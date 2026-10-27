import { NextResponse } from 'next/server';
import { tickHousehold } from '@/lib/server/runtime';
import { getStore } from '@/lib/server/store';

/**
 * PATCH /api/v1/household/{id}/config
 * Settings (quiet hours, timers, names) and the demo time-warp control
 * { simAdvanceMinutes } — the warp is what turns hours into seconds on stage.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const hh = await store.getHousehold(id);
  if (!hh) return NextResponse.json({ error: 'Household not found' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.parentName === 'string' && body.parentName.trim()) patch.parentName = body.parentName.trim();
  if (typeof body.childName === 'string' && body.childName.trim()) patch.childName = body.childName.trim();
  if (typeof body.learningHours === 'number' && body.learningHours >= 0) {
    patch.learningUntilTs = Date.now() + hh.simTimeOffsetMs + body.learningHours * 3600_000;
  }
  if (
    typeof body.quietStart === 'number' && typeof body.quietEnd === 'number' &&
    body.quietStart >= 0 && body.quietStart < 24 && body.quietEnd >= 0 && body.quietEnd <= 24
  ) {
    patch.quietHours = { start: Math.floor(body.quietStart), end: Math.floor(body.quietEnd) };
  }
  const cfg = body.escalationConfig as Record<string, unknown> | undefined;
  if (cfg && typeof cfg === 'object') {
    patch.escalationConfig = {
      nudgeAfterMin: clampMin(cfg.nudgeAfterMin, hh.escalationConfig.nudgeAfterMin),
      checkInAfterMin: clampMin(cfg.checkInAfterMin, hh.escalationConfig.checkInAfterMin),
      alertAfterMin: clampMin(cfg.alertAfterMin, hh.escalationConfig.alertAfterMin),
    };
  }
  if (typeof body.simAdvanceMinutes === 'number' && body.simAdvanceMinutes !== 0) {
    patch.simTimeOffsetMs = hh.simTimeOffsetMs + body.simAdvanceMinutes * 60_000;
  }
  if (body.simResetTime === true) patch.simTimeOffsetMs = 0;

  await store.updateHousehold(id, patch);
  const bundle = await tickHousehold(id);
  return NextResponse.json(bundle);
}

function clampMin(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.round(n), 240);
}
