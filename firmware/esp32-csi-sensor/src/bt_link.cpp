/**
 * @file bt_link.cpp
 * @brief Bluetooth Classic SPP link — see bt_link.h.
 *
 * The SPP server is started in "slave" (peripheral) mode: the board waits
 * for the Mac/phone to connect, which is what a serial terminal expects.
 * The Arduino library starts the server with ESP_SPP_SEC_NONE, i.e. the
 * link is not authenticated by the stack — the honest limits are spelled
 * out in docs/BLUETOOTH_FALLBACK.md.
 */
#include "bt_link.h"

#include <string.h>

// Arduino-ESP32 3.3.x marks BluetoothSerial deprecated (it will not be in
// the 4.0 core by default) — but 3.3.x is the core this project pins, and
// Bluetooth Classic is the only radio the WROOM-32 has, so the class is
// exactly what the fallback needs. Silence the warning here rather than
// let it leak into every translation unit.
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wdeprecated-declarations"

#if SOC_BT_SUPPORTED && defined(CONFIG_BT_ENABLED) && defined(CONFIG_BLUEDROID_ENABLED)
#include <BluetoothSerial.h>
#define KH_BT_AVAILABLE 1
#else
#define KH_BT_AVAILABLE 0
#endif

#include "config.h"

namespace {
// One radio, one link — the BluetoothSerial object lives for the whole
// session so the controller is never re-initialised (the ESP-IDF cannot
// re-enable the controller in a different mode after the fact).
BluetoothSerial *g_bt = nullptr;
}  // namespace

bool BtLink::begin(const char *deviceName, const char *pin) {
#if KH_BT_AVAILABLE
  if (active_) return true;
  if (!deviceName || !deviceName[0]) deviceName = KH_BT_NAME_DEFAULT;
  if (!g_bt) g_bt = new BluetoothSerial();
  if (!g_bt) return false;
  // isMaster = false: the board is the SPP server and the peer connects to
  // it. The third argument releases the BLE controller's RAM when set —
  // we never speak BLE on this board (there is no BLE radio).
  if (!g_bt->begin(String(deviceName), false, KH_BT_CLASSIC_ONLY)) return false;
  // The PIN answers a peer that asks for one during legacy pairing; the
  // server itself is started without security.
  if (pin && pin[0]) {
    if (!g_bt->setPin(pin, static_cast<uint8_t>(strlen(pin)))) {
      // Not fatal: the peer can still pair without a PIN.
    }
  }
  active_ = true;
  return true;
#else
  (void)deviceName;
  (void)pin;
  return false;
#endif
}

void BtLink::end() {
#if KH_BT_AVAILABLE
  if (g_bt) g_bt->end();
  active_ = false;
#endif
}

bool BtLink::connected() const {
#if KH_BT_AVAILABLE
  return g_bt && g_bt->hasClient();
#else
  return false;
#endif
}

bool BtLink::write(const char *data) {
#if KH_BT_AVAILABLE
  if (!g_bt || !data || !data[0]) return false;
  if (!g_bt->hasClient()) return false;
  return g_bt->write(reinterpret_cast<const uint8_t *>(data), strlen(data)) > 0;
#else
  (void)data;
  return false;
#endif
}

bool BtLink::writeLine(const char *line) {
#if KH_BT_AVAILABLE
  if (!g_bt || !line) return false;
  if (!g_bt->hasClient()) return false;
  const size_t len = strlen(line);
  if (g_bt->write(reinterpret_cast<const uint8_t *>(line), len) != len) return false;
  return g_bt->write(reinterpret_cast<const uint8_t *>("\n"), 1) == 1;
#else
  (void)line;
  return false;
#endif
}

int BtLink::available() const {
#if KH_BT_AVAILABLE
  return g_bt ? g_bt->available() : 0;
#else
  return 0;
#endif
}

int BtLink::read() {
#if KH_BT_AVAILABLE
  return g_bt ? g_bt->read() : -1;
#else
  return -1;
#endif
}

#pragma GCC diagnostic pop
