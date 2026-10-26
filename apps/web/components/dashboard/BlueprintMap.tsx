'use client';

/**
 * BlueprintMap — the family's own drawing of the home.
 *
 * Room rectangles and sensor dots, percentages of a 100×100 plan. The dots
 * glow with how strongly each sensor sees motion right now, a soft blob
 * marks where movement is strongest, and the recent movement events sit at
 * the sensor that reported them — events carry no coordinates, so they can
 * say nothing more specific than that. In edit mode a sensor can be dragged
 * to where it actually sits; dropping it saves the plan.
 */

import * as React from 'react';
import { BentoCard, CardTitle, useReducedMotion, useSize } from './bento';
import { fmtClock, postJSON, useCsiSeries } from '@/lib/api';
import type { Blueprint, CsiAnchor } from '@khayaal/shared';

/** The live anchor as the /csi endpoint returns it — may carry the IR flag. */
type LiveAnchor = CsiAnchor & { irDetected?: boolean };

const MAP_H = 300;

const INK = '#2a241d';
const CLAY = '#b95c38';
const CLAYDEEP = '#9c4a2b';
const SAGE = '#7d8c6f';
const RED = '#b23a2f';
const DUSK = '#3d3352';
const GREY = '#c9b8a0';

type Provider = 'auto' | 'nvidia' | 'xai' | 'minimax' | 'openrouter';

/** Focus ring shared with the rest of the dashboard's controls. */
const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

export default function BlueprintMap({ id }: { id: string }) {
  const { bundle } = useCsiSeries(id, 2000);
  const reduce = useReducedMotion();

  // The layout as just saved — a drag save or an AI draft answers before the
  // poll catches up, so hold its blueprint until the stream shows it too.
  const [savedBp, setSavedBp] = React.useState<Blueprint | null>(null);
  React.useEffect(() => {
    if (savedBp && bundle && bundle.blueprint.updatedTs >= savedBp.updatedTs) setSavedBp(null);
  }, [bundle, savedBp]);
  const bp: Blueprint | null = savedBp ?? bundle?.blueprint ?? null;

  // Edit mode: drags live here until they are saved. A failed save keeps the
  // moves (and the error) on screen — the layout is never silently lost.
  const [edit, setEdit] = React.useState(false);
  const [moves, setMoves] = React.useState<Record<string, { x: number; y: number }>>({});
  const movesRef = React.useRef(moves);
  const applyMove = (sourceId: string, x: number, y: number) => {
    const next = { ...movesRef.current, [sourceId]: { x, y } };
    movesRef.current = next;
    setMoves(next);
  };
  const clearMoves = () => {
    movesRef.current = {};
    setMoves({});
  };
  const posOf = (a: CsiAnchor) => moves[a.sourceId] ?? { x: a.x, y: a.y };

  const [drag, setDrag] = React.useState<{ sourceId: string } | null>(null);
  const dragOffset = React.useRef({ x: 0, y: 0 });
  const dirty = React.useRef(false);

  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  // AI panel — the provider and key are shared by Generate and "What happened?".
  const [aiOpen, setAiOpen] = React.useState(false);
  const [roomsText, setRoomsText] = React.useState('');
  const [provider, setProvider] = React.useState<Provider>('auto');
  const [apiKey, setApiKey] = React.useState('');
  const [busy, setBusy] = React.useState<'generate' | 'narrate' | null>(null);
  const [aiError, setAiError] = React.useState<string | null>(null);
  const [aiNote, setAiNote] = React.useState<string | null>(null);
  const [narrative, setNarrative] = React.useState<string | null>(null);
  const [narrMeta, setNarrMeta] = React.useState<string | null>(null);

  // Dots come from the live stream (levels, states), positions from the
  // effective blueprint — plus any streaming sensor the plan does not know
  // about yet, so a live sensor is never invisible.
  const anchors: LiveAnchor[] = React.useMemo(() => {
    if (!bundle) return [];
    const eff = savedBp ?? bundle.blueprint;
    const byId = new Map<string, CsiAnchor>();
    for (const a of bundle.anchors) byId.set(a.sourceId, { ...a });
    for (const a of eff.anchors) {
      const hit = byId.get(a.sourceId);
      if (hit) {
        hit.label = a.label;
        hit.roomId = a.roomId;
        hit.x = a.x;
        hit.y = a.y;
      } else {
        byId.set(a.sourceId, { ...a, level: 0, state: 'idle', lastMotionTs: null });
      }
    }
    return [...byId.values()];
  }, [bundle, savedBp]);

  const saveLayout = async () => {
    if (!bp || saving) return;
    const pending = movesRef.current;
    const anchorsOut = anchors.map((a) => {
      const m = pending[a.sourceId];
      return { sourceId: a.sourceId, label: a.label, roomId: a.roomId, x: m ? m.x : a.x, y: m ? m.y : a.y };
    });
    setSaving(true);
    setSaveError(null);
    try {
      const r = await postJSON<{ blueprint: Blueprint }>(`/api/v1/household/${id}/blueprint`, {
        rooms: bp.rooms,
        anchors: anchorsOut,
      });
      setSavedBp(r.blueprint);
      clearMoves();
      setNote('Sensor positions saved');
      window.setTimeout(() => setNote(null), 2500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save the layout');
    } finally {
      setSaving(false);
    }
  };

  const toggleEdit = () => {
    if (edit && Object.keys(movesRef.current).length > 0) void saveLayout();
    setEdit(!edit);
  };

  // Drag with pointer events only — no dependencies, capture on the SVG so a
  // fast drag that leaves the map still lands.
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [mapRef, { w: W, h: H }] = useSize();

  const pctFromEvent = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  };
  const onDotDown = (a: CsiAnchor) => (e: React.PointerEvent) => {
    if (!edit || saving) return;
    const p = pctFromEvent(e);
    if (!p) return;
    e.preventDefault();
    const pos = posOf(a);
    dragOffset.current = { x: p.x - pos.x, y: p.y - pos.y };
    dirty.current = false;
    setDrag({ sourceId: a.sourceId });
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* without capture the drag still works while the pointer stays on the map */
    }
  };
  const onSvgMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = pctFromEvent(e);
    if (!p) return;
    dirty.current = true;
    applyMove(
      drag.sourceId,
      Math.max(0, Math.min(100, p.x - dragOffset.current.x)),
      Math.max(0, Math.min(100, p.y - dragOffset.current.y)),
    );
  };
  const onSvgUp = () => {
    if (!drag) return;
    setDrag(null);
    if (dirty.current) {
      dirty.current = false;
      void saveLayout();
    }
  };

  const runAi = async (kind: 'generate' | 'narrate') => {
    setBusy(kind);
    setAiError(null);
    try {
      if (kind === 'generate') {
        const r = await postJSON<{ blueprint: Blueprint; provider: string; model: string }>(
          `/api/v1/household/${id}/blueprint/generate`,
          { rooms: roomsText, provider, apiKey: apiKey || undefined },
        );
        setSavedBp(r.blueprint);
        clearMoves();
        setAiNote(`Drafted by ${r.model} (${r.provider}) — drag the sensors into their rooms.`);
      } else {
        const r = await postJSON<{ narrative: string; provider: string | null; model: string | null }>(
          `/api/v1/household/${id}/motion/narrate`,
          { provider, apiKey: apiKey || undefined },
        );
        setNarrative(r.narrative);
        setNarrMeta(r.provider ? `read by ${r.model ?? r.provider}` : null);
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'The request failed');
    } finally {
      setBusy(null);
    }
  };

  // Recent movement, drawn at the sensor that saw it — the honest limit of
  // what events know.
  const trail = (bundle?.events ?? []).filter((e) => e.kind === 'motion' || e.kind === 'fall').slice(-10);

  const isStarterPlan = !!bp && bp.rooms.length <= 1 && (bp.rooms[0]?.name.trim().toLowerCase() ?? '') === 'room';

  return (
    <BentoCard label="Room blueprint" className="col-span-12 lg:col-span-7">
      <CardTitle note={bp?.source === 'llm' ? 'drafted by a model — adjust freely' : 'rooms and sensors, drawn by the family'}>
        Room blueprint
      </CardTitle>

      <div
        ref={mapRef}
        className="relative mt-4 overflow-hidden rounded-2xl border border-ink/10 bg-cream/40"
        style={{ height: MAP_H }}
      >
        {bp && W > 0 && (
          <svg
            ref={svgRef}
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            className="block"
            style={edit ? { touchAction: 'none' } : undefined}
            role="img"
            aria-label="Floor plan with the room sensors marked, how strongly each sees motion, and where movement is strongest"
            onPointerMove={onSvgMove}
            onPointerUp={onSvgUp}
            onPointerCancel={onSvgUp}
          >
            {bp.rooms.map((r, i) => {
              const x = (r.x / 100) * W;
              const y = (r.y / 100) * H;
              const w = (r.w / 100) * W;
              const h = (r.h / 100) * H;
              return (
                <g key={r.id}>
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    rx="8"
                    fill={i % 2 ? '#f3ecdf' : '#efe3d3'}
                    stroke={INK}
                    strokeOpacity="0.12"
                  />
                  <text
                    x={x + w / 2}
                    y={Math.min(y + 18, y + h - 6)}
                    textAnchor="middle"
                    fontSize="11"
                    fill={INK}
                    fillOpacity="0.45"
                    style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}
                  >
                    {r.name}
                  </text>
                </g>
              );
            })}

            {bundle?.estimated && !edit && (
              <g>
                <circle
                  cx={(bundle.estimated.x / 100) * W}
                  cy={(bundle.estimated.y / 100) * H}
                  r={10 + bundle.estimated.confidence * 20}
                  fill={DUSK}
                  fillOpacity="0.1"
                  stroke={DUSK}
                  strokeOpacity="0.3"
                  strokeDasharray="3 3"
                />
                <title>Movement is strongest near here</title>
              </g>
            )}

            {trail.map((e, i) => {
              const a = anchors.find((x) => x.sourceId === e.sourceId);
              if (!a) return null;
              const pos = posOf(a);
              const age = trail.length > 1 ? i / (trail.length - 1) : 1;
              return (
                <circle
                  key={`${e.ts}-${e.sourceId}-${i}`}
                  cx={(pos.x / 100) * W}
                  cy={(pos.y / 100) * H}
                  r={2.5 + age * 1.5}
                  fill={e.kind === 'fall' ? RED : SAGE}
                  fillOpacity={0.15 + age * 0.6}
                >
                  <title>{`${e.label} · ${fmtClock(e.ts)}`}</title>
                </circle>
              );
            })}

            {anchors.map((a) => {
              const pos = posOf(a);
              const cx = (pos.x / 100) * W;
              const cy = (pos.y / 100) * H;
              const level = Math.max(0, Math.min(1, a.level));
              const active = a.state === 'motion' || a.state === 'fall' || level > 0.05;
              const color = a.state === 'fall' ? RED : active ? CLAY : GREY;
              const hot = a.state === 'fall' || (a.state === 'motion' && level > 0.2);
              const dragging = drag?.sourceId === a.sourceId;
              const roomName = a.roomId ? bp.rooms.find((r) => r.id === a.roomId)?.name ?? null : null;
              const labelY = cy + 22 > H - 2 ? cy - 14 : cy + 22;
              // The IR beam is near-field and its own channel: it points at
              // the sensor itself, never at a person's position.
              const irHere = a.irDetected === true;
              return (
                <g key={a.sourceId} onPointerDown={onDotDown(a)} style={{ cursor: edit && !saving ? 'grab' : 'default' }}>
                  {irHere && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={13}
                      fill="none"
                      stroke="#8a5a8f"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                      opacity="0.85"
                    >
                      <title>{`Object right at the sensor (IR beam) — ${a.label}${roomName ? `, ${roomName}` : ''}`}</title>
                    </circle>
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={9 + level * 9}
                    fill={color}
                    opacity={active ? 0.18 + level * 0.25 : 0.1}
                    className={hot && !reduce ? 'animate-pulse' : ''}
                  />
                  <circle cx={cx} cy={cy} r={4.5 + level * 3} fill={color} stroke="#ffffff" strokeWidth="1.5" />
                  {dragging && (
                    <circle cx={cx} cy={cy} r={13} fill="none" stroke={CLAYDEEP} strokeWidth="1.5" strokeDasharray="3 3" />
                  )}
                  <text x={cx} y={labelY} textAnchor="middle" fontSize="9.5" fill={INK} fillOpacity="0.5">
                    {a.label}
                  </text>
                  <title>
                    {`${a.label}${roomName ? ` — ${roomName}` : ''} · ${
                      active ? `motion level ${Math.round(level * 100)}%` : 'quiet'
                    }`}
                  </title>
                </g>
              );
            })}
          </svg>
        )}
        {(!bp || W === 0) && (
          <div className="flex h-full items-center justify-center text-sm text-ink/40">
            The room plan appears when the sensor checks in.
          </div>
        )}
      </div>

      {edit && (
        <p className="mt-2 text-xs text-ink/50">Drag a sensor to where it sits, then drop it — the plan saves itself.</p>
      )}
      {isStarterPlan && (
        <p className="mt-2 text-xs leading-relaxed text-ink/45">
          This is the starter plan — describe your home under “Generate with AI” and the layout will follow, or
          simply drag your sensors where they sit.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={toggleEdit}
          disabled={saving}
          aria-pressed={edit}
          className={`rounded-full border px-4 py-1.5 text-[13px] transition-colors disabled:opacity-40 ${
            edit ? 'border-clay bg-clay/10 text-claydeep' : 'border-ink/15 text-ink/60 hover:border-ink/25 hover:bg-paper'
          } ${FOCUS}`}
        >
          {saving ? 'Saving…' : edit ? 'Done' : 'Move sensors'}
        </button>
        <button
          onClick={() => runAi('narrate')}
          disabled={busy !== null}
          className={`rounded-full border border-ink/15 px-4 py-1.5 text-[13px] text-ink/70 transition-colors hover:border-ink/25 hover:bg-ink hover:text-paper disabled:opacity-40 ${FOCUS}`}
        >
          {busy === 'narrate' ? 'Reading the room…' : 'What happened?'}
        </button>
        <button
          onClick={() => setAiOpen(!aiOpen)}
          aria-expanded={aiOpen}
          className={`rounded-full border border-ink/15 px-4 py-1.5 text-[13px] text-ink/60 transition-colors hover:border-ink/25 hover:bg-paper ${FOCUS}`}
        >
          {aiOpen ? 'Hide AI layout' : 'Generate with AI'}
        </button>
        {note && <span className="text-xs text-[#4c7a4f]">{note} ✓</span>}
      </div>

      {saveError && (
        <p className="mt-2 text-xs leading-relaxed text-[#b23a2f]">
          Could not save the layout — {saveError}. The moved positions are still on the map; try again.
        </p>
      )}

      {aiOpen && (
        <div className="mt-3 rounded-2xl border border-ink/10 bg-paper/70 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Describe the home — a model drafts the plan</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={roomsText}
              onChange={(e) => setRoomsText(e.target.value)}
              placeholder="2BHK — bedroom, kitchen, hall, balcony"
              className="min-w-[200px] flex-1 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm outline-none transition-colors focus:border-clay focus:ring-2 focus:ring-clay/15"
            />
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className={`rounded-full border border-ink/15 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-clay focus:ring-2 focus:ring-clay/15 ${FOCUS}`}
            >
              <option value="auto">Auto</option>
              <option value="nvidia">NVIDIA NIM</option>
              <option value="xai">xAI Grok</option>
              <option value="minimax">MiniMax</option>
              <option value="openrouter">OpenRouter</option>
            </select>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="leave empty to use the server key"
              className="min-w-[200px] flex-1 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm outline-none transition-colors focus:border-clay focus:ring-2 focus:ring-clay/15"
            />
            <button
              onClick={() => runAi('generate')}
              disabled={busy !== null}
              className={`rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper transition-colors hover:bg-ink/85 disabled:opacity-40 ${FOCUS}`}
            >
              {busy === 'generate' ? 'Drafting…' : 'Generate layout'}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink/40">
            The model only proposes rooms — no coordinate of a person exists to send. “What happened?” uses the
            same provider and key.
          </p>
          {aiError && <p className="mt-2 text-xs text-[#b23a2f]">{aiError}</p>}
          {aiNote && <p className="mt-2 text-xs text-[#4c7a4f]">{aiNote}</p>}
        </div>
      )}

      {narrative && (
        <div className="mt-3">
          <div className="whitespace-pre-wrap rounded-2xl bg-paper/80 p-4 text-[13.5px] leading-relaxed text-ink/80">
            {narrative}
          </div>
          {narrMeta && <p className="mt-1.5 text-[11px] text-ink/40">{narrMeta}</p>}
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-ink/40">
        Room-level motion from the sensors — this blueprint never tracks a person.
      </p>
    </BentoCard>
  );
}
