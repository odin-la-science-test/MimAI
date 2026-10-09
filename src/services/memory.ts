/* MiMai — mémoire (README §6) : apprentissage immédiat, distinct de
   l'entraînement. "Je préfère les réponses courtes" est enregistré et
   réinjecté dans les conversations suivantes. */
import type { Memory } from './db';
import { uid } from './db';

interface Rule { re: RegExp; kind: Memory['kind']; fmt: (m: RegExpMatchArray) => string }

const RULES: Rule[] = [
  { re: /je préf[eè]re (?:les |des |que |du |la |le |)(.{3,80})/i, kind: 'préférence', fmt: m => 'Préfère ' + m[1].replace(/[.!?]+$/, '') },
  { re: /r[ée]tiens(?:-moi)? que (.{3,90})/i, kind: 'fait', fmt: m => m[1].replace(/[.!?]+$/, '') },
  { re: /n['’]oublie pas (?:que )?(.{3,90})/i, kind: 'fait', fmt: m => m[1].replace(/[.!?]+$/, '') },
  { re: /je m['’]appelle (.{2,40})/i, kind: 'fait', fmt: m => 'S\u2019appelle ' + m[1].replace(/[.!?]+$/, '') },
  { re: /je (?:travaille|bosse) (?:chez|à|dans) (.{2,60})/i, kind: 'fait', fmt: m => 'Travaille chez ' + m[1].replace(/[.!?]+$/, '') },
  { re: /(?:réponds?-?moi|parle) (?:plus )?(?:courtement|court|brièvement|simplement)/i, kind: 'style', fmt: () => 'Réponses courtes' },
  { re: /(?:réponds?-?moi|parle) (?:plus )?(?:longuement|en détail)/i, kind: 'style', fmt: () => 'Réponses détaillées' },
  { re: /tutoie(?:-moi)?|appelle-moi par mon prénom/i, kind: 'style', fmt: () => 'Tutoiement' },
  { re: /vouvoie(?:-moi)?/i, kind: 'style', fmt: () => 'Vouvoiement' },
  { re: /je d[ée]teste (.{3,80})/i, kind: 'préférence', fmt: m => 'À éviter : ' + m[1].replace(/[.!?]+$/, '') },
];

/* déduit des mémoires depuis un message utilisateur ; renvoie null si rien */
export function extractMemory(text: string): Memory | null {
  for (const r of RULES) {
    const m = text.match(r.re);
    if (m) return { id: uid('mem'), text: r.fmt(m), kind: r.kind, ts: Date.now(), enabled: true };
  }
  return null;
}

/* mémoires actives → lignes de contexte pour le moteur */
export function memoryLines(mems: Memory[]): string[] {
  return mems.filter(m => m.enabled).map(m => '- ' + m.text);
}

/* détection d'un message qui ressemble à une préférence, pour accusé local */
export function looksLikePreference(text: string): boolean {
  return RULES.some(r => r.re.test(text));
}

