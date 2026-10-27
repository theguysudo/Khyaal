/**
 * @file tunnel_crypto.h
 * @brief AES-256-GCM sealing for the LAN ingest hop — see tunnel_crypto.cpp.
 */
#pragma once

#include <stddef.h>

#include <esp_system.h>

/**
 * Seal one ingest event into the v1 envelope (JSON, one line). `plainJson`
 * is the event as before, e.g. {"type":"presence","value":"fall","ts":...}.
 * Identity fields are outside the ciphertext but covered as AAD.
 * Returns false on any crypto failure; `out` is then untouched.
 */
bool sealIngestEvent(const char *apiKey, const char *householdId,
                     const char *sourceId, const char *plainJson,
                     char *out, size_t outCap);
