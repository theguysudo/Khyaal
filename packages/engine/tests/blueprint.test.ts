import { describe, expect, it } from 'vitest';

import {
  anchorLevels,
  defaultBlueprint,
  deriveCsiEvents,
  estimatePosition,
  sanitizeBlueprint,
} from '../src/blueprint';
import type { CsiAnchor, CsiPoint, Source } from '@khayaal/shared';

const NOW = 1_800_000_000_000;

function point(over: Partial<CsiPoint> & { sourceId: string }): CsiPoint {
  return { ts: NOW, v: 8, f: 9, thr: 25, state: 'idle', ...over };
}

function anchor(over: Partial<CsiAnchor> & { sourceId: string }): CsiAnchor {
  return {
    label: 'Sensor',
    roomId: null,
    x: 50,
    y: 50,
    level: 0,
    state: 'idle',
    lastMotionTs: null,
    ...over,
  };
}

describe('anchorLevels', () => {
  it('maps variance against the device threshold, clamped to 0..1', () => {
    const points = [
      point({ sourceId: 'a', v: 25, thr: 25 }), // exactly at threshold → 0
      point({ sourceId: 'a', v: 50, thr: 25 }), // 2x threshold → 1
      point({ sourceId: 'a', v: 5, thr: 25 }), // quiet → clamped to 0
    ];
    const levels = anchorLevels(points, NOW + 1000);
    expect(levels.get('a')!.level).toBe(1); // strongest reading in the window wins
    expect(levels.get('a')!.threshold).toBe(25);
  });

  it('ignores readings older than the level window', () => {
    const points = [point({ sourceId: 'a', v: 100, thr: 25, ts: NOW - 60_000 })];
    expect(anchorLevels(points, NOW).size).toBe(0);
  });

  it('records the last motion timestamp, not the newest state', () => {
    const points = [
      point({ sourceId: 'a', state: 'motion', ts: NOW - 4000 }),
      point({ sourceId: 'a', state: 'idle', ts: NOW }),
    ];
    const levels = anchorLevels(points, NOW + 1000);
    expect(levels.get('a')!.lastMotionTs).toBe(NOW - 4000);
    expect(levels.get('a')!.state).toBe('idle');
  });
});

describe('estimatePosition', () => {
  it('returns the single active anchor, confidence scaled by its level', () => {
    const est = estimatePosition([anchor({ sourceId: 'a', x: 20, y: 40, level: 0.6 })]);
    expect(est).not.toBeNull();
    expect(est!.x).toBe(20);
    expect(est!.y).toBe(40);
    expect(est!.sourceId).toBe('a');
    expect(est!.confidence).toBeGreaterThan(0);
    expect(est!.confidence).toBeLessThanOrEqual(1);
  });

  it('weights the centroid toward the stronger sensor', () => {
    const est = estimatePosition([
      anchor({ sourceId: 'a', x: 0, y: 0, level: 0.9 }),
      anchor({ sourceId: 'b', x: 100, y: 100, level: 0.1 }),
    ]);
    expect(est!.x).toBeLessThan(25); // squared weighting pulls it hard to 'a'
    expect(est!.y).toBeLessThan(25);
  });

  it('returns null when nothing is moving', () => {
    expect(estimatePosition([anchor({ sourceId: 'a', level: 0 })])).toBeNull();
    expect(estimatePosition([])).toBeNull();
  });
});

describe('deriveCsiEvents', () => {
  it('emits one event per state change with the room name', () => {
    const points = [
      point({ sourceId: 'a', state: 'idle', ts: 1000 }),
      point({ sourceId: 'a', state: 'motion', ts: 2000 }),
      point({ sourceId: 'a', state: 'motion', ts: 3000 }), // repeat → no event
      point({ sourceId: 'a', state: 'fall', ts: 4000 }),
    ];
    const events = deriveCsiEvents(points, () => 'Hall');
    expect(events.map((e) => e.kind)).toEqual(['motion', 'fall']);
    expect(events[0].label).toBe('Movement in the Hall');
    expect(events[1].label).toBe('Fall detected in the Hall');
  });

  it('handles several sources independently', () => {
    const points = [
      point({ sourceId: 'a', state: 'idle', ts: 500 }),
      point({ sourceId: 'b', state: 'idle', ts: 500 }),
      point({ sourceId: 'a', state: 'motion', ts: 1000 }),
      point({ sourceId: 'b', state: 'motion', ts: 2000 }),
      point({ sourceId: 'a', state: 'idle', ts: 3000 }),
    ];
    const events = deriveCsiEvents(points, (id) => (id === 'a' ? 'Kitchen' : 'Hall'));
    expect(events.map((e) => e.label)).toEqual([
      'Movement in the Kitchen',
      'Movement in the Hall',
      'The Kitchen went quiet',
    ]);
  });
});

describe('defaultBlueprint', () => {
  const source = (over: Partial<Source> & { id: string }): Source => ({
    type: 'esp32',
    label: 'Sensor',
    apiKey: 'sk_test',
    createdAtTs: NOW,
    lastSeenTs: null,
    ...over,
  });

  it('puts every sensor in one honest, unnamed-but-real room', () => {
    const bp = defaultBlueprint(
      [source({ id: 'a' }), source({ id: 'b' }), source({ id: 'c', type: 'phone' })],
      NOW,
    );
    expect(bp.rooms).toHaveLength(1);
    // the phone is not a room sensor — it does not get an anchor
    expect(bp.anchors.map((a) => a.sourceId)).toEqual(['a', 'b']);
    expect(bp.anchors[0].x).not.toBe(bp.anchors[1].x); // spread, not stacked
  });
});

describe('sanitizeBlueprint', () => {
  it('clamps geometry into the plan and drops junk anchors', () => {
    const bp = sanitizeBlueprint(
      {
        rooms: [{ name: 'Kitchen', x: -50, y: 999, w: 500, h: 0 }],
        anchors: [
          { sourceId: 'src_a', label: 'A', x: 120, y: -3, roomId: 'room_kitchen' },
          { sourceId: '', label: 'ghost' },
          { sourceId: 'src_b', label: 'B', roomId: 'no_such_room' },
        ],
      },
      NOW,
    );
    const room = bp.rooms[0];
    expect(room.x).toBe(0);
    expect(room.y).toBe(100);
    expect(room.w).toBeLessThanOrEqual(96);
    expect(room.h).toBeGreaterThanOrEqual(4);
    expect(bp.anchors).toHaveLength(2);
    expect(bp.anchors[0].x).toBe(100);
    expect(bp.anchors[0].y).toBe(0);
    expect(bp.anchors[0].roomId).toBe(room.id);
    expect(bp.anchors[1].roomId).toBeNull(); // unknown room refused
    expect(bp.source).toBe('manual');
  });

  it('caps the room and anchor lists', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ name: `R${i}`, x: i, y: 0, w: 10, h: 10 }));
    const bp = sanitizeBlueprint({ rooms: many, anchors: [] }, NOW);
    expect(bp.rooms).toHaveLength(24);
  });
});
