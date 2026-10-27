# Khayaal — Security Audit

**Date:** 2026-10-24 · **Scope:** `apps/web` (API + dashboard), `apps/android` (v0.3.0), `firmware` (ESP32 + tunnel) · **Method:** manual code review of every route and transport, then an executable regression suite (`apps/web/scripts/pentest.sh`, **37 checks**) plus the pipeline-level crypto checks (`firmware/test-pipeline.sh enc`).

Khayaal's threat model is unusual for a hackathon-scale project: the data is about a dependent person, so **false alerts and silenced alerts are both safety failures**, and the household API is reachable from a phone hotspot (shared, untrusted network) during demos.

---

## 1. Findings & fixes

### F1 · Household API had no authorization (Critical — fixed)
Every `/api/v1/household/{id}/*` route accepted any caller who knew or guessed the household id — reading state, **sending commands to her phone**, editing the escalation config, adding care-circle contacts, registering FCM tokens, running LLM analysis, triggering check-ins, and re-running the demo time-warp. Household ids appear in URLs and browser history.

**Fix:** `apps/web/lib/server/authz.ts` — every household route now goes through one of:
- `requireFamily` — HMAC-signed session cookie whose subject is linked to the household (owner or claimed care-circle member). Governs: commands POST, circle, config, demo, sources, analysis, ack, push-subscribe.
- `requireHouseholdMember` — family session **or** device credentials (`x-kh-source` + `x-kh-key`, constant-time compared via SHA-256 + `timingSafeEqual`). Governs: state, checkin, snooze, command-ack, devices, assistant.
- Unknown/unauthorised ids answer **404 "Household not found"** (never 401/403) so existence is not confirmable.
- The `/demo` console runs without a Google login on purpose, so `pair {action:'demo'|'create'}` now issues a **signed, household-bound demo cookie** (`kh_demo`, HMAC-SHA256, HttpOnly, 1 day) that authorizes exactly that household — verified to confer no power over any other household.

Verified by the 14 "anonymous route blocked" and 3 "demo console isolation" pen-test checks.

### F2 · Source creation minted API keys to anyone (Critical — fixed)
`POST /household/{id}/sources` returned a fresh `sk_…` API key to any unauthenticated caller holding the household id. That key is the credential for ingest and every device route.

**Fix:** source creation now requires either a family session or the household's **current pairing code** (which a pairing phone legitimately holds), and **the code is rotated immediately after use** (`requireSourceCreator` in authz.ts) — a captured pairing request cannot mint more keys. The web dashboard already pairs in-session; `register_source.py` and the Android app now present the code (the app passes the code it just joined with; the server rotates it in the same call).

### F3 · Ingest accepted keyless plaintext (High — fixed)
`ingestSignal` treated the API key as optional: anyone with the household + source id could inject signals — including forged `presence: fall` events, which escalate to tier 3 and trigger the call chain.

**Fix:** the key is now **required** on plaintext ingest (403 without it). Encrypted envelopes authenticate by possession of the key itself (F5).

### F4 · Unbounded LLM proxy input (Medium — fixed)
`/assistant` accepted unlimited message history/content lengths upstream (an LLM spend/abuse vector), and `/analysis` was callable without a session.

**Fix:** `/assistant` is now household-member-gated, messages capped at 8 turns × 2000 chars; `/analysis` is family-only; both keep their existing per-IP rate limits (10/min, 6/min).

### F5 · Tunnel traffic was plaintext HTTP (High — fixed)
Three legs carry signals: app → server, bridge → server (USB-serial tunnel), and ESP32 → server (LAN mode). The latter two were plain JSON over HTTP on the hotspot.

**Fix — AES-256-GCM on the tunnel (`enc v1` envelope):**
- **Key derivation:** `HKDF-SHA256(sourceApiKey, salt="khayaal-tunnel-v1", info="khayaal/ingest", 32 bytes)` — the key never travels; capturing traffic reveals only identity fields and ciphertext.
- **AAD binding:** ciphertext is authenticated against `"{householdId}|{sourceId}"`, so a recorded envelope cannot be replayed into a different household or under a different source (verified live — 403).
- **Replay protection:** the server remembers `(sourceId, iv)` for 1 h; repeats are rejected with 409.
- **Tamper:** any flipped byte fails the GCM tag → 400.
- **Implementations:** bridge (Python `cryptography`, default on, plaintext fallback only with a loud warning), server (`lib/server/tunnel-crypto.ts`, node:crypto), and the ESP32 itself (`tunnel_crypto.cpp` over mbedtls, `enc on|off` serial CLI, default on). Plaintext with a valid key remains accepted for the app's body-based auth and as a bridge fallback.
- Envelope: `{ enc:"v1", iv, tag, ct }` — one command to verify: `bash firmware/test-pipeline.sh enc`.

### F6 · Serial port & USB artifacts (Low — accepted, documented)
The tunnel `config.json` stores the source API key in plaintext on the operator's Mac, and the ESP32 holds it in NVS. This is inherent to a no-backend demo (no KMS); mitigations: keys are per-source and rotatable by re-pairing, NVS is only readable over USB with physical access, and the whole household is disposable.

### F7 · Session/OAuth hardening (passed, no action)
- Session cookies: HMAC-SHA256-signed, HttpOnly, SameSite=Lax, 7-day expiry; forging fails (pen-test check).
- Google OAuth: random `state` double-submitted via cookie (CSRF-safe), redirect URI fixed to localhost, profile fetched from Google's OIDC endpoint; secrets only in `.env.local` (gitignored).
- Transfer links: one-time, 5-minute TTL, single-use (consumed on first hit), full-profile rotation on claim.
- At rest: signals are AES-256-GCM encrypted (`crypto-box.ts`, key outside the repo) before touching the store, and the Firestore adapter keeps that envelope format.
- Transport to browsers: security headers (CSP, X-Frame-Options DENY, nosniff, Permissions-Policy locking camera/mic/geolocation) on every response; HSTS noted as N/A for LAN HTTP demos.

## 2. Known limits (honest)
- LAN HTTP between device and server on the personal hotspot is protected by the envelope-level AES-256-GCM above, not by TLS; there is no server certificate on a hotspot demo.
- Rate limits are per-process, in-memory — appropriate for single-node demos, not a distributed deployment.
- The demo pair endpoint (`action:"demo"`) still creates households without a session so judges can start instantly; it is rate-limited (10/min) and disposable.
- Firmware crypto (`tunnel_crypto.cpp`) compiles against the Arduino-ESP32 bundled mbedtls but has not been flashed yet (board port requires a physical replug); `enc off` reverts to plaintext if anything misbehaves on hardware.

## 3. How to re-run the audit
```bash
# 40 executable checks (headers, authz, demo isolation, crypto, privacy,
# forgery, rate limits)
BASE=http://localhost:3100 bash apps/web/scripts/pentest.sh

# tunnel crypto + full pipeline (sim needs no hardware)
bash firmware/test-pipeline.sh enc
bash firmware/test-pipeline.sh sim

# engine behaviour (incl. fall escalation) — 20 tests
npm test -w @khayaal/engine
```
