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
  | 'presence' // ESP32 Wi-Fi sensing: 'motion' | 'idle' | 'lost' | 'fall'
  | 'manual_checkin' // parent tapped "I'm OK"
  | 'sleep_event' // on-device classifier: 'asleep' | 'awake' | 'restless' | 'woke'
  | 'sound_event'; // on-device loudness: 'quiet' | 'noise' | 'loud' — never audio

export type SignalValue = number | string | boolean;

export interface Signal {
  sourceId: string;
  type: SignalType;
  value: SignalValue;
  ts: number; // epoch ms, already in simulation time
}

/** Dashboard → device control, relayed over the tunnel. */
export interface DeviceAction {
  action: 'falltest' | 'recheck' | 'wifi_scan' | 'wifi_connect' | 'wififorget';
  payload?: Record<string, unknown>; // e.g. { ssid, password } for wifi_connect
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
  /** Neighbours & family who can check in — tier 3 alerts them too. */
  careCircle?: CareCircleMember[];
  /** Escalation extras: call the elder, then loop in the circle. */
  callPlan?: { callElderAfterMin: number; alertCircleAfterMin: number };
  /** Last saved LLM behaviour analysis. */
  lastAnalysis?: { ts: number; model: string; text: string };
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
  'presence',
  'manual_checkin',
  'sleep_event',
  'sound_event',
];

export function isSignalType(v: unknown): v is SignalType {
  return typeof v === 'string' && (SIGNAL_TYPES as readonly string[]).includes(v);
}

export function isSignalValue(v: unknown): v is SignalValue {
  return typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean';
}

export function parseIngest(body: unknown): Signal | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.sourceId !== 'string' || !b.sourceId) return null;
  if (!isSignalType(b.type)) return null;
  if (!isSignalValue(b.value)) return null;
  const ts = typeof b.ts === 'number' ? b.ts : Date.now();
  if (!Number.isFinite(ts)) return null;
  return { sourceId: b.sourceId, type: b.type, value: b.value, ts };
}
