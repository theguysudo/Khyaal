import type {
  AppCommand,
  Baseline,
  CsiPoint,
  SensorPairRequest,
  DeviceAction,
  Household,
  HouseholdEvent,
  HouseholdState,
  KhayaalUser,
  Signal,
  Source,
  TalkbackChunk,
  TalkbackSession,
} from '@khayaal/shared';
import { decrypt, encrypt } from './crypto-box';
import { firebaseAccessToken } from './firebase-auth';
import type { Store } from './store';

/**
 * FirestoreStore — the persistence tier, free (Spark plan) and activated only
 * when FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (or
 * FIREBASE_SERVICE_ACCOUNT_JSON) are present. Talks to the Firestore REST API
 * with a service-account access token; no extra SDK dependency. Every layout
 * mirrors MemoryStore so the demo and prod behave identically.
 */

type FsValue =
  | { nullValue: null }
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { arrayValue: { values?: FsValue[] } }
  | { mapValue: { fields?: Record<string, FsValue> } };
type FsDoc = { fields?: Record<string, FsValue>; name?: string; createTime?: string };

const SCOPE = 'https://www.googleapis.com/auth/datastore';

let projectId = '';
let clientEmail = '';
let privateKey = '';

export function firestoreConfigured(): boolean {
  if (projectId) return true;
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (svc) {
    try {
      const parsed = JSON.parse(svc) as { project_id: string; client_email: string; private_key: string };
      projectId = parsed.project_id;
      clientEmail = parsed.client_email;
      privateKey = parsed.private_key.replace(/\\n/g, '\n');
    } catch {
      return false;
    }
  } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    projectId = process.env.FIREBASE_PROJECT_ID;
    clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  }
  return Boolean(projectId && clientEmail && privateKey);
}

const base = () => `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`;

async function call(
  path: string,
  init: { method?: string; body?: unknown; query?: string } = {},
): Promise<Response> {
  const token = await firebaseAccessToken(clientEmail, privateKey, SCOPE);
  const url = `${base()}/${path}${init.query ? `?${init.query}` : ''}`;
  return fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
}

// --- value codec -----------------------------------------------------------

function encode(value: unknown): FsValue {
  if (value === null || value === undefined) return { nullValue: null };
  switch (typeof value) {
    case 'string':
      return { stringValue: value };
    case 'boolean':
      return { booleanValue: value };
    case 'number':
      return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    case 'object':
      if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
      return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
    default:
      return { stringValue: String(value) };
  }
}

function encodeFields(obj: Record<string, unknown>): Record<string, FsValue> {
  const out: Record<string, FsValue> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[k] = encode(v);
  }
  return out;
}

function decode(v: FsValue): unknown {
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('arrayValue' in v) return (v.arrayValue?.values ?? []).map(decode);
  if ('mapValue' in v) return decodeFields(v.mapValue?.fields ?? {});
  return null;
}

function decodeFields(fields: Record<string, FsValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decode(v);
  return out;
}

const toDoc = (obj: unknown): { fields: Record<string, FsValue> } => ({
  fields: encodeFields(obj as Record<string, unknown>),
});

function fromDoc<T>(doc: FsDoc | null): T | null {
  if (!doc?.fields) return null;
  return decodeFields(doc.fields) as T;
}

function docId(doc: FsDoc | null): string | null {
  if (!doc?.name) return null;
  const parts = doc.name.split('/');
  return parts[parts.length - 1] ?? null;
}

async function getDoc<T>(path: string): Promise<T | null> {
  const res = await call(`documents/${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`firestore get ${path}: ${res.status}`);
  return fromDoc<T>((await res.json()) as FsDoc);
}

async function setDoc(path: string, obj: unknown): Promise<void> {
  const res = await call(`documents/${path}`, { method: 'PATCH', body: toDoc(obj) });
  if (!res.ok) throw new Error(`firestore set ${path}: ${res.status}`);
}

async function deleteDoc(path: string): Promise<void> {
  const res = await call(`documents/${path}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error(`firestore delete ${path}: ${res.status}`);
}

/** List a subcollection (up to `limit` docs, auto-paged once if needed). */
async function listDocs(collectionPath: string, limit = 300): Promise<{ id: string; data: Record<string, unknown> }[]> {
  const out: { id: string; data: Record<string, unknown> }[] = [];
  let pageToken: string | undefined;
  while (out.length < limit) {
    const q = new URLSearchParams({ pageSize: String(Math.min(limit - out.length, 300)) });
    if (pageToken) q.set('pageToken', pageToken);
    const res = await call(`documents/${collectionPath}`, { query: q.toString() });
    if (res.status === 404) return out;
    if (!res.ok) throw new Error(`firestore list ${collectionPath}: ${res.status}`);
    const json = (await res.json()) as { documents?: FsDoc[]; nextPageToken?: string };
    for (const d of json.documents ?? []) {
      const id = docId(d);
      if (id) out.push({ id, data: decodeFields(d.fields ?? {}) });
    }
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }
  return out;
}

/** Structured query on a single field (equality or >=), automatic index. */
async function runQuery(
  parent: string,
  collectionId: string,
  field: string,
  op: 'EQUAL' | 'GREATER_THAN_OR_EQUAL',
  value: unknown,
  limit: number,
): Promise<{ id: string; data: Record<string, unknown> }[]> {
  const body = {
    structuredQuery: {
      from: [{ collectionId }],
      where: {
        fieldFilter: {
          field: { fieldPath: field },
          op,
          value: encode(value),
        },
      },
      orderBy: [{ field: { fieldPath: field }, direction: 'ASCENDING' }],
      limit,
    },
  };
  const res = await call('documents:runQuery', { method: 'POST', body });
  if (!res.ok) throw new Error(`firestore query ${parent}/${collectionId}: ${res.status}`);
  const rows = (await res.json()) as { document?: FsDoc }[];
  const out: { id: string; data: Record<string, unknown> }[] = [];
  for (const row of rows) {
    if (!row.document) continue;
    const id = docId(row.document);
    if (id) out.push({ id, data: decodeFields(row.document.fields ?? {}) });
  }
  return out;
}

const hhPath = (id: string) => `households/${id}`;
const sub = (id: string, name: string) => `${hhPath(id)}/${name}`;

export class FirestoreStore implements Store {
  async createHousehold(hh: Household): Promise<void> {
    await setDoc(hhPath(hh.id), hh);
  }
  async getHousehold(id: string): Promise<Household | null> {
    return getDoc<Household>(hhPath(id));
  }
  async getHouseholdByPairingCode(code: string): Promise<Household | null> {
    const rows = await runQuery('', 'households', 'pairingCode', 'EQUAL', code, 1);
    return (rows[0]?.data as unknown as Household) ?? null;
  }
  async listHouseholds(): Promise<Household[]> {
    const rows = await listDocs('households', 100);
    return rows
      .map((r) => r.data as unknown as Household)
      .sort((a, b) => a.createdAtTs - b.createdAtTs);
  }
  async updateHousehold(id: string, patch: Partial<Household>): Promise<Household | null> {
    const cur = await this.getHousehold(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await setDoc(hhPath(id), next);
    return next;
  }

  async getUser(subId: string): Promise<KhayaalUser | null> {
    return getDoc<KhayaalUser>(`users/${subId}`);
  }
  async upsertUser(user: KhayaalUser): Promise<void> {
    await setDoc(`users/${user.sub}`, user);
  }
  async linkHouseholdToUser(subId: string, householdId: string): Promise<void> {
    // Upsert a stub user if the row doesn't exist yet — same as MemoryStore.
    let user = await this.getUser(subId);
    if (!user) {
      user = { sub: subId, email: '', name: 'Family', householdIds: [], createdAtTs: Date.now() };
      await this.upsertUser(user);
    }
    if (!user.householdIds.includes(householdId)) {
      await this.upsertUser({ ...user, householdIds: [...user.householdIds, householdId] });
    }
    const hh = await this.getHousehold(householdId);
    if (hh) {
      const owners = new Set(hh.ownerSubs ?? []);
      owners.add(subId);
      await setDoc(hhPath(householdId), { ...hh, ownerSubs: [...owners] });
    }
  }

  async addCommand(householdId: string, command: AppCommand): Promise<void> {
    await setDoc(`${sub(householdId, 'commands')}/${command.id}`, command);
  }
  async getCommands(householdId: string, limit = 50): Promise<AppCommand[]> {
    const rows = await listDocs(sub(householdId, 'commands'), limit);
    return rows
      .map((r) => r.data as unknown as AppCommand)
      .sort((a, b) => a.ts - b.ts)
      .slice(-limit);
  }
  async ackCommand(householdId: string, commandId: string, ackTs: number): Promise<void> {
    const path = `${sub(householdId, 'commands')}/${commandId}`;
    const cur = await getDoc<AppCommand>(path);
    if (cur) await setDoc(path, { ...cur, ackTs });
  }
  async clearCommands(householdId: string): Promise<void> {
    const rows = await listDocs(sub(householdId, 'commands'), 100);
    await Promise.all(rows.map((r) => deleteDoc(`${sub(householdId, 'commands')}/${r.id}`)));
  }

  async addDeviceToken(householdId: string, token: string): Promise<void> {
    await setDoc(`${sub(householdId, 'deviceTokens')}/${encodeURIComponent(token).slice(0, 200)}`, {
      token,
      addedTs: Date.now(),
    });
  }
  async removeDeviceToken(householdId: string, token: string): Promise<void> {
    await deleteDoc(`${sub(householdId, 'deviceTokens')}/${encodeURIComponent(token).slice(0, 200)}`);
  }
  async getDeviceTokens(householdId: string): Promise<string[]> {
    const rows = await listDocs(sub(householdId, 'deviceTokens'), 50);
    return rows.map((r) => String(r.data.token)).filter(Boolean);
  }

  async addWebPushSubscriber(householdId: string, sub_: unknown): Promise<void> {
    const endpoint =
      typeof sub_ === 'object' && sub_ !== null && 'endpoint' in sub_
        ? String((sub_ as { endpoint: unknown }).endpoint)
        : null;
    if (!endpoint) return;
    await setDoc(`${sub(householdId, 'webPushSubs')}/${encodeURIComponent(endpoint).slice(0, 200)}`, {
      sub: sub_ as Record<string, unknown>,
    });
  }
  async getWebPushSubscribers(householdId: string): Promise<unknown[]> {
    const rows = await listDocs(sub(householdId, 'webPushSubs'), 50);
    return rows.map((r) => r.data.sub);
  }

  async queueDeviceAction(householdId: string, sourceId: string, action: DeviceAction): Promise<void> {
    await call(`documents/sources/${encodeURIComponent(sourceId)}/actions`, {
      method: 'POST',
      body: toDoc({ ...action, queuedTs: Date.now() }),
    });
  }
  async drainDeviceActions(sourceId: string, via: 'lan' | 'usb'): Promise<DeviceAction[]> {
    const rows = await listDocs(`sources/${encodeURIComponent(sourceId)}/actions`, 50);
    const mine: DeviceAction[] = [];
    const mineIds: string[] = [];
    for (const r of rows) {
      const action = String(r.data.action);
      if (!action) continue;
      const channel = r.data.via === 'usb' ? 'usb' : 'lan';
      if (channel !== via) continue; // the other poller owns this one
      mine.push({
        action: action as DeviceAction['action'],
        ...(r.data.payload ? { payload: r.data.payload as Record<string, unknown> } : {}),
        via: channel,
      });
      mineIds.push(r.id);
    }
    // Only this channel's actions are taken; the rest stay queued for the
    // other poller.
    await Promise.all(
      mineIds.map((id) =>
        deleteDoc(`sources/${encodeURIComponent(sourceId)}/actions/${id}`).catch(() => undefined),
      ),
    );
    return mine;
  }

  async putDeviceScan(sourceId: string, networks: unknown): Promise<void> {
    await setDoc(`devicedata/${encodeURIComponent(sourceId)}-scan`, { data: networks, ts: Date.now() });
  }
  async getDeviceScan(sourceId: string): Promise<unknown | null> {
    const doc = await getDoc<{ data: unknown; ts: number }>(`devicedata/${encodeURIComponent(sourceId)}-scan`);
    if (!doc || Date.now() - doc.ts > 120_000) return null;
    return doc.data;
  }
  async putDeviceStatus(sourceId: string, status: unknown): Promise<void> {
    await setDoc(`devicedata/${encodeURIComponent(sourceId)}-status`, { data: status, ts: Date.now() });
  }
  async getDeviceStatus(sourceId: string): Promise<unknown | null> {
    const doc = await getDoc<{ data: unknown; ts: number }>(`devicedata/${encodeURIComponent(sourceId)}-status`);
    if (!doc || Date.now() - doc.ts > 600_000) return null;
    return doc.data;
  }
  async noteRelaySeen(sourceId: string): Promise<void> {
    await setDoc(`devicedata/${encodeURIComponent(sourceId)}-relay`, {
      data: { seenTs: Date.now() },
      ts: Date.now(),
    });
  }
  async getRelaySeen(sourceId: string): Promise<number | null> {
    const doc = await getDoc<{ data: { seenTs: number }; ts: number }>(
      `devicedata/${encodeURIComponent(sourceId)}-relay`,
    );
    if (!doc) return null;
    return doc.data?.seenTs ?? null;
  }

  // -- Talkback ---------------------------------------------------------------

  async createTalkbackSession(session: TalkbackSession): Promise<TalkbackSession> {
    await setDoc(`${sub(session.householdId, 'talkbackSessions')}/${session.id}`, session);
    return session;
  }
  async getTalkbackSession(householdId: string, sessionId: string): Promise<TalkbackSession | null> {
    return getDoc<TalkbackSession>(`${sub(householdId, 'talkbackSessions')}/${sessionId}`);
  }
  async getLatestTalkbackSession(householdId: string): Promise<TalkbackSession | null> {
    const rows = await listDocs(sub(householdId, 'talkbackSessions'), 50);
    const sessions = rows
      .map((r) => r.data as unknown as TalkbackSession)
      .filter((s) => s && typeof s.createdTs === 'number')
      .sort((a, b) => b.createdTs - a.createdTs);
    return sessions[0] ?? null;
  }
  async updateTalkbackSession(
    householdId: string,
    sessionId: string,
    patch: Partial<TalkbackSession>,
  ): Promise<TalkbackSession | null> {
    const path = `${sub(householdId, 'talkbackSessions')}/${sessionId}`;
    const cur = await getDoc<TalkbackSession>(path);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    await setDoc(path, next);
    return next;
  }
  async appendTalkbackChunk(
    householdId: string,
    sessionId: string,
    chunk: Omit<TalkbackChunk, 'seq'>,
  ): Promise<TalkbackChunk> {
    const base = `${sub(householdId, 'talkbackChunks')}/${sessionId}`;
    const rows = await listDocs(base, 400);
    const seq = rows.reduce((max, r) => Math.max(max, Number(r.data.seq ?? 0)), 0) + 1;
    const next = { ...chunk, seq };
    await setDoc(`${base}/${seq}`, next);
    return next;
  }
  async getTalkbackChunks(
    householdId: string,
    sessionId: string,
    afterSeq: number,
  ): Promise<TalkbackChunk[]> {
    const rows = await listDocs(`${sub(householdId, 'talkbackChunks')}/${sessionId}`, 400);
    return rows
      .map((r) => r.data as unknown as TalkbackChunk)
      .filter((c) => c && typeof c.seq === 'number' && c.seq > afterSeq)
      .sort((a, b) => a.seq - b.seq);
  }
  async deleteTalkbackChunks(householdId: string, sessionId: string): Promise<void> {
    // Audio is transient: when the session ends the slices are deleted, not
    // just hidden from readers.
    const base = `${sub(householdId, 'talkbackChunks')}/${sessionId}`;
    const rows = await listDocs(base, 400);
    await Promise.all(
      rows.map((r) => deleteDoc(`${base}/${r.id}`).catch(() => undefined)),
    );
  }

  async appendSignal(householdId: string, signal: Signal): Promise<void> {
    const res = await call(`documents/${sub(householdId, 'signals')}`, {
      method: 'POST',
      body: toDoc({ env: encrypt(JSON.stringify(signal)) }),
    });
    if (!res.ok) throw new Error(`firestore appendSignal: ${res.status}`);
    // Trim beyond ~7 days / 5000 docs, same retention as MemoryStore.
    const old = await runQuery(sub(householdId, ''), 'signals', 'ts', 'GREATER_THAN_OR_EQUAL', 0, 300);
    const cutoff = signal.ts - 7 * 24 * 3600_000;
    const stale = old.filter((r) => Number(r.data.ts) < cutoff).slice(0, 50);
    if (old.length > 4900) stale.push(...old.slice(0, 100));
    await Promise.all(
      stale.map((r) => deleteDoc(`${sub(householdId, 'signals')}/${r.id}`).catch(() => undefined)),
    );
  }
  async getSignals(householdId: string, sinceTs: number): Promise<Signal[]> {
    const rows = await runQuery(sub(householdId, ''), 'signals', 'ts', 'GREATER_THAN_OR_EQUAL', sinceTs, 2000);
    return rows
      .map((r) => {
        const plain = decrypt(String(r.data.env ?? ''));
        return plain ? (JSON.parse(plain) as Signal) : null;
      })
      .filter((s): s is Signal => s !== null);
  }
  async clearSignals(householdId: string): Promise<void> {
    const rows = await listDocs(sub(householdId, 'signals'), 300);
    await Promise.all(rows.map((r) => deleteDoc(`${sub(householdId, 'signals')}/${r.id}`).catch(() => undefined)));
  }

  async appendCsi(householdId: string, point: CsiPoint): Promise<void> {
    const res = await call(`documents/${sub(householdId, 'csi')}`, {
      method: 'POST',
      body: toDoc({ env: encrypt(JSON.stringify(point)) }),
    });
    if (!res.ok) throw new Error(`firestore appendCsi: ${res.status}`);
    // Keep the last ~30 minutes, matching MemoryStore.
    const rows = await runQuery(sub(householdId, ''), 'csi', 'ts', 'GREATER_THAN_OR_EQUAL', 0, 300);
    const stale = rows.slice(0, Math.max(0, rows.length - 1500));
    await Promise.all(
      stale.map((r) => deleteDoc(`${sub(householdId, 'csi')}/${r.id}`).catch(() => undefined)),
    );
  }
  async getCsi(
    householdId: string,
    sinceTs: number,
    limit = 900,
  ): Promise<CsiPoint[]> {
    const rows = await runQuery(sub(householdId, ''), 'csi', 'ts', 'GREATER_THAN_OR_EQUAL', sinceTs, 2000);
    return rows
      .map((r) => {
        const plain = decrypt(String(r.data.env ?? ''));
        return plain ? (JSON.parse(plain) as CsiPoint) : null;
      })
      .filter((p): p is CsiPoint => p !== null)
      .slice(-limit);
  }

  async putSensorPairRequest(householdId: string, request: SensorPairRequest): Promise<void> {
    await setDoc(`${sub(householdId, 'meta')}/pair-request`, request);
  }
  async getSensorPairRequest(householdId: string): Promise<SensorPairRequest | null> {
    return getDoc<SensorPairRequest>(`${sub(householdId, 'meta')}/pair-request`);
  }

  async getState(householdId: string): Promise<HouseholdState | null> {
    return getDoc<HouseholdState>(`${sub(householdId, 'meta')}/state`);
  }
  async setState(householdId: string, state: HouseholdState): Promise<void> {
    await setDoc(`${sub(householdId, 'meta')}/state`, state);
  }

  async appendEvent(householdId: string, event: HouseholdEvent): Promise<void> {
    await call(`documents/${sub(householdId, 'events')}`, { method: 'POST', body: toDoc(event) });
  }
  async getEvents(householdId: string, sinceTs: number, limit = 100): Promise<HouseholdEvent[]> {
    const rows = await runQuery(sub(householdId, ''), 'events', 'ts', 'GREATER_THAN_OR_EQUAL', sinceTs, limit);
    return rows.map((r) => r.data as unknown as HouseholdEvent).slice(-limit);
  }
  async clearEvents(householdId: string): Promise<void> {
    const rows = await listDocs(sub(householdId, 'events'), 300);
    await Promise.all(rows.map((r) => deleteDoc(`${sub(householdId, 'events')}/${r.id}`).catch(() => undefined)));
  }

  async getSources(householdId: string): Promise<Source[]> {
    const rows = await listDocs(sub(householdId, 'sources'), 50);
    return rows.map((r) => r.data as unknown as Source);
  }
  async addSource(householdId: string, source: Source): Promise<void> {
    await setDoc(`${sub(householdId, 'sources')}/${encodeURIComponent(source.id)}`, source);
  }
  async deleteSource(householdId: string, sourceId: string): Promise<void> {
    await deleteDoc(`${sub(householdId, 'sources')}/${encodeURIComponent(sourceId)}`);
  }
  async touchSource(householdId: string, sourceId: string, ts: number): Promise<void> {
    const cur = await getDoc<Source>(`${sub(householdId, 'sources')}/${encodeURIComponent(sourceId)}`);
    if (cur) await setDoc(`${sub(householdId, 'sources')}/${encodeURIComponent(sourceId)}`, { ...cur, lastSeenTs: ts });
  }
  async findSource(householdId: string, sourceId: string): Promise<Source | null> {
    return getDoc<Source>(`${sub(householdId, 'sources')}/${encodeURIComponent(sourceId)}`);
  }

  async getBaseline(householdId: string): Promise<Baseline | null> {
    return getDoc<Baseline>(`${sub(householdId, 'meta')}/baseline`);
  }
  async setBaseline(householdId: string, baseline: Baseline): Promise<void> {
    await setDoc(`${sub(householdId, 'meta')}/baseline`, baseline);
  }
}
