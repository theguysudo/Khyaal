/**
 * @file config_store.h
 * @brief Runtime configuration: compiled-in defaults with NVS overrides.
 *
 * NVS namespace "khayaal". Values changed from the serial CLI survive
 * reboots; `factory` clears them back to config.h defaults.
 */
#pragma once

#include <stdint.h>

#include "config.h"

struct KhConfig {
  char ssid[33];
  char password[65];
  char host[128];         // LAN base URL, e.g. http://192.168.1.20:3100
  char householdId[48];
  char sourceId[48];
  char apiKey[96];
  char btName[32];        // Bluetooth Classic SPP device name
  char btPin[8];          // Bluetooth pairing PIN (optional)
  float threshold;
  uint8_t transport;      // TRANSPORT_SERIAL | TRANSPORT_LAN | TRANSPORT_BT
  bool encrypt;           // AES-256-GCM seal the LAN ingest hop
};

class ConfigStore {
 public:
  /** Load defaults from config.h, then overlay any NVS keys present. */
  void load(KhConfig *out);
  /** Persist a single field to NVS and update `cfg`. */
  void saveSsid(KhConfig *cfg, const char *ssid);
  void savePassword(KhConfig *cfg, const char *pass);
  void saveHost(KhConfig *cfg, const char *host);
  void saveHouseholdId(KhConfig *cfg, const char *id);
  void saveSourceId(KhConfig *cfg, const char *id);
  void saveApiKey(KhConfig *cfg, const char *key);
  void saveBtName(KhConfig *cfg, const char *name);
  void saveBtPin(KhConfig *cfg, const char *pin);
  void saveThreshold(KhConfig *cfg, float thr);
  void saveTransport(KhConfig *cfg, uint8_t transport);
  void saveEncrypt(KhConfig *cfg, bool on);
  /** Remove every khayaal/ key, then reload defaults into `cfg`. */
  void factoryReset(KhConfig *cfg);
};
