#!/usr/bin/env python3
"""
register_source.py — get (or re-point) a Khayaal ESP32 source in one command.

The local Khayaal server keeps the demo household and its sources in memory,
so a server restart invalidates the ids in tunnel/config.json. This script:

    1. POSTs /api/v1/pair {action:"demo"}       -> householdId
       (or uses --household-id if given)
    2. POSTs /api/v1/household/<id>/sources     -> sourceId + apiKey (once)
    3. rewrites tunnel/config.json next to this script

Usage:
    python3 register_source.py
    python3 register_source.py --server http://localhost:3100
    python3 register_source.py --household-id hh_xxx
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any, Optional

try:
    import requests
except ImportError:  # pragma: no cover
    sys.exit("requests missing — run: pip3 install requests")


def register(server: str, household_id: Optional[str], label: str) -> dict[str, Any]:
    """Create a source on `server` and return the full ingest identity."""
    if not household_id:
        resp = requests.post(
            f"{server}/api/v1/pair",
            json={"action": "demo"},
            timeout=5,
        )
        resp.raise_for_status()
        household_id = resp.json()["household"]["id"]
        print(f"household: {household_id}")

    resp = requests.post(
        f"{server}/api/v1/household/{household_id}/sources",
        json={"type": "esp32", "label": label},
        timeout=5,
    )
    resp.raise_for_status()
    source = resp.json()
    return {
        "endpoint": f"{server}/api/v1/ingest",
        "householdId": household_id,
        "sourceId": source["id"],
        "apiKey": source["apiKey"],
    }


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Register an ESP32 source on the Khayaal server and "
                    "update tunnel/config.json.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--server", default="http://localhost:3100",
                        help="Khayaal backend base URL")
    parser.add_argument("--household-id", dest="household_id", default=None,
                        help="use this household instead of the demo one")
    parser.add_argument("--label", default="Room sensor (ESP32)",
                        help="label shown in the web app")
    parser.add_argument("--config", type=Path,
                        default=Path(__file__).with_name("config.json"),
                        help="config file to write")
    args = parser.parse_args(argv)

    try:
        identity = register(args.server, args.household_id, args.label)
    except (requests.RequestException, KeyError, ValueError) as exc:
        print(f"registration failed: {exc}", file=sys.stderr)
        return 1

    args.config.write_text(
        json.dumps(identity, separators=(",", ":")) + "\n", encoding="utf-8"
    )
    print(f"source registered at {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(json.dumps(identity, indent=2))
    print(f"written to {args.config} — the apiKey is shown ONCE; keep it")
    return 0


if __name__ == "__main__":
    sys.exit(main())
