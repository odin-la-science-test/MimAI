/* MiMai — RAG 100 % local (README §15) : découpage en chunks, recherche
   lexicale pondérée (TF-like), réponse citée. Aucun document ne quitte
   l'appareil. */
import type { Doc, Chunk } from './db';

const STOP = new Set(`le la les un une des du de d l et ou mais donc or ni car à au aux avec ce cet cette ces
que qui quoi dont où est sont était étaient être avoir ai as ont avons avez pour pas ne plus moins très bien
tu vous je il elle on nous ils elles se sa son ses leur leurs mon ma mes ton ta tes notre nos votre vos y en
si comme dans par sur sous entre vers chez sans tout toute tous toutes autre autres même aussi alors quand
parce quel quelle quels quelles combien cela ceci celui celle ceux faire fait fais font peux peut peuvent
dois doit faut va vais vont the of and to a in is it`.split(/\s+/));

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function tokens(s: string): string[] {
  return norm(s).replace(/[^a-z0-9€%]+/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));
}
export function sentences(text: string): string[] {
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ\d])/).map(s => s.trim()).filter(s => s.length > 15);
}

export function chunkDoc(doc: Doc): Chunk[] {
  const paras = doc.text.split(/\n\s*\n/);
  const out: Chunk[] = [];
  let i = 0;
  for (const para of paras) {
    const s = sentences(para);
    for (let j = 0; j < Math.max(1, s.length); j += 2) {
      const text = s.length ? s.slice(j, j + 2).join(' ') : para.trim();
      /* repère honnête : numéro de passage dans le document (un texte brut n'a pas de pages) */
      if (text) { out.push({ i, text, page: 'passage ' + (i + 1) }); i++; }
    }
  }
  return out;
}

export function ensureIndexed(doc: Doc): Doc {
  if (!doc.chunks || !doc.chunks.length) doc.chunks = chunkDoc(doc);
  return doc;
}

function tf(tokensArr: string[]): Record<string, number> {
  /* sans prototype : un mot comme « constructor » ne doit pas collisionner avec Object */
  const v: Record<string, number> = Object.create(null);
  tokensArr.forEach(t => { v[t] = (v[t] || 0) + 1; });
  return v;
}
export function cosine(a: Record<string, number>, b: Record<string, number>): number {
  let dot = 0, na = 0, nb = 0;
  for (const k in a) na += a[k] * a[k];
  for (const k in b) { nb += b[k] * b[k]; if (a[k]) dot += a[k] * b[k]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface Hit { doc: Doc; chunk: Chunk; score: number; }

export function retrieve(query: string, docs: Doc[], k = 2): Hit[] {
  const qv = tf(tokens(query));
  const hits: Hit[] = [];
  for (const doc of docs) {
    if (!doc.indexed) continue;
    ensureIndexed(doc);
    for (const chunk of doc.chunks || []) {
      const s = cosine(qv, tf(tokens(chunk.text)));
      if (s > 0.05) hits.push({ doc, chunk, score: s });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, k);
}

export function findDocByName(q: string, docs: Doc[]): Doc | undefined {
  const n = norm(q);
  return docs.find(d => n.includes(norm(d.name)) || n.includes(norm(d.name.replace(/\.[a-z]+$/, ''))));
}

/* résumé extractif : phrases les plus représentatives */
export function summarize(text: string, n = 3): string[] {
  const sents = sentences(text);
  if (sents.length <= n) return sents;
  const freq: Record<string, number> = Object.create(null);
  sents.forEach(s => tokens(s).forEach(t => { freq[t] = (freq[t] || 0) + 1; }));
  const scored = sents.map((s, i) => {
    const tk = tokens(s);
    return { s, i, sc: tk.reduce((a, t) => a + (freq[t] || 0), 0) / Math.sqrt(tk.length + 1) };
  });
  return scored.sort((a, b) => b.sc - a.sc).slice(0, n).sort((a, b) => a.i - b.i).map(x => x.s);
}

/* façade regroupée (utilisée par engine.ts et les écrans) */
export const RAG = { ensureIndexed, retrieve, findDocByName, summarize, tokens, chunkDoc, cosine };
