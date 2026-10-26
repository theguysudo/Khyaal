# Security model & self-test

## Threat model

Khayaal's data is deliberately minimal (no camera, no microphone recording, no
GPS, no message content), but what little exists must not leak: presence
signals, wellbeing scores, care-circle identities, pairing keys.

## Controls in place

| Control | Implementation |
| --- | --- |
| Encryption at rest | Every stored signal is AES-256-GCM sealed (`lib/server/crypto-box.ts`, 256-bit key, random IV, auth tag) — the store holds ciphertext envelopes only |
| Per-source auth | Ingest requires a paired source; per-source API key returned exactly once; wrong key → 403 (timing-safe comparisons on sessions) |
| Family sessions | HMAC-SHA256 signed HttpOnly SameSite cookies; forged/malformed tokens rejected without oracle behaviour |
| Session hand-off | One-time, 5-minute, single-use transfer links for phones |
| Rate limiting | Sliding-window per IP: ingest 120/min, pair 10/min, commands 20/min, analysis 6/min, assistant 10/min |
| Input validation | Strict signal-type allow-list; command text rejected beyond 280 chars; emails validated; unknown actions → 400 |
| Transport headers | CSP, X-Frame-Options DENY, nosniff, strict Referrer-Policy, Permissions-Policy locking camera and geolocation while allowing the microphone on our own origin — the consent-gated talkback needs it, and `microphone=()` made `getUserMedia` reject outright with no browser prompt to allow |
| Privacy by API | The child-facing state bundle contains no raw signals and no API keys — enforced by construction |
| Least data | No location permission on Android; ESP32 emits a presence scalar only; audio never leaves the device |
| Secret hygiene | `.env.local`, `.session-secret`, `.crypto-key` are gitignored; the OAuth client secret never ships to the app (assistant/analysis are proxied server-side) |

## Self-test (penetration pass)

`BASE=http://localhost:3100 bash apps/web/scripts/pentest.sh` — 15 checks
covering headers, source/key auth, input validation, child-bundle privacy,
session forgery and rate limiting. **Current status: 15 / 15 passing.**

### Findings fixed during this pass

1. Command text was silently truncated instead of rejected — now a hard 400
   beyond 280 chars.
2. The pen-test itself had a wrong expectation for unknown-household ingest
   (server correctly rejects before source lookup).

## Known limits (honest list)

- HTTP on the LAN during demos; production must sit behind TLS (any reverse
  proxy works — the app sets no cookies that require insecure transport).
- The memory store resets on restart (Firestore adapter is the persistence
  path; its `setState` should run in a transaction).
- Rate limiting is per-process; multi-instance deployments need a shared
  counter (Firestore/Redis).
- The OAuth client secret lives in `.env.local` on the server only; rotate it
  if it was ever shared in chat.
