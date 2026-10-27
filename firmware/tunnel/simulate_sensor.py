#!/usr/bin/env python3
"""
simulate_sensor.py — a Khayaal ESP32 room sensor without the hardware.

Emits exactly the JSON lines the real firmware emits (one `presence` event
per line), over a pseudo-terminal so the *real* serial bridge can be tested
end to end: bridge parses, stamps `ts`, enriches, POSTs to the backend and
the engine escalates. No pyserial needed on the simulator side — the bridge
opens the PTY slave; we write the master.

Pattern (loops): idle → motion → idle → motion → fall → idle …
The `fall` exercises the whole tier-3 escalation path.

Usage:
    python3 simulate_sensor.py                 # prints the PTY path, loops
    python3 simulate_sensor.py --once          # one full pattern, then exit
    python3 simulate_sensor.py --fall-only     # a single fall event, then exit
    python3 simulate_sensor.py --path-only     # print path and wait (for tests)
"""
from __future__ import annotations

import argparse
import json
import os
import pty
import sys
import time

PATTERN = ["idle", "motion", "idle", "motion", "fall", "idle", "motion", "idle"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true", help="run one pattern, then exit")
    ap.add_argument("--fall-only", action="store_true", help="emit one fall, then exit")
    ap.add_argument("--gap", type=float, default=1.5, help="seconds between events")
    args = ap.parse_args()

    master, slave = pty.openpty()
    path = os.ttyname(slave)
    print(path, flush=True)

    events: list[str]
    if args.fall_only:
        events = ["fall"]
    elif args.once:
        events = PATTERN
    else:
        events = PATTERN * 10_000  # effectively forever

    for value in events:
        line = json.dumps({"type": "presence", "value": value, "ts": int(time.time() * 1000)})
        os.write(master, (line + "\n").encode())
        print(f"sim: {line}", file=sys.stderr, flush=True)
        time.sleep(args.gap)

    os.close(master)
    os.close(slave)


if __name__ == "__main__":
    main()
