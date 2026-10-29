import type { Config } from 'tailwindcss';

/**
 * Khayaal brand tokens — Untitled UI anatomy, Khayaal terracotta.
 *
 * The ramps below were pulled from the Untitled UI Figma foundations
 * (Neutral, Effect styles, spacing) and the Khayaal Counter source
 * (terracotta/orange ramp, dark-glass #262626, glow #FF6B21 → #FFDCA6).
 *
 * The legacy aliases (paper/ink/clay/claydeep) are kept as names so existing
 * classes across the app keep compiling, but their values now resolve onto
 * the new ramp: paper = Neutral/50, ink = Neutral/900, clay = Brand/600,
 * claydeep = Brand/700.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* legacy aliases — values moved onto the new ramp */
        paper: '#FAFAFA',
        cream: '#f3ecdf',
        ink: '#171717',
        clay: '#DC6803',
        claydeep: '#B54708',
        sage: '#7d8c6f',
        dusk: '#3d3352',
        mist: '#efe3d3',

        /* Neutral (Untitled UI grays, as used by the v3 reference) */
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

        /* Brand — Khayaal terracotta (Untitled UI orange ramp + glow accents) */
        brand: {
          25: '#FFFCF5',
          50: '#FFFAEB',
          100: '#FEF0C7',
          200: '#FEDF89',
          300: '#FEC84B',
          400: '#FDB022',
          500: '#F79009',
          600: '#DC6803',
          700: '#B54708',
          800: '#93370D',
          900: '#7A2E0E',
        },
        glow: {
          1: '#FF6B21',
          2: '#F27F24',
          3: '#FFDCA6',
        },

        /* Error ramp (SOS + alerts) */
        err: {
          25: '#FFFBFA',
          50: '#FEF3F2',
          100: '#FEE4E2',
          200: '#FECDCA',
          300: '#FDA29B',
          400: '#F97066',
          500: '#F04438',
          600: '#D92D20',
          700: '#B42318',
          800: '#912018',
          900: '#7A271A',
        },

        /* Success ramp */
        ok: {
          50: '#ECFDF3',
          100: '#D1FADF',
          200: '#A6F4C5',
          300: '#6CE9A6',
          400: '#32D583',
          500: '#12B76A',
          600: '#039855',
          700: '#027A48',
          800: '#05603A',
          900: '#054F31',
        },

        /* Vision UI dark-glass system (household dashboard surface).
           Pulled from the Vision UI Dashboard Figma (file zxxQKywVTTCgmXdHQHQxdh,
           Dashboard Screen 580:3777): navy page field, glass card fills,
           #2D2E5F separators, #A0AEC0 secondary text, and the purple/blue/teal
           data accents. Khayaal terracotta stays the brand action colour. */
        vision: {
          navy: '#060B26', // page fill
          'navy-2': '#0F123B', // gradient stop 1
          'navy-3': '#090D2E', // gradient stop 2
          'navy-4': '#020515', // gradient stop 3
          panel: '#0B1029', // inset panels (maps, mixers)
          field: '#0F1535', // input fill (580:4242)
          sep: '#2D2E5F', // separators + chart grid
          dim: '#A0AEC0', // secondary text / labels
          tile: '#1A1F37', // stat tiles, icon tiles
          purple: '#4318FF', // data accent
          blue: '#0075FF', // data accent
          teal: '#4FD1C5', // data accent
          green: '#01B574', // success accent
          red: '#E31A1A', // Vision error (SOS/tier-3 family)
        },
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        /* Untitled UI effect styles (node 1030:33573) */
        xs: '0px 1px 2px 0px rgba(0, 0, 0, 0.05)',
        'unt-sm': '0px 1px 2px 0px rgba(0, 0, 0, 0.06), 0px 1px 3px 0px rgba(0, 0, 0, 0.10)',
        'unt-md': '0px 2px 4px -2px rgba(0, 0, 0, 0.06), 0px 4px 8px -2px rgba(0, 0, 0, 0.10)',
        'unt-lg': '0px 4px 6px -2px rgba(0, 0, 0, 0.03), 0px 12px 16px -4px rgba(0, 0, 0, 0.08)',
        'unt-xl': '0px 8px 8px -4px rgba(0, 0, 0, 0.03), 0px 20px 24px -4px rgba(0, 0, 0, 0.08)',
        'unt-2xl': '0px 24px 48px -12px rgba(0, 0, 0, 0.18)',
      },
    },
  },
  plugins: [],
};
export default config;
