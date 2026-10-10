/* La barre de la caméra vit avec l'app : elle réfléchit pendant une réponse, écoute pendant la dictée, montre la progression
   d'un téléchargement ou d'un entraînement, puis réagit au résultat. Tout est no-op sans le module natif (Expo Go, build sans barre). */
import { overlayBarState, overlayBarPlay } from './overlay';

let lastAt = 0;
let lastP = -1;

export const barThink = (on: boolean): void => { overlayBarState(on ? 'reflexion' : 'repos'); };
export const barListen = (on: boolean): void => { overlayBarState(on ? 'ecoute' : 'repos'); };

/* progression (0..1) d'une tâche longue ; limitée à quelques mises à jour par seconde */
export function barProgress(label: string, p: number): void {
  const now = Date.now();
  const q = Math.max(0, Math.min(1, p));
  if (now - lastAt < 350 && Math.abs(q - lastP) < 0.02 && q < 1) return;
  lastAt = now; lastP = q;
  overlayBarState('activite', { label, prog: q });
}

/* fin d'une tâche : retour au repos puis petite animation (eureka = réponse trouvée, termine, erreur, confus…) */
export function barDone(anim: string = 'eureka'): void {
  lastP = -1;
  overlayBarState('repos');
  overlayBarPlay(anim);
}

export const barPlay = (id: string): void => { overlayBarPlay(id); };
