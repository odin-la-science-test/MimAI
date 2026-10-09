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
  const bar = useRef(false);
  bar.current = !!data.settings.comp.bar;

  useEffect(() => {
    if (!overlayAvailable()) return;
    const sync = async () => {
      if (!want.current) return;
      if (await overlayGranted()) await overlayShow(bar.current);
    };
    if (ready) void sync();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') void sync(); });
    return () => sub.remove();
  }, [ready, data.settings.comp.on, data.settings.comp.overlay, data.settings.comp.bar]);

  return null;
}
