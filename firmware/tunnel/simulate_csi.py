#!/usr/bin/env python3
"""A fake room sensor that speaks the real firmware's CSI wire format.

Writes the same JSON lines the ESP32 does — batched "csi" readings once a
second plus "presence" events on state changes — into a PTY, so the serial
bridge, the server and the dashboard's live scope and blueprint can all be
demoed and load-tested with no hardware attached.

  python3 simulate_csi.py                     # 4 s motion / 6 s idle, forever
  python3 simulate_csi.py --cycles 1 --fall   # one short cycle ending in a fall
  python3 simulate_csi.py --motion 3 --idle 5 --noise 8 --spike 60

The first stdout line is the PTY's slave path; feed it to the bridge:
  python3 khayaal_serial_bridge.py --port /dev/ttysNNN ...
"""

import argparse
import json
import os
import pty
import random
import sys
import time

PATTERN_NOTE = "motion then idle, repeating"


def parse_args(argv=None):
    p = argparse.ArgumentParser(description="Khayaal fake CSI sensor (PTTY).")
    p.add_argument("--motion", type=float, default=4.0,
                   help="seconds of motion per cycle")
    p.add_argument("--idle", type=float, default=6.0,
                   help="seconds of quiet per cycle")
    p.add_argument("--cycles", type=int, default=0,
                   help="how many motion/idle cycles (0 = forever)")
    p.add_argument("--noise", type=float, default=8.0,
                   help="baseline variance when the room is still")
    p.add_argument("--spike", type=float, default=60.0,
                   help="variance during motion")
    p.add_argument("--threshold", type=float, default=25.0,
                   help="motion threshold reported in the readings")
    p.add_argument("--fall", action="store_true",
                   help="end the last motion burst with a fall pattern")
    p.add_argument("--gap", type=float, default=1.0,
                   help="seconds between batched csi events (1 = like the device)")
    p.add_argument("--no-presence", action="store_true",
                   help="emit csi readings only, no presence events")
    return p.parse_args(argv)


def open_pty():
    master, slave = pty.openpty()
    path = os.ttyname(slave)
    return master, path


def emit(master, obj):
    line = json.dumps(obj, separators=(",", ":"))
    os.write(master, (line + "\n").encode())


def variance_for(moving, args):
    if moving:
        # ramps and wobble — a hand wave is not a flat line
        base = args.spike * random.uniform(0.7, 1.35)
        return round(base + random.uniform(-6, 6), 2)
    return round(max(0.5, args.noise * random.uniform(0.6, 1.25)), 2)


def main():
    args = parse_args()
    master, path = open_pty()
    print(path, flush=True)

    # A real board reads its serial CLI continuously; without this drain the
    # PTY's input queue fills and anything writing CLI lines to us blocks.
    import threading

    def _drain():
        while True:
            try:
                os.read(master, 1024)
            except OSError:
                break

    threading.Thread(target=_drain, daemon=True).start()

    state = "idle"
    cycle = 0
    moving_until = 0.0
    quiet_until = 0.0
    fall_emitted = False
    next_batch = time.time()

    while True:
        now = time.time()
        if args.cycles and cycle >= args.cycles and state == "idle":
            break

        # state machine (mirrors the device's cadence, simplified)
        if state == "idle" and now >= quiet_until:
            state = "motion"
            moving_until = now + args.motion
            cycle += 1
            if not args.no_presence:
                emit(master, {"type": "presence", "value": "motion", "ts": int(now * 1000)})
        elif state == "motion" and now >= moving_until:
            if args.fall and not fall_emitted:
                fall_emitted = True
                if not args.no_presence:
                    emit(master, {"type": "presence", "value": "fall", "ts": int(now * 1000)})
            state = "idle"
            quiet_until = now + args.idle
            if not args.no_presence:
                emit(master, {"type": "presence", "value": "idle", "ts": int(now * 1000)})

        if now >= next_batch:
            next_batch = now + args.gap
            n = 4  # the device batches 4 readings per second
            slow = [variance_for(state == "motion", args) for _ in range(n)]
            fast = [round(v * random.uniform(1.1, 1.9), 2) for v in slow]
            emit(master, {
                "type": "csi",
                "value": slow[-1],
                "meta": {
                    "mean": round(random.uniform(11.0, 14.5), 1),
                    "pkt": round(random.uniform(70.0, 95.0), 1),
                    "state": state,
                    "thr": args.threshold,
                    "samples": slow,
                    "fast": fast,
                },
                "ts": int(now * 1000),
            })

        time.sleep(min(0.05, max(0.02, args.gap / 10)))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
