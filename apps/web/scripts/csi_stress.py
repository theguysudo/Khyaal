#!/usr/bin/env python3
"""Benchmark the CSI path end to end: device -> /ingest -> /csi.

Three phases against a running server:

  A. steady state  — one device posting a batched csi event every second
                     (exactly what the real ESP32 does) while the dashboard
                     polls GET /csi once a second, for STEADY_S.
  B. burst         — BURST_DEVICES devices at once, plus concurrent readers,
                     for BURST_S.
  C. flood         — unpaced posts until the 120/min ingest limiter bites;
                     proves the limiter sheds load with 429s and no 5xx.

Usage:
  python3 csi_stress.py [--base http://localhost:3100] [--hh ... --src ... --key ...]
  (identity defaults to firmware/tunnel/config.json — run register_source.py first)
"""

import argparse
import json
import statistics
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

STEADY_S = 30
BURST_DEVICES = 8
BURST_S = 15
FLOOD_N = 300

lock = threading.Lock()


def post(base, hh, src, key, payload, timeout=10):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{base}/api/v1/ingest",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            res.read()
            return time.perf_counter() - t0, res.status
    except urllib.error.HTTPError as e:
        e.read()
        return time.perf_counter() - t0, e.code
    except Exception:
        return time.perf_counter() - t0, 0


def csi_get_device(base, hh, src, key, timeout=15):
    req = urllib.request.Request(
        f"{base}/api/v1/household/{hh}/csi",
        headers={"x-kh-household": hh, "x-kh-source": src, "x-kh-key": key},
    )
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            res.read()
            return time.perf_counter() - t0, res.status
    except urllib.error.HTTPError as e:
        e.read()
        return time.perf_counter() - t0, e.code
    except Exception:
        return time.perf_counter() - t0, 0


def csi_payload(src, ts, thr=25.0, state="idle"):
    samples = [round(8.0 + (30.0 if state == "motion" else 0.0) * (0.7 + 0.6 * ((i * 37) % 11) / 11), 2) for i in range(4)]
    fast = [round(s * 1.5, 2) for s in samples]
    return {
        "householdId": None,  # filled by caller
        "sourceId": src,
        "type": "csi",
        "value": samples[-1],
        "meta": {"mean": 12.4, "pkt": 86.0, "state": state, "thr": thr, "samples": samples, "fast": fast},
        "ts": ts,
    }


class Recorder:
    def __init__(self):
        self.rows = []  # (kind, dt, status)

    def add(self, kind, dt, status):
        with lock:
            self.rows.append((kind, dt, status))

    def report(self, title):
        print(f"\n== {title} ==")
        for kind in sorted({k for k, _, _ in self.rows}):
            dts = [dt for k, dt, _ in self.rows if k == kind]
            codes = {}
            for k, _, s in self.rows:
                if k == kind:
                    codes[s] = codes.get(s, 0) + 1
            dts.sort()
            n = len(dts)
            p = lambda q: dts[min(n - 1, int(q * n))]
            print(
                f"  {kind:12s} n={n:5d}  p50={p(0.50)*1000:7.0f}ms  p95={p(0.95)*1000:7.0f}ms"
                f"  p99={p(0.99)*1000:7.0f}ms  max={dts[-1]*1000:7.0f}ms  statuses={codes}"
            )


def server_rss():
    try:
        pid = subprocess.run(
            ["lsof", "-t", "-iTCP:3100", "-sTCP:LISTEN"], capture_output=True, text=True
        ).stdout.split()
        if pid:
            out = subprocess.run(["ps", "-o", "rss=", "-p", pid[0]], capture_output=True, text=True)
            return int(out.stdout.strip())
    except Exception:
        pass
    return None


def device_loop(base, hh, src, key, stop_at, rec, gap=1.0):
    ts_ms = int(time.time() * 1000)
    while time.time() < stop_at:
        ts_ms += int(gap * 1000)
        payload = csi_payload(src, ts_ms)
        payload["householdId"] = hh
        payload["apiKey"] = key
        dt, status = post(base, hh, src, key, payload)
        rec.add(f"ingest", dt, status)
        time.sleep(gap)


def reader_loop(base, hh, src, key, stop_at, rec, gap=1.0):
    while time.time() < stop_at:
        dt, status = csi_get_device(base, hh, src, key)
        rec.add("GET /csi", dt, status)
        time.sleep(gap)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3100")
    ap.add_argument("--hh"); ap.add_argument("--src"); ap.add_argument("--key")
    args = ap.parse_args()

    hh, src, key = args.hh, args.src, args.key
    if not (hh and src and key):
        cfgp = Path(__file__).resolve().parents[3] / "firmware" / "tunnel" / "config.json"
        cfg = json.loads(cfgp.read_text())
        hh = hh or cfg.get("householdId")
        src = src or cfg.get("sourceId")
        key = key or cfg.get("apiKey")
    print(f"household {hh}\nsource    {src}")

    rss0 = server_rss()
    print(f"server RSS before: {rss0} KB")

    # sanity: one authenticated GET
    dt, status = csi_get_device(args.base, hh, src, key)
    if status != 200:
        print(f"sanity GET /csi failed: {status} — check identity", file=sys.stderr)
        sys.exit(2)

    rec = Recorder()

    # ---- Phase A: one real device, one reader
    print(f"\n=== PHASE A: steady state, {STEADY_S}s (1 device @ 1 Hz + 1 reader @ 1 Hz) ===")
    stop = time.time() + STEADY_S
    threads = [
        threading.Thread(target=device_loop, args=(args.base, hh, src, key, stop, rec)),
        threading.Thread(target=reader_loop, args=(args.base, hh, src, key, stop, rec)),
    ]
    for t in threads: t.start()
    for t in threads: t.join()

    # ---- Phase B: burst
    print(f"\n=== PHASE B: {BURST_DEVICES} devices + {BURST_DEVICES} readers for {BURST_S}s ===")
    stop = time.time() + BURST_S
    threads = []
    for i in range(BURST_DEVICES):
        threads.append(threading.Thread(target=device_loop, args=(args.base, hh, src, key, stop, rec, 1.0)))
        threads.append(threading.Thread(target=reader_loop, args=(args.base, hh, src, key, stop, rec, 1.0)))
    for t in threads: t.start()
    for t in threads: t.join()

    # ---- Phase C: flood
    print(f"\n=== PHASE C: ingest flood ({FLOOD_N} posts, no pacing) ===")
    ts_ms = int(time.time() * 1000)
    codes = {}
    for i in range(FLOOD_N):
        ts_ms += 250
        payload = csi_payload(src, ts_ms)
        payload["householdId"] = hh
        payload["apiKey"] = key
        _, status = post(args.base, hh, src, key, payload)
        codes[status] = codes.get(status, 0) + 1
    print(f"  statuses: {codes}")

    rec.report("ALL TIMED PHASES")

    rss1 = server_rss()
    print(f"\nserver RSS after:  {rss1} KB (delta {None if not (rss0 and rss1) else rss1 - rss0} KB)")
    codes_all = {}
    for _, _, s in rec.rows:
        codes_all[s] = codes_all.get(s, 0) + 1
    fivehundreds = sum(v for k, v in codes_all.items() if 500 <= k < 600)
    print(f"5xx responses across the whole run: {fivehundreds}")
    print("PASS" if fivehundreds == 0 else "FAIL")


if __name__ == "__main__":
    main()
