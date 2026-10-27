'use client';

/**
 * Relaxing nature sounds for the night watch — generated in the browser with
 * the Web Audio API, not downloaded.
 *
 * Why procedural: nothing to license, nothing to download, nothing to cache,
 * works offline on a demo laptop, and it never phones home. Each sound is a
 * small synth: filtered noise for the body, scheduled little events for the
 * texture (droplets, bird calls, crickets, fire crackle).
 */

export type SoundId = 'rain' | 'ocean' | 'forest' | 'night' | 'fire';

export interface SoundMeta {
  id: SoundId;
  label: string;
  glyph: string;
  hint: string;
}

export const SOUNDS: SoundMeta[] = [
  { id: 'rain', label: 'Rain', glyph: '🌧️', hint: 'steady rain on a window' },
  { id: 'ocean', label: 'Ocean', glyph: '🌊', hint: 'slow waves on a shore' },
  { id: 'forest', label: 'Forest', glyph: '🌲', hint: 'leaves and far-off birds' },
  { id: 'night', label: 'Night', glyph: '🌙', hint: 'crickets and a soft breeze' },
  { id: 'fire', label: 'Fireplace', glyph: '🔥', hint: 'embers and a warm crackle' },
];

interface Track {
  gain: GainNode;
  nodes: AudioNode[];
  stop: () => void;
}

function noiseBuffer(ctx: AudioContext, seconds: number, brown: boolean): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white;
    }
  }
  return buffer;
}

function loopNoise(
  ctx: AudioContext,
  destination: AudioNode,
  opts: { brown?: boolean; type?: BiquadFilterType; freq: number; q?: number; gain: number },
): { source: AudioBufferSourceNode; filter: BiquadFilterNode } {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, 4, opts.brown ?? false);
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = opts.type ?? 'lowpass';
  filter.frequency.value = opts.freq;
  filter.Q.value = opts.q ?? 0.7;

  const level = ctx.createGain();
  level.gain.value = opts.gain;

  source.connect(filter);
  filter.connect(level);
  level.connect(destination);
  source.start();

  return { source, filter };
}

/**
 * The mixer. One instance per page; tracks start and stop independently so a
 * muted sound is genuinely silent rather than "quiet".
 */
export class NatureSoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private tracks = new Map<SoundId, Track>();
  private timers = new Map<SoundId, number>();

  private ensure(): { ctx: AudioContext; master: GainNode } | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return { ctx: this.ctx, master: this.master! };
  }

  isPlaying(id: SoundId): boolean {
    return this.tracks.has(id);
  }

  /** Starts one sound. Calling it again for a playing sound is a no-op. */
  start(id: SoundId, volume: number): boolean {
    if (this.tracks.has(id)) return true;
    const made = this.ensure();
    if (!made) return false;
    const { ctx, master } = made;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);

    const nodes: AudioNode[] = [gain];
    let stop = () => {};

    switch (id) {
      case 'rain': {
        const { source, filter } = loopNoise(ctx, gain, {
          type: 'bandpass',
          freq: 1400,
          q: 0.5,
          gain: 0.32,
        });
        nodes.push(source, filter);
        // A second, lower layer keeps it from sounding like static.
        const { source: low } = loopNoise(ctx, gain, { brown: true, freq: 500, gain: 0.12 });
        nodes.push(low);
        // Droplets: tiny filtered clicks, irregular.
        const timer = window.setInterval(() => {
          if (ctx.state !== 'running') return;
          const click = ctx.createBufferSource();
          click.buffer = noiseBuffer(ctx, 0.05, false);
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 1800 + Math.random() * 2600;
          bp.Q.value = 8;
          const env = ctx.createGain();
          env.gain.setValueAtTime(0.0001, ctx.currentTime);
          env.gain.exponentialRampToValueAtTime(0.06 + Math.random() * 0.05, ctx.currentTime + 0.01);
          env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16);
          click.connect(bp);
          bp.connect(env);
          env.connect(gain);
          click.start();
          click.stop(ctx.currentTime + 0.2);
        }, 260);
        this.timers.set(id, timer);
        stop = () => window.clearInterval(timer);
        break;
      }
      case 'ocean': {
        const { source, filter } = loopNoise(ctx, gain, { brown: true, freq: 620, gain: 0.5 });
        nodes.push(source, filter);
        // The swell: a slow LFO on the filter and the level.
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.09;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 340;
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        const swell = ctx.createOscillator();
        swell.frequency.value = 0.09;
        const swellGain = ctx.createGain();
        swellGain.gain.value = 0.22;
        swell.connect(swellGain);
        swellGain.connect(gain.gain);
        lfo.start();
        swell.start();
        nodes.push(lfo, lfoGain, swell, swellGain);
        stop = () => {
          try {
            lfo.stop();
            swell.stop();
          } catch {
            /* already stopped */
          }
        };
        break;
      }
      case 'forest': {
        const { source, filter } = loopNoise(ctx, gain, {
          type: 'bandpass',
          freq: 900,
          q: 0.35,
          gain: 0.16,
        });
        nodes.push(source, filter);
        // Leaves: slow rustle from a gently modulated band.
        const rustle = ctx.createOscillator();
        rustle.frequency.value = 0.17;
        const rustleGain = ctx.createGain();
        rustleGain.gain.value = 0.05;
        rustle.connect(rustleGain);
        rustleGain.connect(gain.gain);
        rustle.start();
        nodes.push(rustle, rustleGain);
        // Birds: two-note whistles, now and then.
        const timer = window.setInterval(() => {
          if (ctx.state !== 'running' || Math.random() > 0.55) return;
          const base = 1600 + Math.random() * 1400;
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          const env = ctx.createGain();
          const t = ctx.currentTime;
          osc.frequency.setValueAtTime(base, t);
          osc.frequency.exponentialRampToValueAtTime(base * 1.5, t + 0.09);
          osc.frequency.exponentialRampToValueAtTime(base * 1.1, t + 0.2);
          env.gain.setValueAtTime(0.0001, t);
          env.gain.exponentialRampToValueAtTime(0.05, t + 0.03);
          env.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
          osc.connect(env);
          env.connect(gain);
          osc.start(t);
          osc.stop(t + 0.4);
        }, 2200);
        this.timers.set(id, timer);
        stop = () => window.clearInterval(timer);
        break;
      }
      case 'night': {
        const { source, filter } = loopNoise(ctx, gain, {
          type: 'lowpass',
          freq: 380,
          gain: 0.14,
        });
        nodes.push(source, filter);
        // Crickets: short high pulses in little groups.
        const timer = window.setInterval(() => {
          if (ctx.state !== 'running') return;
          const pulses = 3 + Math.floor(Math.random() * 4);
          for (let i = 0; i < pulses; i++) {
            const t = ctx.currentTime + i * 0.07;
            const osc = ctx.createOscillator();
            osc.type = 'square';
            osc.frequency.value = 4200 + Math.random() * 500;
            const env = ctx.createGain();
            env.gain.setValueAtTime(0.0001, t);
            env.gain.exponentialRampToValueAtTime(0.014, t + 0.005);
            env.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
            osc.connect(env);
            env.connect(gain);
            osc.start(t);
            osc.stop(t + 0.05);
          }
        }, 900);
        this.timers.set(id, timer);
        stop = () => window.clearInterval(timer);
        break;
      }
      case 'fire': {
        const { source, filter } = loopNoise(ctx, gain, { brown: true, freq: 300, gain: 0.3 });
        nodes.push(source, filter);
        // Crackle: sharp little bursts through a resonant filter.
        const timer = window.setInterval(() => {
          if (ctx.state !== 'running' || Math.random() > 0.7) return;
          const crack = ctx.createBufferSource();
          crack.buffer = noiseBuffer(ctx, 0.03, false);
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 900 + Math.random() * 2400;
          bp.Q.value = 3;
          const env = ctx.createGain();
          const t = ctx.currentTime;
          env.gain.setValueAtTime(0.0001, t);
          env.gain.exponentialRampToValueAtTime(0.1 + Math.random() * 0.08, t + 0.005);
          env.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
          crack.connect(bp);
          bp.connect(env);
          env.connect(gain);
          crack.start(t);
          crack.stop(t + 0.12);
        }, 420);
        this.timers.set(id, timer);
        stop = () => window.clearInterval(timer);
        break;
      }
    }

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 1.2);

    this.tracks.set(id, { gain, nodes, stop });
    return true;
  }

  stop(id: SoundId): void {
    const track = this.tracks.get(id);
    if (!track) return;
    this.tracks.delete(id);
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      window.clearInterval(timer);
      this.timers.delete(id);
    }
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    try {
      track.gain.gain.cancelScheduledValues(now);
      track.gain.gain.setValueAtTime(track.gain.gain.value, now);
      track.gain.gain.linearRampToValueAtTime(0.0001, now + 0.6);
    } catch {
      /* the context may already be closed */
    }
    window.setTimeout(() => {
      track.stop();
      for (const node of track.nodes) {
        try {
          (node as AudioScheduledSourceNode).stop?.();
        } catch {
          /* not a source */
        }
        try {
          node.disconnect();
        } catch {
          /* already disconnected */
        }
      }
      try {
        track.gain.disconnect();
      } catch {
        /* already disconnected */
      }
    }, 700);
  }

  setVolume(id: SoundId, volume: number): void {
    const track = this.tracks.get(id);
    if (!track || !this.ctx) return;
    const now = this.ctx.currentTime;
    track.gain.gain.cancelScheduledValues(now);
    track.gain.gain.setValueAtTime(track.gain.gain.value, now);
    track.gain.gain.linearRampToValueAtTime(volume, now + 0.25);
  }

  /** Stops everything — used when the page unmounts. */
  stopAll(): void {
    for (const id of [...this.tracks.keys()]) this.stop(id);
  }
}
