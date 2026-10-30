'use client';

/**
 * The documentation section on the homepage — everything a judge, a curious
 * visitor or a future teammate needs to understand Khayaal in one scroll:
 * what it is, how a signal travels from her phone to your dashboard, the
 * stack it is built on, the API surface, and the privacy model.
 *
 * The same content lives in the README; this is the readable version of it.
 */

import Link from 'next/link';

const PIPELINE = [
  {
    step: '01',
    title: 'Her phone',
    body: 'An Android app watches the ordinary: unlock, movement, steps, charging, sleep, loudness. Everything is classified on the device.',
    tag: 'Kotlin · Jetpack Compose',
  },
  {
    step: '02',
    title: 'The room sensor',
    body: 'An optional ESP32 reads Wi-Fi CSI to feel movement and falls. No camera in the house, no microphone, and she wears nothing.',
    tag: 'Arduino · ESP-CSI · AES-256-GCM',
  },
  {
    step: '03',
    title: 'One API',
    body: 'Every source speaks the same contract: POST /api/v1/ingest. The tunnel is sealed with AES-256-GCM under a key the server never transmits.',
    tag: 'Next.js 15 · TypeScript',
  },
  {
    step: '04',
    title: 'The engine',
    body: 'A pure TypeScript risk engine turns absence into one score. Missing data lowers confidence; it never raises the score alone.',
    tag: 'packages/engine · Vitest',
  },
  {
    step: '05',
    title: 'Your dashboard',
    body: 'The family sees a status, a plain-language reason and a ladder. Never a feed.',
    tag: 'React 19 · Tailwind',
  },
];

const STACK = [
  {
    group: 'Web',
    items: ['Next.js 15 (App Router)', 'React 19', 'TypeScript', 'Tailwind CSS', 'Hand-rolled OAuth (no extra deps)'],
  },
  {
    group: 'Engine',
    items: ['Pure TypeScript', 'Vitest (25 tests)', 'Rule-based scoring', 'Dwell timers, quiet hours', 'Idempotent escalation'],
  },
  {
    group: 'Android',
    items: ['Kotlin · Jetpack Compose', 'Retrofit + kotlinx.serialization', 'WorkManager collectors', 'AndroidKeyStore AES-256-GCM', 'AppWidget to-do widget'],
  },
  {
    group: 'Firmware',
    items: ['ESP32-WROOM-32', 'Arduino-ESP32 3.x', 'Espressif esp-csi', 'HKDF-SHA256 tunnel keys', 'AES-256-GCM sealed ingest'],
  },
  {
    group: 'Infrastructure',
    items: ['Firebase Spark (Firestore)', 'Google OAuth 2.0', 'FCM + VAPID push', 'SMTP email', 'MiniMax · NVIDIA NIM · OpenRouter'],
  },
  {
    group: 'Delivery',
    items: ['npm workspaces monorepo', 'GitHub Actions CI', 'Android APK as a build artifact', 'One-command ESP32 test pipeline', 'Free tier only — no paid service'],
  },
];

const API_ROWS: [string, string, string][] = [
  ['POST', '/api/v1/ingest', 'One signal from any source (phone, ESP32, bridge).'],
  ['GET', '/api/v1/household/{id}/state', 'The tick: score, tier, reasons, events, movement.'],
  ['POST', '/api/v1/household/{id}/checkin', 'Her one-tap "I\'m OK".'],
  ['POST', '/api/v1/household/{id}/commands', 'Family → phone: message, reminder, spoken TTS, check-in request.'],
  ['POST', '/api/v1/household/{id}/assistant', 'Ask Khayaal — proxied to a free LLM, the app holds no key.'],
  ['POST', '/api/v1/household/{id}/talkback/request', 'Ask to talk. The other side gets a consent popup first.'],
  ['POST', '/api/v1/household/{id}/talkback/answer', 'Allow or decline. Nothing is recorded without Allow.'],
  ['POST', '/api/v1/device/actions', 'The dashboard\'s control channel to the sensor (fall test, Wi-Fi).'],
];

const PRIVACY = [
  { title: 'No camera, ever', body: 'There is no video pipeline, no image and no microphone recording in the sensing path.' },
  { title: 'No location trail', body: 'The phone works out home or away and a few movement numbers on-device. Coordinates never leave it.' },
  { title: 'No message content', body: 'App usage is a package name. Nothing ever reads a message, a call or a notification.' },
  { title: 'Encrypted at rest and in transit', body: 'Signals are AES-256-GCM sealed in the store; the sensor tunnel is sealed on the wire.' },
  { title: 'Consent before audio', body: 'Talkback opens a microphone only after the other side taps Allow. The audio passes through and is gone.' },
  { title: 'Seven days, then gone', body: 'Signal history is discarded after a week. The dashboard only ever shows aggregates.' },
];

export default function Docs() {
  return (
    <section id="docs" className="relative overflow-hidden bg-paper px-5 py-24 sm:px-8">
      <div className="relative mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-clay">The complete picture</p>
          <h2 className="mt-3 font-heading text-4xl leading-[1.08] tracking-tight text-ink sm:text-5xl">
            How Khayaal actually works
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink/60">
            Khayaal is a passive wellbeing monitor for a parent living alone. It watches the ordinary signals of a day
            and learns what a normal day looks like for her. When several absences pile up at once, it tells the family.
            It never asks her to do anything, and it never shows the family a feed.
          </p>
        </div>

        {/* the pipeline */}
        <div className="mt-14">
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-ink/40">One signal, end to end</p>
          <ol className="mt-5 grid gap-3 md:grid-cols-5">
            {PIPELINE.map((p, i) => (
              <li
                key={p.step}
                className="group relative rounded-lg border border-[#E7E2DA] bg-white p-5 transition-colors duration-200 hover:border-[#D6CFC4]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[11px] tracking-[0.2em] text-clay">{p.step}</span>
                  {i < PIPELINE.length - 1 && (
                    <span aria-hidden className="text-ink/20 sm:hidden">
                      ↓
                    </span>
                  )}
                </div>
                <h3 className="mt-3 font-heading text-[19px] leading-tight text-ink">{p.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-ink/60">{p.body}</p>
                <p className="mt-3 border-t border-ink/8 pt-3 font-mono text-[10.5px] leading-relaxed text-ink/40">
                  {p.tag}
                </p>
              </li>
            ))}
          </ol>
        </div>

        {/* the stack */}
        <div className="mt-16">
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-ink/40">The stack</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STACK.map((group) => (
              <div key={group.group} className="rounded-lg border border-[#E7E2DA] bg-white p-5">
                <h3 className="font-heading text-[17px] text-ink">{group.group}</h3>
                <ul className="mt-3 space-y-1.5">
                  {group.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-[13px] leading-relaxed text-ink/60">
                      <span aria-hidden className="mt-[7px] h-1 w-1 flex-none rounded-full bg-clay/70" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* the API */}
        <div className="mt-16 grid gap-8 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-ink/40">The API</p>
            <h3 className="mt-3 font-heading text-[28px] leading-tight text-ink">One contract, every surface</h3>
            <p className="mt-3 max-w-prose text-[14px] leading-relaxed text-ink/60">
              The phone, the sensor, the USB bridge and the dashboard all speak the same small REST surface. It is
              documented route by route in the repository README, and every household route is authorised — a family
              session, a device credential, or the demo cookie.
            </p>
            <div className="mt-5 overflow-hidden rounded-lg border border-[#E7E2DA] bg-white">
              <table className="w-full text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-ink/8 bg-paper/70">
                    <th className="w-14 px-4 py-2.5 font-semibold uppercase tracking-wide text-ink/40">Verb</th>
                    <th className="px-2 py-2.5 font-semibold uppercase tracking-wide text-ink/40">Route</th>
                    <th className="px-4 py-2.5 font-semibold uppercase tracking-wide text-ink/40">What it does</th>
                  </tr>
                </thead>
                <tbody>
                  {API_ROWS.map(([verb, route, what]) => (
                    <tr key={route} className="border-b border-ink/5 last:border-0">
                      <td className="px-4 py-2.5 align-top">
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                            verb === 'GET' ? 'bg-sage/15 text-[#4c7a4f]' : 'bg-clay/12 text-claydeep'
                          }`}
                        >
                          {verb}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 align-top font-mono text-[11.5px] text-ink/75">{route}</td>
                      <td className="px-4 py-2.5 align-top leading-relaxed text-ink/55">{what}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-ink/40">The privacy model</p>
            <h3 className="mt-3 font-heading text-[28px] leading-tight text-ink">What Khayaal refuses to do</h3>
            <ul className="mt-5 space-y-3">
              {PRIVACY.map((p) => (
                <li key={p.title} className="rounded-lg border border-[#E7E2DA] bg-white p-4">
                  <p className="text-[14px] font-medium text-ink">{p.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink/55">{p.body}</p>
                </li>
              ))}
            </ul>
            <div className="mt-5 rounded-lg border border-[#B4451C] bg-[#FDF3EC] p-5">
              <p className="text-[13px] leading-relaxed text-ink/70">
                <span className="font-medium text-ink">Everything is free.</span> Google OAuth, Firebase Spark, GitHub
                Actions, VAPID push and the hosted open models — no paid service is wired in anywhere, on purpose.
              </p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <Link
                  href="/demo"
                  className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-90"
                >
                  Try the live demo
                </Link>
                <a
                  href="https://github.com/theguysudo/Khyaal"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-ink/15 px-5 py-2.5 text-sm text-ink/70 transition-colors hover:bg-white"
                >
                  Read the repository
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
