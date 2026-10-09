/* MiMai — compatibilité modèle / téléphone et recommandations (logique PURE, testable sous Node).
   Aucun import runtime : ce fichier est exécuté tel quel par scripts/fit.test.mjs.

   RÈGLES DOCUMENTÉES
   - RAM nécessaire = model.needRamGb (donnée du catalogue). Rapport r = needRamGb / RAM de l'appareil :
       r ≤ 0,35 → « ideal »   r ≤ 0,50 → « ok »   r ≤ 0,65 → « limite »   sinon « trop-lourd ».
   - Disque : si l'espace libre est connu et < 1,1 × taille du fichier → « trop-lourd » (cause « disk »),
       quelle que soit la RAM (même marge que le téléchargeur : fichier + vérification).
   - RAM inconnue : « ok » prudent uniquement si needRamGb ≤ 1,5 Go ; sinon « limite » (on ne promet rien).
   - Vitesse : simple ESTIMATION qualitative (rapide / moyen / lent) dérivée de la taille du fichier.
       Jamais de « tokens par seconde » : aucune mesure réelle n'est faite ici.
   - Score de qualité attendue (recommandations) : 10·log2(1 + paramsB) + bonus de classement du catalogue
       (rank 1 = meilleur : max(0, 30 − 0,3·rank)) − malus de quantification très basse (Q1/Q2 : −6, Q3 : −2,5)
       + bonus français (+3 « francais », +1,5 « multilingue »). */

export type FitLevel = 'ideal' | 'ok' | 'limite' | 'trop-lourd';
export type SpeedLevel = 'rapide' | 'moyen' | 'lent';

/* sous-ensemble structurel de ModelDef nécessaire ici */
export interface FitModel {
  id: string; name: string; family: string; paramsB: number; quant: string;
  tags: string[]; needRamGb: number; sizeBytes: number; rank?: number;
}
export interface DeviceProfile { ramGb: number | null; freeDiskGb: number | null }
export interface Fit {
  level: FitLevel;
  label: string;
  reason: string;
  /* cause du blocage quand level === 'trop-lourd' */
  blockedBy?: 'disk' | 'ram';
  speed: SpeedLevel;
  /* texte prêt à afficher, explicitement étiqueté comme estimation */
  speedLabel: string;
}

export const RAM_RATIO = { ideal: 0.35, ok: 0.5, limite: 0.65 } as const;
export const DISK_MARGIN = 1.1;
export const UNKNOWN_RAM_MAX_GB = 1.5;

const GB = 1e9;
const fmt = (n: number) => n.toFixed(1).replace('.', ',');

export const LEVEL_LABEL: Record<FitLevel, string> = {
  ideal: 'Idéal', ok: 'Compatible', limite: 'Limite', 'trop-lourd': 'Trop lourd',
};
export const LEVEL_ORDER: Record<FitLevel, number> = { ideal: 0, ok: 1, limite: 2, 'trop-lourd': 3 };

/* estimation qualitative de la vitesse (selon la taille du fichier uniquement) */
export function speedFor(sizeBytes: number): SpeedLevel {
  const g = sizeBytes / GB;
  return g < 0.9 ? 'rapide' : g < 2.2 ? 'moyen' : 'lent';
}
/* Le moteur embarqué a des noyaux ARM optimisés pour Q4_0 et Q4_K (Q4_K_M), pas pour les formats « IQ » : à taille égale,
   un IQ4_XS est en général plus lent. Information tirée du code du moteur, pas d'une mesure sur votre téléphone. */
export function quantSpeedNote(quant: string): string | null {
  return /^IQ/i.test(quant) ? 'Format ' + quant.toUpperCase() + ' : pas de noyau optimisé pour les processeurs de téléphone dans le moteur ; en général plus lent qu’un Q4_K_M de même taille.' : null;
}
export const speedText = (s: SpeedLevel) => 'Vitesse estimée : ' + s + ' (estimation, varie selon l’appareil)';

export function fitFor(model: FitModel, profile: DeviceProfile): Fit {
  const speed = speedFor(model.sizeBytes);
  const speedLabel = speedText(speed);
  const need = model.needRamGb;
  const sizeGb = model.sizeBytes / GB;
  const mk = (level: FitLevel, reason: string, blockedBy?: 'disk' | 'ram'): Fit =>
    ({ level, label: LEVEL_LABEL[level], reason, blockedBy, speed, speedLabel });

  const disk = profile.freeDiskGb;
  if (disk != null && Number.isFinite(disk) && disk < DISK_MARGIN * sizeGb) {
    return mk('trop-lourd', 'Espace libre insuffisant : ' + fmt(DISK_MARGIN * sizeGb) + ' Go nécessaires, ' + fmt(Math.max(0, disk)) + ' Go disponibles.', 'disk');
  }

  const ram = profile.ramGb;
  if (ram == null || !Number.isFinite(ram) || ram <= 0) {
    return need <= UNKNOWN_RAM_MAX_GB
      ? mk('ok', 'Mémoire de l’appareil inconnue ; modèle assez léger (≈ ' + fmt(need) + ' Go de mémoire), par prudence.')
      : mk('limite', 'Mémoire de l’appareil inconnue : impossible de garantir que ce modèle (≈ ' + fmt(need) + ' Go de mémoire) tienne.');
  }

  const r = need / ram;
  const use = 'Utilise ≈ ' + fmt(need) + ' Go sur ' + fmt(ram) + ' Go de mémoire';
  if (r <= RAM_RATIO.ideal) return mk('ideal', use + ' : confortable.');
  if (r <= RAM_RATIO.ok) return mk('ok', use + ' : fonctionne bien.');
  if (r <= RAM_RATIO.limite) return mk('limite', use + ' : possible mais risque de lenteurs ou de fermeture d’autres applications.');
  return mk('trop-lourd', use + ' : trop pour cet appareil.', 'ram');
}

export function qualityScore(m: FitModel): number {
  let s = 10 * Math.log2(1 + Math.max(0, m.paramsB));
  if (typeof m.rank === 'number' && m.rank > 0) s += Math.max(0, 30 - 0.3 * m.rank);
  const q = m.quant.toUpperCase();
  if (/^(I?Q1|I?Q2)/.test(q)) s -= 6;
  else if (/^(I?Q3)/.test(q)) s -= 2.5;
  if (m.tags.includes('francais')) s += 3;
  else if (m.tags.includes('multilingue')) s += 1.5;
  return s;
}

const FAMILY_PENALTY = 6;

/* Meilleurs n modèles réellement adaptés (ideal / ok), en diversifiant les familles.
   Retourne moins de n (voire []) si peu de modèles conviennent : jamais de remplissage artificiel. */
export function recommend<T extends FitModel>(models: readonly T[], profile: DeviceProfile, n: number): T[] {
  const pool = models
    .map(m => ({ m, fit: fitFor(m, profile), score: qualityScore(m) }))
    .filter(x => x.fit.level === 'ideal' || x.fit.level === 'ok');
  const out: T[] = [];
  const perFamily = new Map<string, number>();
  while (out.length < n && pool.length) {
    let bi = 0; let bs = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const eff = pool[i].score - FAMILY_PENALTY * (perFamily.get(pool[i].m.family) || 0);
      if (eff > bs || (eff === bs && pool[i].m.id < pool[bi].m.id)) { bs = eff; bi = i; }
    }
    const [pick] = pool.splice(bi, 1);
    out.push(pick.m);
    perFamily.set(pick.m.family, (perFamily.get(pick.m.family) || 0) + 1);
  }
  return out;
}

/* ───────── aides de filtrage de l'écran Modèles ───────── */
export type SizeBucket = 'leger' | 'moyen' | 'lourd';
/* léger < 1 Go · moyen 1–2,5 Go · lourd > 2,5 Go */
export function sizeBucket(sizeBytes: number): SizeBucket {
  const g = sizeBytes / GB;
  return g < 1 ? 'leger' : g <= 2.5 ? 'moyen' : 'lourd';
}
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function matchesQuery(m: { name: string; family: string }, q: string): boolean {
  const t = norm(q).trim();
  if (!t) return true;
  const hay = norm(m.name + ' ' + m.family);
  return t.split(/\s+/).every(w => hay.includes(w));
}
