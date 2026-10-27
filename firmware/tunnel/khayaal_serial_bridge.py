#!/usr/bin/env python3
"""
khayaal_serial_bridge.py — the Khayaal USB-serial tunnel.

Reads one-JSON-per-line presence events from the Khayaal ESP32 room sensor
over USB serial and POSTs them to the Khayaal backend ingest endpoint.
This is the "zero network setup" transport: the sensor only needs USB power
and a 2.4 GHz AP to sense against; all HTTP happens on the Mac.

Envelope handled (sensor -> bridge):
    {"type":"presence","value":"motion","ts":1730000000000}
Envelope forwarded (bridge -> backend):
    {"householdId":"hh_...","sourceId":"src_...","apiKey":"sk_...",
     "type":"presence","value":"motion","ts":1730000000000}

householdId/sourceId/apiKey come from a config file (--config) or CLI flags
(flags win). `ts` is stamped here when the sensor had no NTP time.

Usage:
    python3 khayaal_serial_bridge.py                 # auto-detect the port
    python3 khayaal_serial_bridge.py --port /dev/cu.usbserial-0001
    python3 khayaal_serial_bridge.py --dry-run       # print, don't POST
    python3 khayaal_serial_bridge.py --household-id hh_x --source-id src_x \
        --api-key sk_x --endpoint http://localhost:3100/api/v1/ingest

Requires: pyserial, requests  (both preinstalled on this Mac)
"""
from __future__ import annotations

import argparse
import glob
import json
import sys
import time
from pathlib import Path
from typing import Any, Optional

try:
    import serial  # pyserial
except ImportError:  # pragma: no cover
    sys.exit("pyserial missing — run: pip3 install pyserial")
try:
    import requests
except ImportError:  # pragma: no cover
    sys.exit("requests missing — run: pip3 install requests")

# Port glob patterns, macOS first then Linux.
PORT_PATTERNS = [
    "/dev/cu.usbserial-*",
    "/dev/cu.usbmodem*",
    "/dev/cu.SLAB_USBtoUART*",
    "/dev/cu.CH34*",
    "/dev/ttyUSB*",
    "/dev/ttyACM*",
]
READ_TIMEOUT_S = 1.0
POST_TIMEOUT_S = 5.0
POST_RETRIES = 3
RECONNECT_DELAY_S = 2.0


def log(msg: str) -> None:
    """Timestamped line to stderr — stdout stays reserved for payloads."""
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", file=sys.stderr)


# --------------------------------------------------------------------- config
def load_config(path: Path) -> dict[str, Any]:
    """Load the bridge config file; missing file yields an empty dict."""
    try:
        cfg = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(cfg, dict):
            raise ValueError("config root must be a JSON object")
        return cfg
    except FileNotFoundError:
        return {}
    except (json.JSONDecodeError, ValueError) as exc:
        sys.exit(f"config {path} is not valid JSON: {exc}")


# ------------------------------------------------------------------- port scan
def detect_port() -> Optional[str]:
    """Return the first plausible USB serial port, or None."""
    for pattern in PORT_PATTERNS:
        ports = sorted(glob.glob(pattern))
        if ports:
            return ports[0]
    return None


# ----------------------------------------------------------------- forwarding
def enrich(
    event: dict[str, Any],
    household_id: str,
    source_id: str,
    api_key: str,
) -> dict[str, Any]:
    """Fill in identity fields and stamp `ts` when the sensor could not."""
    payload = dict(event)
    payload["householdId"] = household_id
    payload["sourceId"] = source_id
    payload["apiKey"] = api_key
    ts = payload.get("ts")
    if not isinstance(ts, int) or ts <= 0:
        payload["ts"] = int(time.time() * 1000)
    return payload


def post_event(
    endpoint: str,
    payload: dict[str, Any],
    dry_run: bool,
) -> bool:
    """POST one enriched event with short retries; returns success."""
    if dry_run:
        log(f"dry-run would POST to {endpoint}:")
        print(json.dumps(payload, separators=(",", ":")))
        return True

    for attempt in range(1, POST_RETRIES + 1):
        try:
            resp = requests.post(
                endpoint, json=payload, timeout=POST_TIMEOUT_S
            )
            if resp.status_code == 200:
                return True
            # 4xx will not fix itself — do not retry those.
            log(
                f"POST {endpoint} -> HTTP {resp.status_code}: {resp.text.strip()}"
            )
            if 400 <= resp.status_code < 500:
                return False
        except requests.RequestException as exc:
            log(f"POST {endpoint} failed (attempt {attempt}/{POST_RETRIES}): {exc}")
        time.sleep(min(2 ** (attempt - 1), 8))
    return False


# ------------------------------------------------------------------ main loop
def read_loop(
    port_name: str,
    baud: int,
    forward,  # Callable[[dict[str, Any]], bool]
) -> None:
    """Read JSON lines forever; reconnect on any serial error."""
    while True:
        try:
            with serial.Serial(port_name, baud, timeout=READ_TIMEOUT_S) as ser:
                log(f"connected to {port_name} @ {baud}")
                buf = b""
                while True:
                    chunk = ser.read(256)
                    if not chunk:
                        continue
                    buf += chunk
                    while b"\n" in buf:
                        raw, buf = buf.split(b"\n", 1)
                        line = raw.decode("utf-8", errors="replace").strip()
                        if not line:
                            continue
                        if not line.startswith("{"):
                            log(f"device: {line}")  # boot banner / log line
                            continue
                        try:
                            event = json.loads(line)
                        except json.JSONDecodeError as exc:
                            log(f"bad JSON from device ({exc}): {line[:120]}")
                            continue
                        if event.get("type") != "presence":
                            log(f"ignored non-presence event: {line[:120]}")
                            continue
                        if not forward(event):
                            log("forwarding failed; continuing to read")
        except serial.SerialException as exc:
            log(f"serial error on {port_name}: {exc} — retrying in "
                f"{RECONNECT_DELAY_S:.0f}s")
            time.sleep(RECONNECT_DELAY_S)
        except OSError as exc:
            log(f"OS error on {port_name}: {exc} — retrying in "
                f"{RECONNECT_DELAY_S:.0f}s")
            time.sleep(RECONNECT_DELAY_S)


def build_forwarder(
    endpoint: str,
    household_id: str,
    source_id: str,
    api_key: str,
    dry_run: bool,
):
    """Wrap identity + POST policy into a single callable for read_loop."""

    def forward(event: dict[str, Any]) -> bool:
        payload = enrich(event, household_id, source_id, api_key)
        log(f"presence: {payload.get('value')} (source {source_id})")
        return post_event(endpoint, payload, dry_run)

    return forward


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    script_cfg = Path(__file__).with_name("config.json")
    parser = argparse.ArgumentParser(
        description="Khayaal ESP32 serial->HTTP tunnel.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--port", default=None,
                        help="serial device (default: auto-detect)")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--config", type=Path, default=script_cfg,
                        help="JSON config with endpoint/householdId/"
                             "sourceId/apiKey")
    parser.add_argument("--endpoint", default=None,
                        help="ingest URL (overrides config)")
    parser.add_argument("--household-id", dest="household_id", default=None,
                        help="householdId (overrides config)")
    parser.add_argument("--source-id", dest="source_id", default=None,
                        help="sourceId (overrides config)")
    parser.add_argument("--api-key", dest="api_key", default=None,
                        help="apiKey (overrides config)")
    parser.add_argument("--dry-run", dest="dry_run", action="store_true",
                        help="print enriched payloads instead of POSTing")
    return parser.parse_args(argv)


def main(argv: Optional[list[str]] = None) -> int:
    args = parse_args(argv)
    cfg = load_config(args.config)

    endpoint = args.endpoint or cfg.get("endpoint") \
        or "http://localhost:3100/api/v1/ingest"
    household_id = args.household_id or cfg.get("householdId") or ""
    source_id = args.source_id or cfg.get("sourceId") or ""
    api_key = args.api_key or cfg.get("apiKey") or ""

    if not args.dry_run and not (household_id and source_id and api_key):
        log("missing identity: set householdId/sourceId/apiKey in "
            f"{args.config} or pass --household-id/--source-id/--api-key")
        log("register a source with tunnel/register_source.py")
        return 2

    port_name = args.port or detect_port()
    if not port_name:
        log("no USB serial port found (looked for /dev/cu.usb*) — "
            "plug the ESP32 in or pass --port")
        return 2

    log(f"bridge starting: port={port_name} baud={args.baud} "
        f"endpoint={endpoint} dry_run={args.dry_run}")
    forwarder = build_forwarder(
        endpoint, household_id, source_id, api_key, args.dry_run
    )
    try:
        read_loop(port_name, args.baud, forwarder)
    except KeyboardInterrupt:
        log("stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
