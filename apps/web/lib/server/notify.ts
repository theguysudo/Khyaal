import crypto from 'node:crypto';
import fs from 'node:fs';
import webpush from 'web-push';
import nodemailer from 'nodemailer';
import type { Household } from '@khayaal/shared';
import { getStore } from './store';

/**
 * The tier-3 dispatch: FCM push to the Android apps, web push to the
 * dashboards, and email to the care circle — every path free-tier. All
 * transports no-op cleanly when their credentials are absent.
 */

// --- FCM (HTTP v1; activates with FIREBASE_SERVICE_ACCOUNT_JSON) -----------

let cachedAccessToken: { token: string; exp: number } | null = null;

function serviceAccount(): { project_id: string; client_email: string; private_key: string } | null {
  const p = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!p) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

async function googleAccessToken(sa: { client_email: string; private_key: string }): Promise<string | null> {
  if (cachedAccessToken && cachedAccessToken.exp > Date.now() + 60_000) return cachedAccessToken.token;
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(claims)}`;
  let signed: string;
  try {
    signed = crypto.sign('RSA-SHA256', Buffer.from(unsigned), sa.private_key).toString('base64url');
  } catch {
    return null;
  }
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${signed}`,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; expires_in: number };
    cachedAccessToken = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  } catch {
    return null;
  }
}

async function sendFcm(hh: Household, title: string, body: string): Promise<void> {
  const sa = serviceAccount();
  if (!sa) return;
  const token = await googleAccessToken(sa);
  if (!token) return;
  const tokens = await getStore().getDeviceTokens(hh.id);
  for (const t of tokens) {
    await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: t,
          notification: { title, body },
          data: { householdId: hh.id, tier: '3' },
          android: { priority: 'HIGH' },
        },
      }),
    }).catch(() => {});
  }
}

// --- Web push (VAPID; dashboard subscribers) --------------------------------

let pushConfigured: boolean | null = null;
function configureWebPush(): boolean {
  if (pushConfigured !== null) return pushConfigured;
  const { VAPID_PUBLIC_KEY: pk, VAPID_PRIVATE_KEY: sk, VAPID_SUBJECT: sub } = process.env;
  pushConfigured = !!(pk && sk && sub);
  if (pushConfigured) {
    webpush.setVapidDetails(sub!, pk!, sk!);
  }
  return pushConfigured;
}

async function sendWebPush(hh: Household, title: string, body: string): Promise<void> {
  if (!configureWebPush()) return;
  const subs = await getStore().getWebPushSubscribers(hh.id);
  for (const s of subs) {
    await webpush
      .sendNotification(s as Parameters<typeof webpush.sendNotification>[0], JSON.stringify({ title, body, householdId: hh.id }))
      .catch(() => {});
  }
}

// --- Email (SMTP; care circle) ----------------------------------------------

async function sendEmail(hh: Household, title: string, body: string): Promise<void> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return;
  const circle = hh.careCircle ?? [];
  const recipients = circle.map((m) => m.email);
  if (recipients.length === 0) return;
  try {
    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT ?? 587),
      secure: Number(SMTP_PORT ?? 587) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transport.sendMail({
      from: SMTP_USER,
      to: recipients,
      subject: `Khayaal — ${title}`,
      text: `${body}\n\n— Khayaal, watching over ${hh.parentName}`,
    });
  } catch {
    /* email is best-effort */
  }
}

/** Fire the full tier-3 dispatch. Never throws. */
export async function dispatchTierAlert(hh: Household, reason: string): Promise<void> {
  const title = `${hh.parentName} needs attention`;
  const body = `${reason} Last-known signals are on the dashboard. Care circle: ${
    (hh.careCircle ?? []).map((m) => m.name).join(', ') || 'none yet'
  }.`;
  await Promise.allSettled([sendFcm(hh, title, body), sendWebPush(hh, title, body), sendEmail(hh, title, body)]);
}
