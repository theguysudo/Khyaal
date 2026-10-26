'use client';

/**
 * Talkback audio for the browser.
 *
 * Both sides of a Khayaal talkback speak the same wire format: signed 16-bit
 * little-endian PCM, mono, 16 000 Hz, base64-encoded in ~250 ms slices. The
 * phone records and plays that format natively, so the browser does the same
 * — one format, no transcoding, no codec surprises.
 *
 * The microphone is only ever opened after the other side has tapped Allow.
 */

export const TALKBACK_SAMPLE_RATE = 16000;
export const TALKBACK_MIME = 'audio/pcm;rate=16000';
/** ~250 ms of 16 kHz mono PCM16. */
export const TALKBACK_CHUNK_SAMPLES = 4000;

export function pcm16ToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(i * 2, samples[i], true); // little-endian
  }
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToPcm16(b64: string): Int16Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const out = new Int16Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true);
  return out;
}

/** Linear resample to 16 kHz — the browser's mic rate is whatever the hardware has. */
export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx] ?? 0;
    const b = input[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/**
 * Why the microphone could not be opened. Every one of these used to collapse
 * into a single "the microphone is blocked" message, which sent people to
 * their browser settings when the real cause was an unplugged headset.
 */
export type MicFailure =
  | 'insecure-context'
  | 'permission-denied'
  | 'no-device'
  | 'device-busy'
  | 'audio-unavailable'
  | 'unknown';

export interface MicStartResult {
  ok: boolean;
  reason?: MicFailure;
  /** The browser's own message, when it is worth showing. */
  detail?: string;
}

/** Maps a DOMException from getUserMedia onto something a human can act on. */
function classifyMicError(err: unknown): MicFailure {
  const name = (err as { name?: string })?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'permission-denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'no-device';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'device-busy';
    default:
      return 'unknown';
  }
}

function describeError(err: unknown): string | undefined {
  const e = err as { name?: string; message?: string } | undefined;
  if (!e) return undefined;
  if (e.name && e.message) return `${e.name}: ${e.message}`;
  return e.name ?? e.message;
}

/** The sentence shown to the family when the mic will not open. */
export function micFailureMessage(reason?: MicFailure, detail?: string): string {
  switch (reason) {
    case 'insecure-context':
      return 'This address cannot use the microphone — browsers only allow it on a secure origin. Open the dashboard on https:// or on localhost and try again.';
    case 'permission-denied':
      return 'Your browser blocked the microphone for this page. Allow it from the icon beside the address bar (or the site settings), then hold the button again.';
    case 'no-device':
      return 'No microphone was found on this device.';
    case 'device-busy':
      return 'Another app is using the microphone. Close it and try again.';
    case 'audio-unavailable':
      return 'This browser could not start its audio engine.';
    default:
      return detail
        ? `The microphone could not be opened (${detail}).`
        : 'The microphone could not be opened.';
  }
}

/**
 * Microphone capture. Produces base64 PCM16 slices at 16 kHz.
 * `onChunk` is called roughly every 250 ms while recording.
 */
export class MicCapture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private pending = new Float32Array(0);
  private running = false;

  get isRunning(): boolean {
    return this.running;
  }

  async start(onChunk: (base64: string) => void): Promise<MicStartResult> {
    if (this.running) return { ok: true };
    if (typeof window === 'undefined') return { ok: false, reason: 'audio-unavailable' };

    // The microphone only exists in a secure context. `http://localhost`
    // counts as one; a plain `http://192.168.x.x` LAN address does not, and
    // there is no permission prompt to fix it — the API is simply absent.
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      return { ok: false, reason: 'insecure-context' };
    }

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return { ok: false, reason: 'audio-unavailable' };

    // Open the audio context inside the click, before the first await: iOS
    // Safari refuses to resume a context created after the gesture ended.
    try {
      this.ctx = new Ctor();
      if (this.ctx.state === 'suspended') await this.ctx.resume();
    } catch (err) {
      this.stop();
      return { ok: false, reason: 'audio-unavailable', detail: describeError(err) };
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      this.stop();
      return { ok: false, reason: classifyMicError(err), detail: describeError(err) };
    }

    this.source = this.ctx.createMediaStreamSource(this.stream);
    // ScriptProcessor is deprecated but it is the one node that works
    // everywhere without shipping a separate worklet file.
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (event) => {
      if (!this.running || !this.ctx) return;
      const input = event.inputBuffer.getChannelData(0);
      const rate = this.ctx.sampleRate;
      const resampled = resample(input, rate, TALKBACK_SAMPLE_RATE);

      const merged = new Float32Array(this.pending.length + resampled.length);
      merged.set(this.pending, 0);
      merged.set(resampled, this.pending.length);

      let offset = 0;
      while (merged.length - offset >= TALKBACK_CHUNK_SAMPLES) {
        const slice = merged.subarray(offset, offset + TALKBACK_CHUNK_SAMPLES);
        const pcm = new Int16Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          const s = Math.max(-1, Math.min(1, slice[i]));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        onChunk(pcm16ToBase64(pcm));
        offset += TALKBACK_CHUNK_SAMPLES;
      }
      this.pending = merged.slice(offset);
    };

    this.source.connect(this.processor);
    // Route to the destination through a zero gain: the processor only runs
    // while it is connected, but we must not echo her microphone back.
    const mute = this.ctx.createGain();
    mute.gain.value = 0;
    this.processor.connect(mute);
    mute.connect(this.ctx.destination);

    // A context that came back suspended (some mobile browsers) would
    // capture silence; one more resume attempt here is cheap.
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* playback will report the problem; capture still opens */
      }
    }

    this.running = true;
    return { ok: true };
  }

  stop(): void {
    this.running = false;
    this.pending = new Float32Array(0);
    try {
      this.processor?.disconnect();
      this.source?.disconnect();
      this.stream?.getTracks().forEach((t) => t.stop());
      void this.ctx?.close();
    } catch {
      /* already torn down */
    }
    this.processor = null;
    this.source = null;
    this.stream = null;
    this.ctx = null;
  }
}

/** Plays base64 PCM16 slices as they arrive. */
export class PcmPlayer {
  private ctx: AudioContext | null = null;
  private queue: AudioBufferSourceNode[] = [];
  private nextAt = 0;

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  play(b64: string): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const samples = base64ToPcm16(b64);
    if (samples.length === 0) return;

    const buffer = ctx.createBuffer(1, samples.length, TALKBACK_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 0x8000;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    // Queue slices back to back so the conversation does not stutter.
    const now = ctx.currentTime;
    const startAt = Math.max(now + 0.02, this.nextAt);
    source.start(startAt);
    this.nextAt = startAt + buffer.duration;
    this.queue.push(source);
    if (this.queue.length > 40) {
      const old = this.queue.shift();
      try {
        old?.stop();
      } catch {
        /* already finished */
      }
    }
  }

  stop(): void {
    for (const source of this.queue) {
      try {
        source.stop();
      } catch {
        /* already finished */
      }
    }
    this.queue = [];
    this.nextAt = 0;
  }
}
