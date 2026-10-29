import { Inter } from 'next/font/google';
import * as React from 'react';

/**
 * The household shell's type layer.
 *
 * The dashboard speaks Untitled UI: Inter, weights 400/500/600, on the
 * Display/Text scale. The font is loaded here — not in the root layout — so
 * the landing page keeps its own display faces untouched. `.kh-root` both
 * applies Inter as the body face and re-points `--font-heading` (which
 * tailwind's `font-heading` utility resolves to) at Inter, so every card
 * inside the household route renders the dashboard's type scale without
 * touching anything outside it.
 */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

export default function HouseholdLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${inter.variable} kh-root`}>{children}</div>;
}
