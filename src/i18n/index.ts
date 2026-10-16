/* MiMai — langue de l'interface : français (par défaut) ou anglais.
   Les textes sont écrits en français dans le code ; en anglais, ils passent par le dictionnaire src/i18n/en.ts (clé = texte
   français exact). Un texte sans traduction reste en français : jamais d'écran vide. Réglage : Auto (langue du téléphone), Français, English. */
import { EN } from './en';

export type LangPref = 'auto' | 'fr' | 'en';
let current: 'fr' | 'en' = 'fr';

export function deviceLang(): 'fr' | 'en' {
  try {
    const loc = (Intl.DateTimeFormat().resolvedOptions().locale || 'fr').toLowerCase();
    return loc.startsWith('fr') ? 'fr' : 'en';
  } catch { return 'fr'; }
}

export function setLang(pref: LangPref | undefined): void {
  current = pref === 'fr' ? 'fr' : pref === 'en' ? 'en' : deviceLang();
}
export const getLang = (): 'fr' | 'en' => current;

/* traduit un texte français (exact, ou avec des espaces en bord) ; sinon le rend tel quel */
export function tr(s: string): string {
  if (current === 'fr' || !s) return s;
  const hit = EN[s];
  if (hit) return hit;
  const t = s.trim();
  if (t !== s) { const h2 = EN[t]; if (h2) return s.replace(t, h2); }
  return s;
}

/* texte bilingue écrit directement dans le code (écrans récents) */
export const bi = (fr: string, en: string): string => (current === 'en' ? en : fr);
