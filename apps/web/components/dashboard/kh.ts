/**
 * The dashboard's shared UI vocabulary — one place for the Vision-UI dark
 * glass patterns every card repeats: focus rings, buttons, badges, inputs,
 * and the tier colour map (the dashboard-side twin of lib/api's TIER_META,
 * restyled onto the Vision dark surface: Vision green/amber/red for tiers,
 * Khayaal terracotta for the mid-tier ramp).
 *
 * Brand mapping: Khayaal terracotta (brand-*) stays the colour of filled
 * actions; Vision's purple/blue/teal/green (vision-*) are the data accents.
 * Everything is a full literal string so Tailwind's scanner sees each class.
 */

/* Focus rings — one per surface the dashboard renders on. White rings on the
   dark glass, offset onto the page navy. */
export const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-vision-navy';
export const FOCUS_ON_DARK =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-vision-navy';
export const FOCUS_ON_RED =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#20060a]';
export const FOCUS_ON_N50 = FOCUS;

/* Buttons — Vision UI on dark: primary is Khayaal terracotta (the brand's
   filled action, white text, 10×18 padding, 10px radius, warm shadow);
   secondary is glass (white 10% fill, gradient hairline via .kh-gradring,
   hover 16%). */
export const BTN_PRIMARY = `kh-press kh-lift inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-brand-600 px-[18px] py-[10px] text-sm font-semibold text-white shadow-[0_6px_20px_-6px_rgba(220,104,3,0.55)] transition-colors hover:bg-brand-500 disabled:opacity-40 disabled:hover:bg-brand-600 ${FOCUS}`;
export const BTN_SECONDARY = `kh-press kh-gradring kh-gbtn inline-flex items-center justify-center gap-1.5 rounded-[10px] px-[18px] py-[10px] text-sm font-semibold text-white disabled:opacity-40 ${FOCUS}`;
export const BTN_DANGER = `kh-press kh-lift inline-flex items-center justify-center gap-1.5 rounded-[10px] bg-err-600 px-[18px] py-[10px] text-sm font-semibold text-white shadow-[0_6px_20px_-6px_rgba(227,26,26,0.55)] transition-colors hover:bg-err-500 disabled:opacity-40 ${FOCUS_ON_RED}`;
/* The small, quiet variant used inside rows and chips. */
export const BTN_GHOST =
  'kh-press rounded-lg px-2.5 py-1 text-xs font-medium text-vision-dim transition-colors hover:bg-white/10 hover:text-white';

/* Inputs — Vision's dark field (Figma 580:4242): near-navy fill, faint white
   stroke, quiet white focus. */
export const INPUT =
  'min-w-0 rounded-xl border border-white/15 bg-vision-field/70 px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-white/35 focus:border-white/40 focus-visible:ring-4 focus-visible:ring-white/10';

/* Badge pill — Text xs/Medium, 2px 8px, 16px radius (Figma badge pattern). */
export const BADGE =
  'inline-flex items-center gap-1.5 rounded-2xl px-2.5 py-0.5 text-xs font-medium whitespace-nowrap';

/* The dashboard-side tier map — same tiers as lib/api's TIER_META, recoloured
   for the dark glass. `dot`/`pill` style the status badge (pills are the
   hue at 10-15% fill with a lighter text tone for contrast); `color` paints
   chart fills and contribution bars. */
export const TIER_UI: Record<number, { color: string; pill: string; dot: string }> = {
  0: { color: '#01B574', pill: 'bg-[#01B574]/10 text-[#01B574]', dot: 'bg-[#01B574]' },
  1: { color: '#FDB022', pill: 'bg-[#FDB022]/10 text-[#FDB022]', dot: 'bg-[#FDB022]' },
  2: { color: '#F79009', pill: 'bg-[#F79009]/10 text-[#F79009]', dot: 'bg-[#F79009]' },
  3: { color: '#E31A1A', pill: 'bg-[#E31A1A]/15 text-err-400', dot: 'bg-[#E31A1A]' },
  4: { color: '#E31A1A', pill: 'bg-err-600 text-white', dot: 'bg-err-200' },
};
