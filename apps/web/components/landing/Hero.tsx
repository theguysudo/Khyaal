'use client';

/**
 * Landing hero — Quiet Ledger edition.
 *
 * Paper instead of a dark screen: a serif headline set like a ledger cover,
 * the typewriter line (one-shot, static cursor), the action row as hairline
 * buttons, and the claymation as a framed media plate with its mouse-scrub
 * seek still intact. The glass navbar is now a paper bar on a hairline rule;
 * the soft-focus intro label, the scrim overlays and the blinking cursor are
 * gone.
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useTypewriter } from './useTypewriter';

const SENSITIVITY = 0.8;
const EMAIL = 'hello@khayaal.care';

const NAV_LINKS = [
  { label: 'How it works', href: '/#how' },
  { label: 'Signals', href: '/#signals' },
  { label: 'Docs', href: '/#docs' },
  { label: 'Demo', href: '/demo' },
  { label: 'Privacy', href: '/#promise' },
];

const PILL_LINKS = [
  { label: 'See how it works', href: '/#how' },
  { label: 'Try the live demo', href: '/demo' },
  { label: 'Set up your family', href: '/onboarding' },
  { label: 'The privacy promise', href: '/#promise' },
];

export default function Hero() {
  const { displayed, done } = useTypewriter(
    "She hasn't pressed a button, worn a gadget, or remembered a thing. And you already know — all is well today.",
    38,
    600,
  );
  const [pillsVisible, setPillsVisible] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [videoOk, setVideoOk] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setPillsVisible(true), 400);
    return () => clearTimeout(t);
  }, []);

  // --- Mouse-scrub video ----------------------------------------------------
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let prevX: number | null = null;
    let targetTime = 0;
    let seeking = false;

    const onMove = (e: MouseEvent) => {
      if (prevX === null) {
        prevX = e.clientX;
        return;
      }
      const delta = e.clientX - prevX;
      prevX = e.clientX;
      if (!video.duration || Number.isNaN(video.duration)) return;
      targetTime = Math.max(
        0,
        Math.min(video.duration, targetTime + (delta / window.innerWidth) * SENSITIVITY * video.duration),
      );
      // Seek-queue: never flood currentTime; re-seek on seeked if we fell behind.
      if (!seeking) {
        seeking = true;
        video.currentTime = targetTime;
      }
    };
    const onSeeked = () => {
      seeking = false;
      if (Math.abs(video.currentTime - targetTime) > 0.01) {
        seeking = true;
        video.currentTime = targetTime;
      }
    };

    window.addEventListener('mousemove', onMove);
    video.addEventListener('seeked', onSeeked);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('seeked', onSeeked);
    };
  }, []);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable — the address is right there in the label */
    }
  };

  return (
    <>
      {/* ------------------------------------------------ Media plate (scrubbed) */}
      <div
        aria-hidden={!videoOk}
        className="relative mt-24 aspect-[16/9] w-full overflow-hidden border border-[#E7E2DA] bg-[#EFEAE2] md:mt-28"
      >
        {videoOk ? (
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            src="/homepage_animation.mp4"
            muted
            playsInline
            preload="auto"
            onError={() => setVideoOk(false)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span aria-hidden className="text-[28px] text-[#B4451C]">✳︎</span>
          </div>
        )}
        <p className="pointer-events-none absolute bottom-3 right-4 font-mono text-[11px] uppercase tracking-[0.14em] text-[#8A857D]">
          move your cursor — the plate scrubs
        </p>
      </div>

      {/* ------------------------------------------------ Navbar — paper bar on a rule */}
      <header className="fixed inset-x-0 top-0 z-10 px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between rounded-lg border border-[#E7E2DA] bg-[#FAF8F5] px-5 py-3 sm:px-7">
          <Link href="/" className="flex select-none items-center gap-2.5">
            <span aria-hidden className="text-[19px] leading-none text-[#B4451C] sm:text-[21px]">✳︎</span>
            <span className="t-section text-[19px] text-[#1A1815] sm:text-[21px]">Khayaal</span>
          </Link>

          <nav className="hidden items-center gap-7 text-[15px] text-[#57534E] md:flex">
            {NAV_LINKS.map((l) => (
              <Link key={l.label} href={l.href} className="transition-colors hover:text-[#1A1815]">
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-4 md:flex">
            <Link href="/login" className="text-[15px] text-[#57534E] underline-offset-2 transition-colors hover:text-[#1A1815] hover:underline">
              Sign in
            </Link>
            <Link href="/onboarding" className="btn-primary h-9 px-4 text-[14px]">
              Start for your family
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="flex flex-col gap-[5px] p-2 md:hidden"
          >
            <span className={`h-[2px] w-6 bg-[#1A1815] transition-all duration-300 ${menuOpen ? 'translate-y-[7px] rotate-45' : ''}`} />
            <span className={`h-[2px] w-6 bg-[#1A1815] transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`h-[2px] w-6 bg-[#1A1815] transition-all duration-300 ${menuOpen ? '-translate-y-[7px] -rotate-45' : ''}`} />
          </button>
        </div>
      </header>

      {/* Mobile overlay — paper, hairline rows */}
      <div
        className={`fixed inset-0 z-[9] flex flex-col justify-center gap-8 bg-[#FAF8F5] px-8 transition-opacity duration-300 md:hidden ${
          menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        {NAV_LINKS.map((l) => (
          <Link key={l.label} href={l.href} onClick={() => setMenuOpen(false)} className="t-section border-b border-[#E7E2DA] pb-4 text-[26px] text-[#1A1815]">
            {l.label}
          </Link>
        ))}
        <Link
          href="/onboarding"
          onClick={() => setMenuOpen(false)}
          className="t-section text-[26px] text-[#B4451C] underline underline-offset-4"
        >
          Start for your family
        </Link>
      </div>

      {/* ------------------------------------------------ Hero section */}
      <section className="relative z-[1] px-5 pb-16 pt-12 sm:px-8 md:pt-16">
        <div className="relative z-10 max-w-3xl">
          {/* 1. Kicker */}
          <p className="t-meta mb-5 select-none text-[#8A857D] sm:mb-6">
            Hey there, meet Khayaal —
            <br />
            a quiet watch over parents who live alone
          </p>

          {/* 2. Typewriter — min-height fits the full copy at every clamp size */}
          <p
            className="t-display mb-5 text-[clamp(26px,4vw,40px)] text-[#1A1815] sm:mb-6"
            style={{ minHeight: 'clamp(120px, 18vw, 168px)' }}
          >
            {displayed}
            {!done && <span className="mf-cursor" aria-hidden />}
          </p>

          {/* 3. Action row */}
          <div
            className="flex flex-wrap gap-y-1 transition-all duration-[360ms] ease-[cubic-bezier(.32,.72,0,1)]"
            style={{
              opacity: pillsVisible ? 1 : 0,
              transform: pillsVisible ? 'translateY(0px)' : 'translateY(8px)',
            }}
          >
            {PILL_LINKS.map((p) => (
              <Link
                key={p.label}
                href={p.href}
                className="btn-secondary mx-[0.2em] mb-[0.4em] h-9 px-4 text-[13px] sm:px-5 sm:text-[14px]"
              >
                {p.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={copyEmail}
              className="btn-secondary mx-[0.2em] mb-[0.4em] inline-flex h-9 items-center justify-center gap-2 px-4 text-[13px] sm:px-5 sm:text-[14px]"
            >
              <span>
                Reach us: <span className="underline underline-offset-2">{EMAIL}</span>
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <rect x="9" y="9" width="12" height="12" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </svg>
              {copied && <span className="ml-1 text-[11px] opacity-80">copied</span>}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
