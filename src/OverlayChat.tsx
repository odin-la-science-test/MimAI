/* Discussion flottante : le chat de l'app, utilisable par-dessus n'importe quelle autre appli.
   Même moteur (modèle local, mémoire, style appris), mêmes modes, même enregistrement des conversations.
   La fenêtre native envoie les messages et les actions (mode, modèle, nouvelle discussion, régénérer, écouter) ;
   ce composant répond et lui renvoie l'état à afficher. Rien ne sort de l'appareil. */
import { useEffect, useRef } from 'react';
import { useApp } from './state';
import { generateDetailed } from './services/engine';
import { activeAdapter } from './services/training';
import { uid } from './services/db';
import type { Msg } from './services/db';
import { MODELS } from './services/net';
import { modelForMode, candidatesFor, assign, nextModel } from './services/modes';
import type { FnMode } from './services/modes';
import { titleFrom } from './theme';
import { speak, stopSpeaking } from './services/speak';
import { trail } from './services/crashlog';
import { overlayAvailable, overlayChatOn, overlayChatText, overlayChatState } from './services/overlay';

type Mode = 'rapide' | 'reflexion' | 'vision' | 'outils';

export function OverlayChat() {
  const { data, patchData, setActiveModel } = useApp();
  const dataRef = useRef(data);
  dataRef.current = data;
  const patchRef = useRef(patchData);
  patchRef.current = patchData;
  const setModelRef = useRef(setActiveModel);
  setModelRef.current = setActiveModel;
  const convId = useRef<string | null>(null);
  const hist = useRef<Msg[]>([]);
  const busy = useRef(false);
  /* choix faits dans la fenêtre : appliqués tout de suite, avant que l'état de l'app ait eu le temps de suivre */
  const modeRef = useRef<Mode | null>(null);
  /* mode et modèle FIXÉS au premier message de la discussion */
  const convMode = useRef<Mode | null>(null);
  const convModel = useRef<string | null>(null);

  const curMode = (): Mode => convMode.current ?? modeRef.current ?? dataRef.current.settings.mode;
  /* le modèle dépend de la fonction (mode) : celui que l'utilisateur lui a associé, sinon le modèle actif */
  const curModel = (): string => {
    const st = dataRef.current.settings;
    return convModel.current && st.installed.includes(convModel.current) ? convModel.current : modelForMode(st.installed, st.activeModel, st.modeModels, curMode());
  };

  const pushState = (reset: boolean) => {
    overlayChatState(JSON.stringify({
      reset, locked: hist.current.length > 0, mode: curMode(), model: MODELS[curModel()]?.name || curModel(),
      msgs: reset ? hist.current.map(m => ({ role: m.role === 'user' ? 'user' : 'ai', text: m.text })) : undefined,
    }));
  };

  const answer = async (raw: string, regen = false) => {
    const text = raw.trim();
    if (!text) return;
    if (busy.current) { overlayChatText('Une réponse est déjà en cours…', true); return; }
    busy.current = true;
    const d = dataRef.current;
    const id = convId.current ?? uid('c');
    const isNew = convId.current === null;
    convId.current = id;
    if (isNew || !convMode.current) { convMode.current = curMode(); convModel.current = curModel(); }   /* premier message : on fige le moteur */
    trail('discussion flottante : question ' + text.length + ' car., mode ' + curMode() + (regen ? ' (régénération)' : ''));
    const prev = regen ? hist.current.slice(0, -1) : hist.current;   /* en régénération, la question est déjà la dernière */
    if (!regen) {
      const um: Msg = { id: uid('m'), role: 'user', text, ts: Date.now(), feedback: null };
      hist.current = [...hist.current, um];
      patchRef.current(x => {
        if (isNew) x.convs.unshift({ id, title: titleFrom(text), ts: Date.now(), trainFlag: 'yes', msgs: [um], mode: convMode.current ?? undefined, model: convModel.current ?? undefined });
        else { const c = x.convs.find(v => v.id === id); if (c) { c.msgs.push(um); c.ts = Date.now(); } }
      });
    }
    let lastSent = 0;
    try {
      const info = await generateDetailed({
        history: prev, userText: text, mode: curMode(),
        docs: d.docs, memories: d.memories, adapterRules: activeAdapter(d)?.rules || [], examples: d.tex,
        modelName: curModel(),
        onText: t => { const n = Date.now(); if (n - lastSent > 120) { lastSent = n; overlayChatText(t, false); } },
      });
      const am: Msg = { id: uid('m'), role: 'ai', text: info.text, ts: Date.now(), feedback: null, model: info.real ? (MODELS[curModel()]?.name || 'local') : 'Moteur intégré' };
      hist.current = [...hist.current, am];
      patchRef.current(x => { const c = x.convs.find(v => v.id === id); if (c) c.msgs.push(am); });
      overlayChatText(info.text, true);
    } catch {
      overlayChatText('Mìmir n’a pas pu répondre. Réessayez.', true);
    }
    busy.current = false;
  };

  const onAction = (type: string, arg: string) => {
    if (type === 'mode' && hist.current.length === 0 && (arg === 'rapide' || arg === 'reflexion' || arg === 'outils')) {
      modeRef.current = arg;
      patchRef.current(x => { x.settings.mode = arg; });
      pushState(false);
    } else if (type === 'new') {
      convId.current = null; hist.current = []; busy.current = false;
      convMode.current = null; convModel.current = null; modeRef.current = null;
      stopSpeaking();
      pushState(true);
    } else if (type === 'regen') {
      const h = hist.current;
      if (busy.current || h.length < 2 || h[h.length - 1].role !== 'ai' || h[h.length - 2].role !== 'user') return;
      const gone = h[h.length - 1];
      const q = h[h.length - 2];
      hist.current = h.slice(0, -1);
      patchRef.current(x => { const c = x.convs.find(v => v.id === convId.current); if (c) c.msgs = c.msgs.filter(m => m.id !== gone.id); });
      pushState(true);
      void answer(q.text, true);
    } else if (type === 'speak') {
      speak(arg);
    }
  };

  useEffect(() => {
    if (!overlayAvailable()) return;
    const off = overlayChatOn(
      () => { modeRef.current = null; pushState(true); },   /* ouverture : on garde la conversation en cours */
      text => { void answer(text); },
      onAction,
    );
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
