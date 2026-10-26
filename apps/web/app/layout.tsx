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
  title: 'Khayaal — A quiet watch over parents who live alone',
  description:
    'Nothing to press. Nothing to wear. Nothing to remember. Khayaal listens to the harmless rhythm of an ordinary day and turns it into one quiet answer for the family.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="font-body bg-paper text-ink">
        {/* Hero display faces — Instrument Serif + Instrument Sans (React hoists
            link tags into <head>; the rest of the site keeps Fraunces/Inter) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Instrument+Sans:wght@400;500&display=swap"
        />
        {children}
      </body>
    </html>
  );
}
