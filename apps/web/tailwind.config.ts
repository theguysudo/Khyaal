import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#faf6ef',
        cream: '#f3ecdf',
        ink: '#2a241d',
        clay: '#b95c38',
        claydeep: '#9c4a2b',
        sage: '#7d8c6f',
        dusk: '#3d3352',
        mist: '#efe3d3',
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
