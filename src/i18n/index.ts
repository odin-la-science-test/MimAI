/* MiMai — langue de l'interface : français (source), anglais, espagnol, hongrois, portugais, japonais, mandarin (simplifié), allemand.
   Les textes sont écrits en français dans le code. L'anglais passe par le dictionnaire src/i18n/en.ts (clé = texte français exact) ;
   les six autres langues traduisent le texte ANGLAIS correspondant (listes alignées sur ORDER, voir order.ts).
   Un texte sans traduction reste en français (ou en anglais pour bi()) : jamais d'écran vide.
   Réglage : Auto (langue du téléphone) ou un choix explicite. */
import { EN } from './en';
import { ORDER } from './order';
import { ES } from './es';
import { HU } from './hu';
import { PT } from './pt';
import { JA } from './ja';
import { ZH } from './zh';
import { DE } from './de';

export type Lang = 'fr' | 'en' | 'es' | 'hu' | 'pt' | 'ja' | 'zh' | 'de';
export type LangPref = 'auto' | Lang;

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'fr', label: 'Français' }, { id: 'en', label: 'English' }, { id: 'es', label: 'Español' }, { id: 'hu', label: 'Magyar' },
  { id: 'pt', label: 'Português' }, { id: 'ja', label: '日本語' }, { id: 'zh', label: '中文' }, { id: 'de', label: 'Deutsch' },
];

const PACKS: Partial<Record<Lang, string[]>> = { es: ES, hu: HU, pt: PT, ja: JA, zh: ZH, de: DE };
const IDX: Record<string, number> = {};
ORDER.forEach((e, i) => { IDX[e] = i; });

let current: Lang = 'fr';

/* langue du téléphone, parmi celles prises en charge (anglais par défaut) */
export function deviceLang(): Lang {
  try {
    const loc = (Intl.DateTimeFormat().resolvedOptions().locale || 'fr').toLowerCase();
    const p = loc.split(/[-_]/)[0];
    return (LANGS.some(l => l.id === p) ? p : 'en') as Lang;
  } catch { return 'fr'; }
}

export function setLang(pref: LangPref | undefined): void {
  current = pref && pref !== 'auto' && LANGS.some(l => l.id === pref) ? pref : deviceLang();
}
export const getLang = (): Lang => current;

/* traduit l'anglais de référence dans la langue courante */
function fromEnglish(e: string): string {
  if (current === 'fr') return e;
  const pack = PACKS[current];
  if (!pack) return e;
  const i = IDX[e];
  return i === undefined ? e : (pack[i] || e);
}

/* traduit un texte français (exact, ou avec des espaces en bord) ; sinon le rend tel quel */
export function tr(s: string): string {
  if (current === 'fr' || !s) return s;
  const hit = EN[s];
  if (hit) return fromEnglish(hit);
  const t = s.trim();
  if (t !== s) { const h2 = EN[t]; if (h2) return s.replace(t, fromEnglish(h2)); }
  return s;
}

/* texte écrit directement en français + anglais dans le code (écrans récents) ; les autres langues partent de l'anglais */
export const bi = (fr: string, en: string): string => (current === 'fr' ? fr : fromEnglish(en));
