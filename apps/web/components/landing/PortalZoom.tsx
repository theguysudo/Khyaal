'use client';

/**
 * The zoom-through. Borrowed from the Planet-Jump portal mechanic: a small
 * rounded window sits mid-screen showing a live scene; as you scroll it
 * grows until it swallows the viewport — corner radius and all — while the
 * headline rises out of the blur. GSAP ScrollTrigger scrubs the whole thing,
 * so scrolling back re-opens the window. anime.js is not used here; this is
 * pure ScrollTrigger scrubbing.
 *
 * Image: Wikimedia Commons, "Grandmother and grandchild" (hotlinked).
 */

import { useEffect, useRef } from 'react';

const IMAGE =
  'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e5/Grandmother_and_grandchild_%CC%A0_1.jpg/1920px-Grandmother_and_grandchild_%CC%A0_1.jpg';

export default function PortalZoom() {
  const sectionRef = useRef<HTMLElement>(null);
  const winRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const introRef = useRef<HTMLParagraphElement>(null);
  const headlineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cleanup = () => {};
    let cancelled = false;

    (async () => {
      try {
        const gsap = (await import('gsap')).default;
        const { ScrollTrigger } = await import('gsap/ScrollTrigger');
        if (cancelled) return;
        gsap.registerPlugin(ScrollTrigger);

      const ctx = gsap.context(() => {
        const mm = gsap.matchMedia();

        mm.add(
          {
            desktop: '(min-width: 768px)',
            mobile: '(max-width: 767px)',
            reduce: '(prefers-reduced-motion: reduce)',
          },
          (mmCtx) => {
            const { desktop, reduce } = mmCtx.conditions as { desktop: boolean; reduce: boolean };

            if (reduce) {
              // No pin, no zoom — show the settled frame.
              gsap.set(winRef.current, { clipPath: 'inset(0% 0% 0% 0% round 0px)' });
              gsap.set(headlineRef.current, { opacity: 1, y: 0 });
              gsap.set(introRef.current, { opacity: 0 });
              return;
            }

            const inset = desktop ? '30% 33% 30% 33%' : '24% 9% 24% 9%';
            const radius = desktop ? '90px' : '64px';

            const tl = gsap.timeline({
              scrollTrigger: {
                trigger: sectionRef.current,
                start: 'top top',
                end: '+=170%',
                scrub: 0.6,
                pin: true,
                anticipatePin: 1,
                onUpdate: (self) => {
                  if (counterRef.current) {
                    counterRef.current.textContent = `${Math.round(self.progress * 100)}`;
                  }
                },
              },
            });

            tl.fromTo(
              winRef.current,
              { clipPath: `inset(${inset} round ${radius})` },
              { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none', duration: 1 },
              0,
            )
              .fromTo(imgRef.current, { scale: 1.32 }, { scale: 1, ease: 'none', duration: 1 }, 0)
              .fromTo(
                introRef.current,
                { opacity: 1, y: 0 },
                { opacity: 0, y: -34, ease: 'none', duration: 0.32 },
                0,
              )
              .fromTo(
                counterRef.current,
                { opacity: 1 },
                { opacity: 0, ease: 'none', duration: 0.25 },
                0.75,
              )
              .fromTo(
                headlineRef.current,
                { opacity: 0, y: 70 },
                { opacity: 1, y: 0, ease: 'power2.out', duration: 0.4 },
                0.55,
              );
          },
        );
      }, sectionRef);

      cleanup = () => ctx.revert();
      } catch (err) {
        // TEMP diagnostics — surfaced in the DOM so remote checks can see it.
        const tag = document.createElement('div');
        tag.setAttribute('data-gsap-err', String(err));
        tag.textContent = String(err);
        tag.style.cssText = 'position:fixed;top:4px;left:4px;z-index:99;font-size:10px;color:#fff;background:#b23a2f;padding:2px 6px;border-radius:4px;max-width:60vw;overflow:hidden';
        document.body.appendChild(tag);
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return (
    <section ref={sectionRef} className="relative h-screen overflow-hidden bg-[#1A1815]">
      {/* the window — clip-path shrinks/grows; media stays screen-locked */}
      <div ref={winRef} className="absolute inset-0" style={{ clipPath: 'inset(30% 33% 30% 33% round 90px)' }}>
        <img
          ref={imgRef}
          src={IMAGE}
          alt="A grandmother spending time with her grandchild at home"
          className="h-full w-full object-cover"
          loading="eager"
        />
        {/* bottom scrim so type stays readable — one flat veil */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
          style={{ background: 'rgba(20, 14, 10, 0.55)' }}
        />
        {/* headline that rises as the window swallows the screen */}
        <div ref={headlineRef} className="absolute inset-x-0 bottom-[14%] px-6 text-center opacity-0 md:bottom-[18%]">
          <p className="t-display text-[clamp(34px,6vw,68px)] text-[#FAF8F5]">
            The day still happens
          </p>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-white/75">
            The kettle, the courtyard, the grandchild visiting — Khayaal hears the shape of it
            and turns it into one quiet answer for you.
          </p>
        </div>
      </div>

      {/* floating caption above the window (fades as it opens) */}
      <p
        ref={introRef}
        className="t-meta pointer-events-none absolute left-1/2 top-[16%] -translate-x-1/2 text-[rgba(250,248,245,0.75)]"
      >
        While you are away —
      </p>

      {/* scroll progress, a nod to the reference's counter */}
      <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg border border-[rgba(250,248,245,0.4)] bg-[rgba(20,14,10,0.6)] px-4 py-1.5">
        <span className="font-mono text-[13px] tabular-nums text-[#FAF8F5]">
          <span ref={counterRef}>0</span>%
        </span>
      </div>
    </section>
  );
}
