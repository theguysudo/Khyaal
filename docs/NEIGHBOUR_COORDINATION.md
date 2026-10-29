# Neighbour coordination — responder team + no-response escalation

The neighbour surface stays **one bit and one answer**: the status shape is
green or red, and the neighbour either says "I'm responding" or does nothing.
What was missing was everything that happens *between* and *after* those
moments — and that is what this adds, without adding a single new screen of
data for a neighbour to read.

## The capability, and why this one

Research across real community-response systems shows two mechanisms that
Khayaal's neighbour program did not have:

1. **Multi-responder coordination.** GoodSAM (NHS, St John NZ, SA/TAS
   ambulance services) alerts the nearest responders simultaneously; each
   accepts or rejects, the first accepting responder leads, others join, and
   a rejection frees the next neighbour sooner. HartslagNu alerts rings of
   citizen responders the same way. Khayaal had a single `sos.ack` slot with
   last-write-wins semantics — two neighbours responding meant the second
   silently erased the first, and nobody could see who else was coming.
2. **No-response escalation.** When nobody accepts an alert, these systems
   do not just let it sit: GoodSAM escalates to the next tier of responders
   on a short timer and flags a responder who never arrives on scene; Snug
   Safety's core paid feature is the escalation chain after a missed
   check-in (contacts → live dispatcher → wellness check); caregiver
   communities (AARP, AgingCare) describe the same chain: family →
   neighbour with a key → formal wellness check. Khayaal's SOS, if nobody
   responded, rang once and then hung there forever — no re-dispatch, no
   explicit "the family must know nobody is coming" beat, no state showing
   the silence.

Availability/shifts (an "on-duty" roster) was considered and deliberately
not built: it optimizes response time, but the failure that actually harms
is *no human moving after an alarm* — and only escalation covers that.
Sources:

- GoodSAM responder model (accept/reject, escalation on no-accept,
  scene-arrival safety response): St John NZ —
  https://www.stjohn.org.nz/first-aid/lifesaving-apps/goodsam/responder ·
  Ambulance Tasmania FAQ —
  https://www.health.tas.gov.au/sites/default/files/2024-06/goodsam_-_ambulance_tasmania_staff_faqs.pdf ·
  SA Ambulance FAQ — https://saambulance.sa.gov.au/goodsam/faq
- Smartphone dispatch of community first responders (multi-responder
  alerting improves survival; escalation when unaccepted):
  https://pmc.ncbi.nlm.nih.gov/articles/PMC11887373
- Snug Safety (missed check-in → trusted contacts → dispatcher):
  https://www.snugsafe.com
- HartslagNu (concentric rings of citizen responders, accept/reject):
  https://hartslagnu.nl

## What the engine now does (packages/engine/escalation.ts)

Still pure: signals + state in → state + events out, no I/O, no
`Date.now()`. Every SOS tick re-derives, from the `sos` signals alone:

- **Responder team** — every `sos: responded` signal whose `sourceId` has
  not withdrawn joins the team. The **first** responder leads (primary);
  later responders join instead of overwriting. A `sos: withdrawn` signal
  stands that source down (`withdrawnTs` set); re-responding rejoins.
  `sos.ack` is the primary responder's ack (first-arrival semantics, no
  longer last-write-wins).
- **Anchor** — responders attach to the current emergency: the ongoing
  sos's `sinceTs` (so a responder to the auto alarm keeps their place when
  the elder also presses the button), else the latest press. Responders of
  a previous emergency never ride in on a new one.
- **No-response escalation** — while the SOS is active with nobody active
  in the team, each elapsed **response window** (default 5 min,
  `Household.neighbourRespondWindowMin` when set; capped by
  `MAX_UNANSWERED_ESCALATIONS = 3`) fires one `sos` event
  (`from 4, to 4`) whose meta reads *"No one has responded for N min —
  alarm re-rung and the family circle notified (attempt X of 3)."* The
  server's tick dispatches the alarm on every such event (the existing
  `dispatchSosAlarm` path in `lib/server/runtime.ts`, unmodified): FCM data
  message re-rings every registered phone at full volume, web push hits the
  dashboards, email lands on the care circle. A responder joining stops the
  clock; the withdrawal that empties the team restarts it **from the
  withdrawal**. Idempotent: re-ticking the same instant repeats nothing.
- **State** — `SosState.responders?: SosResponder[]` and
  `SosState.unanswered?: SosUnanswered | null` (both additive/optional in
  `packages/shared/src/index.ts`).

Tests: `packages/engine/tests/neighbour-response.test.ts` (11 tests; the
engine suite is 60 green including the pre-existing 49).

## API contract for the Android apps

Base: `/api/v1`. All bodies JSON. Rate limits: pair 5/min/IP, status
60/min/IP, respond & withdraw 20/min/IP. Auth responses mirror the existing
house rules (404 for unauthorized household lookups, no existence oracle).

### Pairing (unchanged)

```
POST /api/v1/neighbour/pair        { pairingCode, name }        → 200
  Set-Cookie: kh_neighbour=...  (store it; all neighbour calls use it)
  → { householdId, householdName, sourceId }
```

### Status — GET /api/v1/neighbour/status?hh={householdId}

Cookie-auth. The read is a **tick**: it advances the engine, so a neighbour
app polling this while the family dashboards are closed is what drives
escalation. Poll ~15 s idle; ~5 s while an SOS is active.

```jsonc
{
  "householdName": "Amma's home",
  "parentName": "Amma",
  "allWell": false,                       // one bit: green shape ↔ red shape
  "tier": 4,
  "status": "SOS — Amma pressed the emergency button — Meera is responding (+1 helping)",
  "sos": {
    "active": true,
    "origin": "button",                   // 'button' | 'auto' | null
    "sinceTs": 1793300924534,             // sim-time epoch ms
    "ack": { "by": "Neighbour · Meera next door", "ts": 1793300924534 },
    "responders": [                       // THIS sos only, join order; names only
      { "by": "Neighbour · Meera next door", "respondedTs": 1793300924534,
        "etaMin": 4, "withdrawnTs": null },
      { "by": "Neighbour · Devi across the road", "respondedTs": 1793300924587,
        "etaMin": 10, "withdrawnTs": 1793300936313 }
    ],
    "unanswered": {                       // null while anyone is responding
      "attempts": 2, "windowMin": 5,
      "emptySinceTs": 1793300936384, "lastEscalationTs": 1793301236384
    }
  },
  "me": {                                 // THIS neighbour, by cookie source
    "responding": true,
    "isPrimary": true,
    "respondedTs": 1793300924534,
    "etaMin": 4
  },
  "escalation": {
    "unanswered": false,                  // true while nobody is responding
    "attempts": 0,
    "windowMin": 5,
    "nextBeatInMs": null                  // ms until the family is re-alerted;
  },                                      // null once capped or answered
  "contacts": [                           // family call contacts, SOS only
    { "name": "Aditya", "phone": "+91..." }
  ],
  "serverTs": 1793301250000
}
```

Unpaired (no/foreign cookie): `403 { error: "Pair with the household code
first" }`. Revoked (source deleted by the family): `403 { error: "This
neighbour access was revoked" }`.

### Respond — POST /api/v1/household/{id}/sos/respond

Cookie-auth (neighbour) or family session; scope `respond`. Call only while
`sos.active` is true (the app shows the FAB only then).

```
body { etaMin?: number 1..120, by?: string (display name override) }
→ 200 { sos, tier, status }   // sos.responders now includes me; me.isPrimary
                              // is true only if I was first and am still active
→ 404 when unauthorized (no oracle)
```

Does **not** silence the alarm. Repeat calls update my `etaMin`/display name
and never duplicate me in the team.

### Withdraw — POST /api/v1/household/{id}/sos/withdraw  (NEW)

"Two minutes" that became forty is worse than silence: it tells the next
neighbour nobody is needed. Withdraw when you cannot actually go.

```
body { by?: string }
→ 200 { sos, tier, status }   // my responder entry carries withdrawnTs;
                              // primary passes to the next active responder;
                              // if the team is empty, sos.unanswered restarts
→ 409 { error: "No active SOS" }   // nothing to stand down from; reset UI
→ 404 when unauthorized
```

A withdrawal from a source that never responded is ignored by the engine.

### Raise / resolve (family + elder phone; unchanged)

`POST /api/v1/household/{id}/sos` (scope `sos` — neighbours cannot raise),
`POST .../sos/resolve` (family or the elder's phone — neighbours cannot
declare her safe). Response shape `{ sos, tier, status }` now carries the
additive `responders`/`unanswered` fields for the family dashboard too.

## Escalation timing (what the phones will observe)

- t0 — SOS fires: every registered phone rings (existing alarm dispatch).
- t0 + w, + 2w, + 3w (w = response window, default 5 min) — while **nobody**
  is responding: one escalation beat each. The alarm dispatches again
  (data-message `type: "sos_alarm"`, so Android re-rings at full volume)
  with the beat reason, and the care circle gets the explicit
  "no one has responded" email/push. Beats cap at 3.
- Any respond → beats stop; `escalation.unanswered` false. All responders
  withdrawn → the clock restarts from the last withdrawal.
- Resolve (family/elder) → SOS down everywhere, `allWell` true.

Per-household tuning: `Household.neighbourRespondWindowMin` (optional,
minutes; default 5). The demo time-warp (`PATCH .../config
{ simAdvanceMinutes }`) compresses it for staged demos without touching the
window itself.

## UI guidance for the neighbour app (Android team)

The console stays: one morphing status shape (green ↔ red), the respond
FAB, the on-duty pill, the call contacts. Three additive cues during an
active SOS, all from fields that already exist:

1. **Who is coming** — first active `responders[].by` under the status
   line, `+N helping` for the rest; withdrawn responders drop out. `me`
   tells the user whether their own name is on that list.
2. **The FAB is stateful** — "I'm responding (ETA 4 min)" while
   `me.responding`, switching to "I can't anymore" (withdraw) on tap.
3. **The silence chip** — when `escalation.unanswered`, show
   "Nobody has responded — the family is re-alerted in
   `<nextBeatInMs/60000>` min". This is the one place the neighbour should
   feel urgency about *inaction*: it is what turns a neighbour who cannot
   go into one who withdraws (freeing the truth) or calls the family
   instead.

Materials: `docs/DESIGN_SYSTEM.md` — responder chip `on-error` @ 14% bg,
FAB full-width `primary`, morphing status shape. Never add the feed, the
score, or the signals to this surface.
