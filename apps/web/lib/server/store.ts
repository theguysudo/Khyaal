import type {
  AppCommand,
  Baseline,
  DeviceAction,
  Household,
  HouseholdEvent,
  HouseholdState,
  KhayaalUser,
  Signal,
  Source,
} from '@khayaal/shared';
import { decrypt, encrypt } from './crypto-box';
import { FirestoreStore, firestoreConfigured } from './firestore';

/**
 * One storage interface, two implementations:
 *  - MemoryStore: default, zero-config — powers the local demo instantly.
 *  - FirestoreStore: activates when FIREBASE_* env vars are set (see lib/server/firestore.ts).
 * The Android client (Phase 2) never talks to storage directly — only to /api/v1.
 * Stored signals are AES-256-GCM encrypted at rest (lib/server/crypto-box.ts).
 */
export interface Store {
  // households
  createHousehold(hh: Household): Promise<void>;
  getHousehold(id: string): Promise<Household | null>;
  getHouseholdByPairingCode(code: string): Promise<Household | null>;
  listHouseholds(): Promise<Household[]>;
  updateHousehold(id: string, patch: Partial<Household>): Promise<Household | null>;

  // users (family sign-ins)
  getUser(sub: string): Promise<KhayaalUser | null>;
  upsertUser(user: KhayaalUser): Promise<void>;
  linkHouseholdToUser(sub: string, householdId: string): Promise<void>;

  // commands (family → app nudges)
  addCommand(householdId: string, command: AppCommand): Promise<void>;
  getCommands(householdId: string, limit?: number): Promise<AppCommand[]>;
  ackCommand(householdId: string, commandId: string, ackTs: number): Promise<void>;
  clearCommands(householdId: string): Promise<void>;

  // device tokens (FCM)
  addDeviceToken(householdId: string, token: string): Promise<void>;
  removeDeviceToken(householdId: string, token: string): Promise<void>;
  getDeviceTokens(householdId: string): Promise<string[]>;

  // browser push (VAPID)
  addWebPushSubscriber(householdId: string, sub: unknown): Promise<void>;
  getWebPushSubscribers(householdId: string): Promise<unknown[]>;

  // device actions (dashboard → sensor control, e.g. 'falltest', 'wifi_connect')
  queueDeviceAction(householdId: string, sourceId: string, action: DeviceAction): Promise<void>;
  drainDeviceActions(sourceId: string): Promise<DeviceAction[]>;

  // device-reported Wi-Fi data (scan results, connection status)
  putDeviceScan(sourceId: string, networks: unknown): Promise<void>;
  getDeviceScan(sourceId: string): Promise<unknown | null>;
  putDeviceStatus(sourceId: string, status: unknown): Promise<void>;
  getDeviceStatus(sourceId: string): Promise<unknown | null>;

  // signals
  appendSignal(householdId: string, signal: Signal): Promise<void>;
  getSignals(householdId: string, sinceTs: number): Promise<Signal[]>;
  clearSignals(householdId: string): Promise<void>;

  // state
  getState(householdId: string): Promise<HouseholdState | null>;
  setState(householdId: string, state: HouseholdState): Promise<void>;

  // events (audit log)
  appendEvent(householdId: string, event: HouseholdEvent): Promise<void>;
  getEvents(householdId: string, sinceTs: number, limit?: number): Promise<HouseholdEvent[]>;
  clearEvents(householdId: string): Promise<void>;

  // sources
  getSources(householdId: string): Promise<Source[]>;
  addSource(householdId: string, source: Source): Promise<void>;
  deleteSource(householdId: string, sourceId: string): Promise<void>;
  touchSource(householdId: string, sourceId: string, ts: number): Promise<void>;
  findSource(householdId: string, sourceId: string): Promise<Source | null>;

  // baseline
  getBaseline(householdId: string): Promise<Baseline | null>;
  setBaseline(householdId: string, baseline: Baseline): Promise<void>;
}

// ---------------------------------------------------------------------------
// MemoryStore — module-level singleton, survives across requests in one
// server process. Perfect for the demo; swap to Firestore for persistence.
// ---------------------------------------------------------------------------

interface MemoryDb {
  households: Map<string, Household>;
  signals: Map<string, string[]>; // AES-256-GCM envelopes, never plaintext
  states: Map<string, HouseholdState>;
  events: Map<string, HouseholdEvent[]>;
  sources: Map<string, Source[]>;
  baselines: Map<string, Baseline>;
  users: Map<string, KhayaalUser>;
  commands: Map<string, AppCommand[]>;
  deviceTokens: Map<string, string[]>;
  webPushSubs: Map<string, unknown[]>;
  deviceActions: Map<string, DeviceAction[]>; // keyed by sourceId
  deviceScan: Map<string, { data: unknown; ts: number }>;
  deviceStatus: Map<string, { data: unknown; ts: number }>;
}

const g = globalThis as unknown as { __khayaalDb?: MemoryDb };

function db(): MemoryDb {
  if (!g.__khayaalDb) {
    g.__khayaalDb = {
      households: new Map(),
      signals: new Map(),
      states: new Map(),
      events: new Map(),
      sources: new Map(),
      baselines: new Map(),
      users: new Map(),
      commands: new Map(),
      deviceTokens: new Map(),
      webPushSubs: new Map(),
      deviceActions: new Map(),
      deviceScan: new Map(),
      deviceStatus: new Map(),
    };
  }
  return g.__khayaalDb;
}

export class MemoryStore implements Store {
  async createHousehold(hh: Household): Promise<void> {
    db().households.set(hh.id, { ...hh });
  }
  async getHousehold(id: string): Promise<Household | null> {
    return db().households.get(id) ?? null;
  }
  async getHouseholdByPairingCode(code: string): Promise<Household | null> {
    for (const hh of db().households.values()) if (hh.pairingCode === code) return hh;
    return null;
  }
  async listHouseholds(): Promise<Household[]> {
    return [...db().households.values()].sort((a, b) => a.createdAtTs - b.createdAtTs);
  }
  async updateHousehold(id: string, patch: Partial<Household>): Promise<Household | null> {
    const cur = db().households.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    db().households.set(id, next);
    return next;
  }

  async getUser(sub: string): Promise<KhayaalUser | null> {
    return db().users.get(sub) ?? null;
  }
  async upsertUser(user: KhayaalUser): Promise<void> {
    db().users.set(user.sub, { ...user });
  }
  async linkHouseholdToUser(sub: string, householdId: string): Promise<void> {
    // A session may exist before its user row (forged/test sessions, transfer
    // edge cases) — create a stub so the link is never silently lost.
    const existing = db().users.get(sub);
    const user: KhayaalUser = existing ?? {
      sub,
      email: '',
      name: 'Family',
      householdIds: [],
      createdAtTs: Date.now(),
    };
    if (!user.householdIds.includes(householdId)) {
      user.householdIds = [...user.householdIds, householdId];
    }
    db().users.set(sub, user);
    const hh = db().households.get(householdId);
    if (hh) {
      const ownerSubs = new Set(hh.ownerSubs ?? []);
      ownerSubs.add(sub);
      db().households.set(householdId, { ...hh, ownerSubs: [...ownerSubs] });
    }
  }

  async addCommand(householdId: string, command: AppCommand): Promise<void> {
    const list = db().commands.get(householdId) ?? [];
    db().commands.set(householdId, [...list, command].slice(-50));
  }
  async getCommands(householdId: string, limit = 50): Promise<AppCommand[]> {
    return (db().commands.get(householdId) ?? []).slice(-limit);
  }
  async ackCommand(householdId: string, commandId: string, ackTs: number): Promise<void> {
    const list = db().commands.get(householdId) ?? [];
    db().commands.set(
      householdId,
      list.map((c) => (c.id === commandId ? { ...c, ackTs } : c)),
    );
  }
  async clearCommands(householdId: string): Promise<void> {
    db().commands.set(householdId, []);
  }

  async addDeviceToken(householdId: string, token: string): Promise<void> {
    const t = db().deviceTokens.get(householdId) ?? [];
    db().deviceTokens.set(householdId, [...new Set([...t, token])].slice(-20));
  }
  async removeDeviceToken(householdId: string, token: string): Promise<void> {
    const t = db().deviceTokens.get(householdId) ?? [];
    db().deviceTokens.set(householdId, t.filter((x) => x !== token));
  }
  async getDeviceTokens(householdId: string): Promise<string[]> {
    return db().deviceTokens.get(householdId) ?? [];
  }

  async addWebPushSubscriber(householdId: string, sub: unknown): Promise<void> {
    const list = db().webPushSubs.get(householdId) ?? [];
    const endpoint =
      typeof sub === 'object' && sub !== null && 'endpoint' in sub
        ? String((sub as { endpoint: unknown }).endpoint)
        : null;
    if (!endpoint) return; // a subscription without an endpoint cannot receive anything
    const rest = list.filter(
      (s) =>
        !(typeof s === 'object' && s !== null && 'endpoint' in s &&
          String((s as { endpoint: unknown }).endpoint) === endpoint),
    );
    db().webPushSubs.set(householdId, [...rest, sub].slice(-10));
  }
  async getWebPushSubscribers(householdId: string): Promise<unknown[]> {
    return db().webPushSubs.get(householdId) ?? [];
  }

  async queueDeviceAction(householdId: string, sourceId: string, action: DeviceAction): Promise<void> {
    const list = db().deviceActions.get(sourceId) ?? [];
    db().deviceActions.set(sourceId, [...list, action].slice(-10));
  }
  async drainDeviceActions(sourceId: string): Promise<DeviceAction[]> {
    const list = db().deviceActions.get(sourceId) ?? [];
    db().deviceActions.set(sourceId, []);
    return list;
  }

  async putDeviceScan(sourceId: string, networks: unknown): Promise<void> {
    db().deviceScan.set(sourceId, { data: networks, ts: Date.now() });
  }
  async getDeviceScan(sourceId: string): Promise<unknown | null> {
    const hit = db().deviceScan.get(sourceId);
    if (!hit || Date.now() - hit.ts > 120_000) return null; // results go stale after 2 min
    return hit.data;
  }
  async putDeviceStatus(sourceId: string, status: unknown): Promise<void> {
    db().deviceStatus.set(sourceId, { data: status, ts: Date.now() });
  }
  async getDeviceStatus(sourceId: string): Promise<unknown | null> {
    const hit = db().deviceStatus.get(sourceId);
    if (!hit || Date.now() - hit.ts > 600_000) return null;
    return hit.data;
  }

  async appendSignal(householdId: string, signal: Signal): Promise<void> {
    const list = db().signals.get(householdId) ?? [];
    // AES-256-GCM at rest — the heap only ever holds ciphertext envelopes.
    list.push(encrypt(JSON.stringify(signal)));
    // Retain ~7 days.
    const cutoff = signal.ts - 7 * 24 * 3600_000;
    db().signals.set(
      householdId,
      list
        .filter((env) => {
          const plain = decrypt(env);
          return plain ? (JSON.parse(plain) as Signal).ts >= cutoff : false;
        })
        .slice(-5000),
    );
  }
  async getSignals(householdId: string, sinceTs: number): Promise<Signal[]> {
    return (db().signals.get(householdId) ?? [])
      .map((env) => {
        const plain = decrypt(env);
        return plain ? (JSON.parse(plain) as Signal) : null;
      })
      .filter((s): s is Signal => s !== null && s.ts >= sinceTs);
  }
  async clearSignals(householdId: string): Promise<void> {
    db().signals.set(householdId, []);
  }

  async getState(householdId: string): Promise<HouseholdState | null> {
    return db().states.get(householdId) ?? null;
  }
  async setState(householdId: string, state: HouseholdState): Promise<void> {
    db().states.set(householdId, state);
  }

  async appendEvent(householdId: string, event: HouseholdEvent): Promise<void> {
    const list = db().events.get(householdId) ?? [];
    list.push(event);
    db().events.set(householdId, list.slice(-500));
  }
  async getEvents(householdId: string, sinceTs: number, limit = 100): Promise<HouseholdEvent[]> {
    return (db().events.get(householdId) ?? []).filter((e) => e.ts >= sinceTs).slice(-limit);
  }
  async clearEvents(householdId: string): Promise<void> {
    db().events.set(householdId, []);
  }

  async getSources(householdId: string): Promise<Source[]> {
    return db().sources.get(householdId) ?? [];
  }
  async addSource(householdId: string, source: Source): Promise<void> {
    const list = db().sources.get(householdId) ?? [];
    db().sources.set(householdId, [...list.filter((s) => s.id !== source.id), source]);
  }
  async deleteSource(householdId: string, sourceId: string): Promise<void> {
    const list = db().sources.get(householdId) ?? [];
    db().sources.set(householdId, list.filter((s) => s.id !== sourceId));
  }
  async touchSource(householdId: string, sourceId: string, ts: number): Promise<void> {
    await this.updateSource(householdId, sourceId, (s) => ({ ...s, lastSeenTs: ts }));
  }
  async findSource(householdId: string, sourceId: string): Promise<Source | null> {
    return (db().sources.get(householdId) ?? []).find((s) => s.id === sourceId) ?? null;
  }

  private async updateSource(
    householdId: string,
    sourceId: string,
    fn: (s: Source) => Source,
  ): Promise<void> {
    const list = db().sources.get(householdId) ?? [];
    db().sources.set(householdId, list.map((s) => (s.id === sourceId ? fn(s) : s)));
  }

  async getBaseline(householdId: string): Promise<Baseline | null> {
    return db().baselines.get(householdId) ?? null;
  }
  async setBaseline(householdId: string, baseline: Baseline): Promise<void> {
    db().baselines.set(householdId, baseline);
  }
}

let store: Store | null = null;

/** Memory by default; Firestore when configured. One instance per process. */
export function getStore(): Store {
  if (!store) store = firestoreConfigured() ? new FirestoreStore() : new MemoryStore();
  return store;
}
