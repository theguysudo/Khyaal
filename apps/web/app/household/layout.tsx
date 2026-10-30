import * as React from 'react';

/**
 * The household shell — Quiet Ledger edition.
 *
 * The ledger's voices are system stacks defined in globals.css: verdicts in
 * ui-serif ("New York"/Georgia), body and UI in the system sans, every
 * numeral, index and timestamp in ui-monospace. Nothing needs loading here —
 * the dashboard reads like a printed ledger, not a branded type show.
 * `.kh-root` scopes the household's motion layer (app/household/motion.css).
 */
export default function HouseholdLayout({ children }: { children: React.ReactNode }) {
  return <div className="kh-root">{children}</div>;
}
