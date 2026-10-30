'use client';

/**
 * Footer — Quiet Ledger edition.
 *
 * The dusk courtyard (layered sky wash, drifting diya lights, frosted wordmark,
 * fog) is gone: those were blobs, glows and loops, all banned. What remains
 * is the colophon — brand block, three link columns, status chips — set as a
 * printed ledger's back page: a hairline top rule, mono indices, ink on
 * paper. Every link and line of copy is preserved.
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

const CHIPS: { label: string; icon?: 'dot' | 'refresh' | 'star' }[] = [
  { label: 'No camera, ever', icon: 'dot' },
  { label: 'v0.1 · Working prototype', icon: 'refresh' },
  { label: '6 signals, one quiet score', icon: 'star' },
];

export default function FooterScene() {
  return (
    <footer id="team" className="border-t border-[#E7E2DA] bg-[#FAF8F5]">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-16 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:gap-10 md:py-20">
        {/* brand block */}
        <div>
          <Link href="/" className="inline-flex items-center gap-2.5 text-[17px] font-medium tracking-[-0.02em] text-[#1A1815]" aria-label="Khayaal home">
            <span aria-hidden className="text-[19px] leading-none text-[#B4451C]">✳︎</span>
            Khayaal
          </Link>
          <h2 className="t-section mt-5 text-[20px] text-[#1A1815]">The calm way to know they're okay</h2>
          <p className="mt-4 max-w-[42ch] text-[13.5px] leading-relaxed text-[#57534E]">
            Khayaal listens to the harmless rhythms of an ordinary day: the morning unlock, the
            kettle hour, the phone charging overnight. In return the family gets one calm status,
            and she is asked nothing at all.
          </p>
          <Link href="/demo" className="btn-primary mt-5 h-9 text-[13px]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" className="h-3 w-3">
              <path d="M8 5.5v13l11-6.5-11-6.5Z" strokeLinejoin="round" />
            </svg>
            Watch the live demo
          </Link>
          <p className="mt-6 text-[12.5px] text-[#8A857D]">© 2026 Khayaal · Made with patience in Greater Noida.</p>
          <p className="mt-1 text-[12.5px] text-[#8A857D]">Photography: Wikimedia Commons · Unsplash.</p>
          <p className="mt-4 flex items-center gap-1.5 text-[12.5px] font-medium text-[#1A1815]">
            Built with care by
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-flex h-6 w-6 flex-none items-center justify-center overflow-hidden rounded-full border border-[#E7E2DA] bg-[#EFEAE2]">
                <svg viewBox="0 0 24 24" className="h-5 w-5">
                  <rect width="24" height="24" fill="#e6e0d4" />
                  <circle cx="12" cy="9.2" r="4.4" fill="#3d3352" />
                  <path d="M3 25c0-6 4-9.4 9-9.4S21 19 21 25Z" fill="#3d3352" />
                </svg>
              </span>
              Team Nivaan
            </span>
          </p>
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Khayaal status">
            {CHIPS.map((c) => (
              <li
                key={c.label}
                className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#E7E2DA] bg-white px-2.5 text-[11.5px] font-medium text-[#1A1815]"
              >
                {c.icon === 'dot' && <span className="dot bg-[#2F6B4F]" aria-hidden="true" />}
                {c.icon === 'refresh' && (
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
                    <path d="M20 4v7h-7" />
                  </svg>
                )}
                {c.icon === 'star' && (
                  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8Z" />
                  </svg>
                )}
                {c.label}
              </li>
            ))}
          </ul>
        </div>

        {/* link columns */}
        {COLUMNS.map((col, i) => (
          <nav aria-label={col.title} key={col.title}>
            <h3 className="flex items-baseline gap-2 border-b border-[#E7E2DA] pb-3 text-[13px] font-medium uppercase tracking-[0.08em] text-[#1A1815]">
              <span className="font-mono text-[#8A857D]">0{i + 1}</span>
              {col.title}
            </h3>
            <ul className="mt-4 grid gap-2.5 text-[13.5px] leading-relaxed">
              {col.links.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="text-[#57534E] underline-offset-2 transition-colors hover:text-[#1A1815] hover:underline">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
    </footer>
  );
}
