import { NextResponse } from 'next/server';
import { randomId } from '@khayaal/engine';
import type { SensorPairRequest } from '@khayaal/shared';
import { requireFamily } from '@/lib/server/authz';
import { getStore } from '@/lib/server/store';
import { rateLimit } from '@/lib/server/rate-limit';
import { parkRelayRegistration, getRelayToken } from '@/lib/server/relay';
import { launchRelay } from '@/lib/server/relay-launcher';

/**
 * POST /api/v1/household/{id}/sensor/connect — one-click sensor pairing.
 *
 * The family plugs the ESP32 into this laptop's USB port and presses
 * Connect. This mints the source, parks the identity in the household's
 * pair-request slot, and returns immediately; the USB relay — which is
 * already polling the device channel — picks the request up and types it
 * into the board over its serial port. The dashboard then watches the new
 * source's lastSeenTs flip live.
 *
 * The key transits only the household's own authenticated channel (it is
 * readable by a source key of this family — the relay's), which is the same
 * trust the relay already holds. The manual paste-block flow stays as the
 * fallback for LAN-mode setups.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`sensor-connect:${req.headers.get('x-forwarded-for') ?? 'local'}`, 4, 60_000)) {
    return NextResponse.json({ error: 'Slow down' }, { status: 429 });
  }
  const { id } = await params;
  const guard = await requireFamily(req, id);
  if (guard instanceof Response) return guard;

  const store = getStore();
  const household = await store.getHousehold(id);
  if (!household) return NextResponse.json({ error: 'Household not found' }, { status: 404 });

  const source = {
    id: `src_${randomId()}`,
    type: 'esp32' as const,
    label: 'Room sensor (ESP32)',
    apiKey: `sk_${randomId()}${randomId()}`,
    createdAtTs: Date.now(),
    lastSeenTs: null,
  };
  await store.addSource(id, source);

  const request: SensorPairRequest = {
    householdId: id,
    sourceId: source.id,
    apiKey: source.apiKey,
    ts: Date.now(),
  };
  await store.putSensorPairRequest(id, request);

  // Park the same identity for the local relay to claim. The relay holds a
  // durable local token (a 0600 file next to its own script), so it can
  // pick this up without the family pasting a pairing code into a terminal.
  // The relay then types the identity into the board over USB serial.
  parkRelayRegistration({
    householdId: id,
    sourceId: source.id,
    apiKey: source.apiKey,
    ts: request.ts,
  });

  // Plug-and-play: if no relay is running on this laptop, start it. It
  // claims the parked identity on its next poll and types it into the board.
  // Minting the local token first means the relay has something to
  // authenticate with the moment it comes up.
  getRelayToken();
  const relay = launchRelay();

  return NextResponse.json({
    source: { ...source, apiKey: undefined }, // the relay gets the key, the page doesn't need it again
    requestId: source.id,
    relay: {
      started: relay.started,
      reason: relay.reason,
      // Where to look if the family wants to see what the relay is doing.
      logPath: relay.logPath ?? null,
    },
  });
}
