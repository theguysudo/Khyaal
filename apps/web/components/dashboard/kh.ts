/**
 * The dashboard's shared UI vocabulary — one place for the Untitled-UI
 * patterns every card repeats: focus rings, buttons, badges, inputs, and the
 * tier colour map (the dashboard-side twin of lib/api's TIER_META, restyled
 * onto the Khayaal terracotta / error / success ramps).
 *
 * Everything is a full literal string so Tailwind's scanner sees each class.
 */

/* Focus rings — one per surface the dashboard renders on. */
export const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white';
export const FOCUS_ON_DARK =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-n-800';
export const FOCUS_ON_RED =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-err-600/60 focus-visible:ring-offset-2 focus-visible:ring-offset-err-50';
export const FOCUS_ON_N50 =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/60 focus-visible:ring-offset-2 focus-visible:ring-offset-n-50';

/* Buttons — Primary (brand) / Secondary gray / Danger, from the Figma
   dashboard anatomy: 8px radius, shadow-xs, Text sm/Semibold. */
export const BTN_PRIMARY = `kh-press kh-lift inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-brand-700 disabled:opacity-40 disabled:hover:bg-brand-600 ${FOCUS}`;
export const BTN_SECONDARY = `kh-press inline-flex items-center justify-center gap-1.5 rounded-lg border border-n-300 bg-white px-4 py-2.5 text-sm font-semibold text-n-700 shadow-xs transition-colors hover:bg-n-50 disabled:opacity-40 ${FOCUS}`;
export const BTN_DANGER = `kh-press kh-lift inline-flex items-center justify-center gap-1.5 rounded-lg bg-err-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-err-700 disabled:opacity-40 ${FOCUS_ON_RED}`;
/* The small, quiet variant used inside rows and chips. */
export const BTN_GHOST =
  'kh-press rounded-lg px-2.5 py-1 text-xs font-medium text-n-500 transition-colors hover:bg-n-100 hover:text-n-700';

/* Inputs — Untitled: white field, Neutral/300 border, shadow-xs, brand focus. */
export const INPUT =
  'min-w-0 rounded-lg border border-n-300 bg-white px-3.5 py-2.5 text-sm text-n-900 shadow-xs outline-none transition-colors placeholder:text-n-500 focus:border-brand-500 focus-visible:ring-4 focus-visible:ring-brand-600/10';

/* Badge pill — Text xs/Medium, 2px 8px, 16px radius (Figma badge pattern). */
export const BADGE =
  'inline-flex items-center gap-1.5 rounded-2xl px-2.5 py-0.5 text-xs font-medium whitespace-nowrap';

/* The dashboard-side tier map — same tiers as lib/api's TIER_META, recoloured
   onto the new ramps. `dot`/`pill` style the status badge; `color` paints
   chart fills and contribution bars; `bar` is the dark-counter accent. */
export const TIER_UI: Record<number, { color: string; pill: string; dot: string }> = {
  0: { color: '#039855', pill: 'bg-ok-50 text-ok-700', dot: 'bg-ok-600' },
  1: { color: '#DC6803', pill: 'bg-brand-50 text-brand-700', dot: 'bg-brand-500' },
  2: { color: '#B54708', pill: 'bg-brand-100 text-brand-800', dot: 'bg-brand-600' },
  3: { color: '#D92D20', pill: 'bg-err-50 text-err-700', dot: 'bg-err-600' },
  4: { color: '#912018', pill: 'bg-err-600 text-white', dot: 'bg-err-200' },
};
