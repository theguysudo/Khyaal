import type {
  Blueprint,
  BlueprintAnchor,
  BlueprintRoom,
  CsiAnchor,
  CsiEstimate,
  CsiEvent,
  CsiPoint,
  Source,
} from '@khayaal/shared';

/**
 * The room sensor's floor plan, and what the blueprint can honestly say.
 *
 * The rule that keeps this honest: this view is about the ROOM, never about
 * the person. The ESP32 in the hallway reports "the hallway is occupied"; it
 * does not report where in the hallway anyone is standing, and it never sees
 * the elder's phone at all. So the blueprint is room-level occupancy plus
 * sensor strength — and the position estimate below is a weighted guess
 * between sensors, labelled with how sure we are.
 */

/** How far back a sensor's "current level" is measured over (ms). */
export const LEVEL_WINDOW_MS = 20_000;

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

export interface SensorLevel {
  sourceId: string;
  /** 0..1 — how strongly this sensor is seeing motion right now. */
  level: number;
  state: string;
  threshold: number;
  lastMotionTs: number | null;
}

/**
 * How busy each sensor is right now.
 *
 * The level is the slow-window variance measured against the device's own
 * motion threshold — the same number the presence rules use, so "level 1"
 * means "as strong as the motion threshold", not an invented scale.
 */
export function anchorLevels(points: CsiPoint[], nowTs: number): Map<string, SensorLevel> {
  const out = new Map<string, SensorLevel>();
  const since = nowTs - LEVEL_WINDOW_MS;
  for (const p of points) {
    if (p.ts < since) continue;
    const thr = p.thr > 0 ? p.thr : 1;
    const raw = (p.v - thr) / thr;
    const level = Math.max(0, Math.min(1, raw));
    const prev = out.get(p.sourceId);
    const motionTs = p.state === 'motion' || p.state === 'fall' ? p.ts : prev?.lastMotionTs ?? null;
    if (!prev) {
      out.set(p.sourceId, { sourceId: p.sourceId, level, state: p.state, threshold: p.thr, lastMotionTs: motionTs });
      continue;
    }
    // Keep the strongest reading in the window, not the newest: a burst that
    // has already decayed should still show as "something happened here".
    out.set(p.sourceId, {
      sourceId: p.sourceId,
      level: Math.max(prev.level, level),
      state: p.state,
      threshold: p.thr || prev.threshold,
      lastMotionTs: motionTs,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Position estimate
// ---------------------------------------------------------------------------

/**
 * Where the sensors say the movement is.
 *
 * With one sensor this is just that sensor's position — the sensor cannot
 * tell us where in the room anything is, and we do not pretend to. With two
 * or more it is a weighted centroid, the standard way to turn "how strong is
 * the signal at each receiver" into a position.
 *
 * The confidence says how much to trust it: it rises with the overall level
 * and with how far ahead the strongest sensor is of the next one.
 */
export function estimatePosition(anchors: CsiAnchor[]): CsiEstimate | null {
  const active = anchors.filter((a) => a.level > 0.05);
  if (!active.length) return null;

  const total = active.reduce((s, a) => s + a.level * a.level, 0);
  if (total <= 0) return null;

  const x = active.reduce((s, a) => s + a.x * a.level * a.level, 0) / total;
  const y = active.reduce((s, a) => s + a.y * a.level * a.level, 0) / total;

  const sorted = [...active].sort((a, b) => b.level - a.level);
  const top = sorted[0].level;
  const runnerUp = sorted[1]?.level ?? 0;
  const dominance = runnerUp > 0 ? (top - runnerUp) / top : 1;
  const confidence = Math.max(0, Math.min(1, (top / 2) * (0.45 + 0.55 * dominance)));

  return { x, y, confidence, sourceId: sorted[0].sourceId };
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

const EVENT_KINDS = new Set(['motion', 'idle', 'fall', 'lost']);

/**
 * The "something happened" line: every state change the device reported,
 * with the room it happened in.
 */
export function deriveCsiEvents(
  points: CsiPoint[],
  roomNameOf: (sourceId: string) => string,
): CsiEvent[] {
  const events: CsiEvent[] = [];
  const lastState = new Map<string, string>();
  for (const p of points) {
    const prev = lastState.get(p.sourceId);
    lastState.set(p.sourceId, p.state);
    // The first reading of a stream is a starting point, not a change —
    // "went quiet" makes no sense as the opening line of a log.
    if (prev === undefined || prev === p.state) continue;
    if (!EVENT_KINDS.has(p.state)) continue;

    const room = roomNameOf(p.sourceId);
    let label: string;
    if (p.state === 'motion') label = room ? `Movement in the ${room}` : 'Movement detected';
    else if (p.state === 'fall') label = room ? `Fall detected in the ${room}` : 'Fall detected';
    else if (p.state === 'lost') label = room ? `Sensor lost in the ${room}` : 'Sensor lost';
    else label = room ? `The ${room} went quiet` : 'Room went quiet';
    events.push({ ts: p.ts, sourceId: p.sourceId, kind: p.state as CsiEvent['kind'], label });
  }
  return events;
}

// ---------------------------------------------------------------------------
// Blueprint shape
// ---------------------------------------------------------------------------

/**
 * A short, unpredictable suffix for a room that has no usable name. The
 * room id ends up in the blueprint the family shares and in the anchors the
 * dashboard draws, so it is a credential-adjacent identifier: it must come
 * from a CSPRNG, not `Math.random()`. `globalThis.crypto` works in the
 * browser bundle and on Node 18+.
 */
function randomSuffix(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function makeRoomId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return slug ? `room_${slug}` : `room_${randomSuffix()}`;
}

/**
 * The blueprint a household starts with: one room, every sensor in it.
 *
 * We do not invent a floor plan. Until the family draws one or asks the
 * model to lay one out, the honest picture is "a room, with your sensors
 * in it" — and the family can then move each sensor into the right room.
 */
export function defaultBlueprint(sources: Source[], nowTs: number): Blueprint {
  const sensors = sources.filter((s) => s.type === 'esp32' || s.type === 'simulator');
  const anchors: BlueprintAnchor[] = sensors.map((s, i) => {
    // Spread the sensors along the middle so two of them do not overlap.
    const spread = sensors.length > 1 ? (i / (sensors.length - 1)) * 60 + 20 : 50;
    return { sourceId: s.id, label: s.label, roomId: 'room_main', x: spread, y: 50 };
  });
  const rooms: BlueprintRoom[] = [{ id: 'room_main', name: 'Room', x: 4, y: 4, w: 92, h: 92 }];
  return { rooms, anchors, updatedTs: nowTs, source: 'manual' };
}

function clampPct(v: unknown, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.max(0, Math.min(100, n));
}

function cleanName(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const trimmed = v.trim().slice(0, 40);
  return trimmed || fallback;
}

/**
 * Checks a blueprint that came from the client or from a model. Anything
 * out of range is clamped rather than rejected, and the room list is capped,
 * so a bad layout can never produce a broken or unbounded map.
 */
export function sanitizeBlueprint(input: unknown, nowTs: number): Blueprint {
  const raw = (input ?? {}) as { rooms?: unknown; anchors?: unknown };
  const rawRooms = Array.isArray(raw.rooms) ? raw.rooms.slice(0, 24) : [];

  const rooms: BlueprintRoom[] = rawRooms.map((r) => {
    const rec = (r ?? {}) as Record<string, unknown>;
    const name = cleanName(rec.name, 'Room');
    return {
      id: cleanName(rec.id, makeRoomId(name)).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || makeRoomId(name),
      name,
      x: clampPct(rec.x, 4),
      y: clampPct(rec.y, 4),
      w: Math.max(4, Math.min(96, clampPct(rec.w, 40))),
      h: Math.max(4, Math.min(96, clampPct(rec.h, 40))),
    };
  });

  const roomIds = new Set(rooms.map((r) => r.id));
  const rawAnchors = Array.isArray(raw.anchors) ? raw.anchors.slice(0, 24) : [];
  const anchors: BlueprintAnchor[] = rawAnchors.map((a) => {
    const rec = (a ?? {}) as Record<string, unknown>;
    const roomId = typeof rec.roomId === 'string' && roomIds.has(rec.roomId) ? rec.roomId : null;
    return {
      sourceId: cleanName(rec.sourceId, '').slice(0, 80),
      label: cleanName(rec.label, 'Sensor'),
      roomId,
      x: clampPct(rec.x, 50),
      y: clampPct(rec.y, 50),
    };
  }).filter((a) => a.sourceId.length > 0);

  return { rooms, anchors, updatedTs: nowTs, source: 'manual' };
}
