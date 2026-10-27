'use client';

/**
 * Footer derived from the Driftbar spec: 1440x672 unit canvas (--u), paper
 * haze, giant frosted-glass wordmark sinking into fog, brand block + three
 * link columns, chips. Re-themed for Khayaal — a warm blue-hour courtyard
 * drawn purely in CSS (no external video), with drifting diya lights instead
 * of fireflies.
 */

import Link from 'next/link';

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', href: '/#how' },
      { label: 'Live demo', href: '/demo' },
      { label: 'Set up your family', href: '/onboarding' },
      { label: 'Privacy promise', href: '/#promise' },
      { label: 'Android app (soon)', href: '/#how' },
    ],
  },
  {
    title: 'Research',
    links: [
      { label: 'Passive sensing review', href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5793918' },
      { label: 'Ageing in place', href: 'https://pubmed.ncbi.nlm.nih.gov/35912590' },
      { label: 'Wi-Fi CSI on ESP32', href: 'https://doi.org/10.1109/AESPC67542.2025.11326701' },
      { label: 'ESP-CSI (Espressif)', href: 'https://github.com/espressif/esp-csi' },
      { label: 'Privacy in monitoring', href: 'https://pubmed.ncbi.nlm.nih.gov/26035900' },
    ],
  },
  {
    title: 'From the team',
    links: [
      { label: 'Team Nivaan', href: '/#team' },
      { label: 'Aditya Dubey', href: '/#team' },
      { label: 'Rudra Pratap Singh Negi', href: '/#team' },
      { label: 'IILM University', href: '/#team' },
      { label: 'hello@khayaal.care', href: 'mailto:hello@khayaal.care' },
    ],
  },
];

const LIGHTS = [
  { left: '12%', bottom: '18%', size: 7, dur: '14s', delay: '0s', dx: '40px', dy: '-120px', glow: 0.9 },
  { left: '28%', bottom: '10%', size: 5, dur: '18s', delay: '3s', dx: '-30px', dy: '-150px', glow: 0.7 },
  { left: '47%', bottom: '14%', size: 8, dur: '16s', delay: '6s', dx: '60px', dy: '-110px', glow: 0.95 },
  { left: '63%', bottom: '8%', size: 5, dur: '20s', delay: '1.5s', dx: '-50px', dy: '-140px', glow: 0.65 },
  { left: '78%', bottom: '16%', size: 6, dur: '15s', delay: '8s', dx: '35px', dy: '-130px', glow: 0.85 },
  { left: '90%', bottom: '12%', size: 4, dur: '19s', delay: '4.5s', dx: '-20px', dy: '-100px', glow: 0.6 },
];

export default function FooterScene() {
  return (
    <footer id="team" className="kft">
      <style>{KFT_CSS}</style>

      {/* stage: the CSS evening courtyard */}
      <div className="kft__stage" aria-hidden="true">
        <div className="kft__sky" />
        <div className="kft__sun" />
        <div className="kft__hills kft__hills--far" />
        <div className="kft__hills kft__hills--near" />
        {LIGHTS.map((l, i) => (
          <span
            key={i}
            className="kft__light"
            style={{
              left: l.left,
              bottom: l.bottom,
              width: l.size,
              height: l.size,
              ['--kh-dur' as string]: l.dur,
              ['--kh-delay' as string]: l.delay,
              ['--kh-dx' as string]: l.dx,
              ['--kh-dy' as string]: l.dy,
              ['--kh-glow' as string]: l.glow,
            } as React.CSSProperties}
          />
        ))}
        <div className="kft__haze" />
      </div>

      {/* frosted-glass wordmark */}
      <p className="kft__wordmark" aria-hidden="true">
        Khayaal
      </p>

      {/* fog */}
      <div className="kft__fog" aria-hidden="true" />

      {/* content grid */}
      <div className="kft__content">
        <div className="kft__brand">
          <Link href="/" className="kft__logo" aria-label="Khayaal home">
            <span className="kft__mark" aria-hidden="true">
              <span className="kft__mark-pill" />
            </span>
            Khayaal
          </Link>
          <h2 className="kft__title">The calm way to know they're okay</h2>
          <p className="kft__text">
            Khayaal listens to the harmless rhythm of an ordinary day — the morning unlock, the
            kettle-hour movement, the phone on charge at night — and turns it into one quiet answer
            for the family. Nothing to press, nothing to wear, nothing to remember.
          </p>
          <Link href="/demo" className="kft__cta">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5-11-6.5Z" strokeLinejoin="round" />
            </svg>
            Watch the live demo
          </Link>
          <p className="kft__copy">© 2026 Khayaal · Made with patience in Greater Noida.</p>
          <p className="kft__copy">Photography: Wikimedia Commons · Unsplash.</p>
          <p className="kft__by">
            Built with <span className="kft__heart" aria-label="love">💙</span> by
            <span className="kft__author">
              <span className="kft__avatar" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <rect width="24" height="24" fill="#e6e0d4" />
                  <circle cx="12" cy="9.2" r="4.4" fill="#3d3352" />
                  <path d="M3 25c0-6 4-9.4 9-9.4S21 19 21 25Z" fill="#3d3352" />
                </svg>
              </span>
              Team Nivaan
            </span>
          </p>
          <ul className="kft__status" aria-label="Khayaal status">
            <li className="kft__chip">
              <span className="kft__chip-dot" aria-hidden="true" />
              No camera · ever
            </li>
            <li className="kft__chip">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 11a8 8 0 1 0-2.3 5.7" />
                <path d="M20 4v7h-7" />
              </svg>
              v0.1 · Working prototype
            </li>
            <li className="kft__chip">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8Z" />
              </svg>
              6 signals · one quiet score
            </li>
          </ul>
        </div>

        {COLUMNS.map((col) => (
          <nav className="kft__col" aria-label={col.title} key={col.title}>
            <h3 className="kft__col-title">{col.title}</h3>
            <ul className="kft__list">
              {col.links.map((l) => (
                <li key={l.label}>
                  <a href={l.href}>{l.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}

const KFT_CSS = `
.kft {
  --u: min(100vw / 1440, 100svh / 672);
  --paper: #faf6ef;
  --mist: #f3ddc4;
  --ink: #2a241d;
  --body: #6f665a;
  --muted: #a2988a;
  position: relative;
  height: 100vh;
  height: 100svh;
  background: var(--paper);
  overflow: hidden;
  isolation: isolate;
  font-family: var(--font-body), system-ui, sans-serif;
}
.kft a { color: inherit; text-decoration: none; }
.kft ul { margin: 0; padding: 0; list-style: none; }

.kft__stage { position: absolute; inset: 0; z-index: 0; }
.kft__sky {
  position: absolute; inset: 0;
  background: linear-gradient(180deg,
    #faf6ef 0%, #f6ecd9 22%, #eccfa9 42%,
    #d9a578 58%, #9c6a6e 78%, #5d4a63 100%);
}
.kft__sun {
  position: absolute; left: 68%; top: 46%;
  width: calc(340 * var(--u)); height: calc(340 * var(--u));
  transform: translate(-50%, -50%);
  border-radius: 9999px;
  background: radial-gradient(circle, rgba(255, 221, 150, 0.95) 0%, rgba(255, 205, 130, 0.35) 45%, rgba(255, 205, 130, 0) 70%);
}
.kft__hills { position: absolute; left: -5%; right: -5%; border-radius: 50% 50% 0 0 / 100% 100% 0 0; }
.kft__hills--far { bottom: 22%; height: 26%; background: linear-gradient(180deg, #7c5b66 0%, #6b4f5e 100%); opacity: 0.75; }
.kft__hills--near { bottom: -6%; height: 34%; background: linear-gradient(180deg, #4f3f52 0%, #3a2e44 100%); }
.kft__light {
  position: absolute; border-radius: 9999px;
  background: #ffd98f;
  box-shadow: 0 0 calc(14 * var(--u)) calc(3 * var(--u)) rgba(255, 205, 120, 0.75);
  opacity: 0;
  animation: kft-drift var(--kh-dur, 14s) linear infinite;
  animation-delay: var(--kh-delay, 0s);
}
@keyframes kft-drift {
  0% { transform: translate(0, 0); opacity: 0; }
  12% { opacity: var(--kh-glow, 0.8); }
  85% { opacity: var(--kh-glow, 0.8); }
  100% { transform: translate(var(--kh-dx, 40px), var(--kh-dy, -120px)); opacity: 0; }
}
.kft__haze {
  position: absolute; inset: 0;
  background: linear-gradient(to bottom,
    var(--paper) 0%, rgb(250 246 239 / 0.96) 26%,
    rgb(250 246 239 / 0.72) 44%, rgb(250 246 239 / 0) 70%);
}

.kft__wordmark {
  position: absolute;
  left: 50%; bottom: calc(-2 * var(--u));
  transform: translateX(-50%);
  z-index: 1; margin: 0;
  font-family: var(--font-heading), Georgia, serif;
  font-size: calc(350 * var(--u));
  font-weight: 600;
  line-height: 0.74;
  letter-spacing: -0.045em;
  white-space: nowrap;
  pointer-events: none; user-select: none;
  color: rgb(255 244 224 / 0.4);
  background: linear-gradient(to bottom, rgb(255 255 255 / 0.78), rgb(255 214 170 / 0.36) 48%, rgb(255 255 255 / 0.62));
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 -1px 0 rgb(255 255 255 / 0.55)) drop-shadow(0 0 18px rgb(255 190 120 / 0.45));
}

.kft__fog {
  position: absolute; inset: auto 0 0; z-index: 2;
  height: 17%;
  background: linear-gradient(to top, var(--mist) 0%, rgb(243 221 196 / 0.6) 30%, rgb(243 221 196 / 0) 100%);
}

.kft__content {
  position: relative; z-index: 3;
  display: grid;
  grid-template-columns: 440fr 240fr 240fr 1fr;
  align-items: start;
  width: calc(1440 * var(--u));
  margin: 0 auto;
  padding: calc(86 * var(--u)) calc(100 * var(--u)) 0 calc(160 * var(--u));
}

.kft__logo { display: inline-flex; align-items: center; gap: calc(10 * var(--u)); font-size: calc(17 * var(--u)); font-weight: 500; letter-spacing: -0.02em; color: var(--ink); }
.kft__mark {
  position: relative;
  width: calc(30 * var(--u)); height: calc(30 * var(--u));
  border-radius: calc(8 * var(--u));
  background: linear-gradient(to bottom, #43372e, #221b15 55%);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
}
.kft__mark-pill {
  position: absolute; left: 13%; right: 13%; bottom: 14%; height: 19%;
  border-radius: 9999px; background: #f6d9a0;
}
.kft__title { margin: calc(19 * var(--u)) 0 0; font-size: calc(20 * var(--u)); font-weight: 600; line-height: 1.2; letter-spacing: -0.045em; color: var(--ink); font-family: var(--font-heading), Georgia, serif; }
.kft__text { max-width: calc(412 * var(--u)); margin: calc(18 * var(--u)) 0 0; color: var(--body); font-size: calc(13.7 * var(--u)); line-height: 1.43; letter-spacing: -0.012em; }
.kft__cta {
  display: inline-flex; align-items: center; gap: calc(6 * var(--u));
  height: calc(32.5 * var(--u));
  margin-top: calc(20 * var(--u));
  padding: 0 calc(16 * var(--u)) 0 calc(15 * var(--u));
  border-radius: calc(7 * var(--u));
  background: #26201a; color: #faf6ef;
  font-size: calc(11.8 * var(--u)); font-weight: 500; letter-spacing: -0.01em;
  transition: background 0.2s, transform 0.2s;
}
.kft__cta svg { width: calc(13 * var(--u)); height: calc(13 * var(--u)); margin-top: calc(-1.5 * var(--u)); }
.kft__cta:hover { background: #3d3352; transform: translateY(-1px); }
.kft__copy { margin: calc(23 * var(--u)) 0 0; color: var(--muted); font-size: calc(12.2 * var(--u)); letter-spacing: 0.01em; }
.kft__by { display: flex; align-items: center; gap: calc(5 * var(--u)); margin: calc(21 * var(--u)) 0 0; font-size: calc(11.8 * var(--u)); font-weight: 500; letter-spacing: -0.01em; color: var(--ink); }
.kft__heart { font-size: 0.95em; }
.kft__author { display: inline-flex; align-items: center; gap: calc(6 * var(--u)); margin-left: calc(5 * var(--u)); }
.kft__avatar { width: calc(23 * var(--u)); height: calc(23 * var(--u)); border-radius: 9999px; overflow: hidden; background: #e3dccc; }
.kft__avatar svg { width: 100%; height: 100%; }
.kft__status { display: flex; flex-wrap: wrap; gap: calc(8 * var(--u)); margin-top: calc(16 * var(--u)); }
.kft__chip {
  display: inline-flex; align-items: center; gap: calc(6 * var(--u));
  height: calc(25 * var(--u));
  padding: 0 calc(10 * var(--u));
  border: 1px solid rgb(42 36 29 / 0.12);
  border-radius: 9999px;
  background: rgb(255 255 255 / 0.55);
  font-size: calc(10.8 * var(--u)); font-weight: 500; letter-spacing: -0.01em;
  white-space: nowrap; color: var(--ink);
}
.kft__chip svg { width: calc(11 * var(--u)); height: calc(11 * var(--u)); fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.kft__chip-dot { width: calc(6 * var(--u)); height: calc(6 * var(--u)); border-radius: 9999px; background: #2fb36a; box-shadow: 0 0 0 calc(2.5 * var(--u)) rgb(47 179 106 / 0.18); }

.kft__col-title { margin: 0; font-size: calc(16 * var(--u)); font-weight: 600; line-height: 1; letter-spacing: -0.045em; color: var(--ink); font-family: var(--font-heading), Georgia, serif; }
.kft__list { display: grid; gap: calc(20.5 * var(--u)); margin-top: calc(24 * var(--u)); font-size: calc(13.7 * var(--u)); line-height: 1.24; letter-spacing: 0.022em; color: #161616; }
.kft__col:first-of-type .kft__list { gap: calc(15 * var(--u)); margin-top: calc(21 * var(--u)); font-weight: 500; letter-spacing: -0.025em; color: var(--ink); }
.kft__list a { transition: opacity 0.2s; }
.kft__list a:hover { opacity: 0.55; }

@media (prefers-reduced-motion: reduce) {
  .kft__light { animation: none; opacity: 0.5; }
  .kft__cta, .kft__list a { transition: none; }
}

@media (max-width: 1023px) and (min-width: 768px) {
  .kft { --u: min(100vw / 1040, 100svh / 672); }
  .kft__content { grid-template-columns: 400fr 190fr 210fr 1fr; width: calc(1040 * var(--u)); padding: calc(64 * var(--u)) calc(40 * var(--u)) 0; }
  .kft__text { max-width: calc(350 * var(--u)); }
  .kft__wordmark { font-size: calc(286 * var(--u)); bottom: calc(10 * var(--u)); }
}

@media (max-width: 767px) {
  .kft { --u: 1px; display: flex; flex-direction: column; height: auto; min-height: 100svh; }
  .kft__haze { background: linear-gradient(to bottom, var(--paper) 0%, rgb(250 246 239 / 0.95) 50%, rgb(250 246 239 / 0.8) 68%, rgb(250 246 239 / 0) 90%); }
  .kft__content {
    grid-template-columns: auto auto auto;
    justify-content: space-between;
    column-gap: 12px; row-gap: 36px;
    width: 100%; padding: 40px 20px 0;
    margin-bottom: max(34vw, 150px);
  }
  .kft__brand { grid-column: 1 / -1; }
  .kft__title { font-size: 21px; }
  .kft__text { max-width: 34em; font-size: 14px; }
  .kft__cta { height: 38px; padding: 0 18px 0 16px; border-radius: 8px; font-size: 13px; }
  .kft__cta svg { width: 14px; height: 14px; }
  .kft__copy, .kft__by { font-size: 12.5px; }
  .kft__chip { height: 28px; font-size: 12px; }
  .kft__chip svg { width: 12px; height: 12px; }
  .kft__col-title { font-size: 15px; }
  .kft__list { gap: 14px; margin-top: 20px; font-size: 13px; letter-spacing: 0; white-space: nowrap; }
  .kft__wordmark { bottom: 5vw; font-size: 27vw; }
  .kft__fog { height: 7%; }
}
@media (max-width: 359px) {
  .kft__content { grid-template-columns: 1fr 1fr; }
}
`;
