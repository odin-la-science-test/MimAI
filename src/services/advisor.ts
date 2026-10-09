/* MiMai — conseiller de modèles « selon la spécialité » (logique pure, testable sous Node).
   L'utilisateur dit ce qu'il veut faire ; on classe les modèles du catalogue qui tiennent sur CE téléphone.
   HONNÊTETÉ : le classement s'appuie sur les caractéristiques publiées dans le catalogue (usage annoncé par
   les étiquettes, taille, famille, quantification). Ce ne sont PAS des benchmarks mesurés sur l'appareil :
   l'interface l'affiche (ADVISOR_NOTE). Aucun score de « précision » ni de vitesse n'est inventé. */
import { fitFor, qualityScore } from './fit';
import type { Fit, FitModel, DeviceProfile } from './fit';

export type SpecialtyId = 'general' | 'francais' | 'code' | 'raisonnement' | 'resume' | 'rapide' | 'multilingue' | 'maximum';

export interface Specialty { id: SpecialtyId; label: string; hint: string }

export const SPECIALTIES: Specialty[] = [
  { id: 'general', label: 'Discussion générale', hint: 'Questions du quotidien, idées, explications.' },
  { id: 'francais', label: 'Écrire en français', hint: 'Messages, mails, reformulation, correction.' },
  { id: 'code', label: 'Programmer', hint: 'Code, scripts, explication d’erreurs.' },
  { id: 'raisonnement', label: 'Raisonner et calculer', hint: 'Maths, logique, problèmes en plusieurs étapes.' },
  { id: 'resume', label: 'Résumer mes documents', hint: 'Comprendre et synthétiser les textes de la bibliothèque.' },
  { id: 'multilingue', label: 'Plusieurs langues', hint: 'Traduire, écrire hors du français.' },
  { id: 'rapide', label: 'Rapide et économe', hint: 'Réponses vives, peu de batterie et de mémoire.' },
  { id: 'maximum', label: 'Le plus capable possible', hint: 'Qualité maximale, quitte à être plus lent.' },
];

export const ADVISOR_NOTE =
  'Classement établi d’après les caractéristiques publiées des modèles (usage annoncé, taille, famille), pas d’après des tests mesurés sur votre téléphone. '
  + 'MiMai utilise une fenêtre de 2 048 jetons : les très longs textes sont tronqués, quel que soit le modèle.';

export interface Ranked<T> { model: T; score: number; why: string[]; fit: Fit }

const GB = 1e9;
const has = (m: FitModel, t: string) => m.tags.includes(t);
const nameIs = (m: FitModel, re: RegExp) => re.test(m.name);

/* note de spécialité + raisons affichables, SANS jamais affirmer plus que ce que disent les données */
function specialtyScore(m: FitModel, id: SpecialtyId): { bonus: number; why: string[] } {
  const why: string[] = [];
  let bonus = 0;
  const sizeGb = m.sizeBytes / GB;
  switch (id) {
    case 'code':
      if (has(m, 'code')) { bonus += 28; why.push('Annoncé pour le code'); }
      if (nameIs(m, /coder|code/i)) { bonus += 12; why.push('Version spécialisée « coder »'); }
      if (!has(m, 'code') && !nameIs(m, /coder|code/i)) bonus -= 12;
      break;
    case 'raisonnement':
      if (has(m, 'raisonnement')) { bonus += 24; why.push('Modèle de raisonnement'); }
      if (has(m, 'maths')) { bonus += 10; why.push('Annoncé pour les maths'); }
      if (nameIs(m, /think|r1|reason/i)) { bonus += 8; why.push('Réfléchit avant de répondre (plus lent)'); }
      if (m.paramsB < 1.5) bonus -= 10;
      if (!has(m, 'raisonnement') && !has(m, 'maths')) bonus -= 8;
      break;
    case 'francais':
      if (has(m, 'francais')) { bonus += 24; why.push('Français annoncé'); }
      else if (has(m, 'multilingue')) { bonus += 8; why.push('Multilingue'); }
      else bonus -= 10;
      break;
    case 'multilingue':
      if (has(m, 'multilingue')) { bonus += 22; why.push('Multilingue annoncé'); }
      if (has(m, 'francais')) { bonus += 6; }
      if (!has(m, 'multilingue')) bonus -= 12;
      break;
    case 'resume':
      if (has(m, 'precis')) { bonus += 6; why.push('Orienté précision'); }
      bonus += 6 * Math.log2(1 + m.paramsB);
      if (m.paramsB < 1) bonus -= 8;
      if (has(m, 'francais')) bonus += 4;
      why.push('Les modèles plus grands résument en général mieux');
      break;
    case 'rapide':
      bonus += -14 * sizeGb + (has(m, 'leger') ? 12 : 0);
      if (/^IQ/i.test(m.quant)) bonus -= 8; // pas de noyau optimisé ARM : en général plus lent
      if (has(m, 'leger')) why.push('Léger');
      why.push(sizeGb.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Go : peu de mémoire');
      break;
    case 'maximum':
      bonus += 4 * Math.log2(1 + m.paramsB);
      why.push(m.paramsB.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' milliards de paramètres');
      break;
    default:
      break;
  }
  return { bonus, why };
}

const FAMILY_PENALTY = 6;

/* Classe les modèles pour une spécialité, adaptés à l'appareil. Retourne moins de n (voire []) s'il y en a peu :
   jamais de remplissage. 'maximum' accepte aussi le niveau « limite » (avec pénalité) ; les autres seulement idéal/ok. */
export function rankForSpecialty<T extends FitModel>(models: readonly T[], id: SpecialtyId, profile: DeviceProfile, n = 5): Ranked<T>[] {
  const allowLimit = id === 'maximum';
  const pool = models.map(m => {
    const fit = fitFor(m, profile);
    const { bonus, why } = specialtyScore(m, id);
    const base = id === 'rapide' ? 0.3 * qualityScore(m) : qualityScore(m);
    let score = base + bonus;
    if (fit.level === 'limite') score -= 12;
    const reasons = [...why];
    if (fit.level === 'ideal') reasons.push('Tient confortablement sur votre téléphone');
    else if (fit.level === 'ok') reasons.push('Tient bien sur votre téléphone');
    else if (fit.level === 'limite') reasons.push('À la limite de votre mémoire');
    return { model: m, score, why: reasons, fit };
  }).filter(x => x.fit.level === 'ideal' || x.fit.level === 'ok' || (allowLimit && x.fit.level === 'limite'));

  const out: Ranked<T>[] = [];
  const perFamily = new Map<string, number>();
  while (out.length < n && pool.length) {
    let bi = 0; let bs = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const eff = pool[i].score - FAMILY_PENALTY * (perFamily.get(pool[i].model.family) || 0);
      if (eff > bs || (eff === bs && pool[i].model.id < pool[bi].model.id)) { bs = eff; bi = i; }
    }
    const [pick] = pool.splice(bi, 1);
    out.push({ ...pick, score: bs });
    perFamily.set(pick.model.family, (perFamily.get(pick.model.family) || 0) + 1);
  }
  return out;
}
