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
import base64
import glob
import json
import sys
import termios
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

# Device event types the relay passes on to the server. "presence" is the
# state machine's verdict; "csi" is the batched live reading the dashboard
# scope draws. Everything else the board prints (scan/status JSON) stays local.
FORWARDED_TYPES = frozenset({"presence", "csi"})


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


# ----------------------------------------------------------------- crypto
# AES-256-GCM on the network leg (bridge -> backend), matching
# apps/web/lib/server/tunnel-crypto.ts. The key is derived from the source's
# own apiKey with HKDF-SHA256 and never travels; the ciphertext is bound to
# householdId|sourceId as AAD, so a recorded envelope cannot be replayed into
# another household or under another source. `cryptography` is preinstalled
# on macOS; without it we fall back to plaintext with a loud warning.
HKDF_SALT = b"khayaal-tunnel-v1"
HKDF_INFO = b"khayaal/ingest"

try:
    import os as _os

    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF

    _CRYPTO_OK = True
except ImportError:  # pragma: no cover
    _CRYPTO_OK = False


def tunnel_key(api_key: str) -> bytes:
    """HKDF-SHA256 -> 32-byte AES-256 key (same derivation as the server)."""
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=HKDF_SALT,
        info=HKDF_INFO,
    )
    return hkdf.derive(api_key.encode("utf-8"))


def encrypt_event(
    event: dict[str, Any],
    household_id: str,
    source_id: str,
    api_key: str,
) -> dict[str, Any]:
    """Seal the event into the v1 envelope. Identity fields stay outside the
    ciphertext (the server needs them to pick the key) but are covered as AAD."""
    key = tunnel_key(api_key)
    iv = _os.urandom(12)
    aad = f"{household_id}|{source_id}".encode("utf-8")
    ct = AESGCM(key).encrypt(iv, json.dumps(event, separators=(",", ":")).encode(), aad)
    # cryptography appends the 16-byte tag to ct; split it for the envelope.
    return {
        "householdId": household_id,
        "sourceId": source_id,
        "enc": "v1",
        "iv": base64.b64encode(iv).decode(),
        "tag": base64.b64encode(ct[-16:]).decode(),
        "ct": base64.b64encode(ct[:-16]).decode(),
    }


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


# ------------------------------------------------------------------ manage
# Dashboard → device relay. The bridge polls the backend for queued actions
# (falltest, wifi_scan, wifi_connect, wififorget) and runs them over the USB
# serial link — which is exactly what makes Wi-Fi management work when the
# sensor has no network at all. Results (scan lists, connection status) are
# posted back to /api/v1/device/wifi.
#
# The poll is channel-scoped (?via=usb): the sensor itself polls the same
# endpoint over Wi-Fi and can only run what it can do over Wi-Fi. Without the
# split the board drained the Wi-Fi actions and did nothing with them, so the
# dashboard waited forever for a scan that had already been consumed.
MANAGE_POLL_S = 3.0
SCAN_COLLECT_S = 20.0
CONNECT_SETTLE_S = 10.0


def _read_for(ser: "serial.Serial", seconds: float, stop_on: Optional[str] = None) -> list[dict[str, Any]]:
    """Collect JSON objects from the device for a bounded time.

    Returns the parsed JSON lines. Presence events seen in the window are
    returned too — they must not be swallowed just because a dashboard action
    happened to be running.
    """
    out: list[dict[str, Any]] = []
    deadline = time.time() + seconds
    buf = b""
    while time.time() < deadline:
        chunk = ser.read(256)
        if chunk:
            buf += chunk
            while b"\n" in buf:
                raw, buf = buf.split(b"\n", 1)
                line = raw.decode("utf-8", errors="replace").strip()
                if not line or not line.startswith("{"):
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                out.append(obj)
                if stop_on and obj.get(stop_on) is True:
                    return out
        else:
            time.sleep(0.05)
    return out


def _forward_presence(objects: list[dict[str, Any]], forward) -> None:
    """Send any presence events collected during an action window."""
    for obj in objects:
        if obj.get("type") == "presence":
            forward(obj)


def run_manage_action(
    ser: "serial.Serial",
    act: dict[str, Any],
    endpoint_base: str,
    household_id: str,
    source_id: str,
    api_key: str,
    forward=None,
) -> None:
    """Execute one dashboard action against the device over USB."""
    action = act.get("action", "")
    log(f"manage: {action}")

    if action == "falltest":
        ser.write(b"falltest\n")  # device emits the fall line; forwarding carries it
        return
    if action == "wifi_scan":
        ser.write(b"scan\n")
        # The device prints one JSON line per network and then
        # {"scanDone":true}. Stop on that marker rather than guessing a
        # duration — a full 2.4 GHz scan can take longer than a few seconds.
        objects = _read_for(ser, SCAN_COLLECT_S, stop_on="scanDone")
        if forward:
            _forward_presence(objects, forward)
        networks = []
        scan_error = None
        for obj in objects:
            if obj.get("scan") is True and obj.get("ssid"):
                networks.append({"ssid": obj["ssid"], "rssi": obj.get("rssi"), "secure": obj.get("secure")})
            elif obj.get("scanDone") is True and obj.get("error"):
                scan_error = str(obj.get("error"))
        if not any(o.get("scanDone") is True for o in objects):
            scan_error = "the sensor did not answer the scan"
        _post_wifi(endpoint_base, {"kind": "scan", "networks": networks,
                                   "count": len(networks), "error": scan_error},
                   household_id, source_id, api_key)
        log(f"manage: scan -> {len(networks)} networks"
            + (f" ({scan_error})" if scan_error else ""))
        return
    if action == "wifi_connect":
        payload = act.get("payload") or {}
        ssid = str(payload.get("ssid", ""))
        password = str(payload.get("password", ""))
        ser.write(f"ssid {ssid}\n".encode())
        time.sleep(0.3)
        ser.write(f"pass {password}\n".encode())
        time.sleep(CONNECT_SETTLE_S)
        ser.write(b"statusjson\n")
        objects = _read_for(ser, 5.0, stop_on="status")
        if forward:
            _forward_presence(objects, forward)
        for obj in reversed(objects):
            if obj.get("status") is True:
                _post_wifi(endpoint_base, {"kind": "status", "status": obj},
                           household_id, source_id, api_key)
                log(f"manage: connect -> connected={obj.get('connected')}")
                return
        _post_wifi(endpoint_base, {"kind": "status", "status": {"connected": False, "ssid": ssid}},
                   household_id, source_id, api_key)
        return
    if action == "wififorget":
        ser.write(b"wififorget\n")
        time.sleep(1.0)
        ser.write(b"statusjson\n")
        objects = _read_for(ser, 5.0, stop_on="status")
        if forward:
            _forward_presence(objects, forward)
        for obj in reversed(objects):
            if obj.get("status") is True:
                _post_wifi(endpoint_base, {"kind": "status", "status": obj},
                           household_id, source_id, api_key)
                return
        return


def _post_wifi(
    endpoint_base: str,
    body: dict[str, Any],
    household_id: str,
    source_id: str,
    api_key: str,
) -> None:
    try:
        requests.post(
            f"{endpoint_base}/api/v1/device/wifi",
            json=body,
            headers={
                "x-kh-household": household_id,
                "x-kh-source": source_id,
                "x-kh-key": api_key,
            },
            timeout=POST_TIMEOUT_S,
        )
    except requests.RequestException as exc:
        log(f"manage: post wifi result failed: {exc}")


def poll_manage(
    ser: "serial.Serial",
    manage: dict[str, Any],
    forward=None,
    config_path: Optional[Path] = None,
) -> None:
    """Drain dashboard-queued actions; returns quickly when the queue is empty.

    Only the 'usb' channel is drained here — the sensor's own Wi-Fi poll takes
    the 'lan' channel, and the two must not eat each other's work.

    `manage` holds the live identity (base/householdId/sourceId/apiKey). It is
    updated in place when the source is re-registered, so a restart of the
    server no longer costs a restart of the bridge.
    """
    household_id = manage["householdId"]
    source_id = manage["sourceId"]
    api_key = manage["apiKey"]
    try:
        resp = requests.get(
            f"{manage['base']}/api/v1/device/actions?via=usb",
            headers={
                "x-kh-household": household_id,
                "x-kh-source": source_id,
                "x-kh-key": api_key,
            },
            timeout=5,
        )
        if resp.status_code != 200:
            _log_poll_failure(resp, household_id, source_id)
            # The operator may have re-registered the source while we were
            # running. Adopt the new identity instead of staying broken.
            if resp.status_code in (401, 403, 404) and config_path is not None:
                reload_identity(manage, config_path)
            return
        for act in resp.json().get("actions", []):
            name = str(act.get("action", ""))
            try:
                run_manage_action(ser, act, manage["base"], household_id, source_id, api_key, forward)
            except Exception as exc:  # one bad action must not kill the bridge
                log(f"manage: {name} failed: {exc}")
                if name == "wifi_scan":
                    # Tell the dashboard, so the panel says what went wrong
                    # instead of waiting for a scan that will never arrive.
                    _post_wifi(manage["base"], {"kind": "scan", "networks": [],
                                                "count": 0, "error": f"the relay failed: {exc}"},
                               household_id, source_id, api_key)
    except (requests.RequestException, ValueError) as exc:
        _log_poll_error(exc)


def reload_identity(manage: dict[str, Any], config_path: Path) -> bool:
    """Adopt a re-registered identity from the config file.

    The server keeps sources in memory, so restarting it invalidates them.
    register_source.py fixes that and rewrites config.json — this picks the
    new values up without restarting the bridge.
    """
    try:
        cfg = load_config(config_path)
    except SystemExit:
        # A half-written config is not worth killing the bridge over.
        return False
    fresh = {
        "householdId": str(cfg.get("householdId") or ""),
        "sourceId": str(cfg.get("sourceId") or ""),
        "apiKey": str(cfg.get("apiKey") or ""),
    }
    if not all(fresh.values()):
        return False
    if all(fresh[k] == manage.get(k) for k in fresh):
        return False
    manage.update(fresh)
    log(f"manage: picked up a new source from {config_path.name} "
        f"(household={fresh['householdId']} source={fresh['sourceId']}) — trying again")
    return True


_last_poll_problem_log = 0.0


def _log_poll_error(exc: Exception) -> None:
    """Log a connection problem, but not once every three seconds."""
    global _last_poll_problem_log
    now = time.time()
    if now - _last_poll_problem_log < 60:
        return
    _last_poll_problem_log = now
    log(f"manage: cannot reach the server ({exc}) — is it running?")


def _log_poll_failure(resp, household_id: str, source_id: str) -> None:
    """Say why the action poll failed — silence here looks like a dead board."""
    global _last_poll_problem_log
    body = (resp.text or "").strip()
    if resp.status_code in (401, 403, 404):
        now = time.time()
        if now - _last_poll_problem_log < 60:
            return
        _last_poll_problem_log = now
        log(f"manage: the server rejected this relay ({resp.status_code}) "
            f"household={household_id} source={source_id} {body}")
        log("manage: the server keeps sources in memory, so restarting it makes "
            "these credentials stale. Fix it with: "
            "python3 firmware/tunnel/register_source.py")
    else:
        log(f"manage: action poll failed ({resp.status_code}) {body}")


# ------------------------------------------------------------------ main loop
def read_loop(
    port_name: str,
    baud: int,
    forward,  # Callable[[dict[str, Any]], bool]
    manage: Optional[dict[str, Any]] = None,
    config_path: Optional[Path] = None,
) -> None:
    """Read JSON lines forever; reconnect on any serial error.
    `manage` (household/source/key + base) enables the dashboard relay."""
    last_manage = 0.0
    while True:
        try:
            with serial.Serial(port_name, baud, timeout=READ_TIMEOUT_S) as ser:
                log(f"connected to {port_name} @ {baud}")
                buf = b""
                while True:
                    if manage and time.time() - last_manage > MANAGE_POLL_S:
                        last_manage = time.time()
                        poll_manage(ser, manage, forward, config_path)
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
                        if event.get("type") not in FORWARDED_TYPES:
                            # scan/status JSON and device log JSON stay local
                            if not event.get("scan") and not event.get("status"):
                                log(f"ignored non-presence event: {line[:120]}")
                            continue
                        if not forward(event):
                            log("forwarding failed; continuing to read")
        except (serial.SerialException, OSError, termios.error) as exc:
            # termios.error (a wedged CP2102 raises `Invalid argument (22)` on
            # every baud) is NOT an OSError subclass, so it must be named —
            # otherwise a replug-recoverable glitch kills the bridge.
            log(f"serial error on {port_name}: {exc} — retrying in "
                f"{RECONNECT_DELAY_S:.0f}s")
            time.sleep(RECONNECT_DELAY_S)


def build_forwarder(
    endpoint: str,
    identity: dict[str, Any],
    dry_run: bool,
    encrypt: bool = True,
):
    """Wrap identity + sealing + POST policy into a single callable.

    `identity` is live: when the server rejects our credentials and the source
    is re-registered, the values are swapped in place and the next event uses
    them without restarting the bridge.
    """

    if encrypt and not _CRYPTO_OK:
        log("WARNING: 'cryptography' not installed — falling back to PLAINTEXT "
            "ingest. Install with: pip3 install cryptography")

    def forward(event: dict[str, Any]) -> bool:
        household_id = identity["householdId"]
        source_id = identity["sourceId"]
        api_key = identity["apiKey"]
        ts = event.get("ts")
        if not isinstance(ts, int) or ts <= 0:
            event = dict(event)
            event["ts"] = int(time.time() * 1000)
        if encrypt and _CRYPTO_OK:
            payload = encrypt_event(event, household_id, source_id, api_key)
        else:
            payload = enrich(event, household_id, source_id, api_key)
        kind = event.get("type", "presence")
        if kind == "csi":
            # One batched reading per second — logging every one would drown
            # the presence lines in the relay log.
            log(f"csi: variance {event.get('value')} "
                f"(source {source_id}{' sealed' if encrypt and _CRYPTO_OK else ''})")
        else:
            log(f"presence: {payload.get('value', event.get('value'))} "
                f"(source {source_id}{' sealed' if encrypt and _CRYPTO_OK else ''})")
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
    enc_group = parser.add_mutually_exclusive_group()
    enc_group.add_argument("--encrypt", dest="encrypt", action="store_true",
                           default=True,
                           help="AES-256-GCM seal the network leg (default)")
    enc_group.add_argument("--no-encrypt", dest="encrypt",
                           action="store_false",
                           help="send plaintext JSON (debugging only)")
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
        f"endpoint={endpoint} dry_run={args.dry_run} "
        f"encrypt={args.encrypt and _CRYPTO_OK}")
    # One live identity, shared by the ingest forwarder and the dashboard
    # relay. It is updated in place when the source is re-registered.
    link = {
        "base": endpoint.rsplit("/api/", 1)[0],
        "householdId": household_id,
        "sourceId": source_id,
        "apiKey": api_key,
    }
    forwarder = build_forwarder(
        endpoint, link, args.dry_run, encrypt=args.encrypt,
    )
    manage = None
    if not args.dry_run and household_id and source_id and api_key:
        manage = link
        log("dashboard relay on (falltest + Wi-Fi management over USB)")
    try:
        read_loop(port_name, args.baud, forwarder, manage=manage,
                  config_path=args.config)
    except KeyboardInterrupt:
        log("stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
