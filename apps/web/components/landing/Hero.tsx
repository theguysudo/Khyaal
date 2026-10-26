'use client';

/**
 * Full-viewport hero, rebuilt literally from the Vinyl hero spec and ported to
 * Khayaal:
 *
 *   - Warm paper (#faf6ef) stands in for the spec's --sky; --ink stays
 *     near-black. The page background always reads as the media's ambience,
 *     never black.
 *   - The media is Khayaal's own hero imagery: a still of the claymation
 *     grandmother from public/khayaal-hero-portrait.jpg (extracted from the
 *     homepage animation). There is no <video>; the still IS the poster, and
 *     the poster-first .is-ready cross-fade + media-plate entrance
 *     (scale 1.08 -> 1, blur 14 -> 0, opacity settling) apply to it.
 *   - Top-anchored masked two-line headline (no align-items centering — the
 *     h1 box stretches and its text renders at the top), horizontal centering
 *     from BOTH justify-content:center on .hero__inner and text-align:center
 *     on .headline.
 *   - Nav in normal flow above the media, z-index 60 so it sits above the
 *     fixed menu overlay (z-index 50) and the burger/X is never trapped.
 *   - Staggered entrance (.rise + .d1-.d7), clip-path mobile menu, reduced
 *     motion reset, and the small imperative IIFE behaviors (menu toggling,
 *     Escape, resize close, image .is-ready, gesture kick) ported into one
 *     effect.
 *
 * All class names from the spec are kept but scoped under .khh so nothing
 * leaks into the rest of the site, which keeps its own font stack.
 */

import Link from 'next/link';
import { useEffect, useRef } from 'react';

const NAV_LINKS = [
  { label: 'How it works', href: '/#how' },
  { label: 'Signals', href: '/#signals' },
  { label: 'Docs', href: '/#docs' },
  { label: 'Demo', href: '/demo' },
  { label: 'Privacy', href: '/#promise' },
];

const CTA_HREF = '/onboarding';
const CTA_LABEL = 'Start for your family';
const HERO_IMG = '/khayaal-hero-portrait.jpg';

const HERO_CSS = `
html { -webkit-text-size-adjust: 100%; }
body.menu-open { overflow: hidden; }

.khh {
  --ink: #0b0b0c;
  --sky: #faf6ef;               /* Khayaal's warm paper stands in for the spec sky */
  --clay: #e8a06b;
  --nav-gap: clamp(1.1rem, 2.2vw, 2.15rem);
  --pad-x: clamp(1.25rem, 4vw, 3.6rem);
  --ease: cubic-bezier(.22, 1, .36, 1);
  --ease-in-out: cubic-bezier(.76, 0, .24, 1);
  --poster: url("/khayaal-hero-portrait.jpg");
  color: var(--ink);
  font-family: "Instrument Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
}
.khh a { color: inherit; text-decoration: none; }
.khh button {
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  color: inherit;
  cursor: pointer;
}

/* ---- structure -------------------------------------------------------- */

.khh .hero {
  position: relative;
  min-height: 100svh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--sky);
}

/* media plate — the still, entrance settles scale 1.08 + blur + opacity */
.khh .hero__media {
  position: absolute;
  inset: 0;
  z-index: 0;
  transform: scale(1.08);
  filter: blur(14px);
  opacity: 0;
  animation: khh-mediaIn 1.9s var(--ease) .1s forwards;
}
@keyframes khh-mediaIn {
  to { transform: scale(1); filter: blur(0); opacity: 1; }
}

/* blurred-feathered backdrop — defined globally, shown only on portrait mobile */
.khh .hero__media::before {
  content: "";
  position: absolute;
  inset: -8%;
  z-index: 0;
  display: none;
  background: var(--poster) center 22% / cover no-repeat;
  filter: blur(30px) saturate(104%);
  transform: scale(1.05);
}

/* the still itself — poster-first paint; .is-ready cross-fades it the rest
   of the way in over 1.2s once it has actually loaded */
.khh .hero__media img {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* the spec biased 62% down toward its low subject; Khayaal's subject sits
     high in frame, so the vertical bias protects her face on cropped
     viewports, and the horizontal bias centres her on narrow strips */
  object-position: center 38%;
  display: block;
  opacity: 0;
  transition: opacity 1.2s ease;
}
.khh .hero__media img.is-ready { opacity: 1; }

/* type wash — keeps the black type crisp without visibly dimming the media */
.khh .hero__media::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
  background:
    linear-gradient(to bottom,
      rgba(250, 246, 239, .55) 0%,
      rgba(250, 246, 239, .18) 34%,
      rgba(250, 246, 239, 0) 58%),
    radial-gradient(120% 70% at 50% 0%, rgba(255, 255, 255, .35), rgba(255, 255, 255, 0) 60%);
}

/* nav — IN NORMAL FLOW, z-index 60 so it sits above the menu overlay (50) */
.khh .nav {
  position: relative;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: clamp(1.1rem, 2.4vw, 1.9rem) var(--pad-x);
}
.khh .logo {
  display: inline-flex;
  align-items: center;
  gap: .35rem;
  font-family: "Instrument Serif", Georgia, serif;
  font-weight: 400;
  font-size: clamp(1.5rem, 2.4vw, 1.9rem);
  line-height: 1;
  letter-spacing: .01em;
  white-space: nowrap;
}
.khh .logo .mark { color: var(--clay); font-size: 1.02em; line-height: 1; }
/* the <nav> wrapper takes the spec's absolute centering; the list itself
   stays a plain flex row */
.khh .nav-primary {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}
.khh .nav__links {
  display: flex;
  gap: var(--nav-gap);
  list-style: none;
  margin: 0;
  padding: 0;
}
.khh .nav__links a {
  font-size: clamp(.95rem, 1.05vw, 1.05rem);
  letter-spacing: .005em;
  padding: .15rem 0;
  display: inline-block;
  position: relative;
}
.khh .nav__links a::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -2px;
  height: 1px;
  background: currentColor;
  transform: scaleX(0);
  transform-origin: right;
  transition: transform .5s var(--ease);
}
.khh .nav__links a:hover::after {
  transform: scaleX(1);
  transform-origin: left;
}
.khh .nav__right {
  display: flex;
  align-items: center;
  gap: .6rem;
}
.khh .btn-play {
  background: var(--ink);
  color: #fff;
  border-radius: 6px;
  padding: .72rem 1.15rem;
  font-size: .95rem;
  line-height: 1;
  white-space: nowrap;
  transition: transform .45s var(--ease), background-color .45s var(--ease), box-shadow .45s var(--ease);
}
.khh .btn-play:hover {
  transform: translateY(-2px);
  background: #1e1e21;
  box-shadow: 0 10px 24px -12px rgba(0, 0, 0, .6);
}
.khh .btn-play:active { transform: translateY(0); }

/* hamburger — hidden on desktop, morphs into an X when open */
.khh .burger {
  display: none;
  width: 44px;
  height: 44px;
  margin-right: -8px;
  position: relative;
  z-index: 60;
  border-radius: 8px;
  flex: 0 0 auto;
}
.khh .burger span {
  position: absolute;
  left: 11px;
  width: 22px;
  height: 1.6px;
  background: var(--ink);
  border-radius: 2px;
  transition: transform .55s var(--ease-in-out), opacity .3s ease, width .55s var(--ease-in-out);
}
.khh .burger span:nth-child(1) { top: 17px; }
.khh .burger span:nth-child(2) { top: 22px; width: 15px; } /* deliberately shorter */
.khh .burger span:nth-child(3) { top: 27px; }
.khh .burger.is-active span:nth-child(1) { transform: translateY(5px) rotate(45deg); }
.khh .burger.is-active span:nth-child(2) { opacity: 0; transform: translateX(10px); }
.khh .burger.is-active span:nth-child(3) { transform: translateY(-5px) rotate(-45deg); }

/* headline — top-anchored, never vertically centered */
.khh .hero__inner {
  position: relative;
  z-index: 10;
  flex: 1;                    /* eats the leftover column height */
  display: flex;              /* REQUIRED */
  justify-content: center;    /* horizontal centering of the h1 box */
  padding: clamp(1.5rem, 5vh, 4.5rem) var(--pad-x) 0;
  pointer-events: none;
  /* align-items deliberately left at its default (stretch): the h1 box spans
     the full height and its text renders at the TOP of that box */
}
.khh .headline {
  margin: 0;
  font-family: "Instrument Serif", Georgia, serif;
  font-weight: 400;
  font-size: clamp(2.7rem, 6.3vw, 6.75rem);
  line-height: 1.06;
  letter-spacing: -.005em;
  text-align: center;         /* second, independent centering mechanism */
}
.khh .line {
  display: block;
  overflow: hidden;           /* the mask the inner span slides out of */
  white-space: nowrap;        /* desktop: the 2-line break is design */
  padding-bottom: .06em;      /* pad + negative margin: descenders clear the
                                 mask without adding layout height */
  margin-bottom: -.06em;
}
.khh .line > span {
  display: block;
  transform: translateY(110%);
  opacity: 0;
  animation: khh-lineUp 1.25s var(--ease) forwards;
}
.khh .line:nth-child(1) > span { animation-delay: .55s; }
.khh .line:nth-child(2) > span { animation-delay: .68s; }
@keyframes khh-lineUp {
  to { transform: translateY(0); opacity: 1; }
}

/* staggered nav entrance */
.khh .rise {
  opacity: 0;
  transform: translateY(-14px);
  animation: khh-rise .95s var(--ease) forwards;
}
@keyframes khh-rise {
  to { opacity: 1; transform: translateY(0); }
}
.khh .d1 { animation-delay: .18s; }
.khh .d2 { animation-delay: .26s; }
.khh .d3 { animation-delay: .32s; }
.khh .d4 { animation-delay: .38s; }
.khh .d5 { animation-delay: .44s; }
.khh .d6 { animation-delay: .52s; }
.khh .d7 { animation-delay: .60s; } /* spec stops at d6; five links need one more */

/* mobile menu — clip-path wipe, everything transitions so it reverses */
.khh .menu {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 var(--pad-x);
  background: rgba(250, 246, 239, .92);
  backdrop-filter: blur(22px) saturate(140%);
  -webkit-backdrop-filter: blur(22px) saturate(140%);
  clip-path: inset(0 0 100% 0);
  visibility: hidden;
  transition: clip-path .85s var(--ease-in-out), visibility 0s linear .85s;
}
.khh .menu.is-open {
  clip-path: inset(0 0 0 0);
  visibility: visible;
  transition: clip-path .85s var(--ease-in-out), visibility 0s linear 0s;
}
.khh .menu__list { list-style: none; margin: 0; padding: 0; }
.khh .menu__list li { overflow: hidden; }
.khh .menu__list a {
  font-family: "Instrument Serif", Georgia, serif;
  font-size: clamp(2.35rem, 12vw, 3.4rem);
  line-height: 1.22;
  padding: .12em 0;
  display: block;
  transform: translateY(115%);
  opacity: 0;
  transition: transform .8s var(--ease), opacity .6s ease;
}
.khh .menu.is-open .menu__list a { transform: translateY(0); opacity: 1; }
.khh .menu.is-open .menu__list li:nth-child(1) a { transition-delay: .26s; }
.khh .menu.is-open .menu__list li:nth-child(2) a { transition-delay: .33s; }
.khh .menu.is-open .menu__list li:nth-child(3) a { transition-delay: .40s; }
.khh .menu.is-open .menu__list li:nth-child(4) a { transition-delay: .47s; }
.khh .menu.is-open .menu__list li:nth-child(5) a { transition-delay: .54s; }
.khh .menu__rule {
  height: 1px;
  background: rgba(11, 11, 12, .16);
  margin: 2.2rem 0 0;
  transform: scaleX(0);
  transform-origin: left;
  transition: transform .9s var(--ease);
}
.khh .menu.is-open .menu__rule { transform: scaleX(1); transition-delay: .5s; }
.khh .menu__foot {
  margin-top: 2.2rem;
  opacity: 0;
  transform: translateY(22px);
  transition: transform .8s var(--ease), opacity .6s ease;
}
.khh .menu.is-open .menu__foot { opacity: 1; transform: translateY(0); transition-delay: .56s; }
.khh .menu__foot .btn-play {
  display: inline-block;
  padding: .95rem 1.6rem;
  font-size: 1rem;
}

/* ---- responsive -------------------------------------------------------- */

@media (max-width: 900px) {
  .khh .nav-primary,
  .khh .nav__right .btn-play { display: none; }
  .khh .burger { display: block; }
  .khh .hero__media img { object-position: 68% 38%; } /* her face sits right of centre */
  .khh .hero__inner { align-items: flex-start; }      /* still top-anchored, just explicit */
  .khh .line { white-space: normal; }                 /* copy may re-wrap below this point */
  .khh .headline { font-size: clamp(2.4rem, 6.4vw, 3.6rem); max-width: 15ch; }
}

@media (max-width: 900px) and (orientation: portrait) {
  /* a 16:9 frame stretched to cover a 375x812 screen shows only a slice of
     its width — bottom-anchor the portrait at a sane scale and feather its
     top edge into the blurred backdrop so the open composition survives */
  .khh .hero__media::before { display: block; }
  .khh .hero__media img {
    top: auto;
    bottom: 0;
    height: 64svh;
    object-position: 68% 62%;
    -webkit-mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, .6) 9%, #000 20%);
    mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, .6) 9%, #000 20%);
  }
}

@media (max-width: 560px) {
  .khh .headline { font-size: clamp(2.15rem, 9.4vw, 3.1rem); line-height: 1.12; max-width: 11ch; }
  .khh .hero__inner { padding-top: clamp(1.75rem, 7vh, 3rem); }
  .khh .hero__media img { object-position: 68% 58%; }
}

@media (max-width: 380px) {
  .khh .headline { font-size: 2rem; }
}

@media (max-height: 520px) and (orientation: landscape) {
  .khh .headline { font-size: clamp(1.7rem, 5vw, 2.4rem); max-width: 22ch; }
  .khh .hero__inner { padding-top: .75rem; }
  .khh .menu__list a { font-size: clamp(1.4rem, 5vw, 1.9rem); }
  .khh .menu__rule, .khh .menu__foot { margin-top: 1.2rem; }
}

/* ---- reduced motion ------------------------------------------------------ */

@media (prefers-reduced-motion: reduce) {
  .khh *, .khh *::before, .khh *::after {
    animation-duration: .01ms !important;
    animation-delay: 0ms !important;
    transition-duration: .01ms !important;
  }
  .khh .hero__media { opacity: 1; transform: none; filter: none; }
  .khh .line > span { transform: none; opacity: 1; }
  /* safety beyond the spec block: kill the visibility/clip-path transition
     delays so the menu opens and closes instantly and never lingers
     hittable-but-invisible after a close */
  .khh .menu, .khh .menu__list a, .khh .menu__rule, .khh .menu__foot {
    transition-delay: 0s !important;
  }
}
`;

export default function Hero() {
  const rootRef = useRef<HTMLDivElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // The spec's imperative IIFE, ported into one effect. No React state is
  // involved: the menu and the image reveal are pure class toggles, exactly
  // like the single-file original.
  useEffect(() => {
    const burger = burgerRef.current;
    const menu = menuRef.current;
    const img = imgRef.current;
    let menuOpen = false;

    const setMenu = (next: boolean) => {
      menuOpen = next;
      menu?.classList.toggle('is-open', next);
      burger?.classList.toggle('is-active', next);
      document.body.classList.toggle('menu-open', next);
      if (burger) {
        burger.setAttribute('aria-expanded', next ? 'true' : 'false');
        burger.setAttribute('aria-label', next ? 'Close menu' : 'Open menu');
      }
    };

    // IMAGE: add .is-ready only once the still has actually loaded, so first
    // paint carries it with no flash and it cross-fades the rest of the way.
    const reveal = () => img?.classList.add('is-ready');
    if (img) {
      if (img.complete && img.naturalWidth > 0) reveal();
      else img.addEventListener('load', reveal, { once: true });
    }

    // GESTURE KICK: the spec's video-play kick, adapted to the still — some
    // browsers may hydrate before the load event lands, so the first touch
    // or click re-checks and reveals if the frame is already there.
    const kick = () => {
      if (img && !img.classList.contains('is-ready') && img.complete && img.naturalWidth > 0) reveal();
    };
    document.addEventListener('touchstart', kick, { once: true, passive: true });
    document.addEventListener('click', kick, { once: true });

    // MENU: burger toggles; any <a> inside the menu closes it.
    const onBurgerClick = () => setMenu(!menuOpen);
    const onMenuClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest('a')) setMenu(false);
    };
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && menuOpen) setMenu(false);
    };
    const onResize = () => {
      if (menuOpen && window.innerWidth > 900) setMenu(false);
    };

    burger?.addEventListener('click', onBurgerClick);
    menu?.addEventListener('click', onMenuClick);
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', onResize);

    return () => {
      document.removeEventListener('touchstart', kick);
      document.removeEventListener('click', kick);
      burger?.removeEventListener('click', onBurgerClick);
      menu?.removeEventListener('click', onMenuClick);
      document.removeEventListener('keydown', onKeydown);
      window.removeEventListener('resize', onResize);
      document.body.classList.remove('menu-open');
    };
  }, []);

  return (
    <div className="khh" ref={rootRef}>
      <style>{HERO_CSS}</style>
      <noscript>
        {/* the .is-ready reveal needs JS; without it the still must simply show */}
        <style>{`.khh .hero__media img { opacity: 1 !important; }`}</style>
      </noscript>

      <section className="hero">
        <div className="hero__media">
          <img
            ref={imgRef}
            src={HERO_IMG}
            alt="A claymation grandmother with curly grey hair and a green cardigan, smiling softly against a deep red backdrop"
          />
        </div>

        <header className="nav">
          <Link href="/" className="logo rise d1" aria-label="Khayaal — home">
            Khayaal
            <span className="mark" aria-hidden="true">
              ✳︎
            </span>
          </Link>

          <nav className="nav-primary" aria-label="Primary">
            <ul className="nav__links">
              {NAV_LINKS.map((l, i) => (
                <li key={l.label} className={`rise d${i + 2}`}>
                  <a href={l.href}>{l.label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="nav__right">
            <Link href={CTA_HREF} className="btn-play rise d7">
              {CTA_LABEL}
            </Link>
            <button
              ref={burgerRef}
              type="button"
              id="burger"
              className="burger rise d7"
              aria-label="Open menu"
              aria-expanded="false"
              aria-controls="menu"
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </header>

        <div className="hero__inner">
          <h1 className="headline">
            <span className="line">
              <span>She hasn&rsquo;t pressed a button,</span>
            </span>
            <span className="line">
              <span>or worn a gadget.</span>
            </span>
          </h1>
        </div>
      </section>

      <div className="menu" id="menu" ref={menuRef}>
        <nav aria-label="Mobile">
          <ul className="menu__list">
            {NAV_LINKS.map((l) => (
              <li key={l.label}>
                <a href={l.href}>{l.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="menu__rule" aria-hidden="true" />
        <div className="menu__foot">
          <Link href={CTA_HREF} className="btn-play">
            {CTA_LABEL}
          </Link>
        </div>
      </div>
    </div>
  );
}
