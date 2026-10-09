/* Discussion flottante : répond aux messages saisis dans la fenêtre qui s'ouvre sous la barre de la caméra.
   Le moteur est le même que dans l'app (modèle local, mémoire, style appris) ; la conversation est enregistrée
   comme les autres. Rien ne sort de l'appareil. Une nouvelle fenêtre = une nouvelle conversation. */
import { useEffect, useRef } from 'react';
import { useApp } from './state';
import { generateDetailed } from './services/engine';
import { activeAdapter } from './services/training';
import { uid } from './services/db';
import type { Msg } from './services/db';
import { MODELS } from './services/net';
import { titleFrom } from './theme';
import { overlayAvailable, overlayChatOn, overlayChatText } from './services/overlay';

export function OverlayChat() {
  const { data, patchData } = useApp();
  const dataRef = useRef(data);
  dataRef.current = data;
  const patchRef = useRef(patchData);
  patchRef.current = patchData;
  const convId = useRef<string | null>(null);
  const hist = useRef<Msg[]>([]);
  const busy = useRef(false);

  useEffect(() => {
    if (!overlayAvailable()) return;
    const off = overlayChatOn(
      () => { convId.current = null; hist.current = []; busy.current = false; },
      text => { void answer(text); },
    );
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const answer = async (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    if (busy.current) { overlayChatText('Une réponse est déjà en cours…', true); return; }
    busy.current = true;
    const d = dataRef.current;
    const id = convId.current ?? uid('c');
    const isNew = convId.current === null;
    convId.current = id;
    const um: Msg = { id: uid('m'), role: 'user', text, ts: Date.now(), feedback: null };
    const prev = hist.current;
    hist.current = [...prev, um];
    patchRef.current(x => {
      if (isNew) x.convs.unshift({ id, title: titleFrom(text), ts: Date.now(), trainFlag: 'yes', msgs: [um] });
      else { const c = x.convs.find(v => v.id === id); if (c) { c.msgs.push(um); c.ts = Date.now(); } }
    });
    let lastSent = 0;
    try {
      const info = await generateDetailed({
        history: prev, userText: text, mode: d.settings.mode === 'reflexion' ? 'reflexion' : 'rapide',
        docs: d.docs, memories: d.memories, adapterRules: activeAdapter(d)?.rules || [], examples: d.tex,
        modelName: d.settings.activeModel,
        onText: t => { const n = Date.now(); if (n - lastSent > 120) { lastSent = n; overlayChatText(t, false); } },
      });
      const am: Msg = { id: uid('m'), role: 'ai', text: info.text, ts: Date.now(), feedback: null, model: info.real ? (MODELS[d.settings.activeModel]?.name || 'local') : 'Moteur intégré' };
      hist.current = [...hist.current, am];
      patchRef.current(x => { const c = x.convs.find(v => v.id === id); if (c) c.msgs.push(am); });
      overlayChatText(info.text, true);
    } catch {
      overlayChatText('Mìmir n’a pas pu répondre. Réessayez.', true);
    }
    busy.current = false;
  };

  return null;
}
