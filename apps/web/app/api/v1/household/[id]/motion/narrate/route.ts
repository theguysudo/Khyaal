import { NextResponse } from 'next/server';
import { requireFamily, unauthorized } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { simNow } from '@/lib/server/runtime';
import { anchorLevels, defaultBlueprint, deriveCsiEvents } from '@khayaal/engine';
import { chat, parseProvider } from '@/lib/server/llm';
import { rateLimit } from '@/lib/server/rate-limit';
import { UNTRUSTED_RULE, promptTurn, untrustedText } from '@/lib/server/untrusted';

/**
 * POST /api/v1/household/{id}/motion/narrate — the model reads the room.
 *
 * Takes the room sensor's own log (state changes, how strong each burst was,
 * how long each lasted) and turns it into a plain-language reading: "a short
 * burst near the door, then the room went quiet — looks like someone walked
 * past." Only the sensor's scalars go to the model — never raw CSI, never
 * coordinates, because the sensor never produces either.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`motion-narrate:${req.headers.get('x-forwarded-for') ?? 'local'}`, 6, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const { id } = await params;
  const guard = await requireFamily(req, id);
  if (guard instanceof Response) return guard;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* defaults */
  }

  const store = getStore();
  const household = await store.getHousehold(id);
  if (!household) return unauthorized();

  const nowTs = simNow(household);
  const batches = await store.getCsi(id, nowTs - 15 * 60_000, 900);
  const blueprint = household.blueprint ?? defaultBlueprint(await store.getSources(id), nowTs);
  const roomOf = new Map(blueprint.anchors.map((a) => [a.sourceId, a.roomId]));
  const roomName = (sourceId: string): string => {
    const roomId = roomOf.get(sourceId);
    return roomId ? blueprint.rooms.find((r) => r.id === roomId)?.name ?? '' : '';
  };

  const events = deriveCsiEvents(batches, roomName);
  const levels = [...anchorLevels(batches, nowTs).values()].map((l) => ({
    sensor: roomName(l.sourceId) || l.sourceId,
    level: Number(l.level.toFixed(2)),
    state: l.state,
    threshold: Number(l.threshold.toFixed(1)),
    lastMotionTs: l.lastMotionTs,
  }));

  if (!events.length && !levels.some((l) => l.level > 0)) {
    return NextResponse.json({
      narrative:
        'The room sensor has nothing to read yet — wave a hand in front of it and this will fill in.',
      provider: null,
      model: null,
    });
  }

  const recent = events.slice(-30);
  const summary = {
    windowMinutes: 15,
    events: recent.map((e) => ({
      at: new Date(e.ts).toISOString().slice(11, 19),
      kind: e.kind,
    })),
    sensorsNow: levels.map((l) => ({
      level: l.level,
      threshold: l.threshold,
      lastMotionTs: l.lastMotionTs,
    })),
  };

  // The room labels come from the blueprint and the sensor's state string
  // comes straight off the wire — both are text a device (or a room someone
  // named) chose. They stay out of the server-computed block and ride in the
  // untrusted one, where the prompt says to read them as data only (F-6).
  // The indices keep each label tied to the numbers it belongs to.
  const untrustedItems = [
    ...recent.map((e, i) => `event[${i}] room label = ${untrustedText(e.label)}`),
    ...levels.map(
      (l, i) => `sensor[${i}] label = ${untrustedText(l.sensor)}, state = ${untrustedText(l.state)}`,
    ),
  ];

  const result = await chat(
    [
      {
        role: 'system',
        content:
          'You are Khayaal, a calm family-care analyst. You are given a room sensor log: movement state changes and how strong each movement burst was. ' +
          'Describe in 2-4 short sentences what the room has been doing, in plain language a family understands. ' +
          'Distinguish brief pass-through movement from sustained activity, and say when the room went quiet. ' +
          'Never speculate about identity or diagnose anything. If the log shows a fall, say plainly that the sensor flagged a fall pattern. ' +
          UNTRUSTED_RULE,
      },
      { role: 'user', content: promptTurn(summary, untrustedItems) },
    ],
    {
      provider: parseProvider(body.provider),
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
      maxTokens: 400,
      temperature: 0.5,
      timeoutMs: 45_000,
    },
  );

  if (!result) {
    return NextResponse.json(
      { error: 'No LLM provider could answer — set XAI_API_KEY, NVIDIA_API_KEY or OPENROUTER_API_KEY.' },
      { status: 502 },
    );
  }

  return NextResponse.json({ narrative: result.text, provider: result.provider, model: result.model });
}
