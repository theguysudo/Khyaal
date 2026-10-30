'use client';

/**
 * The night watch — what her phone heard overnight, and a calm place to sit
 * while you wait.
 *
 * The sounds are synthesised in the browser (see NatureSounds.tsx): no audio
 * files, nothing to download, no network. Every track has its own volume and
 * its own mute, and there is a master mute for the whole room. On the ledger
 * the night reads as rows: mono timestamps, a status dot and a word, hairline
 * dividers — no night-sky backdrop, no moon, no glow.
 */

import * as React from 'react';
import { BentoCard, CardTitle } from './bento';
import { FOCUS } from './kh';
import { IconMoon, IconPlay, IconSpeaker, IconSpeakerOff, IconStop, IconSun } from './icons';
import { fmtClock } from '@/lib/api';
import { NatureSoundEngine, SOUNDS, type SoundId } from './NatureSounds';

interface SleepSoundEvent {
  sourceId: string;
  type: string;
  value: string;
  ts: number;
}

/** Each night event as plain words plus the dot that carries its hue. */
function describeEvent(s: SleepSoundEvent): { text: string; color: string } {
  if (s.type === 'sleep_event') {
    if (s.value === 'asleep') return { text: 'Sleeping peacefully', color: '#2F6B4F' };
    if (s.value === 'woke') return { text: 'Awake this morning', color: '#9A6A1B' };
    if (s.value === 'restless') return { text: 'Restless night stretch', color: '#9A6A1B' };
    return { text: 'Up for the day', color: '#9A6A1B' };
  }
  if (s.value === 'loud') return { text: 'A loud sound was heard', color: '#B3261E' };
  if (s.value === 'noise') return { text: 'Some noise nearby', color: '#9A6A1B' };
  return { text: 'All quiet', color: '#2F6B4F' };
}

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
    <BentoCard label="Night watch">
      <CardTitle note="on-device · nothing recorded">Night watch</CardTitle>

      {/* the night's reading — an inset panel on a hairline, no sky, no moon */}
      <div className="mt-4 rounded-lg border border-[#E7E2DA] bg-[#FAF8F5] px-4 pb-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-2 text-[13px] font-medium uppercase tracking-[0.08em] text-[#57534E]">
              <span className="dot" style={{ background: asleep ? '#2F6B4F' : '#9A6A1B' }} aria-hidden />
              {asleep ? 'She is asleep' : 'The house was quiet'}
            </p>
            <p className="t-section mt-1.5 text-[#1A1815]">
              {asleep
                ? `Since ${fmtClock(asleep.ts)}`
                : lastEvent
                  ? `Last heard ${fmtClock(lastEvent.ts)}`
                  : 'No night events yet'}
            </p>
            <p className="mt-1.5 max-w-[46ch] text-[13px] leading-relaxed text-[#8A857D]">
              Her phone can watch over the night, opt-in. It listens for loud sounds only, on-device, and shares just the
              classification — never the audio.
            </p>
          </div>
          <span aria-hidden className="mt-1 text-[#8A857D]">
            {asleep ? <IconMoon className="h-6 w-6" /> : <IconSun className="h-6 w-6" />}
          </span>
        </div>

        {/* the night's events */}
        <ul className="mt-4 border-t border-[#E7E2DA] pt-1">
          {events.length === 0 && <li className="py-2 text-[13px] text-[#8A857D]">Nothing unusual was heard overnight.</li>}
          {events.slice().reverse().slice(0, 4).map((s, i) => {
            const d = describeEvent(s);
            return (
              <li key={`${s.ts}-${i}`} className="ledger-row !py-2 text-[13px]">
                <span className="flex-none font-mono tabular-nums text-[#8A857D]">{fmtClock(s.ts)}</span>
                <span className="inline-flex items-center gap-2 text-[#1A1815]">
                  <span className="dot flex-none" style={{ background: d.color }} aria-hidden />
                  {d.text}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* the mixer — ledger rows with a play square, a slider, a mute */}
      <div className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-[#57534E]">Calming sounds</p>
          <div className="flex items-center gap-2">
            {anyPlaying && (
              <button
                onClick={stopAll}
                className={`${FOCUS} kh-press h-8 rounded-lg border border-[#D6CFC4] px-3 text-[13px] font-medium text-[#1A1815] transition-colors hover:border-[#1A1815]`}
              >
                stop all
              </button>
            )}
            <button
              onClick={toggleMasterMute}
              aria-pressed={masterMuted}
              className={`${FOCUS} kh-press inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition-colors ${
                masterMuted
                  ? 'border-[#B3261E] text-[#B3261E]'
                  : 'border-[#D6CFC4] text-[#1A1815] hover:border-[#1A1815]'
              }`}
            >
              {masterMuted ? <IconSpeakerOff className="h-3.5 w-3.5" /> : <IconSpeaker className="h-3.5 w-3.5" />}
              {masterMuted ? 'muted' : 'sound on'}
            </button>
          </div>
        </div>

        {!supported && (
          <p className="mt-2 text-[13px] text-[#8A857D]">This browser cannot play audio.</p>
        )}

        <div className="mt-2.5">
          {SOUNDS.map((s) => {
            const on = playing[s.id];
            const off = muted[s.id] || masterMuted;
            return (
              <div key={s.id} className="ledger-row">
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <button
                    onClick={() => toggle(s.id)}
                    disabled={!supported}
                    aria-label={`${on ? 'Stop' : 'Play'} ${s.label}`}
                    className={`kh-press flex h-9 w-9 flex-none items-center justify-center rounded-lg border transition-colors disabled:opacity-40 ${
                      on
                        ? 'border-transparent bg-[#B4451C] text-[#FFF7F0]'
                        : 'border-[#D6CFC4] bg-transparent text-[#1A1815] hover:border-[#1A1815]'
                    } ${FOCUS}`}
                  >
                    {on ? <IconStop className="h-4 w-4" /> : <IconPlay className="h-4 w-4" />}
                  </button>
                  <span className="min-w-0">
                    <span className={`inline-flex items-center gap-2 text-[15px] font-medium ${off ? 'text-[#D6CFC4]' : 'text-[#1A1815]'}`}>
                      {s.label}
                      {on && <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#B4451C]"><span className="dot bg-[#B4451C]" aria-hidden />playing</span>}
                    </span>
                    <span className="block truncate text-[13px] text-[#8A857D]">{s.hint}</span>
                  </span>
                </span>
                <span className="flex flex-none items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volumes[s.id]}
                    onChange={(e) => changeVolume(s.id, Number(e.target.value))}
                    aria-label={`${s.label} volume`}
                    className="hidden h-1 w-20 accent-[#B4451C] sm:block"
                  />
                  <button
                    onClick={() => toggleMute(s.id)}
                    aria-label={`${muted[s.id] ? 'Unmute' : 'Mute'} ${s.label}`}
                    aria-pressed={muted[s.id]}
                    className={`kh-press flex-none rounded p-1.5 transition-colors ${
                      muted[s.id] ? 'bg-[#F7F4EF] text-[#57534E]' : 'text-[#8A857D] hover:bg-[#F7F4EF] hover:text-[#1A1815]'
                    } ${FOCUS}`}
                  >
                    {muted[s.id] ? <IconSpeakerOff className="h-4 w-4" /> : <IconSpeaker className="h-4 w-4" />}
                  </button>
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span className="text-[13px] font-medium uppercase tracking-[0.08em] text-[#57534E]">room volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={masterVolume}
            onChange={(e) => changeMaster(Number(e.target.value))}
            aria-label="Room volume"
            className="h-1 flex-1 accent-[#B4451C]"
          />
          <span className="w-8 text-right font-mono text-[13px] tabular-nums text-[#57534E]">
            {Math.round(masterVolume * 100)}
          </span>
        </div>

        <p className="mt-3 border-t border-[#E7E2DA] pt-3 text-[13px] leading-relaxed text-[#8A857D]">
          The sounds are made by this page as you listen — no recording, no download, nothing leaves the house.
        </p>
      </div>
    </BentoCard>
  );
}
