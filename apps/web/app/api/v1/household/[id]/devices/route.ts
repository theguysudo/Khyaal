import { NextRequest, NextResponse } from 'next/server';

import { requireScoped, unauthorized } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/**
 * FCM device-token registry. The Android app posts its token here after
 * pairing; the notify pipeline reads the list when a tier-3 alert fires.
 * Tokens are opaque to the server beyond being sent to FCM.
 *
 * Registering a token means "send this device the tier-3 alerts", and a
 * tier-3 alert is a family event: only a caller that may speak for the
 * household may subscribe to it. A room sensor may not.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireScoped(req, id, 'push');
  if (guard instanceof Response) return guard;
  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim();
  if (!token || token.length > 4096) {
    return NextResponse.json({ ok: false, error: 'token required (max 4096 chars)' }, { status: 400 });
  }
  await getStore().addDeviceToken(id, token);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireScoped(req, id, 'push');
  if (guard instanceof Response) return guard;
  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  if (!body?.token) {
    return NextResponse.json({ ok: false, error: 'token required' }, { status: 400 });
  }
  await getStore().removeDeviceToken(id, body.token);
  return NextResponse.json({ ok: true });
}

/**
 * Every other method answers 404 — after the authorization check, so the
 * route never answers "405 Method Not Allowed" before the caller has proved
 * anything. It used to: Next.js rejects an unmatched method before any
 * handler runs, which made this the one route in the whole surface where an
 * anonymous caller could tell "wrong method" from "no such household".
 */
async function notFound(req: NextRequest, id: string): Promise<Response> {
  const guard = await requireScoped(req, id, 'push');
  if (guard instanceof Response) return guard;
  return NextResponse.json({ error: 'Household not found' }, { status: 404 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return notFound(req, id);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return notFound(req, id);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return notFound(req, id);
}
