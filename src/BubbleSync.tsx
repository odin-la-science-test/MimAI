/* Garde la bulle Mìmir cohérente avec le choix de l'utilisateur.
   Au démarrage et à chaque retour au premier plan (par exemple après l'écran d'autorisation d'Android),
   si la bulle est ACTIVÉE par l'utilisateur ET que la permission est accordée, on l'affiche.
   Rien ne s'active sans le choix explicite de l'utilisateur (règle Google Play + vie privée). */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useApp } from './state';
import { overlayAvailable, overlayGranted, overlayShow } from './services/overlay';

export function BubbleSync() {
  const { data, ready } = useApp();
  const want = useRef(false);
  want.current = !!(data.settings.comp.on && data.settings.comp.overlay);

  useEffect(() => {
    if (!overlayAvailable()) return;
    const sync = async () => {
      if (!want.current) return;
      if (await overlayGranted()) await overlayShow();
    };
    if (ready) void sync();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') void sync(); });
    return () => sub.remove();
  }, [ready, data.settings.comp.on, data.settings.comp.overlay]);

  return null;
}
