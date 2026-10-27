import type {
  Baseline,
  Household,
  HouseholdEvent,
  HouseholdState,
  Signal,
  Source,
} from '@khayaal/shared';

/**
 * One storage interface, two implementations:
 *  - MemoryStore: default, zero-config — powers the local demo instantly.
 *  - FirestoreStore: activates when FIREBASE_* env vars are set (see lib/server/firestore.ts).
 * The Android client (Phase 2) never talks to storage directly — only to /api/v1.
 */
export interface Store {
  // households
  createHousehold(hh: Household): Promise<void>;
  getHousehold(id: string): Promise<Household | null>;
  getHouseholdByPairingCode(code: string): Promise<Household | null>;
  listHouseholds(): Promise<Household[]>;
  updateHousehold(id: string, patch: Partial<Household>): Promise<Household | null>;

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
  signals: Map<string, Signal[]>;
  states: Map<string, HouseholdState>;
  events: Map<string, HouseholdEvent[]>;
  sources: Map<string, Source[]>;
  baselines: Map<string, Baseline>;
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

  async appendSignal(householdId: string, signal: Signal): Promise<void> {
    const list = db().signals.get(householdId) ?? [];
    list.push(signal);
    // Retain ~7 days.
    const cutoff = signal.ts - 7 * 24 * 3600_000;
    db().signals.set(householdId, list.filter((s) => s.ts >= cutoff).slice(-5000));
  }
  async getSignals(householdId: string, sinceTs: number): Promise<Signal[]> {
    return (db().signals.get(householdId) ?? []).filter((s) => s.ts >= sinceTs);
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
  if (!store) store = new MemoryStore();
  return store;
}
