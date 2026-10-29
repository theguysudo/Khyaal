/**
 * Khayaal shared types — the single contract used by the engine, the API
 * routes, the web app and (later) the Android client. No framework imports.
 */

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

export type SignalType =
  | 'screen_event' // unlock / screen-on / app open
  | 'steps' // step count delta
  | 'motion' // accelerometer activity
  | 'charging' // phone on charger (true) or off (false)
  | 'app_usage' // an app was opened (name only, never content)
  | 'location_zone' // 'home' | 'away' — presence, never a trail
  | 'gps_motion' // GPS-derived movement — distance/speed, never coordinates
  | 'presence' // ESP32 Wi-Fi sensing: 'motion' | 'idle' | 'lost' | 'fall'
  | 'csi' // ESP32 CSI scalars: variance/mean/rate — never raw subcarriers
  | 'ir_reflective' // ESP32 IR beam: 'detected' | 'clear' — near-field only
  | 'manual_checkin' // parent tapped "I'm OK"
  | 'sleep_event' // on-device classifier: 'asleep' | 'awake' | 'restless' | 'woke'
  | 'sound_event' // on-device loudness: 'quiet' | 'noise' | 'loud' — never audio
  | 'heart_rate' // smartwatch pulse in bpm — a number, never a waveform
  | 'sleep_duration' // smartwatch sleep minutes for one night
  | 'activity' // smartwatch active minutes in the interval that ended at ts
  // emergency — the alarm channel. Values: 'pressed' | 'responded' |
  // 'resolved' | 'withdrawn' (a responder standing back down so the next
  // neighbour is visibly still needed).
  | 'sos';

export type SignalValue = number | string | boolean;

/** One primitive in a signal's detail bag, or a short vector of numbers. */
export type SignalMetaValue = string | number | boolean | number[];

export interface Signal {
  sourceId: string;
  type: SignalType;
  value: SignalValue;
  ts: number; // epoch ms, already in simulation time
  /**
   * Optional privacy-safe detail bag — numbers, strings, booleans and short
   * numeric vectors only. Used by signals that need a little more shape than
   * a single primitive (gps_motion carries distance/speed/accuracy here;
   * csi carries a batch of variance readings). Never free-form content,
   * never coordinates, never raw CSI.
   */
  meta?: Record<string, SignalMetaValue>;
}

/** Dashboard → device control, relayed over the tunnel. */
export interface DeviceAction {
  action: 'falltest' | 'recheck' | 'wifi_scan' | 'wifi_connect' | 'wififorget';
  payload?: Record<string, unknown>; // e.g. { ssid, password } for wifi_connect
  /**
   * Which transport may run this action.
   *  - 'lan'  → the sensor itself, over Wi-Fi (it polls /device/actions).
   *  - 'usb'  → the Mac-side USB relay, which types the command over serial.
   * Actions are channel-separated because two pollers share one queue: the
   * board must not swallow a Wi-Fi action it cannot execute over Wi-Fi.
   */
  via?: 'lan' | 'usb';
}

// ---------------------------------------------------------------------------
// Household & configuration
// ---------------------------------------------------------------------------

export interface QuietHours {
  start: number; // hour of day 0-23, inclusive
  end: number; // hour of day 0-23, exclusive (may wrap midnight)
}

export interface EscalationConfig {
  nudgeAfterMin: number; // time in a raised-score band before tier 1
  checkInAfterMin: number; // dwell in tier 1 before tier 2
  alertAfterMin: number; // dwell in tier 2 before tier 3
}

export interface Household {
  id: string;
  parentName: string;
  childName: string;
  childIds: string[];
  pairingCode: string; // 6-digit code the parent app enters
  quietHours: QuietHours;
  escalationConfig: EscalationConfig;
  /** Demo time-warp: simulated now = real now + offset. 0 in normal use. */
  simTimeOffsetMs: number;
  /** Before this (sim) timestamp the engine deliberately scores nothing. */
  learningUntilTs: number;
  createdAtTs: number;
  /** Google-account subjects linked to this family (the child side). */
  ownerSubs?: string[];
  /** True for the throwaway household behind the /demo console. */
  isDemo?: boolean;
  /** Neighbours & family who can check in — tier 3 alerts them too. */
  careCircle?: CareCircleMember[];
  /** Escalation extras: call the elder, then loop in the circle. */
  callPlan?: { callElderAfterMin: number; alertCircleAfterMin: number };
  /** Last saved LLM behaviour analysis. */
  lastAnalysis?: { ts: number; model: string; text: string };
  /** The room sensor's floor plan — rooms and where each sensor sits. */
  blueprint?: Blueprint;
  /**
   * Coordination: minutes an SOS may sit with nobody responding before the
   * engine fires its next escalation beat (re-dispatch + explicit family
   * notice). Absent = the engine default (5).
   */
  neighbourRespondWindowMin?: number;
}

export interface CareCircleMember {
  name: string;
  email: string;
  phone?: string; // for the on-device auto-dial call chain
  role: 'family' | 'neighbor';
  addedTs: number;
}

/** A one-way family→app nudge composed on the dashboard. */
export interface AppCommand {
  id: string;
  ts: number;
  type: 'message' | 'reminder' | 'tts' | 'request_checkin';
  text: string;
  lang?: 'hi' | 'en'; // TTS language for spoken reminders
  ackTs: number | null;
}

/**
 * One-click sensor pairing. The dashboard mints the source and stores this
 * request; the laptop-side USB relay picks it up (it already polls the
 * household's device channel) and types the identity into the board over its
 * serial port. The key rides the household's own authenticated channel —
 * readable only by a source of the same family.
 */
export interface SensorPairRequest {
  householdId: string;
  sourceId: string;
  apiKey: string;
  ts: number;
}

/** A signed-in family member (Google OIDC profile + linked households). */
export interface KhayaalUser {
  sub: string; // Google subject id
  email: string;
  name: string;
  picture?: string;
  householdIds: string[];
  createdAtTs: number;
}

export const TIER_THRESHOLDS = { 1: 35, 2: 55, 3: 72 } as const;

/** Which free LLM backend answers. All of them speak the same chat shape. */
export type LlmProvider = 'openrouter' | 'minimax' | 'nvidia' | 'xai';

// ---------------------------------------------------------------------------
// Blueprint — the room sensor's floor plan
// ---------------------------------------------------------------------------

/**
 * A room on the blueprint. Coordinates are percentages of the blueprint box
 * (0..100) so the same layout renders at any card size.
 */
export interface BlueprintRoom {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A sensor placed on the blueprint. `sourceId` ties the anchor to a paired
 * ESP32 or phone; the room it sits in decides which room lights up when that
 * sensor reports motion.
 */
export interface BlueprintAnchor {
  sourceId: string;
  label: string;
  roomId: string | null;
  x: number;
  y: number;
}

export interface Blueprint {
  rooms: BlueprintRoom[];
  anchors: BlueprintAnchor[];
  updatedTs: number;
  source: 'manual' | 'llm';
}

/** One reading from the CSI stream, as the dashboard sees it. */
export interface CsiPoint {
  ts: number;
  /** Slow-window variance — the number the fall/motion rules use. */
  v: number;
  /** Fast-window variance — a ~0.25 s view, so a hand wave shows up at once. */
  f: number;
  /** The device's own motion threshold, in the same units as `v`. */
  thr: number;
  /** Presence state at the moment of the reading. */
  state: string;
  /** 1 when the reflective IR beam sees an object (near-field only). */
  ir?: number;
  sourceId: string;
  /** The slow-window readings in this batch (one per 250 ms). */
  samples?: number[];
  /** The fast-window readings in this batch. */
  fast?: number[];
}

/** A state change on the CSI stream — the "something happened" line. */
export interface CsiEvent {
  ts: number;
  sourceId: string;
  kind: 'motion' | 'idle' | 'fall' | 'lost';
  label: string;
}

/** A sensor's current standing on the blueprint. */
export interface CsiAnchor {
  sourceId: string;
  label: string;
  roomId: string | null;
  x: number;
  y: number;
  /** 0..1 — how strongly this sensor is seeing motion right now. */
  level: number;
  state: string;
  lastMotionTs: number | null;
}

/** Where the room sensors say the movement is, and how sure we are. */
export interface CsiEstimate {
  x: number;
  y: number;
  confidence: number;
  sourceId: string | null;
}

// ---------------------------------------------------------------------------
// Talkback — a consent-first walkie-talkie between family and parent
// ---------------------------------------------------------------------------

/** Who is speaking. The two sides of a talkback session. */
export type TalkbackRole = 'family' | 'parent';

export type TalkbackState =
  | 'pending' // request sent, waiting for the other side to allow
  | 'active' // both sides allowed — audio flows
  | 'declined' // the other side said no
  | 'ended'; // finished by either side

export interface TalkbackSession {
  id: string;
  householdId: string;
  /** Who asked for the conversation. */
  requester: TalkbackRole;
  requesterName: string;
  /** The side being asked — the consent popup lands here. */
  callee: TalkbackRole;
  state: TalkbackState;
  createdTs: number;
  answeredTs: number | null;
  endedTs: number | null;
  /** True once the callee has allowed the microphone to open. */
  consentGiven: boolean;
}

/** One slice of a talkback conversation (~250 ms of compressed audio). */
export interface TalkbackChunk {
  /** Monotonic per session; the receiver asks for everything after its last seq. */
  seq: number;
  ts: number;
  /** Audio mime, e.g. 'audio/webm;codecs=opus' or 'audio/l16;rate=16000'. */
  mime: string;
  /** Base64 payload. */
  data: string;
  /** Which side produced it. */
  from: TalkbackRole;
}

// ---------------------------------------------------------------------------
// Baseline — the learned "ordinary" for one parent
// ---------------------------------------------------------------------------

export interface Baseline {
  wakeHour: number; // decimal local hour of typical first unlock
  chargingStartHour: number; // decimal local hour the phone usually goes on charge
  dailyMotionCount: number; // typical motion events per day
  sampleDays: number; // how many days of data back this stands on
  updatedAt: number;
  /**
   * Median nightly sleep, learned from a smartwatch — absent until a band has
   * reported at least two nights. Optional on purpose: a baseline written
   * before the band existed must still load.
   */
  sleepMinutes?: number;
  /** How many nights the sleep figure is based on. */
  sleepNights?: number;
}

// ---------------------------------------------------------------------------
// Risk engine output
// ---------------------------------------------------------------------------

export interface Contribution {
  signal: string; // which stream produced this
  weight: number; // max possible effect for this stream
  effect: number; // actual points contributed
  reason: string; // plain language, shown to the family
}

export type Tier = 0 | 1 | 2 | 3 | 4;

export interface RiskResult {
  score: number | null; // null during the learning window
  tier: Tier;
  contributions: Contribution[];
  confidence: number; // 0.4 - 1
  learning: boolean;
  notes: string[]; // engine remarks that are not score-changing
}

// ---------------------------------------------------------------------------
// State, events, sources
// ---------------------------------------------------------------------------

export interface TrendPoint {
  ts: number;
  score: number;
}

export interface Ack {
  by: string;
  ts: number;
}

/**
 * The SOS state — the one state that is allowed to be loud.
 *
 * `active` is true from the moment the elder presses the button (or the
 * ladder's last step times out) until somebody stands it down. `ack` holds
 * the primary responder — the first person who said "I'm responding" and has
 * not stood back down. The phones ring from this flag; the dashboard paints
 * from it; everything else is detail.
 *
 * Coordination (additive, so older stored states load unchanged): every
 * responder of the CURRENT sos is tracked, first-is-primary, later ones
 * join. While nobody active has responded past the response window, the
 * `unanswered` block is set and the engine emits an escalation beat
 * (re-dispatch + explicit family-circle notice) per elapsed window, capped.
 */
export interface SosResponder {
  /** The responder's source id — stable identity, display name is `by`. */
  sourceId: string;
  by: string;
  /** When they first said "I'm responding" (sim time). */
  respondedTs: number;
  /** Their stated minutes-away, when they gave one. */
  etaMin: number | null;
  /** When they stood back down — null while they are still responding. */
  withdrawnTs: number | null;
}

export interface SosUnanswered {
  /** Escalation beats fired so far for this unanswered stretch (capped). */
  attempts: number;
  /** The response window in minutes that governs this countdown. */
  windowMin: number;
  /** When the responder team last became empty (= the clock restarted). */
  emptySinceTs: number;
  /** When the latest beat fired — null before the first one. */
  lastEscalationTs: number | null;
}

export interface SosState {
  active: boolean;
  origin: 'button' | 'auto' | null;
  sinceTs: number | null;
  ack: Ack | null;
  /** Everyone who responded to this sos, in join order. Absent on old states. */
  responders?: SosResponder[];
  /** Set while the sos is active with nobody responding. */
  unanswered?: SosUnanswered | null;
}

export interface HouseholdState {
  score: number | null;
  tier: Tier;
  status: string;
  contributions: Contribution[];
  confidence: number;
  lastActiveTs: number | null;
  tierSinceTs: number;
  updatedTs: number;
  scoreTrend: TrendPoint[];
  snoozeUntilTs: number | null;
  ack: Ack | null;
  learning: boolean;
  sos: SosState;
}

export type EventType = 'tier_change' | 'checkin' | 'ack' | 'snooze' | 'note' | 'sos';

export interface HouseholdEvent {
  id: string;
  ts: number;
  type: EventType;
  from?: Tier;
  to?: Tier;
  meta?: string;
}

export interface Source {
  id: string;
  /**
   * What kind of device this is. `smartwatch` is the wearable family: a
   * Fastrack band or any other wrist device that syncs its steps, pulse,
   * sleep and activity through the phone. It reports — it never decides.
   */
  type: 'phone' | 'esp32' | 'simulator' | 'smartwatch' | 'neighbour';
  label: string;
  apiKey: string;
  createdAtTs: number;
  lastSeenTs: number | null;
}

/**
 * The wearable's latest reading, as the family sees it.
 *
 * Aggregates and a last-active time — never a live feed, never a
 * heart-rate trace. This is the whole surface of the band on the dashboard.
 */
export interface SmartwatchSummary {
  /** True when a smartwatch source is paired. */
  paired: boolean;
  sourceId: string | null;
  label: string | null;
  /** Steps the band counted today. */
  stepsToday: number | null;
  /** The band's pulse at its last reading, in bpm. */
  heartRateBpm: number | null;
  heartRateTs: number | null;
  /** Minutes of sleep in the last night the band recorded. */
  sleepMinutesLastNight: number | null;
  sleepTs: number | null;
  /** Active minutes the band counted today. */
  activeMinutesToday: number | null;
  activityTs: number | null;
  /** When the band last reported anything at all. */
  lastSeenTs: number | null;
}

// ---------------------------------------------------------------------------
// Validation (hand-rolled — keeps the dependency tree honest)
// ---------------------------------------------------------------------------

export const SIGNAL_TYPES: readonly SignalType[] = [
  'screen_event',
  'steps',
  'motion',
  'charging',
  'app_usage',
  'location_zone',
  'gps_motion',
  'presence',
  'csi',
  'ir_reflective',
  'manual_checkin',
  'sleep_event',
  'sound_event',
  'heart_rate',
  'sleep_duration',
  'activity',
  'sos',
];

/** Longest numeric vector allowed in a signal's detail bag. */
export const MAX_META_VECTOR = 32;

/**
 * Longest string a signal's `value` may be.
 *
 * Every legitimate value is a short enum — 'motion', 'idle', 'home', 'away',
 * 'unlock', 'asleep', 'quiet', 'ok' — and the same 64-character bound the
 * detail bag uses. A long value is a memory weapon (F-7) and a
 * prompt-injection surface (F-6), never telemetry.
 */
export const MAX_SIGNAL_VALUE_CHARS = 64;

/**
 * The one explicit exemption.
 *
 * `app_usage` carries the name of the app that was opened, and the Android
 * app reports the full package name (the platform allows up to 255
 * characters). It is still bounded, and still far too short to be a payload.
 */
export const MAX_APP_USAGE_VALUE_CHARS = 128;

const VALUE_CHAR_LIMITS: Partial<Record<SignalType, number>> = {
  app_usage: MAX_APP_USAGE_VALUE_CHARS,
};

/** The string-length ceiling for this signal type's value. */
export function maxSignalValueChars(type: SignalType): number {
  return VALUE_CHAR_LIMITS[type] ?? MAX_SIGNAL_VALUE_CHARS;
}

export function isSignalType(v: unknown): v is SignalType {
  return typeof v === 'string' && (SIGNAL_TYPES as readonly string[]).includes(v);
}

export function isSignalValue(v: unknown): v is SignalValue {
  return typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean';
}

/**
 * Keeps the optional detail bag small and primitive. Anything else — nested
 * objects, long strings, oversized vectors — is dropped rather than stored,
 * so a signal can never smuggle content into the encrypted-at-rest store.
 *
 * The one exception is a short vector of finite numbers (MAX_META_VECTOR),
 * which the CSI stream uses to carry a batch of variance readings in one
 * request instead of one request per reading.
 */
export function sanitizeSignalMeta(
  meta: unknown,
): Record<string, SignalMetaValue> | undefined {
  if (typeof meta !== 'object' || meta === null) return undefined;
  const out: Record<string, SignalMetaValue> = {};
  let count = 0;
  for (const [key, value] of Object.entries(meta as Record<string, unknown>)) {
    if (count >= 8) break;
    if (!/^[a-zA-Z0-9_]{1,24}$/.test(key)) continue;
    if (typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
    else if (typeof value === 'string' && value.length <= 64) out[key] = value;
    else if (Array.isArray(value)) {
      const vec = value.filter(
        (v): v is number => typeof v === 'number' && Number.isFinite(v),
      );
      if (vec.length > 0 && vec.length <= MAX_META_VECTOR) out[key] = vec.slice(0, MAX_META_VECTOR);
      else continue;
    } else continue;
    count++;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function parseIngest(body: unknown): Signal | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.sourceId !== 'string' || !b.sourceId) return null;
  if (!isSignalType(b.type)) return null;
  if (!isSignalValue(b.value)) return null;
  // A device-stamped clock can be wrong or hostile: a timestamp days in the
  // future would otherwise shove every real signal out of the retention
  // window on arrival. Five minutes of slack covers honest clock skew.
  const now = Date.now();
  const ts = typeof b.ts === 'number' ? b.ts : now;
  if (!Number.isFinite(ts) || ts > now + 5 * 60_000) return null;
  // A two-megabyte string in a signal is a memory weapon, not telemetry,
  // and a long one is also a prompt-injection surface. Every legitimate
  // value is a short enum; app_usage (the Android package name) holds the
  // one explicit, still-bounded exemption.
  const value = typeof b.value === 'string'
    ? b.value.slice(0, maxSignalValueChars(b.type))
    : b.value;
  const meta = sanitizeSignalMeta(b.meta);
  return { sourceId: b.sourceId, type: b.type, value, ts, ...(meta ? { meta } : {}) };
}
