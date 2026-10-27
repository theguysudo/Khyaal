/**
 * @file config_store.cpp
 * @brief NVS-backed configuration (Arduino Preferences over NVS partitions).
 */
#include "config_store.h"

#include <Preferences.h>
#include <string.h>

#include "config.h"

namespace {
const char *kNamespace = "khayaal";

void copyStr(char *dst, size_t cap, const char *src) {
  snprintf(dst, cap, "%s", src ? src : "");
}
}  // namespace

void ConfigStore::load(KhConfig *out) {
  copyStr(out->ssid, sizeof(out->ssid), KH_WIFI_SSID_DEFAULT);
  copyStr(out->password, sizeof(out->password), KH_WIFI_PASS_DEFAULT);
  copyStr(out->host, sizeof(out->host), KH_LAN_HOST_DEFAULT);
  copyStr(out->householdId, sizeof(out->householdId), KH_HOUSEHOLD_ID_DEFAULT);
  copyStr(out->sourceId, sizeof(out->sourceId), KH_SOURCE_ID_DEFAULT);
  copyStr(out->apiKey, sizeof(out->apiKey), KH_API_KEY_DEFAULT);
  out->threshold = KH_MOTION_THRESHOLD_DEFAULT;
  out->transport = KH_TRANSPORT_DEFAULT;
  out->encrypt = true;  // seal by default; `enc off` only for debugging

  Preferences prefs;
  prefs.begin(kNamespace, true);  // read-only
  if (prefs.isKey("ssid")) copyStr(out->ssid, sizeof(out->ssid), prefs.getString("ssid").c_str());
  if (prefs.isKey("pass")) copyStr(out->password, sizeof(out->password), prefs.getString("pass").c_str());
  if (prefs.isKey("host")) copyStr(out->host, sizeof(out->host), prefs.getString("host").c_str());
  if (prefs.isKey("hh")) copyStr(out->householdId, sizeof(out->householdId), prefs.getString("hh").c_str());
  if (prefs.isKey("src")) copyStr(out->sourceId, sizeof(out->sourceId), prefs.getString("src").c_str());
  if (prefs.isKey("key")) copyStr(out->apiKey, sizeof(out->apiKey), prefs.getString("key").c_str());
  if (prefs.isKey("thr")) out->threshold = prefs.getFloat("thr", out->threshold);
  if (prefs.isKey("mode")) out->transport = prefs.getUChar("mode", out->transport);
  if (prefs.isKey("enc")) out->encrypt = prefs.getBool("enc", out->encrypt);
  prefs.end();
}

void ConfigStore::saveSsid(KhConfig *cfg, const char *v) {
  copyStr(cfg->ssid, sizeof(cfg->ssid), v);
  Preferences p; p.begin(kNamespace, false); p.putString("ssid", v); p.end();
}

void ConfigStore::savePassword(KhConfig *cfg, const char *v) {
  copyStr(cfg->password, sizeof(cfg->password), v);
  Preferences p; p.begin(kNamespace, false); p.putString("pass", v); p.end();
}

void ConfigStore::saveHost(KhConfig *cfg, const char *v) {
  copyStr(cfg->host, sizeof(cfg->host), v);
  Preferences p; p.begin(kNamespace, false); p.putString("host", v); p.end();
}

void ConfigStore::saveHouseholdId(KhConfig *cfg, const char *v) {
  copyStr(cfg->householdId, sizeof(cfg->householdId), v);
  Preferences p; p.begin(kNamespace, false); p.putString("hh", v); p.end();
}

void ConfigStore::saveSourceId(KhConfig *cfg, const char *v) {
  copyStr(cfg->sourceId, sizeof(cfg->sourceId), v);
  Preferences p; p.begin(kNamespace, false); p.putString("src", v); p.end();
}

void ConfigStore::saveApiKey(KhConfig *cfg, const char *v) {
  copyStr(cfg->apiKey, sizeof(cfg->apiKey), v);
  Preferences p; p.begin(kNamespace, false); p.putString("key", v); p.end();
}

void ConfigStore::saveThreshold(KhConfig *cfg, float v) {
  cfg->threshold = v;
  Preferences p; p.begin(kNamespace, false); p.putFloat("thr", v); p.end();
}

void ConfigStore::saveTransport(KhConfig *cfg, uint8_t v) {
  cfg->transport = v;
  Preferences p; p.begin(kNamespace, false); p.putUChar("mode", v); p.end();
}

void ConfigStore::saveEncrypt(KhConfig *cfg, bool v) {
  cfg->encrypt = v;
  Preferences p; p.begin(kNamespace, false); p.putBool("enc", v); p.end();
}

void ConfigStore::factoryReset(KhConfig *cfg) {
  Preferences p;
  p.begin(kNamespace, false);
  p.clear();
  p.end();
  load(cfg);
}
