/* MiMai — stockage local (README §16-17) : SQLite sur l'appareil.
   Schéma : conversations, messages, memories, documents, training_examples,
   training_runs, adapters, settings, net_log, crashes.
   Les contenus sensibles sont chiffrés au repos via services/crypto.ts
   (AES-256-GCM, clé dans SecureStore → Android Keystore ; en Expo Go, repli
   sans chiffrement, signalé dans l'écran Confidentialité). */
import * as SQLite from 'expo-sqlite';
import { encryptText, decryptText } from './crypto';
import type { BenchSnapshot } from './bench';

export type Role = 'user' | 'ai';
export interface Msg { id: string; role: Role; text: string; ts: number; source?: string | null; model?: string | null; feedback?: 'good' | 'bad' | null; image?: string | null; }
/* mode et modèle sont FIXÉS à la création de la discussion : on ne change pas de moteur en cours de route */
export interface Conv { id: string; title: string; ts: number; trainFlag: 'yes' | 'no' | 'memory'; msgs: Msg[]; mode?: string; model?: string; }
export interface Memory { id: string; text: string; kind: 'préférence' | 'fait' | 'style'; ts: number; enabled: boolean; }
export interface Doc { id: string; name: string; type: string; sizeMb: number; addedAt: number; text: string; indexed: boolean; chunks?: Chunk[]; }
export interface Chunk { i: number; text: string; page: string; }
export interface TEx { id: string; q: string; base: string; target: string; tags: string[]; ts: number; src: 'seed' | 'conv' | 'manual'; }
export interface Run { id: string; name: string; startedAt: number; finishedAt?: number | null; status: 'running' | 'pass' | 'fail'; progress: number; styleScore?: number; generalScore?: number; }
export interface Adapter { id: string; v: number; name: string; createdAt: number; active: boolean; examples: number; styleScore: number; generalScore: number; rules: string[]; }
export interface NetEntry { t: number; ev: string; }
export interface CrashEntry { t: number; msg: string; stack: string; }
export interface Settings {
  onboarded: boolean; installed: string[]; activeModel: string; mode: 'rapide' | 'reflexion' | 'vision' | 'outils';
  wifiOnly: boolean; speed?: Record<string, number>; compat?: boolean; crashSeen?: number;
  /* un moteur d'IA par fonction (Rapide, Réflexion, Outils, Vision) ; sans choix : le modèle actif */
  modeModels?: Partial<Record<'rapide' | 'reflexion' | 'outils' | 'vision', string>>; voice?: { id?: string | null; rate: number; pitch: number }; gameReset?: boolean; memOn: boolean; encrypt: boolean; threshold: number; netUntil?: number | null;
  comp: { on: boolean; overlay: boolean; read: boolean; voice: boolean; speak?: boolean; bar?: boolean };
}
export interface AppData {
  convs: Conv[]; docs: Doc[]; memories: Memory[]; tex: TEx[]; runs: Run[]; adapters: Adapter[];
  settings: Settings; netLog: NetEntry[]; crashes: CrashEntry[];
  /* instantanés de benchmark (vitesse + qualité mesurées), avant/après chaque entraînement ou pris à la main */
  benches: BenchSnapshot[];
}

export const uid = (p = 'x') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function freshData(): AppData {
  /* Aucun contenu préchargé : l'app démarre vide, l'utilisateur crée tout.
     Aucun compte : pas de données d'identité du tout (README §1, ADR-002). */
  return {
    convs: [],
    docs: [],
    memories: [],
    tex: [],
    runs: [],
    adapters: [],
    benches: [],
    netLog: [],
    crashes: [],
    settings: {
      onboarded: false, installed: [], activeModel: 'qwen05b', mode: 'rapide',
      wifiOnly: false, memOn: true, encrypt: true, threshold: 8, netUntil: null,
      comp: { on: false, overlay: true, read: true, voice: false, speak: false },
    },
  };
}

/* ─────────── base SQLite ─────────── */
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, title TEXT, ts INTEGER, train_flag TEXT);
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conv_id TEXT, role TEXT, text_enc TEXT, ts INTEGER, source TEXT, model TEXT, feedback TEXT, image TEXT);
CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, text_enc TEXT, kind TEXT, ts INTEGER, enabled INTEGER);
CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, name TEXT, type TEXT, size_mb REAL, added_at INTEGER, text_enc TEXT, indexed INTEGER);
CREATE TABLE IF NOT EXISTS training_examples (id TEXT PRIMARY KEY, q_enc TEXT, base_enc TEXT, target_enc TEXT, tags TEXT, ts INTEGER, src TEXT);
CREATE TABLE IF NOT EXISTS training_runs (id TEXT PRIMARY KEY, name TEXT, started_at INTEGER, finished_at INTEGER, status TEXT, progress REAL, style REAL, general REAL);
CREATE TABLE IF NOT EXISTS adapters (id TEXT PRIMARY KEY, v INTEGER, name TEXT, created_at INTEGER, active INTEGER, examples INTEGER, style REAL, general REAL, rules TEXT);
CREATE TABLE IF NOT EXISTS benches (id TEXT PRIMARY KEY, ts INTEGER, json TEXT);
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS net_log (t INTEGER, ev TEXT);
CREATE TABLE IF NOT EXISTS crashes (t INTEGER, msg TEXT, stack TEXT);
`;
const TABLES = ['conversations', 'messages', 'memories', 'documents', 'training_examples', 'training_runs', 'adapters', 'benches', 'settings', 'net_log', 'crashes'];

export function openDb(): Promise<SQLite.SQLiteDatabase> {
  if (!opening) {
    opening = (async () => {
      const d = await SQLite.openDatabaseAsync('mimai.db');
      /* secure_delete : les lignes supprimées sont écrasées sur le disque */
      await d.execAsync('PRAGMA secure_delete = ON; PRAGMA journal_mode = WAL;');
      await d.execAsync(SCHEMA);
      /* bases créées avant la vision : colonne de la photo jointe (ignorée si elle existe déjà) */
      await d.execAsync('ALTER TABLE messages ADD COLUMN image TEXT').catch(() => { /* déjà présente */ });
      await d.execAsync('ALTER TABLE conversations ADD COLUMN mode TEXT').catch(() => { /* déjà présente */ });
      await d.execAsync('ALTER TABLE conversations ADD COLUMN model TEXT').catch(() => { /* déjà présente */ });
      return d;
    })().catch(err => { opening = null; throw err; });
  }
  return opening;
}

/* Empreintes de la dernière version écrite/lue de chaque ligne : permet de ne
   réécrire (et rechiffrer) que ce qui a changé, et de supprimer en base ce que
   l'utilisateur a supprimé dans l'app. Seules les lignes connues sont supprimées :
   une ligne illisible (clé perdue…) n'est jamais effacée par erreur. */
const saved = new Map<string, string>();
const keyOf = (table: string, id: string) => table + ':' + id;

const parseJson = <T,>(s: string, fallback: T): T => { try { return JSON.parse(s) as T; } catch { return fallback; } };
async function tryDecrypt(box: string): Promise<string | null> {
  try { return await decryptText(box); } catch { return null; }
}
const fpDoc = (x: Doc) => JSON.stringify({ ...x, chunks: undefined });
type MsgRow = { m: Msg; convId: string };
const fpMsg = (r: MsgRow) => JSON.stringify(r);
const fpConv = (c: Conv) => JSON.stringify({ ...c, msgs: undefined });

export async function loadAll(): Promise<AppData> {
  const d = await openDb();
  const data = freshData();
  saved.clear();
  try {
    const convs = await d.getAllAsync<{ id: string; title: string; ts: number; train_flag: string; mode: string | null; model: string | null }>('SELECT * FROM conversations ORDER BY ts DESC');
    for (const c of convs) {
      const rows = await d.getAllAsync<{ id: string; role: Role; text_enc: string; ts: number; source: string | null; model: string | null; feedback: string | null; image: string | null }>(
        'SELECT * FROM messages WHERE conv_id = ? ORDER BY ts', [c.id]);
      const msgs: Msg[] = [];
      for (const r of rows) {
        const text = await tryDecrypt(r.text_enc);
        if (text === null) continue;
        const m: Msg = { id: r.id, role: r.role, text, ts: r.ts, source: r.source, model: r.model, feedback: (r.feedback as Msg['feedback']) || null, image: r.image || null };
        msgs.push(m);
        saved.set(keyOf('messages', m.id), fpMsg({ m, convId: c.id }));
      }
      const conv: Conv = { id: c.id, title: c.title, ts: c.ts, trainFlag: c.train_flag as Conv['trainFlag'], msgs, mode: c.mode || undefined, model: c.model || undefined };
      data.convs.push(conv);
      saved.set(keyOf('conversations', c.id), fpConv(conv));
    }
    const mems = await d.getAllAsync<{ id: string; text_enc: string; kind: Memory['kind']; ts: number; enabled: number }>('SELECT * FROM memories ORDER BY ts DESC');
    for (const r of mems) {
      const text = await tryDecrypt(r.text_enc);
      if (text === null) continue;
      const m: Memory = { id: r.id, text, kind: r.kind, ts: r.ts, enabled: !!r.enabled };
      data.memories.push(m);
      saved.set(keyOf('memories', m.id), JSON.stringify(m));
    }
    const docs = await d.getAllAsync<{ id: string; name: string; type: string; size_mb: number; added_at: number; text_enc: string; indexed: number }>('SELECT * FROM documents ORDER BY added_at DESC');
    for (const r of docs) {
      const text = await tryDecrypt(r.text_enc);
      if (text === null) continue;
      const x: Doc = { id: r.id, name: r.name, type: r.type, sizeMb: r.size_mb, addedAt: r.added_at, text, indexed: !!r.indexed };
      data.docs.push(x);
      saved.set(keyOf('documents', x.id), fpDoc(x));
    }
    const texs = await d.getAllAsync<{ id: string; q_enc: string; base_enc: string; target_enc: string; tags: string; ts: number; src: TEx['src'] }>('SELECT * FROM training_examples ORDER BY ts');
    for (const r of texs) {
      const [q, base, target] = [await tryDecrypt(r.q_enc), await tryDecrypt(r.base_enc), await tryDecrypt(r.target_enc)];
      if (q === null || base === null || target === null) continue;
      const t: TEx = { id: r.id, q, base, target, tags: parseJson<string[]>(r.tags, []), ts: r.ts, src: r.src };
      data.tex.push(t);
      saved.set(keyOf('training_examples', t.id), JSON.stringify(t));
    }
    const runs = await d.getAllAsync<{ id: string; name: string; started_at: number; finished_at: number | null; status: Run['status']; progress: number; style: number | null; general: number | null }>('SELECT * FROM training_runs ORDER BY started_at DESC');
    for (const r of runs) {
      const run: Run = { id: r.id, name: r.name, startedAt: r.started_at, finishedAt: r.finished_at, status: r.status, progress: r.progress, styleScore: r.style ?? undefined, generalScore: r.general ?? undefined };
      data.runs.push(run);
      saved.set(keyOf('training_runs', run.id), JSON.stringify(run));
    }
    const ads = await d.getAllAsync<{ id: string; v: number; name: string; created_at: number; active: number; examples: number; style: number; general: number; rules: string }>('SELECT * FROM adapters ORDER BY v');
    for (const r of ads) {
      const a: Adapter = { id: r.id, v: r.v, name: r.name, createdAt: r.created_at, active: !!r.active, examples: r.examples, styleScore: r.style, generalScore: r.general, rules: parseJson<string[]>(r.rules, []) };
      data.adapters.push(a);
      saved.set(keyOf('adapters', a.id), JSON.stringify(a));
    }
    const brows = await d.getAllAsync<{ id: string; json: string }>('SELECT id, json FROM benches ORDER BY ts');
    for (const r of brows) {
      const b = parseJson<BenchSnapshot | null>(r.json, null);
      if (!b || !b.id) continue;
      data.benches.push(b);
      saved.set(keyOf('benches', b.id), JSON.stringify(b));
    }
    const srow = await d.getAllAsync<{ v: string }>('SELECT v FROM settings WHERE k = ?', ['app']);
    if (srow.length) {
      const s = parseJson<Record<string, unknown>>(srow[0].v, {});
      delete s.account; /* anciennes bases : l'identité de compte n'existe plus */
      data.settings = { ...data.settings, ...s } as Settings;
    }
    data.netLog = await d.getAllAsync<NetEntry>('SELECT t, ev FROM net_log ORDER BY t DESC LIMIT 40');
    data.crashes = await d.getAllAsync<CrashEntry>('SELECT t, msg, stack FROM crashes ORDER BY t DESC LIMIT 10');
    saved.set('net_log:*', JSON.stringify(data.netLog));
    saved.set('crashes:*', JSON.stringify(data.crashes));
  } catch {
    /* base neuve ou partiellement illisible : on garde ce qui a pu être lu */
  }
  /* DEFAULT DENY : aucune autorisation réseau ne survit à un redémarrage */
  data.settings.netUntil = null;
  return data;
}

/* écritures sérialisées : jamais deux sauvegardes en parallèle */
let queue: Promise<void> = Promise.resolve();
export function saveAll(data: AppData): Promise<void> {
  const run = () => doSave(data);
  queue = queue.then(run, run);
  return queue;
}

async function doSave(data: AppData): Promise<void> {
  const d = await openDb();
  const sets = new Map<string, string>();
  const dels: string[] = [];

  await d.withTransactionAsync(async () => {
    const sync = async <T,>(table: string, items: T[], idOf: (t: T) => string, fpOf: (t: T) => string, write: (t: T) => Promise<unknown>) => {
      const seen = new Set<string>();
      for (const it of items) {
        const key = keyOf(table, idOf(it));
        seen.add(key);
        const fp = fpOf(it);
        if (saved.get(key) === fp) continue;
        await write(it);
        sets.set(key, fp);
      }
      for (const key of saved.keys()) {
        if (key.startsWith(table + ':') && !key.endsWith(':*') && !seen.has(key)) {
          await d.runAsync(`DELETE FROM ${table} WHERE id = ?`, [key.slice(table.length + 1)]);
          dels.push(key);
        }
      }
    };
    /* listes sans identifiant : remplacées d'un bloc si elles ont changé */
    const replaceAll = async (table: string, rows: unknown[], insert: () => Promise<void>) => {
      const fp = JSON.stringify(rows);
      if (saved.get(table + ':*') === fp) return;
      await d.runAsync(`DELETE FROM ${table}`);
      await insert();
      sets.set(table + ':*', fp);
    };

    await sync('conversations', data.convs, c => c.id, fpConv,
      c => d.runAsync('INSERT OR REPLACE INTO conversations (id, title, ts, train_flag, mode, model) VALUES (?,?,?,?,?,?)', [c.id, c.title, c.ts, c.trainFlag, c.mode ?? null, c.model ?? null]));
    const msgRows: MsgRow[] = data.convs.flatMap(c => c.msgs.map(m => ({ m, convId: c.id })));
    await sync('messages', msgRows, r => r.m.id, fpMsg, async ({ m, convId }) => {
      await d.runAsync('INSERT OR REPLACE INTO messages (id, conv_id, role, text_enc, ts, source, model, feedback, image) VALUES (?,?,?,?,?,?,?,?,?)',
        [m.id, convId, m.role, await encryptText(m.text), m.ts, m.source ?? null, m.model ?? null, m.feedback ?? null, m.image ?? null]);
    });
    await sync('memories', data.memories, m => m.id, m => JSON.stringify(m), async m => {
      await d.runAsync('INSERT OR REPLACE INTO memories (id, text_enc, kind, ts, enabled) VALUES (?,?,?,?,?)', [m.id, await encryptText(m.text), m.kind, m.ts, m.enabled ? 1 : 0]);
    });
    await sync('documents', data.docs, x => x.id, fpDoc, async x => {
      await d.runAsync('INSERT OR REPLACE INTO documents (id, name, type, size_mb, added_at, text_enc, indexed) VALUES (?,?,?,?,?,?,?)',
        [x.id, x.name, x.type, x.sizeMb, x.addedAt, await encryptText(x.text), x.indexed ? 1 : 0]);
    });
    await sync('training_examples', data.tex, t => t.id, t => JSON.stringify(t), async t => {
      await d.runAsync('INSERT OR REPLACE INTO training_examples (id, q_enc, base_enc, target_enc, tags, ts, src) VALUES (?,?,?,?,?,?,?)',
        [t.id, await encryptText(t.q), await encryptText(t.base), await encryptText(t.target), JSON.stringify(t.tags), t.ts, t.src]);
    });
    await sync('training_runs', data.runs, r => r.id, r => JSON.stringify(r), r =>
      d.runAsync('INSERT OR REPLACE INTO training_runs (id, name, started_at, finished_at, status, progress, style, general) VALUES (?,?,?,?,?,?,?,?)',
        [r.id, r.name, r.startedAt, r.finishedAt ?? null, r.status, r.progress, r.styleScore ?? null, r.generalScore ?? null]));
    await sync('adapters', data.adapters, a => a.id, a => JSON.stringify(a), a =>
      d.runAsync('INSERT OR REPLACE INTO adapters (id, v, name, created_at, active, examples, style, general, rules) VALUES (?,?,?,?,?,?,?,?,?)',
        [a.id, a.v, a.name, a.createdAt, a.active ? 1 : 0, a.examples, a.styleScore, a.generalScore, JSON.stringify(a.rules)]));
    await sync('benches', data.benches || [], b => b.id, b => JSON.stringify(b), b =>
      d.runAsync('INSERT OR REPLACE INTO benches (id, ts, json) VALUES (?,?,?)', [b.id, b.ts, JSON.stringify(b)]));
    /* réglages : l'autorisation réseau n'est jamais persistée */
    const settingsJson = JSON.stringify({ ...data.settings, netUntil: null });
    if (saved.get('settings:app') !== settingsJson) {
      await d.runAsync('INSERT OR REPLACE INTO settings (k, v) VALUES (?,?)', ['app', settingsJson]);
      sets.set('settings:app', settingsJson);
    }
    await replaceAll('net_log', data.netLog, async () => { for (const n of data.netLog) await d.runAsync('INSERT INTO net_log (t, ev) VALUES (?,?)', [n.t, n.ev]); });
    await replaceAll('crashes', data.crashes, async () => { for (const c of data.crashes) await d.runAsync('INSERT INTO crashes (t, msg, stack) VALUES (?,?,?)', [c.t, c.msg, c.stack]); });
  });

  sets.forEach((v, k) => saved.set(k, v));
  dels.forEach(k => saved.delete(k));
}

/* Efface TOUT en base (lignes + fichier SQLite compacté) et renvoie un état neuf,
   en conservant les réglages fournis. N'altère jamais l'objet reçu. */
export async function wipeData(settings: Settings): Promise<AppData> {
  const d = await openDb();
  await queue.catch(() => { /* une sauvegarde échouée ne doit pas empêcher l'effacement */ });
  await d.execAsync(TABLES.map(t => `DELETE FROM ${t};`).join(' '));
  await d.execAsync('VACUUM');
  saved.clear();
  const fresh = freshData();
  fresh.settings = { ...settings, netUntil: null };
  await saveAll(fresh);
  return fresh;
}
