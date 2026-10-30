'use client';

/**
 * Sign in + your families, in the Quiet Ledger grammar.
 *
 * Features preserved from the previous page, unchanged in behavior:
 *   - Google OAuth start (login mode) and every ?google= failure state,
 *   - the household list with auto-forward when the account has exactly one,
 *   - the one-time session transfer link for her phone (Google bans IP
 *     redirects, so the phone inherits this session instead of signing in),
 *   - claiming a family set up earlier with its pairing code,
 *   - sign out, and the "transferred" confirmation banner.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { postJSON } from '@/lib/api';
import '../onboarding/onboarding.css';

interface MyHouseholds {
  user: { sub: string; name: string; picture?: string; email: string } | null;
  households: { id: string; parentName: string; createdAtTs: number }[];
}

const GOOGLE_ERRORS: Record<string, { title: string; body: string }> = {
  'not-configured': {
    title: 'Google sign-in isn’t set up on this server yet',
    body: 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to apps/web/.env.local and restart — then the button below works as-is.',
  },
  'state-mismatch': {
    title: 'The sign-in went stale',
    body: 'The request took too long between Google and here. Nothing went wrong on your side — try once more.',
  },
  'token-failed': {
    title: 'Google didn’t complete the sign-in',
    body: 'The handshake failed at the last step. Nothing was created — try again.',
  },
  'profile-failed': {
    title: 'Google didn’t complete the sign-in',
    body: 'We reached Google but couldn’t read your profile. Nothing was created — try again.',
  },
};

export default function LoginPage() {
  const router = useRouter();
  const [data, setData] = useState<MyHouseholds | null>(null);
  const [googleNote, setGoogleNote] = useState<{ title: string; body: string } | null>(null);
  const [claimCode, setClaimCode] = useState('');
  const [claimError, setClaimError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [transferUrl, setTransferUrl] = useState<string | null>(null);
  const [transferred, setTransferred] = useState(false);
  const [copied, setCopied] = useState(false);

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
    if (!google) return;
    setGoogleNote(
      GOOGLE_ERRORS[google] ?? {
        title: 'Google didn’t complete the sign-in',
        body: 'Nothing was created — try again.',
      },
    );
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
      const msg = e instanceof Error ? e.message : 'Could not claim that family';
      setClaimError(
        msg.includes('No household')
          ? 'No family answers to that code. Check the six digits on the household’s dashboard.'
          : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  const copyTransfer = () => {
    if (!transferUrl) return;
    navigator.clipboard?.writeText(transferUrl).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => {},
    );
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
    <main className="onb">
      <div className="onb-wrap">
        <header className="onb-topbar">
          <Link href="/" className="onb-wordmark">
            Khayaal
          </Link>
          <Link href="/onboarding" className="onb-toplink">
            New here? Set up a family →
          </Link>
        </header>

        <section className="onb-rise">
          <div className="onb-sechead" style={{ marginTop: 28 }}>
            <span className="onb-secindex">01</span>
            <span className="onb-seclabel">Sign in</span>
            <span className="onb-secrule" />
          </div>

          <h1 className="onb-h1" style={{ marginTop: 16 }}>
            {signedIn
              ? `Welcome back, ${data!.user!.name.split(' ')[0]}.`
              : 'Your families, one sign-in away.'}
          </h1>
          <p className="onb-body" style={{ marginTop: 8 }}>
            {signedIn
              ? 'Every family you’ve set up or claimed lives here — open one, or add another.'
              : 'Sign in with Google and every family you set up stays with your account.'}
          </p>

          {googleNote && (
            <div className="onb-note" data-tone="alarm" style={{ marginTop: 20 }} role="alert">
              <span className="onb-status" data-tone="alarm">
                <span className="onb-dot" />
                Held
              </span>
              <div className="onb-notebody">
                <p className="onb-notetitle">{googleNote.title}</p>
                <p style={{ margin: 0 }}>{googleNote.body}</p>
              </div>
            </div>
          )}

          {!signedIn && (
            <div className="onb-actions" style={{ marginTop: 24 }}>
              <a href="/api/auth/google/start" className="btn-primary">
                Continue with Google
              </a>
            </div>
          )}

          {signedIn && (
            <div className="onb-panel" style={{ marginTop: 24 }}>
              <div className="onb-row">
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    minWidth: 0,
                  }}
                >
                  {data!.user!.picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data!.user!.picture}
                      alt=""
                      width={40}
                      height={40}
                      style={{ borderRadius: '50%', flex: 'none' }}
                    />
                  ) : (
                    <span
                      aria-hidden
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        border: '1px solid var(--rule-strong)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'var(--serif)',
                        flex: 'none',
                      }}
                    >
                      {data!.user!.name.charAt(0)}
                    </span>
                  )}
                  <span style={{ minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontSize: 15,
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {data!.user!.name}
                    </span>
                    <span
                      className="onb-mono"
                      style={{
                        display: 'block',
                        fontSize: 13,
                        color: 'var(--ink-3)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {data!.user!.email}
                    </span>
                  </span>
                </span>
                <Link href="/api/auth/logout" className="btn-ghost onb-copybtn">
                  Sign out
                </Link>
              </div>
            </div>
          )}
        </section>

        {signedIn && (
          <section className="onb-rise" style={{ '--d': '60ms' } as React.CSSProperties}>
            <div className="onb-sechead">
              <span className="onb-secindex">02</span>
              <span className="onb-seclabel">Your families</span>
              <span className="onb-secrule" />
            </div>

            {transferred && (
              <div className="onb-note" data-tone="calm" style={{ marginBottom: 16 }} role="status">
                <span className="onb-status" data-tone="calm">
                  <span className="onb-dot" />
                  Linked
                </span>
                <div className="onb-notebody">
                  <p style={{ margin: 0 }}>
                    Signed in on this device — the families below now live here too.
                  </p>
                </div>
              </div>
            )}

            <div className="onb-panel">
              <div className="onb-rows">
                {data!.households.length === 0 && (
                  <p className="onb-body" style={{ fontSize: 15, margin: 0 }}>
                    No families linked yet. Set one up below, or claim an existing one with its
                    pairing code.
                  </p>
                )}
                {data!.households.map((hh) => (
                  <div className="onb-row" key={hh.id}>
                    <Link href={`/household/${hh.id}`} className="onb-rowlink">
                      <span>
                        <span style={{ display: 'block', fontFamily: 'var(--serif)', fontSize: 17 }}>
                          The {hh.parentName} household
                        </span>
                        <span
                          className="onb-mono"
                          style={{ display: 'block', fontSize: 13, color: 'var(--ink-3)' }}
                        >
                          set up{' '}
                          {new Date(hh.createdAtTs).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </span>
                      <span aria-hidden>→</span>
                    </Link>
                  </div>
                ))}
                <div className="onb-row">
                  <Link href="/onboarding" className="onb-rowlink" style={{ color: 'var(--signal)' }}>
                    <span>Set up another family</span>
                    <span aria-hidden>→</span>
                  </Link>
                </div>
              </div>
            </div>

            <div className="onb-sechead">
              <span className="onb-secindex">03</span>
              <span className="onb-seclabel">On her phone</span>
              <span className="onb-secrule" />
            </div>
            <div className="onb-panel">
              <p className="onb-body" style={{ fontSize: 15, margin: 0 }}>
                No Google needed on her phone — Google blocks IP addresses in its redirect
                rules, so her phone inherits this session through a one-time link instead.
              </p>
              {transferUrl ? (
                <div style={{ marginTop: 16 }}>
                  <div className="onb-row" style={{ borderTop: 0, paddingTop: 0 }}>
                    <span className="onb-rowlabel">One-time link</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="onb-rowvalue" style={{ fontSize: 13 }}>
                        {transferUrl}
                      </span>
                      <button type="button" className="btn-ghost onb-copybtn" onClick={copyTransfer}>
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </span>
                  </div>
                  <p className="onb-meta" style={{ marginTop: 12 }}>
                    Valid for 5 minutes. Open it in her phone&rsquo;s browser while both are on
                    this Wi-Fi.
                  </p>
                </div>
              ) : (
                <div className="onb-actions" style={{ marginTop: 16 }}>
                  <button type="button" className="btn-secondary" onClick={mintTransfer}>
                    Generate one-time link
                  </button>
                </div>
              )}
            </div>

            <div className="onb-sechead">
              <span className="onb-secindex">04</span>
              <span className="onb-seclabel">Claim a family</span>
              <span className="onb-secrule" />
            </div>
            <div className="onb-panel">
              <p className="onb-body" style={{ fontSize: 15, margin: 0 }}>
                A family set up earlier — on another device, before a sign-in — joins this
                account with its 6-digit pairing code.
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                <input
                  value={claimCode}
                  onChange={(e) => setClaimCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="······"
                  inputMode="numeric"
                  aria-label="6-digit pairing code"
                  className="onb-input onb-mono"
                  style={{
                    flex: 1,
                    minWidth: 160,
                    letterSpacing: '0.15em',
                    textAlign: 'center',
                  }}
                  aria-invalid={claimError ? 'true' : undefined}
                />
                <button
                  type="button"
                  onClick={claim}
                  disabled={busy || claimCode.length !== 6}
                  className="btn-primary"
                >
                  {busy ? 'Linking…' : 'Link it'}
                </button>
              </div>
              {claimError && (
                <span className="onb-fielderror">
                  <span className="onb-dot" style={{ background: 'var(--alarm)' }} />
                  {claimError}
                </span>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
