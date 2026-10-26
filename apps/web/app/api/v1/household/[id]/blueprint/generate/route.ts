import { NextResponse } from 'next/server';
import type { Blueprint } from '@khayaal/shared';
import { requireFamily, unauthorized } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { simNow } from '@/lib/server/runtime';
import { makeRoomId, sanitizeBlueprint } from '@khayaal/engine';
import { chatJson, parseProvider } from '@/lib/server/llm';
import { rateLimit } from '@/lib/server/rate-limit';

/**
 * POST /api/v1/household/{id}/blueprint/generate — lay out the room plan.
 *
 * The family describes their home in a line of text ("2BHK, bedroom,
 * kitchen, hall") and the model proposes a layout. The model only ever
 * proposes ROOMS and where a sensor might sit by its label; it never sees
 * coordinates of a person, because none exist. The server clamps everything
 * through sanitizeBlueprint before saving, so a model that hallucinates a
 * geometry cannot produce a broken map.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`blueprint-gen:${req.headers.get('x-forwarded-for') ?? 'local'}`, 3, 60_000)) {
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

  const sources = (await store.getSources(id)).filter(
    (s) => s.type === 'esp32' || s.type === 'simulator',
  );
  const roomsRequested =
    typeof body.rooms === 'string' && body.rooms.trim()
      ? body.rooms.trim().slice(0, 300)
      : 'bedroom, hall, kitchen, bathroom, balcony';

  const sensors = sources.map((s) => ({ id: s.id, label: s.label }));

  const result = await chatJson(
    [
      {
        role: 'system',
        content:
          'You lay out simple top-down room plans for a home sensor dashboard. ' +
          'Reply with ONLY a JSON object of this exact shape: ' +
          '{"rooms":[{"name":"Room name","x":0,"y":0,"w":0,"h":0}],"sensorRooms":{"Sensor label":"Room name"}}. ' +
          'Coordinates are percentages of a 100x100 plan, so every room fits inside 0..100 and rooms do not overlap. ' +
          'Keep the layout plausible for an Indian apartment: walls shared sensibly, the hall in the middle. ' +
          'Use 3 to 7 rooms. Put every sensor label from the input into sensorRooms, mapped to the room its label suggests.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          homeFor: household.parentName,
          roomsRequested,
          sensors,
        }),
      },
    ],
    {
      provider: parseProvider(body.provider),
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
      maxTokens: 700,
      temperature: 0.4,
      timeoutMs: 45_000,
    },
  );

  if (!result) {
    return NextResponse.json(
      { error: 'No LLM provider could answer — set XAI_API_KEY, NVIDIA_API_KEY or OPENROUTER_API_KEY.' },
      { status: 502 },
    );
  }

  const parsed = result.data as { rooms?: unknown; sensorRooms?: unknown } | null;
  if (!parsed || !Array.isArray(parsed.rooms) || parsed.rooms.length === 0) {
    return NextResponse.json(
      { error: 'The model did not return a usable layout — try again or draw it by hand.' },
      { status: 502 },
    );
  }

  const blueprint: Blueprint = sanitizeBlueprint(
    { rooms: parsed.rooms, anchors: [] },
    simNow(household),
  );
  blueprint.source = 'llm';

  // A generated plan's room ids come from our own slugger, so anchors can
  // reference them safely.
  blueprint.rooms.forEach((r) => {
    if (!r.id.startsWith('room_')) r.id = makeRoomId(r.name);
  });

  // Place each paired sensor in the room its label maps to, else the biggest
  // room. The family can still drag it afterwards.
  const sensorRooms =
    parsed.sensorRooms && typeof parsed.sensorRooms === 'object'
      ? (parsed.sensorRooms as Record<string, unknown>)
      : {};
  const biggest = blueprint.rooms.reduce((a, b) => (a.w * a.h >= b.w * b.h ? a : b));
  blueprint.anchors = sources.map((s) => {
    const wanted =
      typeof sensorRooms[s.label] === 'string' ? String(sensorRooms[s.label]).toLowerCase() : '';
    const room = blueprint.rooms.find((r) => r.name.toLowerCase() === wanted) ?? biggest;
    return {
      sourceId: s.id,
      label: s.label,
      roomId: room.id,
      x: room.x + room.w / 2,
      y: room.y + room.h / 2,
    };
  });

  await store.updateHousehold(id, { blueprint });
  return NextResponse.json({ blueprint, provider: result.provider, model: result.model });
}
