/**
 * The dashboard's shared UI vocabulary — the Quiet Ledger edition.
 *
 * Buttons and inputs map onto the four ledger button families and the paper
 * input defined in app/globals.css (.btn-primary swipe-fill, .btn-secondary
 * border-draw, .btn-ghost underline-draw, .btn-sos rest-pulse). Focus is
 * handled globally (2px signal outline on :focus-visible) — the FOCUS_* here
 * only special-case surfaces where the signal outline would vanish.
 *
 * Status is always dot + word: the tier map's `pill` is text colour only, the
 * `dot` paints the 6px status dot, `color` paints chart fills. Everything is
 * a full literal string so Tailwind's scanner sees each class.
 */

/* Focus rings. The ledger's global focus outline is 2px signal; on the alarm
   banner (signal-on-alarm would vanish) the outline switches to paper. */
export const FOCUS = '';
export const FOCUS_ON_DARK = '';
export const FOCUS_ON_RED =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFF7F0] focus-visible:ring-offset-2 focus-visible:ring-offset-[#2a0d09]';
export const FOCUS_ON_N50 = FOCUS;

/* Buttons — the ledger families from globals.css. kh-press adds the magnetic
   scale(.97) answer from motion.css. */
export const BTN_PRIMARY = 'btn-primary kh-press';
export const BTN_SECONDARY = 'btn-secondary kh-press';
export const BTN_GHOST = 'btn-ghost kh-press';
/* Solid alarm button for the tier-3 banner — alarm fill, no pulse (the pulse
   is reserved for the SOS rail button, the only permitted loop). */
export const BTN_DANGER =
  'kh-press inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#B3261E] px-[18px] py-[10px] text-[15px] font-semibold text-[#FFF7F0] transition-colors hover:bg-[#9E211A] disabled:opacity-40';

/* Inputs — paper field on a 1px rule-strong, signal focus border. */
export const INPUT =
  'min-w-0 rounded-lg border border-[#D6CFC4] bg-white px-3.5 py-2.5 text-[15px] text-[#1A1815] outline-none transition-colors placeholder:text-[#8A857D] focus:border-[#B4451C]';

/* Status line — dot + word, no pill, no colour-only carrier. */
export const BADGE = 'inline-flex items-center gap-2 text-[13px] whitespace-nowrap';

/* The dashboard-side tier map — same tiers as lib/api's TIER_META, spoken in
   ledger tokens: calm green, watch amber, alarm red. `dot`/`pill` style the
   status line (text hue + 6px dot); `color` paints chart fills. */
export const TIER_UI: Record<number, { color: string; pill: string; dot: string }> = {
  0: { color: '#2F6B4F', pill: 'text-[#2F6B4F]', dot: 'bg-[#2F6B4F]' },
  1: { color: '#9A6A1B', pill: 'text-[#9A6A1B]', dot: 'bg-[#9A6A1B]' },
  2: { color: '#9A6A1B', pill: 'text-[#9A6A1B]', dot: 'bg-[#9A6A1B]' },
  3: { color: '#B3261E', pill: 'text-[#B3261E]', dot: 'bg-[#B3261E]' },
  4: { color: '#B3261E', pill: 'text-[#B3261E]', dot: 'bg-[#B3261E]' },
};

/* Chart palette — ledger tokens for svg fills/strokes on paper. */
export const INK = '#1A1815';
export const INK_2 = '#57534E';
export const INK_3 = '#8A857D';
export const RULE = '#E7E2DA';
export const RULE_STRONG = '#D6CFC4';
export const SIGNAL = '#B4451C';
export const CALM = '#2F6B4F';
export const WATCH = '#9A6A1B';
export const ALARM = '#B3261E';
