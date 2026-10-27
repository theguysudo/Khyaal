/**
 * @file tunnel_crypto.cpp
 * @brief AES-256-GCM sealing for the ESP32's LAN ingest hop.
 *
 * Byte-identical scheme to the Mac-side bridge (tunnel/khayaal_serial_bridge.py)
 * and the server (apps/web/lib/server/tunnel-crypto.ts):
 *   key  = HKDF-SHA256(apiKey, salt="khayaal-tunnel-v1", info="khayaal/ingest", 32)
 *   env  = { "enc":"v1", "iv":<b64>, "tag":<b64>, "ct":<b64> }
 *   AAD  = "<householdId>|<sourceId>"
 * The key never leaves the device: it is derived from the apiKey already
 * stored in NVS, so capturing Wi-Fi traffic reveals identity fields only.
 * HKDF is implemented here directly over mbedtls HMAC-SHA256 (extract+expand)
 * to avoid depending on MBEDTLS_HKDF_C being enabled in the core build.
 */
#include "tunnel_crypto.h"

#include <mbedtls/aes.h>
#include <mbedtls/gcm.h>
#include <mbedtls/md.h>

#include <esp_random.h>

#include <string.h>

namespace {

const char HKDF_SALT[] = "khayaal-tunnel-v1";
const char HKDF_INFO[] = "khayaal/ingest";

void hmacSha256(const uint8_t *key, size_t keyLen,
                const uint8_t *data, size_t dataLen, uint8_t out[32]) {
  const mbedtls_md_info_t *info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, info, 1);  // 1 = HMAC
  mbedtls_md_hmac_starts(&ctx, key, keyLen);
  mbedtls_md_hmac_update(&ctx, data, dataLen);
  mbedtls_md_hmac_finish(&ctx, out);
  mbedtls_md_free(&ctx);
}

void hkdfSha256(const uint8_t *ikm, size_t ikmLen,
                const char *salt, const char *info,
                uint8_t out[32]) {
  // extract
  uint8_t prk[32];
  hmacSha256(reinterpret_cast<const uint8_t *>(salt), strlen(salt), ikm, ikmLen, prk);
  // expand (single block: 32 bytes -> one iteration)
  uint8_t t[32 + strlen(HKDF_INFO) + 1];
  size_t tLen = 0;
  memcpy(t + tLen, info, strlen(HKDF_INFO));
  tLen += strlen(HKDF_INFO);
  t[tLen++] = 0x01;
  hmacSha256(prk, sizeof(prk), t, tLen, out);
}

const char B64[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

size_t b64encode(const uint8_t *in, size_t inLen, char *out, size_t outCap) {
  size_t o = 0;
  for (size_t i = 0; i < inLen && o + 4 < outCap; i += 3) {
    const uint32_t n = static_cast<uint32_t>(in[i]) << 16 |
                       (i + 1 < inLen ? static_cast<uint32_t>(in[i + 1]) << 8 : 0) |
                       (i + 2 < inLen ? static_cast<uint32_t>(in[i + 2]) : 0);
    out[o++] = B64[(n >> 18) & 63];
    out[o++] = B64[(n >> 12) & 63];
    out[o++] = (i + 1 < inLen) ? B64[(n >> 6) & 63] : '=';
    out[o++] = (i + 2 < inLen) ? B64[n & 63] : '=';
  }
  out[o] = '\0';
  return o;
}

}  // namespace

bool sealIngestEvent(const char *apiKey, const char *householdId,
                     const char *sourceId, const char *plainJson,
                     char *out, size_t outCap) {
  // 1. key
  uint8_t key[32];
  hkdfSha256(reinterpret_cast<const uint8_t *>(apiKey), strlen(apiKey),
             HKDF_SALT, HKDF_INFO, key);

  // 2. encrypt under AES-256-GCM
  uint8_t iv[12];
  for (size_t i = 0; i < sizeof(iv); i++) iv[i] = static_cast<uint8_t>(esp_random() & 0xFF);

  const size_t plainLen = strlen(plainJson);
  const size_t aadLen = strlen(householdId) + 1 + strlen(sourceId);
  char aad[160];
  snprintf(aad, sizeof(aad), "%s|%s", householdId, sourceId);
  (void)aadLen;

  uint8_t ct[1024];
  uint8_t tag[16];
  if (plainLen == 0 || plainLen > sizeof(ct)) return false;

  mbedtls_gcm_context gcm;
  mbedtls_gcm_init(&gcm);
  int rc = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, key, 256);
  if (rc == 0) {
    rc = mbedtls_gcm_crypt_and_tag(&gcm, MBEDTLS_GCM_ENCRYPT, plainLen,
                                   iv, sizeof(iv),
                                   reinterpret_cast<const unsigned char *>(aad), strlen(aad),
                                   reinterpret_cast<const unsigned char *>(plainJson), ct,
                                   sizeof(tag), tag);
  }
  mbedtls_gcm_free(&gcm);
  if (rc != 0) return false;

  // 3. envelope
  char ivB64[24];
  char tagB64[32];
  char ctB64[((sizeof(ct) + 2) / 3) * 4 + 1];
  b64encode(iv, sizeof(iv), ivB64, sizeof(ivB64));
  b64encode(tag, sizeof(tag), tagB64, sizeof(tagB64));
  b64encode(ct, plainLen, ctB64, sizeof(ctB64));

  snprintf(out, outCap,
           "{\"householdId\":\"%s\",\"sourceId\":\"%s\",\"enc\":\"v1\","
           "\"iv\":\"%s\",\"tag\":\"%s\",\"ct\":\"%s\"}",
           householdId, sourceId, ivB64, tagB64, ctB64);
  return true;
}
