import { useSyncExternalStore } from 'react';
/* Design system « Organic » — tokens issus de disagne/_ds/organic-…/styles.css */
/* Deux palettes : ORANGE (hors ligne, tout reste sur le téléphone) et BLEU (mode en ligne). C est un objet MUTABLE : applyTheme()
   le remplace en place, puis l'appli se redessine. */
const ORANGE = {
  bg: '#f5ead8',
  surface: '#ebddc5',
  text: '#201e1d',
  accent: '#c67139',
  accent2: '#7a8a5e',
  divider: 'rgba(32,30,29,0.16)',

  n100: '#f9f4ed', n200: '#eee7db', n300: '#dcd3c4', n400: '#c0b6a5',
  n500: '#a19786', n600: '#82796a', n700: '#645c50', n800: '#474238', n900: '#2e2b25',

  a100: '#fff2eb', a200: '#ffe1d0', a300: '#ffc6a5', a400: '#f6a06b',
  a500: '#d67f48', a600: '#b2622d', a700: '#8c491a', a800: '#643312', a900: '#402310',

  g100: '#f0fae1', g200: '#e1eecc', g300: '#ccdbb2', g400: '#aebf92',
  g500: '#8fa073', g600: '#728157', g700: '#56633f', g800: '#3d472b', g900: '#272e1b',
} as const;
export type ColorKey = keyof typeof ORANGE;
const BLUE: Record<ColorKey, string> = {
  bg: '#e9f0fa', surface: '#d8e4f4', text: '#1a1f2b', accent: '#2f6fc4', accent2: '#4f8f8a', divider: 'rgba(26,31,43,0.16)',
  n100: '#f3f6fb', n200: '#e5ebf3', n300: '#d0d9e6', n400: '#b2bfd0', n500: '#93a1b6', n600: '#73829a', n700: '#566478', n800: '#3b4656', n900: '#262e3a',
  a100: '#eaf2fd', a200: '#d3e4fa', a300: '#a9c9f3', a400: '#6fa3e8', a500: '#3f80d8', a600: '#2f68b8', a700: '#244f90', a800: '#193769', a900: '#102341',
  g100: '#e6f6f4', g200: '#cdebe7', g300: '#aedbd5', g400: '#86c4bc', g500: '#5fa89f', g600: '#478d85', g700: '#366f69', g800: '#285450', g900: '#1a3836',
};
export const C: Record<ColorKey, string> = { ...ORANGE };

let themeOnline = false;
let themeVersion = 0;
const themeListeners = new Set<() => void>();
export const isOnlineTheme = () => themeOnline;
/* appelé au rendu du fournisseur d'état : change les couleurs AVANT que les écrans se redessinent */
export function applyTheme(online: boolean): void {
  if (online === themeOnline) return;
  themeOnline = online;
  Object.assign(C, online ? BLUE : ORANGE);
  themeVersion++;
  themeListeners.forEach(f => f());
}
/* les styles créés une fois pour toutes (StyleSheet.create) et les composants mémorisés se remettent à jour ici */
export function onThemeChange(f: () => void): void { themeListeners.add(f); }
export function useThemeVersion(): number {
  return useSyncExternalStore(cb => { themeListeners.add(cb); return () => { themeListeners.delete(cb); }; }, () => themeVersion);
}


export const F = {
  heading: 'Caprasimo',
  body: 'Figtree',
  bodySemi: 'Figtree-SemiBold',
  bodyBold: 'Figtree-Bold',
} as const;

export const R = { sm: 8, md: 16, lg: 28, xl: 32, pill: 999 } as const;

export const shadow = (level: 1 | 2 | 3) =>
  level === 1
    ? { shadowColor: '#2e2b25', shadowOpacity: 0.14, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 }
    : level === 2
    ? { shadowColor: '#2e2b25', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 }
    : { shadowColor: '#2e2b25', shadowOpacity: 0.22, shadowRadius: 32, shadowOffset: { width: 0, height: 12 }, elevation: 12 };

export const fmtGo = (n: number) => n.toFixed(1).replace('.', ',') + ' Go';

/* taille lisible (Ko / Mo) à partir d'un nombre d'octets */
export const fmtSize = (bytes: number) =>
  bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + ' Ko' : (bytes / 1048576).toFixed(1).replace('.', ',') + ' Mo';


export const titleFrom = (t: string) => {
  const c = t.replace(/\s+/g, ' ').trim();
  const s = c.length > 34 ? c.slice(0, 34).replace(/\s\S*$/, '') + '…' : c;
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const dayOf = (ts: number) => {
  const d = new Date(ts);
  const t = new Date();
  const midnight = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((midnight - that) / 86400000);
  return Math.max(0, diff);
};

export const hhmm = (ts: number) => {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

export const nowHM = () => hhmm(Date.now());
