/**
 * @file bt_link.h
 * @brief Bluetooth Classic SPP link — the "no usable network" fallback.
 *
 * The room sensor is an original ESP32-WROOM-32: Bluetooth Classic
 * (BR/EDR) only, there is NO BLE radio on it (BLE needs an ESP32-C3/S3/H2).
 * So the fallback transport is a Serial Port Profile *server*, spoken with
 * Arduino's BluetoothSerial: the peer (a Mac, a phone, Serial.app) pairs
 * with the device name and reads exactly the JSON lines the USB bridge
 * reads — one event per line, same shapes.
 *
 * The stack is started on demand (only in `mode bt`), so a serial or LAN
 * install pays neither the BT stack's RAM nor its RF coexistence cost.
 */
#pragma once

#include <Arduino.h>

// Forward declaration only: the real class is deprecated in Arduino-ESP32
// 3.3.x and only bt_link.cpp needs to see it.
class BluetoothSerial;

class BtLink {
 public:
  /**
   * Start the SPP server.
   *
   * `deviceName` is what the peer sees when it scans for the board,
   * `pin` is the optional pairing PIN (used only when the peer asks for
   * one). Returns false when this board has no Bluetooth Classic radio or
   * the controller refused to start.
   */
  bool begin(const char *deviceName, const char *pin);
  /** Stop the server. The controller cannot be re-enabled without a reset,
   *  so this is only used on teardown paths. */
  void end();
  /** The SPP server is up (a peer may or may not be connected yet). */
  bool active() const { return active_; }
  /** A peer is connected and the link can carry bytes. */
  bool connected() const;
  /** Write one line (the newline is added here). False when nobody is
   *  listening. */
  bool writeLine(const char *line);
  /** Write raw bytes, no newline. False when nobody is listening. */
  bool write(const char *data);
  /** Bytes waiting to be read from the peer. */
  int available() const;
  /** Read one byte from the peer; -1 when there is none. */
  int read();

 private:
  BluetoothSerial *bt_ = nullptr;
  bool active_ = false;
};
