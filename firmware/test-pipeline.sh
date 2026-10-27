#!/bin/bash
# =============================================================================
# Khayaal ESP32 pipeline self-test — ONE command, judge-testable.
#
#   bash firmware/test-pipeline.sh              # all levels, hardware optional
#   bash firmware/test-pipeline.sh sim          # level 1 only (no hardware needed)
#   bash firmware/test-pipeline.sh hardware     # level 2 only (real board)
#   bash firmware/test-pipeline.sh lan          # level 3 only (direct HTTP)
#   bash firmware/test-pipeline.sh flash        # erase + flash the ESP32
#
# Levels:
#   1 sim      — a pseudo-terminal acts as the ESP32, the REAL bridge reads it
#                and POSTs to the REAL backend; proves parsing, ts-stamping,
#                enrichment, ingest, and fall → tier-3 escalation, end to end.
#   2 hardware — same bridge against the actual CP2102 board; verifies the
#                USB serial link. The serial CLI `falltest` command fires a
#                real fall event you can watch escalate on the dashboard.
#   3 lan      — the firmware's direct HTTP path (mode lan), same verdict.
#
# Exit code 0 = everything requested passed. PASS/FAIL printed per check.
# =============================================================================
set -u
cd "$(dirname "$0")"   # firmware/

BASE="${BASE:-http://localhost:3100}"
PASS=0; FAIL=0
chk() { if [[ "$3" == *"$2"* ]]; then PASS=$((PASS+1)); echo "PASS  $1";
        else FAIL=$((FAIL+1)); echo "FAIL  $1 (wanted: $2 / got: $3)"; fi; }

TUNNEL="tunnel"
BRIDGE="$TUNNEL/khayaal_serial_bridge.py"
REGISTER="$TUNNEL/register_source.py"
SIM="$TUNNEL/simulate_sensor.py"
SIM_PID=""; BRIDGE_PID=""

cleanup() {
  [[ -n "$SIM_PID" ]] && kill "$SIM_PID" 2>/dev/null
  [[ -n "$BRIDGE_PID" ]] && kill "$BRIDGE_PID" 2>/dev/null
}
trap cleanup EXIT

ensure_server() {
  if ! curl -s -o /dev/null --max-time 2 "$BASE/api/v1/server-info"; then
    echo "starting the Khayaal server on :3100 …"
    ( cd ../apps/web && npm start > /tmp/khayaal-web.log 2>&1 & )
    for _ in $(seq 1 30); do
      curl -s -o /dev/null --max-time 2 "$BASE/api/v1/server-info" && break
      sleep 1
    done
  fi
  if ! curl -s -o /dev/null --max-time 2 "$BASE/api/v1/server-info"; then
    echo "FAIL  server did not start (see /tmp/khayaal-web.log)"; exit 1
  fi
}

# Fresh demo household + ESP32 source; echoes "hh<TAB>src<TAB>key".
register() {
  python3 "$REGISTER" --server "$BASE" > /tmp/khayaal-register.log 2>&1
  python3 - << 'EOF'
import json, sys
cfg = json.load(open("tunnel/config.json"))
print(f"{cfg['householdId']}\t{cfg['sourceId']}\t{cfg['apiKey']}")
EOF
}

state_json() { curl -s --max-time 5 -H "x-kh-source: $2" -H "x-kh-key: $3" "$BASE/api/v1/household/$1/state"; }

# ------------------------------------------------------------------ level 1
level_sim() {
  ensure_server
  IFS=$'\t' read -r HH SRC KEY <<< "$(register)"
  [[ -n "$HH" ]] || { echo "FAIL  source registration"; FAIL=$((FAIL+1)); return; }
  echo "PASS  demo household + sensor registered ($HH)"

  # simulator on a PTY; first stdout line is the slave path
  SIM_OUT=$(mktemp)
  python3 "$SIM" --once --gap 0.6 > "$SIM_OUT" 2>/tmp/khayaal-sim.log &
  SIM_PID=$!
  sleep 1
  PTY=$(head -1 "$SIM_OUT")
  [[ -c "$PTY" ]] || { echo "FAIL  simulator PTY ($PTY)"; FAIL=$((FAIL+1)); return; }
  echo "PASS  sensor simulator live on $PTY"

  # the real bridge, against the fake device
  BRIDGE_LOG=/tmp/khayaal-bridge.log
  python3 "$BRIDGE" --port "$PTY" --endpoint "$BASE/api/v1/ingest" \
    --household-id "$HH" --source-id "$SRC" --api-key "$KEY" > /dev/null 2> "$BRIDGE_LOG" &
  BRIDGE_PID=$!

  # pattern: idle, motion, idle, motion, fall, idle, motion, idle @0.6 s
  sleep 9
  ST=$(state_json "$HH" "$SRC" "$KEY")
  chk "bridge forwarded presence events" '"presence"' "$ST"
  chk "fall event reached the engine" 'fall' "$ST"
  chk "fall escalated the household (tier 3)" '"tier":3' "$ST"
  grep -q "connected to $PTY" "$BRIDGE_LOG" && { PASS=$((PASS+1)); echo "PASS  bridge opened the device link"; } \
    || { FAIL=$((FAIL+1)); echo "FAIL  bridge never opened the link (see $BRIDGE_LOG)"; }
}

# ------------------------------------------------------------------ level 2
level_hardware() {
  ensure_server
  PORT="${PORT:-$(ls /dev/cu.usbserial-* /dev/cu.usbmodem* 2>/dev/null | head -1)}"
  if [[ -z "$PORT" ]]; then
    echo "FAIL  no ESP32 serial port found — plug the board in (USB)"; FAIL=$((FAIL+1)); return
  fi
  PROBE=$(python3 - "$PORT" << 'EOF'
import sys
try:
    import serial
    s = serial.Serial(sys.argv[1], 115200, timeout=1); s.close(); print("PORT_OK")
except Exception as e:
    print(f"PORT_BAD: {e}")
EOF
)
  if [[ "$PROBE" == PORT_OK* ]]; then
    PASS=$((PASS+1)); echo "PASS  serial link healthy on $PORT"
  else
    FAIL=$((FAIL+1)); echo "FAIL  $PORT is wedged: $PROBE"
    echo "      → unplug the ESP32, count to five, plug it back in, rerun."
    return
  fi
  IFS=$'\t' read -r HH SRC KEY <<< "$(register)"
  echo "watching $PORT — trigger events with the serial CLI ('falltest', or walk past the sensor)…"
  python3 "$BRIDGE" --port "$PORT" --endpoint "$BASE/api/v1/ingest" \
    --household-id "$HH" --source-id "$SRC" --api-key "$KEY"
}

# ------------------------------------------------------------------ level 3
level_lan() {
  ensure_server
  IFS=$'\t' read -r HH SRC KEY <<< "$(register)"
  TS=$(date +%s000)
  R=$(curl -s -X POST "$BASE/api/v1/ingest" -H 'Content-Type: application/json' \
    -d "{\"householdId\":\"$HH\",\"sourceId\":\"$SRC\",\"apiKey\":\"$KEY\",\"type\":\"presence\",\"value\":\"fall\",\"ts\":$TS}")
  chk "LAN-style direct ingest accepted" '"ok":true' "$R"
  ST=$(state_json "$HH" "$SRC" "$KEY")
  chk "fall visible in engine state" 'fall' "$ST"
}

# ------------------------------------------------------------------ level enc
# AES-256-GCM tunnel: sealed event accepted, replay + tamper + keyless
# plaintext rejected — the security properties, not just the plumbing.
level_enc() {
  ensure_server
  python3 tunnel/register_source.py --server "$BASE" > /dev/null 2>&1
  python3 - "$BASE" << 'PYEOF'
import base64, importlib.util, json, sys, time
import requests
spec = importlib.util.spec_from_file_location("bridge", "tunnel/khayaal_serial_bridge.py")
bridge = importlib.util.module_from_spec(spec); spec.loader.exec_module(bridge)
B = sys.argv[1]
cfg = json.load(open("tunnel/config.json"))
HH, SRC, KEY = cfg["householdId"], cfg["sourceId"], cfg["apiKey"]
fails = 0
now = int(time.time() * 1000)
env = bridge.encrypt_event({"type": "presence", "value": "motion", "ts": now}, HH, SRC, KEY)
r = requests.post(f"{B}/api/v1/ingest", json=env, timeout=10)
print("PASS  sealed envelope accepted" if r.status_code == 200 else f"FAIL  sealed envelope ({r.status_code})"); fails += r.status_code != 200
r = requests.post(f"{B}/api/v1/ingest", json=env, timeout=10)
print("PASS  replay rejected" if r.status_code == 409 else f"FAIL  replay ({r.status_code})"); fails += r.status_code != 409
env2 = bridge.encrypt_event({"type": "presence", "value": "idle", "ts": now}, HH, SRC, KEY)
ct = bytearray(base64.b64decode(env2["ct"])); ct[0] ^= 1
env2["ct"] = base64.b64encode(bytes(ct)).decode()
r = requests.post(f"{B}/api/v1/ingest", json=env2, timeout=10)
print("PASS  tamper rejected" if r.status_code == 400 else f"FAIL  tamper ({r.status_code})"); fails += r.status_code != 400
r = requests.post(f"{B}/api/v1/ingest", json={"householdId": HH, "sourceId": SRC, "type": "motion", "value": 1}, timeout=10)
print("PASS  keyless plaintext rejected" if r.status_code == 403 else f"FAIL  keyless plaintext ({r.status_code})"); fails += r.status_code != 403
sys.exit(1 if fails else 0)
PYEOF
  if [[ $? -eq 0 ]]; then PASS=$((PASS+4)); else FAIL=$((FAIL+4)); fi
}

# -------------------------------------------------------------------- flash
do_flash() {
  PORT="${PORT:-$(ls /dev/cu.usbserial-* /dev/cu.usbmodem* 2>/dev/null | head -1)}"
  BIN="esp32-csi-sensor/.pio/build/esp32dev/firmware.bin"
  if [[ -z "$PORT" ]]; then echo "no serial port — plug the board in"; exit 1; fi
  if [[ ! -f "$BIN" ]]; then
    echo "firmware.bin missing — build first:"
    echo "  pip3 install platformio && pio run -d esp32-csi-sensor"
    exit 1
  fi
  echo "erasing $PORT …"
  python3 -m esptool --port "$PORT" erase-flash || exit 1
  echo "flashing $BIN …"
  python3 -m esptool --port "$PORT" --baud 460800 write-flash 0x1000 \
    esp32-csi-sensor/.pio/build/esp32dev/bootloader.bin 0x8000 \
    esp32-csi-sensor/.pio/build/esp32dev/partitions.bin 0xe000 \
    esp32-csi-sensor/.pio/build/esp32dev/boot_app0.bin 0x10000 "$BIN" || exit 1
  echo "flashed. open the serial monitor and run: help"
}

LEVELS="${1:-all}"
case "$LEVELS" in
  sim)      level_sim ;;
  hardware) level_hardware ;;
  lan)      level_lan ;;
  enc)      level_enc ;;
  flash)    do_flash ;;
  all)      level_sim; level_enc; level_lan; echo; level_hardware ;;
  *) echo "usage: test-pipeline.sh [sim|hardware|lan|enc|flash|all]"; exit 2 ;;
esac

echo
echo "== SUMMARY: $PASS passed, $FAIL failed =="
exit $((FAIL > 0))
