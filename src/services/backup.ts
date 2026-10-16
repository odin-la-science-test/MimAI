/* MiMai — sauvegarde et restauration (changer de téléphone) : conversations, mémoire, bibliothèque et exemples d'entraînement,
   dans UN fichier JSON que l'utilisateur garde où il veut. Module pur (testable sous Node).
   Exclus volontairement : clés des fournisseurs, réglages, modèles, photos jointes. Le fichier n'est PAS chiffré : à garder en lieu sûr. */
import type { AppData, Conv, Memory, Doc, TEx, Msg } from './db';

export interface Backup {
  app: 'MiMai'; v: 1; at: number;
  convs: Conv[]; memories: Memory[]; docs: Omit<Doc, 'chunks'>[]; tex: TEx[];
}

export function buildBackup(d: Pick<AppData, 'convs' | 'memories' | 'docs' | 'tex'>, now = Date.now()): Backup {
  return {
    app: 'MiMai', v: 1, at: now,
    convs: d.convs.map(c => ({ ...c, msgs: c.msgs.map(m => ({ ...m, image: null })) })),
    memories: d.memories.map(m => ({ ...m })),
    docs: d.docs.map(({ chunks: _chunks, ...rest }) => rest),
    tex: d.tex.map(t => ({ ...t })),
  };
}

const str = (v: unknown, max = 200000): string => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

export type MergeResult = { convs: number; memories: number; docs: number; tex: number } | { error: string };

/* fusionne une sauvegarde dans les données actuelles (sans rien écraser) ; `d` est modifié */
export function mergeBackup(d: Pick<AppData, 'convs' | 'memories' | 'docs' | 'tex'>, raw: unknown, newId: (p: string) => string): MergeResult {
  const b = obj(raw);
  if (b.app !== 'MiMai' || b.v !== 1) return { error: 'Ce fichier n’est pas une sauvegarde MiMai.' };
  let nc = 0, nm = 0, nd = 0, nt = 0;

  const convIds = new Set(d.convs.map(c => c.id));
  const sig = (c: { title: string; ts: number }) => c.title + '|' + c.ts;
  const convSigs = new Set(d.convs.map(sig));
  for (const x of arr(b.convs)) {
    const o = obj(x);
    const msgs: Msg[] = arr(o.msgs).map(mm => {
      const m = obj(mm);
      return { id: str(m.id) || newId('m'), role: m.role === 'user' ? 'user' as const : 'ai' as const, text: str(m.text), ts: num(m.ts), source: typeof m.source === 'string' ? m.source : null, model: typeof m.model === 'string' ? m.model : null, feedback: (m.feedback === 'good' ? 'good' : m.feedback === 'bad' ? 'bad' : null) as Msg['feedback'], image: null };
    }).filter(m => m.text);
    const c: Conv = { id: str(o.id) || newId('c'), title: str(o.title, 200) || 'Discussion', ts: num(o.ts, Date.now()), trainFlag: o.trainFlag === 'no' || o.trainFlag === 'memory' ? o.trainFlag : 'yes', msgs, mode: typeof o.mode === 'string' ? o.mode : undefined, model: typeof o.model === 'string' ? o.model : undefined };
    if (!msgs.length || convSigs.has(sig(c))) continue;
    if (convIds.has(c.id)) c.id = newId('c');
    convIds.add(c.id); convSigs.add(sig(c)); d.convs.push(c); nc++;
  }
  d.convs.sort((a, z) => z.ts - a.ts);

  const memTexts = new Set(d.memories.map(m => m.text.trim().toLowerCase()));
  const memIds = new Set(d.memories.map(m => m.id));
  for (const x of arr(b.memories)) {
    const o = obj(x);
    const text = str(o.text, 2000).trim();
    if (!text || memTexts.has(text.toLowerCase())) continue;
    const kind = o.kind === 'fait' || o.kind === 'style' ? o.kind : 'préférence';
    const m: Memory = { id: str(o.id) || newId('mem'), text, kind, ts: num(o.ts, Date.now()), enabled: o.enabled !== false };
    if (memIds.has(m.id)) m.id = newId('mem');
    memIds.add(m.id); memTexts.add(text.toLowerCase()); d.memories.push(m); nm++;
  }

  const docNames = new Set(d.docs.map(x => x.name));
  const docIds = new Set(d.docs.map(x => x.id));
  for (const x of arr(b.docs)) {
    const o = obj(x);
    const name = str(o.name, 200), text = str(o.text, 2_000_000);
    if (!name || !text || docNames.has(name)) continue;
    const doc: Doc = { id: str(o.id) || newId('d'), name, type: str(o.type, 8) || 'TXT', sizeMb: num(o.sizeMb), addedAt: num(o.addedAt, Date.now()), text, indexed: false };
    if (docIds.has(doc.id)) doc.id = newId('d');
    docIds.add(doc.id); docNames.add(name); d.docs.push(doc); nd++;   /* indexed:false : l'app ré-indexe à l'ouverture */
  }

  const texIds = new Set(d.tex.map(t => t.id));
  const texKeys = new Set(d.tex.map(t => t.q + '|' + t.target));
  for (const x of arr(b.tex)) {
    const o = obj(x);
    const q = str(o.q, 4000), target = str(o.target, 8000);
    if (!q || !target || texKeys.has(q + '|' + target)) continue;
    const t: TEx = { id: str(o.id) || newId('t'), q, base: str(o.base, 8000), target, tags: arr(o.tags).filter((g): g is string => typeof g === 'string').slice(0, 12), ts: num(o.ts, Date.now()), src: o.src === 'seed' || o.src === 'conv' ? o.src : 'manual' };
    if (texIds.has(t.id)) t.id = newId('t');
    texIds.add(t.id); texKeys.add(q + '|' + target); d.tex.push(t); nt++;
  }
  return { convs: nc, memories: nm, docs: nd, tex: nt };
}

export const backupFileName = (now = Date.now()): string => 'mimai-sauvegarde-' + new Date(now).toISOString().slice(0, 10) + '.json';
