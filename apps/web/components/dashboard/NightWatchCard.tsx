'use client';

/**
 * The night watch — what her phone heard overnight, and a calm place to sit
 * while you wait.
 *
 * The sounds are synthesised in the browser (see NatureSounds.tsx): no audio
 * files, nothing to download, no network. Every track has its own volume and
 * its own mute, and there is a master mute for the whole room.
 */

import * as React from 'react';
import { BentoCard, CardTitle } from './bento';
import { fmtClock } from '@/lib/api';
import { NatureSoundEngine, SOUNDS, type SoundId } from './NatureSounds';

interface SleepSoundEvent {
  sourceId: string;
  type: string;
  value: string;
  ts: number;
}

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

export default function NightWatchCard({ events }: { events: SleepSoundEvent[] }) {
  const engineRef = React.useRef<NatureSoundEngine | null>(null);
  const [playing, setPlaying] = React.useState<Record<SoundId, boolean>>({
    rain: false,
    ocean: false,
    forest: false,
    night: false,
    fire: false,
  });
  const [muted, setMuted] = React.useState<Record<SoundId, boolean>>({
    rain: false,
    ocean: false,
    forest: false,
    night: false,
    fire: false,
  });
  const [volumes, setVolumes] = React.useState<Record<SoundId, number>>({
    rain: 0.5,
    ocean: 0.5,
    forest: 0.45,
    night: 0.4,
    fire: 0.5,
  });
  const [masterMuted, setMasterMuted] = React.useState(false);
  const [masterVolume, setMasterVolume] = React.useState(0.8);
  const [supported, setSupported] = React.useState(true);

  React.useEffect(() => {
    engineRef.current = new NatureSoundEngine();
    const ok = typeof window !== 'undefined' && !!(window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
    setSupported(ok);
    return () => {
      engineRef.current?.stopAll();
      engineRef.current = null;
    };
  }, []);

  const toggle = (id: SoundId) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (playing[id]) {
      engine.stop(id);
      setPlaying((p) => ({ ...p, [id]: false }));
    } else {
      const vol = muted[id] ? 0 : volumes[id] * masterVolume;
      engine.start(id, vol);
      setPlaying((p) => ({ ...p, [id]: true }));
    }
  };

  const changeVolume = (id: SoundId, value: number) => {
    setVolumes((v) => ({ ...v, [id]: value }));
    const engine = engineRef.current;
    if (!engine || !playing[id]) return;
    engine.setVolume(id, muted[id] ? 0 : value * masterVolume);
  };

  const toggleMute = (id: SoundId) => {
    const nextMuted = !muted[id];
    setMuted((m) => ({ ...m, [id]: nextMuted }));
    const engine = engineRef.current;
    if (!engine || !playing[id]) return;
    engine.setVolume(id, nextMuted ? 0 : volumes[id] * masterVolume);
  };

  const changeMaster = (value: number) => {
    setMasterVolume(value);
    const engine = engineRef.current;
    if (!engine) return;
    for (const s of SOUNDS) {
      if (playing[s.id]) engine.setVolume(s.id, muted[s.id] ? 0 : volumes[s.id] * value);
    }
  };

  const toggleMasterMute = () => {
    const next = !masterMuted;
    setMasterMuted(next);
    const engine = engineRef.current;
    if (!engine) return;
    for (const s of SOUNDS) {
      if (playing[s.id]) engine.setVolume(s.id, next ? 0 : muted[s.id] ? 0 : volumes[s.id] * masterVolume);
    }
  };

  const anyPlaying = Object.values(playing).some(Boolean);
  const stopAll = () => {
    engineRef.current?.stopAll();
    setPlaying({ rain: false, ocean: false, forest: false, night: false, fire: false });
  };

  const asleep = events.find((e) => e.type === 'sleep_event' && e.value === 'asleep');
  const lastEvent = events.length ? events[events.length - 1] : null;

  return (
    <BentoCard label="Night watch" className="col-span-12 lg:col-span-5">
      <CardTitle note="on-device · nothing recorded">Night watch</CardTitle>

      {/* the night sky */}
      <div className="relative mt-4 overflow-hidden rounded-[20px] border border-dusk/20 bg-[linear-gradient(170deg,#2b2540_0%,#3d3352_45%,#57496b_100%)] px-4 pb-4 pt-5 text-[#f2ecdf]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'radial-gradient(1.2px 1.2px at 12% 22%, rgba(255,255,255,.85), transparent), radial-gradient(1px 1px at 28% 12%, rgba(255,255,255,.6), transparent), radial-gradient(1.4px 1.4px at 46% 28%, rgba(255,255,255,.75), transparent), radial-gradient(1px 1px at 62% 15%, rgba(255,255,255,.5), transparent), radial-gradient(1.3px 1.3px at 78% 26%, rgba(255,255,255,.8), transparent), radial-gradient(1px 1px at 90% 18%, rgba(255,255,255,.55), transparent), radial-gradient(1.1px 1.1px at 34% 38%, rgba(255,255,255,.45), transparent), radial-gradient(1px 1px at 70% 40%, rgba(255,255,255,.4), transparent)',
          }}
        />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#f2ecdf]/55">
              {asleep ? 'She is asleep' : 'The house was quiet'}
            </p>
            <p className="mt-1 font-heading text-[22px] leading-tight">
              {asleep
                ? `Since ${fmtClock(asleep.ts)}`
                : lastEvent
                  ? `Last heard ${fmtClock(lastEvent.ts)}`
                  : 'No night events yet'}
            </p>
            <p className="mt-1.5 max-w-[22ch] text-xs leading-relaxed text-[#f2ecdf]/60">
              Her phone can watch over the night, opt-in. It listens for loud sounds only, on-device, and shares just the
              classification — never the audio.
            </p>
          </div>
          <div
            aria-hidden
            className="relative mt-1 h-12 w-12 flex-none rounded-full bg-[radial-gradient(circle_at_34%_32%,#fdf6e3_0%,#efe0c0_58%,#d8c49c_100%)] shadow-[0_0_26px_rgba(253,246,227,.35)]"
          >
            <span className="absolute left-[13px] top-[9px] h-2.5 w-2.5 rounded-full bg-[#e3d2ab]/70" />
            <span className="absolute left-[24px] top-[24px] h-1.5 w-1.5 rounded-full bg-[#e3d2ab]/60" />
            <span className="absolute left-[9px] top-[28px] h-1 w-1 rounded-full bg-[#e3d2ab]/50" />
          </div>
        </div>

        {/* the night's events */}
        <ul className="relative mt-4 space-y-1.5 border-t border-white/12 pt-3 text-xs">
          {events.length === 0 && <li className="text-[#f2ecdf]/55">Nothing unusual was heard overnight.</li>}
          {events.slice().reverse().slice(0, 4).map((s, i) => (
            <li key={`${s.ts}-${i}`} className="flex items-baseline gap-3">
              <span className="flex-none tabular-nums text-[#f2ecdf]/45">{fmtClock(s.ts)}</span>
              <span className="text-[#f2ecdf]/85">{describeEvent(s)}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* the mixer */}
      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Calming sounds</p>
          <div className="flex items-center gap-2">
            {anyPlaying && (
              <button
                onClick={stopAll}
                className={`rounded-full border border-ink/15 px-3 py-1 text-[11px] text-ink/55 transition-colors hover:border-ink/30 hover:text-ink ${FOCUS}`}
              >
                stop all
              </button>
            )}
            <button
              onClick={toggleMasterMute}
              aria-pressed={masterMuted}
              className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${
                masterMuted
                  ? 'border-[#b23a2f]/40 bg-[#f6dcd8]/70 text-[#77231c]'
                  : 'border-ink/15 text-ink/55 hover:border-ink/30 hover:text-ink'
              } ${FOCUS}`}
            >
              {masterMuted ? '🔇 muted' : '🔊 sound on'}
            </button>
          </div>
        </div>

        {!supported && (
          <p className="mt-2 text-[11px] text-ink/45">This browser cannot play audio.</p>
        )}

        <div className="mt-2.5 space-y-1.5">
          {SOUNDS.map((s) => {
            const on = playing[s.id];
            const off = muted[s.id] || masterMuted;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-3 rounded-2xl border px-3 py-2 transition-colors ${
                  on ? 'border-clay/40 bg-clay/5' : 'border-ink/10 bg-paper/50'
                }`}
              >
                <button
                  onClick={() => toggle(s.id)}
                  disabled={!supported}
                  aria-label={`${on ? 'Stop' : 'Play'} ${s.label}`}
                  className={`flex h-9 w-9 flex-none items-center justify-center rounded-full text-base transition-transform active:scale-95 motion-reduce:active:scale-100 ${
                    on ? 'bg-clay text-paper shadow-[0_4px_14px_rgba(185,92,56,.35)]' : 'bg-white text-ink/60 shadow-sm'
                  } disabled:opacity-40 ${FOCUS}`}
                >
                  {on ? '❚❚' : s.glyph}
                </button>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${off ? 'text-ink/40' : 'text-ink/80'}`}>
                    {s.label}
                    {on && <span className="ml-2 text-[10px] uppercase tracking-wide text-clay">playing</span>}
                  </p>
                  <p className="truncate text-[11px] text-ink/40">{s.hint}</p>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volumes[s.id]}
                  onChange={(e) => changeVolume(s.id, Number(e.target.value))}
                  aria-label={`${s.label} volume`}
                  className="hidden h-1 w-20 appearance-none rounded-full bg-ink/15 accent-clay sm:block"
                />
                <button
                  onClick={() => toggleMute(s.id)}
                  aria-label={`${muted[s.id] ? 'Unmute' : 'Mute'} ${s.label}`}
                  aria-pressed={muted[s.id]}
                  className={`flex-none rounded-full px-2 py-1 text-[11px] transition-colors ${
                    muted[s.id] ? 'bg-ink/10 text-ink/45' : 'text-ink/35 hover:bg-ink/5 hover:text-ink/60'
                  } ${FOCUS}`}
                >
                  {muted[s.id] ? '🔇' : '🔈'}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-wide text-ink/35">room volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            onChange={(e) => changeMaster(Number(e.target.value))}
            aria-label="Room volume"
            className="h-1 flex-1 appearance-none rounded-full bg-ink/15 accent-clay"
          />
          <span className="w-8 text-right text-[11px] tabular-nums text-ink/40">
            {Math.round(masterVolume * 100)}
          </span>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-ink/35">
          The sounds are made by this page as you listen — no recording, no download, nothing leaves the house.
        </p>
      </div>
    </BentoCard>
  );
}

function describeEvent(s: SleepSoundEvent): string {
  if (s.type === 'sleep_event') {
    if (s.value === 'asleep') return '🌙 Sleeping peacefully';
    if (s.value === 'woke') return '☀️ Awake this morning';
    if (s.value === 'restless') return '😕 Restless night stretch';
    return '🌅 Up for the day';
  }
  if (s.value === 'loud') return '📢 A loud sound was heard';
  if (s.value === 'noise') return '🔉 Some noise nearby';
  return '🔇 All quiet';
}
