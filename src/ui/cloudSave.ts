/**
 * Cloud saves: the signed-in account's save, kept in Firestore (one document, saves/{uid}) so it carries to any
 * device. Only that account can read or write it (see firestore.rules).
 *
 * While signed in, the save goes up every UPLOAD_EVERY seconds when it has changed, and whenever the app is put away.
 * At sign-in, at start-up and on coming back to the app, the cloud copy is checked: if another device has saved since
 * this one last synced, the player picks which save to keep (a brand-new game on this device just takes the cloud's).
 * Nothing is overwritten without asking.
 *
 * This device remembers which account it last synced with, and the cloud save's time then (`LINK_KEY`), to tell its
 * own uploads from another device's.
 */
import { Preferences } from '@capacitor/preferences';
import { Game } from '../core/game';
import { areaDef } from '../core/balance';
import { deserialize, serialize, type GameState } from '../core/state';
import { currentUser, firebaseApp, onAccountChange } from './account';

/** Seconds between uploads while playing (only when the save has changed): once an hour, plus whenever the app is put away. */
const UPLOAD_EVERY = 3600;
/** A game this new (seconds played, no Regression yet) takes the cloud save without asking. */
const FRESH_GAME_SEC = 300;
const LINK_KEY = 'pocket-hunter-cloud-link';

/** What the pop-up shows of a save: enough to tell two apart. */
export interface SaveSummary {
  level: number;
  area: string;
  regressions: number;
  played: number;
  savedAt: number;
}

export type CloudStatus = { state: 'off' } | { state: 'syncing' } | { state: 'saved'; at: number } | { state: 'error' };

interface Hooks {
  /** The game's live save. */
  state: () => GameState;
  /** Swaps in another save (the game reloads with it). */
  replace: (s: GameState) => Promise<void>;
  /** Asks which save to keep. */
  choose: (device: SaveSummary, cloud: SaveSummary) => Promise<'device' | 'cloud'>;
}

let hooks: Hooks | null = null;
/** Signed in and synced: uploads may go ahead (for this account). */
let linkedUid: string | null = null;
let lastUpload = 0;
let lastUploaded = '';
let syncing: Promise<void> | null = null;
let status: CloudStatus = { state: 'off' };
const listeners = new Set<() => void>();

function setStatus(s: CloudStatus): void {
  status = s;
  for (const f of listeners) f();
}

/** The cloud save's state, for the Account page. */
export function cloudStatus(): CloudStatus {
  return status;
}

export function onCloudChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function summarize(s: GameState, savedAt: number): SaveSummary {
  let level = 1;
  try {
    level = new Game(deserialize(serialize(s))!).levelOf('main');
  } catch {
    // A summary is only for show.
  }
  return { level, area: areaDef(s.area).name, regressions: s.regression.runs, played: s.stats.played, savedAt };
}

async function readLink(): Promise<{ uid: string; syncedAt: number } | null> {
  try {
    const { value } = await Preferences.get({ key: LINK_KEY });
    return value ? (JSON.parse(value) as { uid: string; syncedAt: number }) : null;
  } catch {
    return null;
  }
}

async function writeLink(uid: string, syncedAt: number): Promise<void> {
  await Preferences.set({ key: LINK_KEY, value: JSON.stringify({ uid, syncedAt }) }).catch(() => {});
}

async function store() {
  const [app, fs] = await Promise.all([firebaseApp(), import('firebase/firestore')]);
  return { fs, db: fs.getFirestore(app) };
}

/** Puts this device's save in the cloud (and remembers it as synced). */
async function upload(uid: string): Promise<void> {
  const s = hooks!.state();
  const data = serialize(s);
  const savedAt = Date.now();
  const { fs, db } = await store();
  await fs.setDoc(fs.doc(db, 'saves', uid), {
    data,
    savedAt,
    updatedAt: fs.serverTimestamp(),
    summary: summarize(s, savedAt),
  });
  lastUpload = performance.now();
  lastUploaded = data;
  await writeLink(uid, savedAt);
  setStatus({ state: 'saved', at: savedAt });
}

/** Checks the cloud copy against this device's, and settles which one carries on (see the module note). */
async function sync(uid: string): Promise<void> {
  if (!hooks) return;
  setStatus({ state: 'syncing' });
  try {
    const { fs, db } = await store();
    const snap = await fs.getDoc(fs.doc(db, 'saves', uid));
    if (currentUser()?.uid !== uid) return;
    const link = await readLink();
    if (!snap.exists()) {
      // Nothing in the cloud yet: this device's save goes up.
      linkedUid = uid;
      await upload(uid);
      return;
    }
    const d = snap.data() as { data: string; savedAt: number };
    if (link?.uid === uid && link.syncedAt >= d.savedAt) {
      // The cloud holds what this device last synced: carry on from here.
      linkedUid = uid;
      setStatus({ state: 'saved', at: d.savedAt });
      return;
    }
    // Another device has saved since (or this device has never synced with this account).
    const cloud = deserialize(d.data);
    if (!cloud) {
      linkedUid = uid;
      await upload(uid);
      return;
    }
    const mine = hooks.state();
    const fresh = mine.stats.played < FRESH_GAME_SEC && mine.regression.runs === 0;
    const pick = fresh ? 'cloud' : await hooks.choose(summarize(mine, mine.lastSeen), summarize(cloud, d.savedAt));
    if (currentUser()?.uid !== uid) return;
    if (pick === 'cloud') {
      await writeLink(uid, d.savedAt);
      await hooks.replace(cloud);
      return;
    }
    linkedUid = uid;
    await upload(uid);
  } catch {
    setStatus({ state: 'error' });
  }
}

/** Runs one sync at a time. */
function syncNow(uid: string): Promise<void> {
  syncing ??= sync(uid).finally(() => (syncing = null));
  return syncing;
}

/**
 * Starts cloud saves: syncs whenever an account signs in (or is restored at start-up), and stops uploading when it
 * signs out.
 */
export function initCloudSave(h: Hooks): void {
  hooks = h;
  let seen: string | null = null;
  const check = () => {
    const u = currentUser();
    const uid = u && !u.uid.startsWith('dev-') ? u.uid : null;
    if (uid === seen) return;
    seen = uid;
    linkedUid = null;
    lastUploaded = '';
    if (uid) void syncNow(uid);
    else setStatus({ state: 'off' });
  };
  onAccountChange(check);
  check();
}

/** On each autosave: uploads now and then while signed in and synced (only when the save has changed). */
export function cloudAutosave(): void {
  if (!linkedUid || syncing || performance.now() - lastUpload < UPLOAD_EVERY * 1000) return;
  pushNow();
}

/** The app is being put away: uploads straight away (if signed in, synced and changed). */
export function cloudPutAway(): void {
  if (linkedUid && !syncing) pushNow();
}

/** Back in the app: checks whether another device saved meanwhile. */
export function cloudResume(): void {
  if (linkedUid) void syncNow(linkedUid);
}

/** Account page → Save now. */
export function cloudSaveNow(): Promise<void> {
  const uid = linkedUid ?? (currentUser() && !currentUser()!.uid.startsWith('dev-') ? currentUser()!.uid : null);
  if (!uid) return Promise.resolve();
  if (!linkedUid) return syncNow(uid);
  return upload(uid).catch(() => setStatus({ state: 'error' }));
}

function pushNow(): void {
  const uid = linkedUid!;
  if (serialize(hooks!.state()) === lastUploaded) return;
  lastUpload = performance.now();
  void upload(uid).catch(() => setStatus({ state: 'error' }));
}
