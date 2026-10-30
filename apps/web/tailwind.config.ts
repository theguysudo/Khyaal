import type { Config } from 'tailwindcss';

/**
 * Khayaal brand tokens — "The Quiet Ledger" (docs/DESIGN_QUIET_LEDGER.md).
 *
 * The ledger palette is small on purpose: warm paper, three inks, two rules,
 * one warm signal accent, and three status hues (calm / watch / alarm) that
 * never carry meaning alone — status is always dot + word. The dark set lives
 * in globals.css under .theme-dark and is reserved for SOS contexts.
 *
 * The legacy aliases (paper/ink/clay/claydeep) are kept as names so existing
 * classes across the app keep compiling, but their values now resolve onto
 * the ledger ramp.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* legacy aliases — values moved onto the ledger ramp */
        paper: '#FAF8F5',
        cream: '#f3ecdf',
        ink: '#1A1815',
        clay: '#B4451C',
        claydeep: '#93370D',
        sage: '#7d8c6f',
        dusk: '#3d3352',
        mist: '#efe3d3',

        /* The Quiet Ledger tokens */
        ledger: {
          paper: '#FAF8F5',
          raised: '#FFFFFF',
          ink: '#1A1815',
          ink2: '#57534E',
          ink3: '#8A857D',
          rule: '#E7E2DA',
          ruleStrong: '#D6CFC4',
          signal: '#B4451C',
          signalInk: '#FFF7F0',
          calm: '#2F6B4F',
          watch: '#9A6A1B',
          alarm: '#B3261E',
        },

        /* Neutral — kept for any remaining gray usage */
        n: {
          25: '#FCFCFD',
          50: '#FAFAFA',
          100: '#F5F5F5',
          200: '#E5E5E5',
          300: '#D4D4D4',
          400: '#A3A3A3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
          950: '#0A0A0A',
        },

        /* Brand — the Khayaal signal ramp (warm terracotta) */
        brand: {
          25: '#FFFCF5',
          50: '#FDF3EC',
          100: '#F7E0D3',
          200: '#EDBEA4',
          300: '#DE9A73',
          400: '#CC7040',
          500: '#B4451C',
          600: '#A03D18',
          700: '#8A3214',
          800: '#6F2810',
          900: '#551E0C',
        },
      },
      fontFamily: {
        heading: ['var(--font-display)', 'Georgia', 'serif'],
        body: ['var(--font-body-ui)', 'system-ui', 'sans-serif'],
        display: ['ui-serif', 'New York', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SF Mono', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;
