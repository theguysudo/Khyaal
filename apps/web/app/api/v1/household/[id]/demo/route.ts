import { NextResponse } from 'next/server';
import type { DemoScenario } from '@/lib/server/runtime';
import { seedDemoScenario } from '@/lib/server/runtime';
import { requireFamily, unauthorized } from '@/lib/server/authz';

/**
 * POST /api/v1/household/{id}/demo { scenario: 'normal' | 'slow' | 'emergency' }
 * Server-side seeding keeps the demo deterministic: the console only asks
 * for a story, the engine tells it. Family-only: it rewrites the household's
 * signals and time-warp.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireFamily(req, id);
  if (guard instanceof Response) return guard;
  let scenario: string = 'normal';
  try {
    const body = await req.json();
    if (typeof body?.scenario === 'string') scenario = body.scenario;
  } catch {
    // default
  }
  if (!['normal', 'slow', 'emergency'].includes(scenario)) {
    return NextResponse.json({ error: 'Unknown scenario' }, { status: 400 });
  }
  const result = await seedDemoScenario(id, scenario as DemoScenario);
  if (!result) return unauthorized();
  return NextResponse.json(result);
}
