import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-heading',
  axes: ['opsz'],
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-body',
});

export const metadata: Metadata = {
  title: 'Khayaal — a quiet guardian for parents who live alone',
  description:
    'Nothing to press. Nothing to wear. Nothing to remember. Khayaal listens to the harmless rhythm of an ordinary day and turns it into one quiet answer for the family.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="font-body bg-paper text-ink">{children}</body>
    </html>
  );
}
