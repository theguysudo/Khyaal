'use client';

/**
 * Sign in + your families. Google OAuth when configured; the page lists every
 * household linked to the account so returning family members never create a
 * duplicate — and an existing family can be claimed with its pairing code.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { postJSON } from '@/lib/api';

interface MyHouseholds {
  user: { sub: string; name: string; picture?: string; email: string } | null;
  households: { id: string; parentName: string; createdAtTs: number }[];
}

export default function LoginPage() {
  const router = useRouter();
  const [data, setData] = useState<MyHouseholds | null>(null);
  const [googleNote, setGoogleNote] = useState<string | null>(null);
  const [claimCode, setClaimCode] = useState('');
  const [claimError, setClaimError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [transferUrl, setTransferUrl] = useState<string | null>(null);
  const [transferred, setTransferred] = useState(false);

  const load = useCallback(() => {
    fetch('/api/v1/my/households', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ user: null, households: [] }));
  }, []);

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    if (params.get('transferred') === '1') setTransferred(true);
    const google = params.get('google');
    if (google === 'not-configured') {
      setGoogleNote('Google sign-in isn\u2019t configured on this server yet — add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to apps/web/.env.local, then restart. Register only the localhost redirect URI (Google bans IP addresses).');
    } else if (google) {
      setGoogleNote('Google sign-in failed (' + google + '). Please try again.');
    }
  }, [load]);

  const mintTransfer = async () => {
    setTransferUrl(null);
    try {
      const r = await postJSON<{ url: string }>('/api/auth/transfer');
      setTransferUrl(r.url);
    } catch {
      setTransferUrl(null);
    }
  };

  const claim = async () => {
    setBusy(true);
    setClaimError(null);
    try {
      await postJSON('/api/v1/auth/claim', { code: claimCode });
      setClaimCode('');
      load();
    } catch (e) {
      setClaimError(e instanceof Error ? e.message : 'Could not claim that family');
    } finally {
      setBusy(false);
    }
  };

  const signedIn = !!data?.user;

  // The whole point of the account: a returning sign-in lands you straight
  // back in your family. One household → forward immediately; several → the
  // list below picks (auto-redirect only on the first load).
  useEffect(() => {
    if (signedIn && data && data.households.length === 1) {
      router.replace(`/household/${data.households[0].id}`);
    }
  }, [signedIn, data, router]);

  return (
    <main className="min-h-screen bg-paper px-4 py-10 sm:px-8" style={{ background: 'linear-gradient(180deg, #f3ecdf 0%, #faf6ef 30%)' }}>
      <div className="mx-auto max-w-xl">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-heading text-lg tracking-tight text-ink">Khayaal</span>
            <span className="text-clay">✳︎</span>
          </Link>
          <Link href="/onboarding" className="text-sm text-ink/50 transition-opacity hover:opacity-70">
            new here? set up a family →
          </Link>
        </header>

        <h1 className="mt-10 font-heading text-[clamp(28px,4vw,38px)] leading-tight tracking-tight text-ink">
          {signedIn ? `Welcome back, ${data!.user!.name.split(' ')[0]}.` : 'Your families, one sign-in away.'}
        </h1>
        <p className="mt-2 text-[15px] text-ink/60">
          {signedIn
            ? 'Every family you\u2019ve set up or claimed lives here — open one, or add another.'
            : 'Sign in with Google and every family you set up stays with your account.'}
        </p>

        {googleNote && (
          <div className="mt-6 rounded-2xl border border-clay/30 bg-[#f7ecd7] p-4 text-sm leading-relaxed text-[#7a5416]">
            {googleNote}
          </div>
        )}

        {!signedIn && (
          <a
            href="/api/auth/google/start"
            className="mt-8 flex w-full items-center justify-center gap-3 rounded-full border border-ink/15 bg-white py-3.5 text-[15px] font-medium text-ink shadow-[0_2px_20px_rgba(42,36,29,0.06)] transition-transform hover:-translate-y-0.5"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2C41.4 35.4 44 30.2 44 24c0-1.3-.1-2.7-.4-3.9z" />
            </svg>
            Continue with Google
          </a>
        )}

        {signedIn && (
          <div className="mt-8 space-y-4">
            {transferred && (
              <div className="rounded-2xl border border-[#4c7a4f]/30 bg-[#e6efe2] p-4 text-sm text-[#33512f]">
                Signed in on this device — the families below now live here too.
              </div>
            )}
            <div className="flex items-center gap-3 rounded-2xl border border-ink/10 bg-white p-4">
              {data!.user!.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data!.user!.picture} alt="" className="h-10 w-10 rounded-full" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-mist font-heading text-ink">🙂</span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{data!.user!.name}</p>
                <p className="truncate text-xs text-ink/45">{data!.user!.email}</p>
              </div>
              <Link href="/api/auth/logout" className="ml-auto rounded-full border border-ink/15 px-3.5 py-1.5 text-xs text-ink/60 transition-colors hover:bg-paper">
                Sign out
              </Link>
            </div>

            <div className="space-y-3">
              {data!.households.length === 0 && (
                <p className="rounded-2xl border border-dashed border-ink/20 p-5 text-sm text-ink/50">
                  No families linked yet. Set one up below, or claim an existing one with its pairing code.
                </p>
              )}
              {data!.households.map((hh) => (
                <Link
                  key={hh.id}
                  href={`/household/${hh.id}`}
                  className="flex items-center justify-between rounded-2xl border border-ink/10 bg-white p-5 shadow-[0_2px_20px_rgba(42,36,29,0.05)] transition-transform hover:-translate-y-0.5"
                >
                  <div>
                    <p className="font-heading text-[17px] text-ink">The {hh.parentName} household</p>
                    <p className="text-xs text-ink/45">set up {new Date(hh.createdAtTs).toLocaleDateString([], { month: 'short', day: 'numeric' })}</p>
                  </div>
                  <span className="text-clay">→</span>
                </Link>
              ))}
              <Link
                href="/onboarding"
                className="flex items-center justify-between rounded-2xl border border-dashed border-clay/40 p-5 transition-colors hover:bg-white"
              >
                <p className="text-sm font-medium text-claydeep">+ Set up another family</p>
                <span className="text-clay">→</span>
              </Link>
            </div>

            <div className="rounded-2xl border border-ink/10 bg-white p-5">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink/45">
                Open on her phone (no Google needed there)
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink/50">
                Google blocks IP addresses in its redirect rules, so the phone inherits this
                session instead of signing in itself.
              </p>
              {transferUrl ? (
                <div className="mt-3 space-y-2">
                  <p className="cursor-pointer break-all rounded-lg bg-paper px-3 py-2 font-mono text-xs text-ink/80 transition-colors hover:bg-mist"
                     title="Tap to copy"
                     onClick={() => navigator.clipboard?.writeText(transferUrl)}>
                    {transferUrl}
                  </p>
                  <p className="text-[11px] text-ink/40">
                    One-time link, valid 5 minutes — open it in her phone's browser while both are on this Wi-Fi.
                  </p>
                </div>
              ) : (
                <button
                  onClick={mintTransfer}
                  className="mt-3 rounded-full border border-ink/15 px-4 py-2 text-sm text-ink/70 transition-colors hover:bg-paper"
                >
                  Generate one-time link
                </button>
              )}
            </div>

            <div className="rounded-2xl border border-ink/10 bg-white p-5">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink/45">
                Claim a family set up earlier
              </p>
              <div className="mt-3 flex gap-2">
                <input
                  value={claimCode}
                  onChange={(e) => setClaimCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit pairing code"
                  className="flex-1 rounded-full border border-ink/15 bg-paper px-4 py-2.5 font-mono text-sm tracking-[0.15em] text-ink outline-none focus:border-clay"
                />
                <button
                  onClick={claim}
                  disabled={busy || claimCode.length !== 6}
                  className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {busy ? 'Linking…' : 'Link it'}
                </button>
              </div>
              {claimError && <p className="mt-2 text-sm text-[#b23a2f]">{claimError}</p>}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
