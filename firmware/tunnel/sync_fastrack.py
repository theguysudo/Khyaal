#!/usr/bin/env python3
"""
sync_fastrack.py — get a Fastrack band's data into Khayaal.

WHAT THIS IS
    Fastrack publishes no developer API and no OAuth: the phone app talks to
    Titan's own cloud and there is nothing a third-party app may call. What
    Titan *does* publish — and what the Fastrack Smart World / Titan Smart
    World apps advertise on Google Play — is a **Health Connect** integration,
    so the band's steps, pulse, sleep and active minutes land in the Android
    health store on the phone.

    Android 14+ can export that health store to a ZIP
    (Settings -> Health Connect -> Manage data -> Backup and restore ->
    Scheduled export -> "Health Connect.zip"). This script reads such an
    export — or a plain CSV/JSON you made yourself — and posts it to
    Khayaal as a `smartwatch` source.

    The import is deliberately lossy: Khayaal wants one step total per day,
    an hourly pulse average, hourly active minutes and one sleep record per
    night. Everything else is dropped rather than stored.

USAGE
    python3 sync_fastrack.py --file "Health Connect.zip"
    python3 sync_fastrack.py --file steps.csv --kind steps --dry-run
    python3 sync_fastrack.py --file export.json --source-id src_x --api-key sk_y

    With no --source-id the script registers a fresh `smartwatch` source on
    the server (it needs the household's pairing code) and prints the
    identity. It never writes to tunnel/config.json — that file belongs to
    the room-sensor relay.
"""
from __future__ import annotations

import argparse
import base64
import csv
import importlib.util
import json
import os
import sys
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

try:
    import requests
except ImportError:  # pragma: no cover
    sys.exit("requests missing — run: pip3 install requests")


HERE = Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# The vocabulary
# ---------------------------------------------------------------------------

# Which Khayaal signal each Health Connect record type becomes.
KIND_BY_FILE = {
    "steps": "steps",
    "heartrate": "heart_rate",
    "restingheartrate": "heart_rate",
    "sleepsession": "sleep_duration",
    "activecaloriesburned": "activity",
    "distance": "activity",
    "exercisesession": "activity",
    "oxygen saturation": "activity",
    "oxygensaturation": "activity",
}

KIND_CHOICES = ["steps", "heart_rate", "sleep_duration", "activity"]

RESTING_KINDS = {"restingheartrate"}


class SyncError(Exception):
    """Anything the user can fix: a clear message, no stack trace."""


# ---------------------------------------------------------------------------
# Time
# ---------------------------------------------------------------------------

def parse_ts(raw: Any) -> int:
    """Parse a timestamp into epoch milliseconds.

    Health Connect exports local device time, sometimes with an offset and
    sometimes without. Naive values are read as local time, which is what an
    export taken on the phone means.
    """
    if isinstance(raw, (int, float)):
        # Heuristic: seconds vs milliseconds.
        n = float(raw)
        return int(n * 1000) if n < 1e11 else int(n)
    if not isinstance(raw, str) or not raw.strip():
        raise SyncError(f"cannot read a timestamp from {raw!r}")
    text = raw.strip().replace("Z", "+00:00")
    for candidate in (text, text.replace(" ", "T", 1)):
        try:
            dt = datetime.fromisoformat(candidate)
        except ValueError:
            continue
        if dt.tzinfo is None:
            return int(dt.timestamp() * 1000)
        return int(dt.astimezone(timezone.utc).timestamp() * 1000)
    raise SyncError(f"cannot read the timestamp {raw!r} (expected YYYY-MM-DD HH:MM:SS)")


# ---------------------------------------------------------------------------
# Reading the export
# ---------------------------------------------------------------------------

def _norm(header: str) -> str:
    return "".join(ch for ch in header.lower() if ch.isalnum())


def _pick(headers: list[str], *wanted: str) -> Optional[int]:
    """Find the column whose normalised header contains one of `wanted`."""
    for want in wanted:
        for i, h in enumerate(headers):
            if want in _norm(h):
                return i
    return None


def read_csv_rows(text: str) -> list[dict[str, str]]:
    reader = csv.DictReader(text.splitlines())
    rows = []
    for row in reader:
        clean = {}
        for key, value in row.items():
            if key is None:
                continue
            clean[key.strip()] = (value or "").strip()
        if any(v for v in clean.values()):
            rows.append(clean)
    return rows


def classify_csv(rows: list[dict[str, str]], hint: Optional[str]) -> str:
    """Work out which Khayaal signal a table of rows describes."""
    if hint:
        if hint not in KIND_CHOICES:
            raise SyncError(f"--kind must be one of {', '.join(KIND_CHOICES)}")
        return hint
    if not rows:
        raise SyncError("the CSV is empty")
    headers = list(rows[0].keys())
    joined = " ".join(_norm(h) for h in headers)
    if "stage" in joined and ("sleep" in joined or "title" in joined):
        return "sleep_duration"
    if "steps" in joined or "count" in joined:
        return "steps"
    if "calorie" in joined or "distance" in joined or "exercise" in joined:
        return "activity"
    if "bpm" in joined or "heart" in joined or "value" in joined:
        return "heart_rate"
    raise SyncError(
        "cannot tell what this CSV holds — its columns are "
        f"{', '.join(headers)}. Pass --kind steps|heart_rate|sleep_duration|activity"
    )


def rows_to_signals(
    rows: list[dict[str, str]],
    kind: str,
    resting: bool = False,
    calories: bool = False,
) -> list[dict[str, Any]]:
    """Turn one table into Khayaal signals."""
    if not rows:
        return []
    headers = list(rows[0].keys())
    i_start = _pick(headers, "timestart", "starttime", "start")
    i_end = _pick(headers, "timeend", "endtime", "end")
    i_value = _pick(headers, "value", "count", "bpm", "calorie", "amount")
    if i_start is None:
        raise SyncError(
            f"this table has no start-time column (columns: {', '.join(headers)})"
        )
    if i_end is None:
        i_end = i_start
    if kind != "sleep_duration" and i_value is None:
        raise SyncError(
            f"this table has no value column (columns: {', '.join(headers)})"
        )

    out: list[dict[str, Any]] = []
    for row in rows:
        start = parse_ts(row.get(headers[i_start], ""))
        end = parse_ts(row.get(headers[i_end], "")) if i_end != i_start else start
        if kind == "sleep_duration":
            minutes = max(0, round((end - start) / 60000))
            if minutes <= 0:
                continue
            out.append({
                "type": "sleep_duration",
                "value": minutes,
                "ts": end,
                "meta": {"startTs": start, "endTs": end},
            })
            continue
        raw_value = row.get(headers[i_value], "") if i_value is not None else ""
        try:
            value = float(raw_value)
        except (TypeError, ValueError):
            continue
        if kind == "steps":
            out.append({"type": "steps", "value": value, "ts": end, "interval": True})
        elif kind == "heart_rate":
            meta = {"resting": True} if resting else {}
            out.append({"type": "heart_rate", "value": value, "ts": end, "meta": meta})
        else:  # activity
            minutes = max(0, round((end - start) / 60000))
            out.append({
                "type": "activity",
                "value": minutes,
                "ts": end,
                "meta": {"calories": value} if calories else {},
            })
    return out


def read_native_json(payload: Any) -> list[dict[str, Any]]:
    """The Khayaal-native format: a list of records, or {"records": [...]}."""
    if isinstance(payload, dict):
        payload = payload.get("records") or payload.get("data") or []
    if not isinstance(payload, list):
        raise SyncError("the JSON file must hold a list of records")
    out = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        kind = item.get("type")
        if kind not in ("steps", "heart_rate", "sleep_duration", "activity"):
            raise SyncError(
                f"unknown record type {kind!r} — expected steps, heart_rate, "
                "sleep_duration or activity"
            )
        if "ts" not in item:
            raise SyncError("every record needs a ts (epoch ms or ISO time)")
        out.append({
            "type": kind,
            "value": float(item.get("value", 0)),
            "ts": parse_ts(item["ts"]),
            "meta": item.get("meta") if isinstance(item.get("meta"), dict) else {},
        })
    return out


def load_file(path: Path, kind: Optional[str]) -> list[dict[str, Any]]:
    """Read the export and return raw Khayaal-shaped signals."""
    if not path.exists():
        raise SyncError(f"no such file: {path}")

    if zipfile.is_zipfile(path):
        signals: list[dict[str, Any]] = []
        with zipfile.ZipFile(path) as zf:
            names = [n for n in zf.namelist() if not n.endswith("/")]
            for name in names:
                base = Path(name).stem.lower()
                mapped = KIND_BY_FILE.get(base)
                if mapped is None:
                    continue
                if zf.getinfo(name).file_size > 20 * 1024 * 1024:
                    print(f"skipping {name} (too large)", file=sys.stderr)
                    continue
                text = zf.read(name).decode("utf-8", errors="replace")
                rows = read_csv_rows(text)
                if not rows:
                    continue
                signals.extend(
                    rows_to_signals(
                        rows,
                        mapped,
                        resting=base in RESTING_KINDS,
                        calories=base == "activecaloriesburned",
                    )
                )
        if not signals:
            raise SyncError(
                "the archive holds no Health Connect tables Khayaal understands "
                f"(looked for: {', '.join(sorted(set(KIND_BY_FILE)))})"
            )
        return signals

    text = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix.lower() == ".json" or text.lstrip().startswith(("{", "[")):
        return read_native_json(json.loads(text))

    rows = read_csv_rows(text)
    return rows_to_signals(rows, classify_csv(rows, kind))


# ---------------------------------------------------------------------------
# Reducing to what Khayaal uses
# ---------------------------------------------------------------------------

def reduce_signals(
    signals: list[dict[str, Any]],
    since_days: int,
    max_records: int,
) -> list[dict[str, Any]]:
    """One step total per day, hourly pulse averages, hourly active minutes,
    one sleep record per night. Everything else is dropped on purpose."""
    if not signals:
        return []

    newest = max(s["ts"] for s in signals)
    cutoff = newest - since_days * 24 * 3600_000
    kept = [s for s in signals if s["ts"] >= cutoff]

    steps_by_day: dict[int, float] = {}
    pulse_by_hour: dict[int, list[tuple[int, float]]] = {}
    active_by_hour: dict[int, dict[str, float]] = {}
    active_ts: dict[int, int] = {}
    sleep_by_night: dict[int, dict[str, Any]] = {}

    for s in kept:
        kind = s["type"]
        ts = s["ts"]
        if kind == "steps":
            day = _day_key(ts)
            steps_by_day[day] = steps_by_day.get(day, 0.0) + float(s["value"])
        elif kind == "heart_rate":
            hour = _hour_key(ts)
            pulse_by_hour.setdefault(hour, []).append((ts, float(s["value"])))
        elif kind == "activity":
            hour = _hour_key(ts)
            slot = active_by_hour.setdefault(hour, {"minutes": 0.0, "calories": 0.0})
            slot["minutes"] += float(s["value"])
            slot["calories"] += float(s.get("meta", {}).get("calories", 0) or 0)
            active_ts[hour] = max(active_ts.get(hour, 0), ts)
        elif kind == "sleep_duration":
            night = _day_key(ts)
            prior = sleep_by_night.get(night)
            if prior is None or ts > prior["ts"]:
                sleep_by_night[night] = s

    out: list[dict[str, Any]] = []
    for day, total in steps_by_day.items():
        # The day's total is stamped at the end of that day — but never in
        # the future: an import of today has to stay inside today.
        out.append({
            "type": "steps",
            "value": int(round(total)),
            "ts": min(_day_end(day), newest),
            "meta": {},
        })
    for hour, samples in pulse_by_hour.items():
        values = [v for _, v in samples]
        out.append({
            "type": "heart_rate",
            "value": int(round(sum(values) / len(values))),
            "ts": max(ts for ts, _ in samples),
            "meta": {},
        })
    for hour, slot in active_by_hour.items():
        meta = {}
        if slot["calories"] > 0:
            meta["calories"] = int(round(slot["calories"]))
        out.append({
            "type": "activity",
            "value": int(round(slot["minutes"])),
            "ts": active_ts.get(hour, hour),
            "meta": meta,
        })
    for night, s in sleep_by_night.items():
        out.append({
            "type": "sleep_duration",
            "value": int(round(float(s["value"]))),
            "ts": s["ts"],
            "meta": s.get("meta", {}),
        })

    out.sort(key=lambda s: s["ts"])
    if len(out) > max_records:
        print(
            f"note: {len(out)} records reduced to the newest {max_records}",
            file=sys.stderr,
        )
        out = out[-max_records:]
    return out


def _day_key(ts: int) -> int:
    d = datetime.fromtimestamp(ts / 1000)
    return int(datetime(d.year, d.month, d.day).timestamp() * 1000)


def _day_end(day_key: int) -> int:
    d = datetime.fromtimestamp(day_key / 1000)
    return int(datetime(d.year, d.month, d.day, 23, 59, 0).timestamp() * 1000)


def _hour_key(ts: int) -> int:
    d = datetime.fromtimestamp(ts / 1000)
    return int(datetime(d.year, d.month, d.day, d.hour).timestamp() * 1000)


# ---------------------------------------------------------------------------
# The server
# ---------------------------------------------------------------------------

def load_bridge():
    """Import the sibling bridge for its AES-256-GCM sealing helpers."""
    path = HERE / "khayaal_serial_bridge.py"
    if not path.exists():
        return None
    try:
        spec = importlib.util.spec_from_file_location("khayaal_serial_bridge", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    except Exception:  # pragma: no cover - the bridge is optional here
        return None


def encrypt_event(bridge, event: dict[str, Any], household_id: str, source_id: str, api_key: str):
    if bridge is None:
        return None
    try:
        return bridge.encrypt_event(event, household_id, source_id, api_key)
    except Exception:
        return None


def register_source(
    server: str,
    household_id: Optional[str],
    pairing_code: Optional[str],
    label: str,
) -> dict[str, str]:
    """Mint a `smartwatch` source. Source creation needs the family seat or
    the household's current pairing code — the demo console hands out both."""
    session = requests.Session()
    demo = session.post(f"{server}/api/v1/pair", json={"action": "demo"}, timeout=10)
    demo.raise_for_status()
    demo_household = demo.json()["household"]

    if not household_id:
        household_id = demo_household["id"]
    if household_id == demo_household["id"]:
        pairing_code = pairing_code or demo_household.get("pairingCode")
    elif not pairing_code:
        sys.exit(
            f"household {household_id} is not the demo household, so its pairing "
            f"code is needed — read it from the dashboard's Watchers card and "
            f"pass --pairing-code"
        )

    resp = session.post(
        f"{server}/api/v1/household/{household_id}/sources",
        json={"type": "smartwatch", "label": label, "pairingCode": pairing_code},
        timeout=10,
    )
    if resp.status_code >= 400:
        raise SyncError(f"the server refused the source: {resp.text.strip()}")
    source = resp.json()
    return {
        "endpoint": f"{server}/api/v1/ingest",
        "householdId": household_id,
        "sourceId": source["id"],
        "apiKey": source["apiKey"],
    }


def post_signal(
    session: requests.Session,
    endpoint: str,
    household_id: str,
    source_id: str,
    api_key: str,
    signal: dict[str, Any],
    bridge,
) -> bool:
    payload = {"type": signal["type"], "value": signal["value"], "ts": signal["ts"]}
    if signal.get("meta"):
        payload["meta"] = signal["meta"]
    envelope = encrypt_event(bridge, payload, household_id, source_id, api_key)
    if envelope is not None:
        body = envelope
    else:
        body = {"householdId": household_id, "sourceId": source_id, "apiKey": api_key, **payload}
    resp = session.post(endpoint, json=body, timeout=15)
    if resp.status_code == 200:
        return True
    print(f"rejected ({resp.status_code}): {resp.text.strip()}", file=sys.stderr)
    return False


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Import a Fastrack / Health Connect export into Khayaal.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--file", type=Path, required=True,
                        help="the export to read (Health Connect .zip, .csv or .json)")
    parser.add_argument("--kind", choices=KIND_CHOICES, default=None,
                        help="what a single CSV holds (auto-detected when omitted)")
    parser.add_argument("--server", default="http://localhost:3100",
                        help="Khayaal backend base URL")
    parser.add_argument("--household-id", dest="household_id", default=None,
                        help="use this household instead of the demo one")
    parser.add_argument("--pairing-code", dest="pairing_code", default=None,
                        help="pairing code, for a household that is not the demo one")
    parser.add_argument("--source-id", dest="source_id", default=None,
                        help="reuse an existing smartwatch source instead of minting one")
    parser.add_argument("--api-key", dest="api_key", default=None,
                        help="the key of that source (shown once when it was minted)")
    parser.add_argument("--label", default="Smartwatch (Fastrack band)",
                        help="label for a freshly minted source")
    parser.add_argument("--since-days", dest="since_days", type=int, default=7,
                        help="only import the last N days of the export")
    parser.add_argument("--max-records", dest="max_records", type=int, default=400,
                        help="cap on how many signals are posted")
    parser.add_argument("--dry-run", dest="dry_run", action="store_true",
                        help="print what would be posted and stop")
    args = parser.parse_args(argv)

    try:
        raw = load_file(args.file, args.kind)
        signals = reduce_signals(raw, args.since_days, args.max_records)
    except (SyncError, json.JSONDecodeError, csv.Error, OSError) as exc:
        print(f"could not read {args.file}: {exc}", file=sys.stderr)
        return 1

    if not signals:
        print(
            f"{args.file} holds nothing Khayaal can use in the last "
            f"{args.since_days} days",
            file=sys.stderr,
        )
        return 1

    counts: dict[str, int] = {}
    for s in signals:
        counts[s["type"]] = counts.get(s["type"], 0) + 1
    print(f"read {len(raw)} raw records -> {len(signals)} signals: " +
          ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))

    if args.dry_run:
        for s in signals[:10]:
            print(f"  would post {s['type']}={s['value']} at {s['ts']}")
        if len(signals) > 10:
            print(f"  … and {len(signals) - 10} more")
        return 0

    if bool(args.source_id) != bool(args.api_key):
        print("--source-id and --api-key must be given together", file=sys.stderr)
        return 1

    try:
        if args.source_id and args.api_key:
            identity = {
                "endpoint": f"{args.server}/api/v1/ingest",
                "householdId": args.household_id or "",
                "sourceId": args.source_id,
                "apiKey": args.api_key,
            }
            if not identity["householdId"]:
                raise SyncError("--household-id is required when reusing a source")
        else:
            identity = register_source(
                args.server, args.household_id, args.pairing_code, args.label
            )
    except (SyncError, requests.RequestException, KeyError, ValueError) as exc:
        print(f"could not prepare the source: {exc}", file=sys.stderr)
        return 1

    bridge = load_bridge()
    if bridge is None or not getattr(bridge, "_CRYPTO_OK", False):
        print(
            "warning: the AES-256-GCM tunnel helper is unavailable — posting "
            "in plaintext. Install it with: pip3 install cryptography",
            file=sys.stderr,
        )

    session = requests.Session()
    posted = 0
    failed = 0
    for s in signals:
        ok = post_signal(
            session,
            identity["endpoint"],
            identity["householdId"],
            identity["sourceId"],
            identity["apiKey"],
            s,
            bridge,
        )
        if ok:
            posted += 1
        else:
            failed += 1
            if failed >= 5:
                print("stopping after 5 rejections", file=sys.stderr)
                break

    print(f"posted {posted} signals to {identity['endpoint']}")
    if not args.source_id:
        print(
            "source identity (the key is shown ONCE — keep it if you want to "
            "import again):\n"
            + json.dumps(
                {
                    "householdId": identity["householdId"],
                    "sourceId": identity["sourceId"],
                    "apiKey": identity["apiKey"],
                },
                indent=2,
            )
        )
    if failed:
        print(f"{failed} signals were rejected", file=sys.stderr)
        return 1
    print(f"imported at {time.strftime('%Y-%m-%d %H:%M:%S')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
