'use client';

/**
 * The scroll story — sits between the warm morning hero and the dusk footer
 * like the night watch itself. Animation grammar derived from the Planet-Jump
 * reference (blur-rise reveals, staggered fact rows, side rail with active
 * dot, glass chrome) kept ~80% intact and tuned to a calm care product:
 * slower easings, no portals, no custom cursor — she is not a game.
 */

import { useEffect, useRef, useState } from 'react';

const SIGNALS: [string, string][] = [
  ['Phone unlocks', 'The morning unlock, app opens and screen-on events — read by the Android usage system, never the screen itself.'],
  ['Movement', 'The accelerometer and activity recognition: walking, still, in transit. Around the house, not where in the world.'],
  ['Overnight charging', 'The phone goes on charge every night. When it doesn\u2019t, that absence is itself a signal.'],
  ['Home presence', 'Whether the phone is on the home network \u2014 presence, not a location trail.'],
  ['Room presence', 'An optional ESP32 senses movement through Wi-Fi alone \u2014 no camera, no microphone, nothing worn.'],
  ['Silence', 'Time since the last signal of any kind. Silence is the single strongest signal Khayaal has.'],
];

const SCORE_ROWS: [string, string][] = [
  ['By 11:00', 'No morning unlock \u2014 she is usually up by 7:15.'],
  ['All morning', 'No movement around the house since dawn.'],
  ['The room', 'The sensor has felt no one for hours.'],
  ['Last night', 'The phone never went on charge.'],
];

const LADDER: { n: string; title: string; body: string }[] = [
  { n: '01', title: 'Silent collection', body: 'Signals are buffered on the device itself. Nothing is sent anywhere; nothing is shown to anyone \u2014 not even her.' },
  { n: '02', title: 'Learning the rhythm', body: 'For an initial window Khayaal scores nothing at all. It only learns this one person\u2019s ordinary.' },
  { n: '03', title: 'Continuous scoring', body: 'Every signal updates a wellbeing score. Absence weighs far more heavily than presence.' },
  { n: '04', title: 'The fork in the road', body: 'Most deviations are just a slow morning. Only a strong, multi-signal departure escalates.' },
  { n: '05', title: 'A gentle nudge', body: 'One quiet notification on her phone. Nothing has left the house yet.' },
  { n: '06', title: 'An explicit check-in', body: 'If unanswered, one clear ask \u2014 are you alright? Dismissing it ends the matter.' },
  { n: '07', title: 'Now the family is called', body: 'With the last-known signals attached, so you can decide whether to call for help. A status, never a feed.' },
  { n: '08', title: 'Resolution and reset', body: 'Safe or not, Khayaal returns to quiet observation. No drama carried over.' },
];

const PROMISES = ['No camera', 'No location trail', 'No wearable', 'No message ever read', 'Signals kept 7 days, then discarded'];

const RAIL: { id: string; label: string }[] = [
  { id: 'how', label: 'The watch' },
  { id: 'signals', label: 'Six signals' },
  { id: 'score', label: 'One score' },
  { id: 'ladder', label: 'The ladder' },
  { id: 'promise', label: 'Dignity' },
];

export default function Story() {
  const rootRef = useRef<HTMLDivElement>(null);
  const scoreNumRef = useRef<HTMLSpanElement>(null);
  const scoreArcRef = useRef<SVGPathElement>(null);
  const bandImgRef = useRef<HTMLImageElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);

  // One-shot blur-rise reveals as sections scroll into view.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-inview');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.18 },
    );
    root.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // The 72/100 gauge counts itself up with anime.js when it scrolls into view.
  useEffect(() => {
    const el = scoreNumRef.current;
    const arc = scoreArcRef.current;
    if (!el || !arc) return;
    const ARC = 126; // length of the semicircle path
    let ran = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || ran) return;
        ran = true;
        io.disconnect();
        (async () => {
          const anime = (await import('animejs')).default;
          const counter = { v: 0 };
          anime({
            targets: counter,
            v: 72,
            round: 1,
            duration: 1600,
            easing: 'easeOutExpo',
            update: () => {
              if (scoreNumRef.current) scoreNumRef.current.textContent = String(counter.v);
            },
          });
          anime({
            targets: arc,
            strokeDashoffset: [183, 183 * (1 - 0.72)],
            duration: 1600,
            easing: 'easeOutExpo',
          });
        })();
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // GSAP parallax on the quiet-ordinary band.
  useEffect(() => {
    let cleanup = () => {};
    let cancelled = false;
    (async () => {
      const gsap = (await import('gsap')).default;
      const { ScrollTrigger } = await import('gsap/ScrollTrigger');
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      const ctx = gsap.context(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        gsap.fromTo(
          bandImgRef.current,
          { yPercent: -14 },
          {
            yPercent: 10,
            ease: 'none',
            scrollTrigger: {
              trigger: bandRef.current,
              start: 'top bottom',
              end: 'bottom top',
              scrub: 0.6,
            },
          },
        );
      }, bandRef);
      cleanup = () => ctx.revert();
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  // Side-rail: the section nearest the middle of the viewport is active.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: '-42% 0px -52% 0px' },
    );
    RAIL.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div ref={rootRef} className="st relative" style={{ background: 'linear-gradient(180deg, #221b15 0%, #191420 38%, #241a29 72%, #2c2033 100%)' }}>
      {/* soft evening glows */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[40vh]" style={{ background: 'radial-gradient(700px 340px at 78% 0%, rgba(255,190,120,0.12), transparent 70%)' }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[40vh]" style={{ background: 'radial-gradient(800px 380px at 20% 100%, rgba(200,150,255,0.10), transparent 70%)' }} />

      {/* side rail — the planet-list, adapted */}
      <nav className={`st-rail ${active ? 'is-on' : ''}`} aria-label="Story sections">
        {RAIL.map((r) => (
          <button key={r.id} onClick={() => jump(r.id)} className={active === r.id ? 'active' : ''}>
            <span className="rail-dot" aria-hidden />
            {r.label}
          </button>
        ))}
      </nav>

      {/* ------------------------------------------------ the watch */}
      <section id="how" className="relative mx-auto max-w-6xl px-5 py-28 sm:px-8 md:py-36">
        <p data-reveal="down" className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#f6d9a0]">How it works</p>
        <h2 data-reveal="title" className="mt-5 max-w-3xl font-heading text-[clamp(40px,7vw,84px)] uppercase leading-[0.85] tracking-tight text-[#f5efe4]">
          A quiet watch in <em className="not-italic text-[#e8a06b]">four phases</em>
        </h2>
        <p data-reveal="fact" style={{ ['--d' as string]: '0.15s' }} className="mt-6 max-w-xl text-[16px] leading-relaxed text-white/65">
          Khayaal spends almost all of its life doing nothing visible at all. The first three
          phases never touch anyone’s day — and most days, the fourth never comes.
        </p>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {[
            ['It listens quietly', 'The Android phone she already owns shares harmless signals. No new habit, no new device, nothing to remember.'],
            ['It learns her rhythm', 'A week of ordinary days becomes a baseline. Normal means her normal — a night owl and an early riser are never measured the same.'],
            ['It speaks up only when it matters', 'A nudge, then a question, and only then you — with the last-known signals attached, never a feed.'],
          ].map(([t, b], i) => (
            <div key={t} data-reveal="fact" style={{ ['--d' as string]: `${0.1 + i * 0.12}s` }} className="kh-glass rounded-3xl p-7 transition-colors duration-300 hover:bg-white/[0.11]">
              <span className="font-heading text-[13px] tracking-[0.2em] text-[#e8a06b]">0{i + 1}</span>
              <h3 className="mt-4 font-heading text-[22px] leading-snug text-white">{t}</h3>
              <p className="mt-3 text-[14.5px] leading-relaxed text-white/65">{b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ six signals */}
      <section id="signals" className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 md:py-32">
        <div className="grid gap-10 md:grid-cols-[1fr_1.4fr] md:gap-16">
          <div>
            <p data-reveal="down" className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#f6d9a0]">The inputs</p>
            <h2 data-reveal="title" className="mt-5 font-heading text-[clamp(40px,6.5vw,78px)] uppercase leading-[0.85] tracking-tight text-[#f5efe4]">
              Six <em className="not-italic text-[#e8a06b]">signals</em> the home already makes
            </h2>
            <p data-reveal="fact" style={{ ['--d' as string]: '0.15s' }} className="mt-6 text-[15.5px] leading-relaxed text-white/60">
              Five come from the phone she already owns. The sixth is an optional sensor that
              reads movement from Wi-Fi alone. Each on its own proves nothing — together they are
              how a house says <span className="text-white/90">“all is well.”</span>
            </p>
          </div>
          <dl className="mt-2">
            {SIGNALS.map(([k, v], i) => (
              <div key={k} data-reveal="fact" style={{ ['--d' as string]: `${i * 0.08}s` }} className="fact">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------ one score */}
      <section id="score" className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 md:py-32">
        <p data-reveal="down" className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#f6d9a0]">The fusion</p>
        <h2 data-reveal="title" className="mt-5 max-w-3xl font-heading text-[clamp(40px,6.5vw,78px)] uppercase leading-[0.85] tracking-tight text-[#f5efe4]">
          One weak signal proves nothing. <em className="not-italic text-[#e8a06b]">Four together do.</em>
        </h2>
        <p data-reveal="fact" style={{ ['--d' as string]: '0.15s' }} className="mt-6 max-w-xl text-[15.5px] leading-relaxed text-white/65">
          Motion alone trips on a cat. A quiet phone is just a slow morning. A missing charge
          might be a moved charger. Fused, the absences stop being noise and become a confidence
          score worth acting on.
        </p>

        <div className="mt-12 grid gap-6 md:grid-cols-[1.5fr_auto_1fr] md:items-center">
          <div className="kh-glass rounded-3xl p-7">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/45">One morning, four independent absences</p>
            <dl className="mt-3">
              {SCORE_ROWS.map(([k, v], i) => (
                <div key={k} data-reveal="fact" style={{ ['--d' as string]: `${0.1 + i * 0.09}s` }} className="fact !border-b-white/15">
                  <dt className="!text-[14px] text-white/85">{k}</dt>
                  <dd className="!text-[14px]">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div data-reveal="down" className="mx-auto text-3xl text-white/30 md:rotate-0">→</div>

          <div data-reveal="fact" style={{ ['--d' as string]: '0.4s' }} className="kh-glass flex flex-col items-center rounded-3xl p-8 text-center">
            <div className="relative h-[96px] w-[168px]">
              <svg viewBox="0 0 168 96" className="absolute inset-0 h-full w-full" aria-hidden="true">
                <path d="M 26 88 A 58 58 0 0 1 142 88" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="8" strokeLinecap="round" />
                <path
                  ref={scoreArcRef}
                  d="M 26 88 A 58 58 0 0 1 142 88"
                  fill="none"
                  stroke="#e8a06b"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray="183"
                  strokeDashoffset="183"
                />
              </svg>
              <div className="absolute inset-x-0 bottom-[2px] flex items-baseline justify-center gap-1.5">
                <span
                  ref={scoreNumRef}
                  className="inline-block min-w-[2.2ch] text-right font-heading text-[44px] leading-none tabular-nums text-[#e8a06b]"
                >
                  0
                </span>
                <span className="text-[15px] leading-none text-white/50">/100</span>
              </div>
            </div>
            <p className="mt-5 text-[13.5px] leading-relaxed text-white/60">
              Where the working prototype begins to escalate — a real threshold from a real run,
              not a design guess.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ quiet-ordinary band (parallax) */}
      <div ref={bandRef} className="relative h-[44vh] overflow-hidden md:h-[56vh]">
        <img
          ref={bandImgRef}
          src="https://images.unsplash.com/photo-1544027993-37dbfe43562a?w=1800&q=80"
          alt="An elderly couple holding hands"
          className="absolute inset-0 h-[124%] w-full object-cover"
          loading="lazy"
        />
        <div aria-hidden className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(34,27,21,0.72) 0%, rgba(34,27,21,0.25) 45%, rgba(44,32,51,0.78) 100%)' }} />
        <p className="absolute inset-x-0 bottom-8 px-6 text-center font-heading text-[clamp(20px,3.4vw,34px)] leading-snug tracking-tight text-white/90">
          She shouldn't have to change a single habit. <span className="text-[#e8a06b]">And she won't.</span>
        </p>
      </div>

      {/* ------------------------------------------------ the ladder */}
      <section id="ladder" className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 md:py-32">
        <div className="grid gap-10 md:grid-cols-[1fr_1.6fr] md:gap-16">
          <div>
            <p data-reveal="down" className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#f6d9a0]">The escalation</p>
            <h2 data-reveal="title" className="mt-5 font-heading text-[clamp(40px,6.5vw,78px)] uppercase leading-[0.85] tracking-tight text-[#f5efe4]">
              The family is the <em className="not-italic text-[#e8a06b]">last</em> step, never the first
            </h2>
            <p data-reveal="fact" style={{ ['--d' as string]: '0.15s' }} className="mt-6 text-[15.5px] leading-relaxed text-white/60">
              Eight phases. Four of them invisible. The ladder is the trust mechanism — each step
              must earn the next, and any ordinary moment walks it quietly back down.
            </p>
          </div>
          <dl>
            {LADDER.map((s, i) => (
              <div key={s.n} data-reveal="fact" style={{ ['--d' as string]: `${Math.min(i, 5) * 0.07}s` }} className="fact">
                <dt className="flex items-baseline gap-3">
                  <span className="font-heading text-[13px] text-[#e8a06b]">{s.n}</span>
                  {s.title}
                </dt>
                <dd>{s.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------ dignity */}
      <section id="promise" className="relative mx-auto max-w-6xl px-5 pb-32 pt-24 sm:px-8 md:pb-40 md:pt-32">
        <div className="kh-glass rounded-[32px] p-8 md:p-14">
          <p data-reveal="down" className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#f6d9a0]">The rule that governs every design decision</p>
          <h2 data-reveal="title" className="mt-5 max-w-3xl font-heading text-[clamp(34px,5.5vw,64px)] leading-[1.02] tracking-tight text-white">
            Dignity first. On a normal day, you see three words — <em className="text-[#e8a06b]">All well today.</em>
          </h2>
          <div data-reveal="fact" style={{ ['--d' as string]: '0.2s' }} className="mt-9 flex flex-wrap gap-2.5">
            {PROMISES.map((p) => (
              <span key={p} className="rounded-full border border-white/25 bg-white/[0.06] px-5 py-2 text-[13.5px] text-white/85">
                {p}
              </span>
            ))}
          </div>
          <p data-reveal="fact" style={{ ['--d' as string]: '0.3s' }} className="mt-8 max-w-xl text-[15px] leading-relaxed text-white/65">
            What leaves the house is a signal, not an account. No feed, no map, no recording — the
            child sees a calm status and a last-active time, and nothing else. Independence and
            privacy stay untouched; only safety is added.
          </p>
        </div>
      </section>
    </div>
  );
}
