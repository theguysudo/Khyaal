'use client';

/**
 * The dashboard hero band.
 *
 * A full-viewport band that opens the household dashboard: Khayaal's
 * claymation of the grandmother as the media plate, a top-anchored headline
 * that never contradicts live data, and a nav that wipes its underlines in
 * from the left. The burger opens a clip-path wipe of the same links.
 *
 * The mechanics follow the reference spec exactly — the media plate entrance,
 * the nav stagger, the masked headline lines, the burger's X-morph, the
 * menu's per-item reveal delays, the easings and the reduced-motion escape.
 * Only the product-specific parts are Khayaal's: the palette, the type
 * (Instrument Serif + Instrument Sans) and the footage.
 *
 * When the household is on a tier-3 alert the band collapses to a slim strip
 * so the "Needs attention" banner stays the first thing on screen.
 */

import Link from 'next/link';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';

/** The four dashboard sections the nav jumps to. */
const NAV_LINKS = [
  { label: 'Status', href: '#kh-current-status' },
  { label: 'Her day', href: '#kh-day-trend' },
  { label: 'Rhythm', href: '#kh-rhythm' },
  { label: 'Circle', href: '#kh-care-circle' },
] as const;

/** The one primary action: open the commands panel that reaches her phone. */
const PRIMARY = { label: 'Reach her', href: '#kh-reach-her' } as const;

export default function DashboardHero({ isAlert = false }: { isAlert?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  /* --- menu: escape, resize past 900px, and the scroll lock (spec §11) --- */
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth > 900) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    document.body.classList.add('kh-menu-open');
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      document.body.classList.remove('kh-menu-open');
    };
  }, [menuOpen]);

  /* --- video: reveal once it has frames, then keep it playing (spec §11) --- */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const reveal = () => video.classList.add('is-ready');
    if (video.readyState >= 3) reveal();
    else video.addEventListener('loadeddata', reveal, { once: true });
    // Some mobile browsers withhold autoplay until a gesture — ask again then.
    const kick = () => {
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    };
    kick();
    window.addEventListener('touchstart', kick, { once: true, passive: true });
    window.addEventListener('click', kick, { once: true });
    return () => {
      window.removeEventListener('touchstart', kick);
      window.removeEventListener('click', kick);
    };
  }, []);

  return (
    <>
      {/*
        The webfonts are loaded here, not in the root layout: the landing page
        keeps its own type, and React hoists these link tags into <head>.
      */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400;500&display=swap"
      />

      <section className={`kh-hero${isAlert ? ' kh-hero--compact' : ''}`} aria-label="Khayaal household">
        {!isAlert && (
          <div className="kh-hero__media">
            <img
              src="/khayaal-hero-poster.jpg"
              alt="A claymation of an elderly grandmother with silver curls, wearing an olive cardigan, looking to one side against a rose-pink backdrop"
            />
            <video
              ref={videoRef}
              src="/homepage_animation.mp4"
              poster="/khayaal-hero-poster.jpg"
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              aria-hidden="true"
            />
          </div>
        )}

        <header className="kh-nav">
          <Link href="/" className="kh-logo kh-rise kh-d1" aria-label="Khayaal — home">
            Khayaal <span className="kh-logo__mark" aria-hidden="true">✳︎</span>
          </Link>

          <nav aria-label="Primary">
            <ul className="kh-nav__links">
              {NAV_LINKS.map((l, i) => (
                <li key={l.href}>
                  <a href={l.href} className={`kh-rise kh-d${i + 2}`}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="kh-nav__right">
            <a href={PRIMARY.href} className="kh-btn-play kh-rise kh-d6">
              {PRIMARY.label}
            </a>
            <button
              type="button"
              className={`kh-burger kh-rise kh-d6${menuOpen ? ' is-active' : ''}`}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="kh-menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </header>

        {!isAlert && (
          <div className="kh-hero__inner">
            <h1 className="kh-headline">
              <span className="kh-line">
                <span>The quiet watch we keep</span>
              </span>
              <span className="kh-line">
                <span>over her ordinary days</span>
              </span>
            </h1>
          </div>
        )}
      </section>

      {/* The overlay is a sibling of the hero, so the nav (z 60) stays above
          it (z 50) and the X is always clickable. */}
      <div
        id="kh-menu"
        className={`kh-menu${menuOpen ? ' is-open' : ''}`}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a')) setMenuOpen(false);
        }}
      >
        <nav aria-label="Mobile">
          <ul className="kh-menu__list">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href}>{l.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="kh-menu__rule" />
        <div className="kh-menu__foot">
          <a href={PRIMARY.href} className="kh-btn-play">
            {PRIMARY.label}
          </a>
        </div>
      </div>
    </>
  );
}
