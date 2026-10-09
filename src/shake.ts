/* Détection de secousse : logique PURE (aucune dépendance RN, testée par scripts/shake.test.mjs).
   Entrée : échantillons d'accéléromètre en g (expo-sensors). On retire la pesanteur (|‖a‖ − 1|),
   on compte des « coups » espacés d'au moins `minGapMs` dans une fenêtre glissante, puis on applique un anti-rebond. */
export type ShakeOpts = {
  /** force minimale d'un coup, en g au-dessus/au-dessous de la pesanteur */
  threshold: number;
  /** nombre de coups nécessaires dans la fenêtre */
  hits: number;
  /** durée de la fenêtre (ms) */
  windowMs: number;
  /** écart minimal entre deux coups comptés (ms) : un seul geste n'en compte pas plusieurs */
  minGapMs: number;
  /** anti-rebond : silence après une secousse validée (ms) */
  cooldownMs: number;
};

export const SHAKE_DEFAULTS: ShakeOpts = { threshold: 1.25, hits: 3, windowMs: 1100, minGapMs: 110, cooldownMs: 2200 };

export const shakeForce = (x: number, y: number, z: number): number => Math.abs(Math.sqrt(x * x + y * y + z * z) - 1);

export function createShakeDetector(over: Partial<ShakeOpts> = {}) {
  const o: ShakeOpts = { ...SHAKE_DEFAULTS, ...over };
  let hitTimes: number[] = [];
  let lastHit = -Infinity;
  let mutedUntil = -Infinity;
  return {
    opts: o,
    /** renvoie true quand une secousse est validée à l'instant t (ms) */
    push(x: number, y: number, z: number, t: number): boolean {
      if (!Number.isFinite(x + y + z + t)) return false;
      if (t < lastHit) { hitTimes = []; lastHit = -Infinity; mutedUntil = -Infinity; } // horloge revenue en arrière
      if (t < mutedUntil) return false;
      if (shakeForce(x, y, z) < o.threshold) return false;
      if (t - lastHit < o.minGapMs) return false;
      lastHit = t;
      hitTimes.push(t);
      hitTimes = hitTimes.filter(h => t - h <= o.windowMs);
      if (hitTimes.length >= o.hits) {
        hitTimes = [];
        mutedUntil = t + o.cooldownMs;
        return true;
      }
      return false;
    },
    reset() { hitTimes = []; lastHit = -Infinity; mutedUntil = -Infinity; },
  };
}
