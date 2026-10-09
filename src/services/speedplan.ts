/* MiMai — plan de vitesse (module pur, testable sous Node : scripts/speed.test.cjs).
   Objectif de temps de réponse : question courte ≤ 5 s, moyenne ≤ 10 s, réflexion ≤ 20 s.
   Ce module ne mesure rien : il CHOISIT, selon la vitesse réellement mesurée du modèle sur ce téléphone,
   une longueur de réponse qui tient dans le délai, et coupe proprement une réponse arrêtée par le délai. */

export type Kind = 'court' | 'moyen' | 'reflexion';
export const KINDS: Kind[] = ['court', 'moyen', 'reflexion'];
export const KIND_LABEL: Record<Kind, string> = { court: 'Question courte', moyen: 'Question moyenne', reflexion: 'Réflexion' };
export const BUDGET_MS: Record<Kind, number> = { court: 5000, moyen: 10000, reflexion: 20000 };

const LONG_ASK = /\b(explique|expliquer|detaille|ecris|ecrire|redige|rediger|resume|resumer|compare|comparer|liste|lister|code|fonction|analyse|analyser|pourquoi|comment|plan|etapes|traduis|traduire|donne[- ]moi)\b/;
const plain = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* classe une demande : le mode Réflexion fixe la catégorie ; Outils/Vision sont au moins « moyen » ;
   sinon une phrase brève sans verbe de travail (≤ 10 mots) est une question courte */
export function classify(text: string, mode: string): Kind {
  if (mode === 'reflexion') return 'reflexion';
  if (mode === 'outils' || mode === 'vision') return 'moyen';
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words <= 10 && !LONG_ASK.test(plain(text))) return 'court';
  return 'moyen';
}

const CAP: Record<Kind, number> = { court: 100, moyen: 300, reflexion: 650 };
const DEFAULT_TOKENS: Record<Kind, number> = { court: 70, moyen: 200, reflexion: 420 };
export const MIN_TOKENS = 24;
/* marge réservée au chargement du modèle et au traitement du prompt avant le premier mot */
const OVERHEAD_S = 1.2;

/* nombre maximal de jetons qui tient dans le délai, d'après la vitesse de génération mesurée (jetons/s) */
export function maxTokensFor(kind: Kind, tps: number | null | undefined): number {
  if (!tps || !(tps > 0)) return DEFAULT_TOKENS[kind];
  const usable = Math.max(1, BUDGET_MS[kind] / 1000 - OVERHEAD_S);
  return Math.max(MIN_TOKENS, Math.min(CAP[kind], Math.floor(tps * usable)));
}

/* durée estimée d'une réponse typique (jetons) à cette vitesse, en secondes ; null si vitesse inconnue */
export const TYPICAL_TOKENS: Record<Kind, number> = { court: 40, moyen: 150, reflexion: 400 };
export function estimateSeconds(kind: Kind, tps: number | null | undefined): number | null {
  if (!tps || !(tps > 0)) return null;
  return Math.round((OVERHEAD_S + TYPICAL_TOKENS[kind] / tps) * 10) / 10;
}

/* consigne de longueur ajoutée à la question (le prompt système reste identique : son cache est réutilisé) */
export function lengthHint(kind: Kind): string {
  if (kind === 'court') return 'Réponds en une ou deux phrases courtes.';
  if (kind === 'moyen') return 'Réponds en trois à cinq phrases, sans introduction.';
  return 'Raisonne en quelques étapes numérotées très courtes, puis conclus en une phrase.';
}

/* réponse arrêtée par le délai : on la coupe à la dernière fin de phrase (si elle garde l'essentiel), sinon « … » */
export function trimToSentence(text: string, cut: boolean): string {
  const t = text.trim();
  if (!cut || !t) return t;
  const m = /^[\s\S]*[.!?…](?=[\s"»)]|$)/.exec(t);
  if (m && m[0].length >= Math.min(40, t.length * 0.5)) return m[0].trim();
  return t.replace(/[\s,;:]+$/, '') + '…';
}

/* historique envoyé au modèle : plus la question est courte, moins on renvoie de contexte (prompt plus court = plus rapide) */
export function historyWindow(kind: Kind): number { return kind === 'court' ? 2 : kind === 'moyen' ? 4 : 6; }
export function fewShotCount(kind: Kind): number { return kind === 'court' ? 1 : 3; }
