import { NextResponse } from 'next/server';
import type { Blueprint, CsiAnchor, CsiPoint } from '@khayaal/shared';
import { requireHouseholdMember, unauthorized } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { simNow } from '@/lib/server/runtime';
import {
  anchorLevels,
  defaultBlueprint,
  deriveCsiEvents,
  estimatePosition,
} from '@khayaal/engine';

/**
 * GET /api/v1/household/{id}/csi — the live scope.
 *
 * Returns the room sensor's readings as one flat series (the device batches
 * a second of readings per request), the state changes worth showing, where
 * each sensor stands on the blueprint, and a position estimate.
 *
 * This is the ROOM's picture, not the person's: the ESP32 says "this room is
 * occupied and how strongly", and nothing here can say where anyone is
 * standing.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireHouseholdMember(req, id);
  if (guard instanceof Response) return guard;

  const store = getStore();
  const household = await store.getHousehold(id);
  if (!household) return unauthorized();

  const url = new URL(req.url);
  const sinceParam = Number(url.searchParams.get('since'));
  const limitParam = Number(url.searchParams.get('limit'));
  const nowTs = simNow(household);
  // Default window: the last 5 minutes of readings.
  const sinceTs = Number.isFinite(sinceParam) && sinceParam > 0 ? sinceParam : nowTs - 5 * 60_000;
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(3000, limitParam) : 1200;

  const batches = await store.getCsi(id, sinceTs, limit);
  const sources = await store.getSources(id);

  const blueprint: Blueprint = household.blueprint ?? defaultBlueprint(sources, nowTs);
  const roomOf = new Map(blueprint.anchors.map((a) => [a.sourceId, a.roomId]));
  const roomName = (sourceId: string): string => {
    const roomId = roomOf.get(sourceId);
    if (!roomId) return '';
    return blueprint.rooms.find((r) => r.id === roomId)?.name ?? '';
  };

  // Flatten each batch into individual readings. The device samples at 4 Hz
  // and stamps the batch at its end, so the readings are spread backwards
  // from that stamp.
  const points: CsiPoint[] = [];
  for (const batch of batches) {
    const samples = batch.samples?.length ? batch.samples : [batch.v];
    const fast = batch.fast?.length ? batch.fast : [];
    for (let i = 0; i < samples.length; i++) {
      const offsetMs = (samples.length - 1 - i) * 250;
      points.push({
        ts: batch.ts - offsetMs,
        v: samples[i],
        f: fast[i] ?? samples[i],
        thr: batch.thr,
        state: batch.state,
        ...(batch.ir === 1 ? { ir: 1 } : {}),
        sourceId: batch.sourceId,
      });
    }
  }
  points.sort((a, b) => a.ts - b.ts);

  const levels = anchorLevels(batches, nowTs);
  const anchors: CsiAnchor[] = blueprint.anchors.map((anchor) => {
    const level = levels.get(anchor.sourceId);
    return {
      sourceId: anchor.sourceId,
      label: anchor.label,
      roomId: anchor.roomId,
      x: anchor.x,
      y: anchor.y,
      level: level?.level ?? 0,
      state: level?.state ?? 'idle',
      lastMotionTs: level?.lastMotionTs ?? null,
    };
  });

  // A sensor that is streaming but was never placed on the blueprint still
  // deserves a dot — otherwise the map looks empty while it is clearly live.
  for (const [sourceId, level] of levels) {
    if (anchors.some((a) => a.sourceId === sourceId)) continue;
    const source = sources.find((s) => s.id === sourceId);
    anchors.push({
      sourceId,
      label: source?.label ?? 'Sensor',
      roomId: null,
      x: 50,
      y: 50,
      level: level.level,
      state: level.state,
      lastMotionTs: level.lastMotionTs,
    });
  }

  const events = deriveCsiEvents(batches, roomName);
  const estimated = estimatePosition(anchors);

  // The IR beam is a separate channel, reported separately: its own event
  // list (object entered / left the beam) and a per-anchor flag. Nothing
  // here feeds the presence verdict — IR never overrides CSI.
  const irEvents: { ts: number; sourceId: string; state: 'detected' | 'clear' }[] = [];
  let lastIr: number | null = null;
  for (const b of batches) {
    const ir = b.ir === 1 ? 1 : 0;
    if (lastIr === null || ir !== lastIr) {
      irEvents.push({ ts: b.ts, sourceId: b.sourceId, state: ir === 1 ? 'detected' : 'clear' });
      lastIr = ir;
    }
  }
  // Per-anchor IR: whether the newest batches of that source see an object.
  const irBySource = new Map<string, number>();
  for (const b of batches) {
    if (b.ir === 1) irBySource.set(b.sourceId, 1);
    else if (!irBySource.has(b.sourceId)) irBySource.set(b.sourceId, 0);
  }

  return NextResponse.json({
    points,
    events,
    irEvents,
    anchors: anchors.map((a) => ({
      ...a,
      ...(irBySource.get(a.sourceId) === 1 ? { irDetected: true } : {}),
    })),
    estimated,
    threshold: batches.length ? batches[batches.length - 1].thr : 0,
    blueprint,
    nowTs,
  });
}
