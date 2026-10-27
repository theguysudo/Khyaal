import { NextResponse } from 'next/server';
import { randomId } from '@khayaal/engine';
import type { CareCircleMember } from '@khayaal/shared';
import { requireFamily, unauthorized } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';

/**
 * POST /api/v1/household/{id}/circle — manage the care circle (family +
 * neighbours who can check in). { action: 'add' | 'remove', name?, email, role? }
 * Members sign in with Google and claim the household by its pairing code to
 * actually see the dashboard; until then they are on the notify list.
 * Family-only — the notify list is personal data and a spam vector.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireFamily(req, id);
  if (guard instanceof Response) return guard;
  const hh = guard;
  const store = getStore();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const action = body.action;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  }
  const circle = hh.careCircle ?? [];

  if (action === 'add') {
    if (circle.some((m) => m.email === email)) {
      return NextResponse.json({ error: 'Already in the circle' }, { status: 409 });
    }
    const rawPhone = typeof body.phone === 'string' ? body.phone.replace(/[^\d+\- ()]/g, '').trim() : '';
    if (rawPhone.length > 24) {
      return NextResponse.json({ error: 'Phone number looks too long' }, { status: 400 });
    }
    const member: CareCircleMember = {
      name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : email.split('@')[0],
      email,
      ...(rawPhone ? { phone: rawPhone } : {}),
      role: body.role === 'neighbor' ? 'neighbor' : 'family',
      addedTs: Date.now(),
    };
    await store.updateHousehold(id, { careCircle: [...circle, member] });
    await store.appendEvent(id, {
      id: randomId(),
      ts: Date.now() + hh.simTimeOffsetMs,
      type: 'note',
      meta: `${member.name} (${member.role}) joined the care circle.`,
    });
    return NextResponse.json({ circle: [...circle, member] });
  }

  if (action === 'remove') {
    const next = circle.filter((m) => m.email !== email);
    await store.updateHousehold(id, { careCircle: next });
    return NextResponse.json({ circle: next });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
