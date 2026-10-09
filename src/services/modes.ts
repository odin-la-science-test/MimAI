/* MiMai — un moteur d'IA par fonction (Rapide, Réflexion, Outils, Vision). Module pur, testable sous Node.
   Chaque fonction peut avoir son propre modèle ; sans choix (ou si le modèle choisi n'est plus installé),
   c'est le modèle actif qui répond. Le moteur ne garde qu'UN modèle en mémoire à la fois : passer d'une
   fonction à une autre avec un modèle différent recharge le modèle (quelques secondes). */

export type FnMode = 'rapide' | 'reflexion' | 'outils' | 'vision';
export const FN_MODES: FnMode[] = ['rapide', 'reflexion', 'outils', 'vision'];
export const FN_LABEL: Record<FnMode, string> = { rapide: 'Rapide', reflexion: 'Réflexion', outils: 'Outils', vision: 'Vision' };
export const FN_HINT: Record<FnMode, string> = {
  rapide: 'Questions courtes du quotidien : un petit modèle rapide convient.',
  reflexion: 'Raisonnement, maths, problèmes : un modèle plus capable, quitte à être plus lent.',
  outils: 'Code, formats, textes structurés : un modèle fort en code.',
  vision: 'Analyse d’images : demande un modèle capable de voir les images.',
};

export type ModeModels = Partial<Record<FnMode, string>>;

/* modèle à utiliser pour une fonction : le choix de l'utilisateur s'il est installé, sinon le modèle actif */
export function modelForMode(installed: string[], active: string, assigned: ModeModels | undefined, mode: string): string {
  const pick = assigned?.[mode as FnMode];
  return pick && installed.includes(pick) ? pick : active;
}

/* un modèle voit-il les images ? seules les étiquettes du catalogue font foi (aucune supposition) */
export const isVisionModel = (m: { tags?: string[] } | undefined): boolean => !!m && Array.isArray(m.tags) && m.tags.includes('vision');

/* choix proposés pour une fonction : tous les modèles installés ; pour la vision, seulement ceux qui voient les images */
export function candidatesFor(mode: FnMode, installed: string[], defs: Record<string, { tags?: string[] } | undefined>): string[] {
  return installed.filter(id => !!defs[id] && (mode !== 'vision' || isVisionModel(defs[id])));
}

/* nouvelle table de choix après une sélection ; id = null revient à « automatique » ; les choix périmés sont retirés */
export function assign(current: ModeModels | undefined, mode: FnMode, id: string | null, installed: string[]): ModeModels {
  const next: ModeModels = {};
  for (const m of FN_MODES) {
    const v = m === mode ? id : current?.[m];
    if (v && installed.includes(v)) next[m] = v;
  }
  return next;
}

/* modèle suivant parmi les candidats (boucle) ; sert à la fenêtre flottante */
export function nextModel(list: string[], current: string): string | null {
  if (!list.length) return null;
  const i = list.indexOf(current);
  return list[(i + 1) % list.length];
}
