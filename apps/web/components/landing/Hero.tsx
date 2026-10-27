'use client';

/**
 * Full-screen hero implemented 1:1 from the provided Mainframe reference:
 * mouse-scrub background video (SENSITIVITY 0.8, seek-queue so we never flood
 * video.currentTime), fixed white navbar with comma-separated links, blurred
 * intro label, typewriter, four white pills + one copy-email pill, and the
 * black/90 mobile overlay. Fonts load from the reference's webfont links and
 * the two family variables are scoped here so the rest of the site keeps its
 * own type.
 */

import { useEffect, useRef, useState } from 'react';
import { useTypewriter } from './useTypewriter';

const SENSITIVITY = 0.8;
const EMAIL = 'hello@mainframe.co';

const NAV_LINKS = ['Labs', 'Studio', 'Openings', 'Shop'];

const PILL_LABELS = ['Pitch us an idea', 'Come work here', 'Send a brief hello', 'See how we operate'];

export default function Hero() {
  const { displayed, done } = useTypewriter(
    'Glad you stopped in. Good taste tends to find us. Now, what are we building?',
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
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />

      {/* ------------------------------------------------ Navbar (fixed) */}
      <header className="fixed top-0 z-10 w-full">
        <div className="flex items-center justify-between px-5 py-4 sm:px-8 sm:py-5">
          <div className="flex items-center gap-3 select-none">
            <span
              className="text-[21px] tracking-tight text-white sm:text-[26px]"
              style={{ fontFamily: 'var(--mf-heading)' }}
            >
              Mainframe®
            </span>
            <span className="select-none text-[25px] leading-none text-white sm:text-[30px]" style={{ letterSpacing: '-0.02em' }}>
              ✳︎
            </span>
          </div>

          <nav className="hidden items-center text-[23px] text-white md:flex">
            {NAV_LINKS.map((l, i) => (
              <span key={l}>
                <a href="#" className="transition-opacity hover:opacity-60">
                  {l}
                </a>
                {i < NAV_LINKS.length - 1 && <span className="mx-2">,&nbsp;</span>}
              </span>
            ))}
          </nav>

          <div className="hidden md:block">
            <a href="#" className="text-[23px] text-white underline underline-offset-2 transition-opacity hover:opacity-60">
              Get in touch
            </a>
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
          <a key={l} href="#" onClick={() => setMenuOpen(false)} className="text-[32px] font-medium text-white">
            {l}
          </a>
        ))}
        <a href="#" className="text-[32px] font-medium text-white underline underline-offset-4">
          Get in touch
        </a>
      </div>

      {/* ------------------------------------------------ Hero section */}
      <section className="relative z-[1] flex h-screen flex-col justify-end overflow-hidden pb-12 md:justify-center md:pb-0">
        <div className="relative z-10 max-w-xl">
          {/* 1. Blurred intro label */}
          <p
            className="pointer-events-none mb-5 select-none sm:mb-6"
            style={{
              fontSize: 'clamp(18px, 4vw, 26px)',
              lineHeight: 1.3,
              fontWeight: 400,
              color: '#fff',
              filter: 'blur(4px)',
              fontFamily: 'var(--mf-body)',
            }}
          >
            Hey there, meet A.R.I.A,
            <br />
            Mainframe's Adaptive Response Interface Agent
          </p>

          {/* 2. Typewriter */}
          <p
            className="mb-5 text-white sm:mb-6"
            style={{
              fontSize: 'clamp(18px, 4vw, 26px)',
              lineHeight: 1.35,
              fontWeight: 400,
              minHeight: '54px',
              fontFamily: 'var(--mf-body)',
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
            {PILL_LABELS.map((label) => (
              <button
                key={label}
                type="button"
                className="mx-[0.2em] mb-[0.4em] inline-flex items-center justify-center whitespace-nowrap rounded-full border border-black/10 bg-white px-4 py-[0.3em] text-[13px] text-black transition-colors duration-200 hover:bg-black hover:text-white sm:px-5 sm:text-[15px]"
              >
                {label}
              </button>
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
