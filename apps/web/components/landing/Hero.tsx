'use client';

/**
 * Full-screen hero from the Mainframe reference, carrying Khayaal's branding:
 * mouse-scrub background video (SENSITIVITY 0.8, seek-queue so we never flood
 * video.currentTime), a sleek transparent-glass navbar, blurred intro label,
 * typewriter, four white pills + one copy-email pill, and the black/90 mobile
 * overlay. Reference webfonts load via link; the --mf-* variables are scoped
 * to this hero so the rest of the site keeps its own type.
 */

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useTypewriter } from './useTypewriter';

const SENSITIVITY = 0.8;
const EMAIL = 'hello@khayaal.care';

const NAV_LINKS = [
  { label: 'How it works', href: '/#how' },
  { label: 'Signals', href: '/#signals' },
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
      video.removeEventListener('seeked', onSeeked);
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
      {/* ------------------------------------------- Fonts (reference webfonts) */}
      <link rel="stylesheet" href="https://db.onlinewebfonts.com/c/5ac3fe7c6abd2f62067f266d89671492?family=HelveticaNowDisplay-Medium" />
      <link rel="stylesheet" href="https://db.onlinewebfonts.com/c/1aa3377e489837a26d019bba501e779d?family=HelveticaNowDisplayW01-Rg" />

      {/* ------------------------------------------------ Background video */}
      <div className="fixed inset-0 z-0 bg-[#0a0908]" aria-hidden="true">
        {videoOk ? (
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            style={{ objectPosition: '70% center' }}
            src="/homepage_animation.mp4"
            muted
            playsInline
            preload="auto"
            onError={() => setVideoOk(false)}
          />
        ) : (
          <div
            className="h-full w-full"
            style={{
              background:
                'radial-gradient(900px 600px at 72% 30%, #262033 0%, rgba(38,32,51,0) 60%), radial-gradient(700px 500px at 20% 80%, #1c2430 0%, rgba(28,36,48,0) 55%), #0a0908',
            }}
          />
        )}
      </div>
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-b from-black/40 via-black/10 to-black/60" />

      {/* ------------------------------------------------ Navbar — sleek glass bar */}
      <header className="fixed inset-x-0 top-0 z-10 px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="kh-glass mx-auto flex max-w-5xl items-center justify-between rounded-full px-5 py-3 sm:px-7">
          <Link href="/" className="flex items-center gap-2.5 select-none">
            <span
              className="text-[19px] tracking-tight text-white sm:text-[23px]"
              style={{ fontFamily: 'var(--mf-heading)' }}
            >
              Khayaal
            </span>
            <span className="select-none text-[21px] leading-none text-[#e8a06b] sm:text-[25px]" style={{ letterSpacing: '-0.02em' }}>
              ✳︎
            </span>
          </Link>

          <nav className="hidden items-center text-[15px] text-white/90 md:flex">
            {NAV_LINKS.map((l, i) => (
              <span key={l.label}>
                <Link href={l.href} className="transition-opacity hover:opacity-60">
                  {l.label}
                </Link>
                {i < NAV_LINKS.length - 1 && <span className="mx-1.5 text-white/40">,</span>}
              </span>
            ))}
          </nav>

          <div className="hidden md:block">
            <Link
              href="/onboarding"
              className="rounded-full bg-white/95 px-4 py-1.5 text-[14px] font-medium text-black transition-colors duration-200 hover:bg-white"
            >
              Start for your family
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            aria-label="Menu"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex flex-col gap-[5px] p-2 md:hidden"
          >
            <span
              className={`h-[2px] w-6 bg-white transition-all duration-300 ${menuOpen ? 'translate-y-[7px] rotate-45' : ''}`}
            />
            <span className={`h-[2px] w-6 bg-white transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
            <span
              className={`h-[2px] w-6 bg-white transition-all duration-300 ${menuOpen ? '-translate-y-[7px] -rotate-45' : ''}`}
            />
          </button>
        </div>
      </header>

      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-[9] flex flex-col justify-center gap-8 bg-black/90 px-8 backdrop-blur-md transition-opacity duration-300 md:hidden ${
          menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        {NAV_LINKS.map((l) => (
          <Link key={l.label} href={l.href} onClick={() => setMenuOpen(false)} className="text-[32px] font-medium text-white">
            {l.label}
          </Link>
        ))}
        <Link
          href="/onboarding"
          onClick={() => setMenuOpen(false)}
          className="text-[32px] font-medium text-white underline underline-offset-4"
        >
          Start for your family
        </Link>
      </div>

      {/* ------------------------------------------------ Hero section */}
      <section className="relative z-[1] flex h-screen flex-col justify-end overflow-hidden pb-12 md:justify-center md:pb-0">
        <div className="relative z-10 max-w-xl px-1 sm:px-0 md:px-10 lg:px-0">
          {/* 1. Blurred intro label */}
          <p
            className="pointer-events-none mb-5 select-none sm:mb-6"
            style={{
              fontSize: 'clamp(18px, 4vw, 26px)',
              lineHeight: 1.35,
              fontWeight: 400,
              color: '#fff',
              filter: 'blur(4px)',
              fontFamily: 'var(--mf-body)',
            }}
          >
            Hey there, meet Khayaal —
            <br />
            a silent guardian for parents who live alone
          </p>

          {/* 2. Typewriter — min-height fits the full copy at every clamp size */}
          <p
            className="mb-5 text-white sm:mb-6"
            style={{
              fontSize: 'clamp(18px, 4vw, 26px)',
              lineHeight: 1.4,
              fontWeight: 400,
              minHeight: 'clamp(100px, 15vw, 118px)',
              fontFamily: 'var(--mf-body)',
              textWrap: 'balance',
            }}
          >
            {displayed}
            {!done && <span className="mf-cursor" />}
          </p>

          {/* 3. Action pills */}
          <div
            className="flex flex-wrap gap-y-1 transition-all duration-[400ms] ease-out"
            style={{
              opacity: pillsVisible ? 1 : 0,
              transform: pillsVisible ? 'translateY(0px)' : 'translateY(8px)',
            }}
          >
            {PILL_LINKS.map((p) => (
              <Link
                key={p.label}
                href={p.href}
                className="mx-[0.2em] mb-[0.4em] inline-flex items-center justify-center whitespace-nowrap rounded-full border border-black/10 bg-white px-4 py-[0.3em] text-[13px] text-black transition-colors duration-200 hover:bg-black hover:text-white sm:px-5 sm:text-[15px]"
              >
                {p.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={copyEmail}
              className="mx-[0.2em] mb-[0.4em] inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-white bg-transparent px-4 py-[0.3em] text-[13px] text-white transition-colors duration-200 hover:bg-white hover:text-black sm:gap-3 sm:px-5 sm:text-[15px]"
            >
              <span>
                Reach us: <span className="underline underline-offset-1">{EMAIL}</span>
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

      <style>{`
        .mf-cursor {
          display: inline-block;
          width: 2px;
          height: 1.1em;
          background: #fff;
          vertical-align: middle;
          margin-left: 2px;
          animation: mf-blink 1s step-end infinite;
        }
        @keyframes mf-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </>
  );
}
