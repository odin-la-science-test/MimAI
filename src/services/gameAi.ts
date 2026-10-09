/* MiMai — IA de combat du jeu « La Garde des Étoiles » (mode Défi).
   Dans ce mode, le joueur lance des monstres et l'adversaire (Mìmir) est piloté par le MODÈLE LOCAL de MiMai :
   le jeu envoie l'état du combat, on demande au modèle UN sort + une réplique, puis on valide strictement la réponse.
   Logique pure et testable ; l'appel au modèle est fait par l'écran du jeu. Rien ne quitte l'appareil. */

export const DEFI_SPELLS = ['Éclair', 'Pluie d’étoiles', 'Vague', 'Bouclier d’étoiles', 'Soin'] as const;
export type DefiSpell = typeof DEFI_SPELLS[number];

export interface AiFoe { n: string; hp: number; max: number; x: number; range: number; boss?: boolean; healer?: boolean; fly?: boolean }
export interface AiRequest { type: 'ai_request'; id: number; hp: number; max: number; ready: string[]; foes: AiFoe[] }
export interface AiDecision { spell: DefiSpell | null; say: string }

const SPELL_HELP: Record<DefiSpell, string> = {
  'Éclair': 'frappe un seul ennemi, rapide',
  'Pluie d’étoiles': 'gros dégâts sur plusieurs ennemis',
  'Vague': 'repousse et touche tous les ennemis',
  'Bouclier d’étoiles': 'te protège un moment',
  'Soin': 'te rend des points de vie',
};

/* minuscules, sans accents ni apostrophes typographiques : « Pluie d’étoiles » == « pluie d'etoiles » */
export const norm = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`´]/g, "'").toLowerCase();

const asSpell = (s: string): DefiSpell | null => DEFI_SPELLS.find(x => norm(x) === norm(s)) || null;

/* sorts réellement lançables ce tour-ci (liste fournie par le jeu, filtrée sur les 5 sorts du Défi) */
export function readySpells(ready: unknown): DefiSpell[] {
  if (!Array.isArray(ready)) return [];
  const out: DefiSpell[] = [];
  for (const r of ready) { const s = typeof r === 'string' ? asSpell(r) : null; if (s && !out.includes(s)) out.push(s); }
  return out;
}

const clamp = (n: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Number.isFinite(Number(n)) ? Number(n) : lo));
const clean = (s: unknown, max: number) => String(s ?? '').replace(/[\r\n|]+/g, ' ').replace(/[^\p{L}\p{N} '’\-.,!?]/gu, '').slice(0, max).trim();

/* messages pour le modèle : consigne courte et stricte pour une réponse de 1 ligne, quelques jetons */
export function buildPrompt(req: AiRequest): { role: 'system' | 'user'; content: string }[] {
  const ready = readySpells(req.ready);
  const foes = (Array.isArray(req.foes) ? req.foes : []).slice(0, 8);
  const lines = foes.map(f => {
    const pct = Math.min(100, Math.round(100 * clamp(f.hp, 0, 9999) / Math.max(1, clamp(f.max, 1, 9999))));
    const dist = clamp(f.x, 0, 9999) <= clamp(f.range, 0, 9999) + 4 ? 'AU CONTACT' : 'loin';
    return '- ' + clean(f.n, 24) + ' : ' + pct + ' % de vie, ' + dist + (f.boss ? ', BOSS' : '') + (f.healer ? ', soigne les autres' : '') + (f.fly ? ', vole' : '');
  });
  const sys = 'Tu es Mìmir, un petit gardien d’étoiles dans un jeu de combat. Tu défends ton camp contre les monstres que le joueur lance. '
    + 'Choisis UN seul sort parmi ceux disponibles, puis une réplique très courte (6 mots maximum, en français, fière ou drôle). '
    + 'Réponds sur UNE ligne, exactement au format : Sort | réplique';
  const user = 'Tes points de vie : ' + clamp(req.hp, 0, 9999) + ' sur ' + clamp(req.max, 1, 9999) + '.\n'
    + 'Monstres :\n' + (lines.length ? lines.join('\n') : '- aucun') + '\n'
    + 'Sorts disponibles :\n' + (ready.length ? ready.map(s => '- ' + s + ' (' + SPELL_HELP[s] + ')').join('\n') : '- aucun')
    + '\nRéponds : Sort | réplique';
  return [{ role: 'system', content: sys }, { role: 'user', content: user }];
}

/* lecture stricte : le sort doit figurer dans la liste des sorts disponibles ; sinon spell = null (le jeu ne lance rien) */
export function parseDecision(text: string, ready: unknown): AiDecision {
  const allowed = readySpells(ready);
  const raw = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const firstLine = raw.split('\n').find(l => l.trim()) || '';
  const [head, ...rest] = firstLine.split('|');
  /* le PREMIER sort cité (pas le premier de notre liste) : d'abord avant le « | », sinon dans toute la réponse */
  const firstMentioned = (text: string): DefiSpell | null => {
    const n = norm(text);
    const hits = allowed.map(s => ({ s, i: n.indexOf(norm(s)) })).filter(h => h.i >= 0).sort((a, b) => a.i - b.i);
    return hits.length ? hits[0].s : null;
  };
  const spell = firstMentioned(head) || firstMentioned(raw);
  const say = clean(rest.join(' '), 40);
  return { spell, say };
}
