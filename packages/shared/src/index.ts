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
  | 'manual_checkin' // parent tapped "I'm OK"
  | 'sleep_event' // on-device classifier: 'asleep' | 'awake' | 'restless' | 'woke'
  | 'sound_event'; // on-device loudness: 'quiet' | 'noise' | 'loud' — never audio

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

export type Tier = 0 | 1 | 2 | 3;

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
}

export type EventType = 'tier_change' | 'checkin' | 'ack' | 'snooze' | 'note';

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
  type: 'phone' | 'esp32' | 'simulator';
  label: string;
  apiKey: string;
  createdAtTs: number;
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
  'manual_checkin',
  'sleep_event',
  'sound_event',
];

/** Longest numeric vector allowed in a signal's detail bag. */
export const MAX_META_VECTOR = 32;

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
  const ts = typeof b.ts === 'number' ? b.ts : Date.now();
  if (!Number.isFinite(ts)) return null;
  const meta = sanitizeSignalMeta(b.meta);
  return { sourceId: b.sourceId, type: b.type, value: b.value, ts, ...(meta ? { meta } : {}) };
}
