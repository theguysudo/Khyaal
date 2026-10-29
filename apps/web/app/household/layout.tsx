import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import * as React from 'react';

/**
 * The household shell's type layer.
 *
 * The dashboard speaks Vision UI: Plus Jakarta Sans (Google Fonts family for
 * Vision's "Plus Jakarta Display"), weights 400/500/600/700, on the dark
 * glass surface. It is loaded here — not in the root layout — so the landing
 * page keeps its own display faces untouched. Inter stays loaded as the
 * fallback face. `.kh-root` both applies Plus Jakarta Sans as the body face
 * and re-points `--font-heading` (which tailwind's `font-heading` utility
 * resolves to) at it, so every card inside the household route renders the
 * dashboard's type scale without touching anything outside it.
 */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jakarta',
  display: 'swap',
});

export default function HouseholdLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${jakarta.variable} ${inter.variable} kh-root`}>{children}</div>;
}
