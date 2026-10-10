/* La bulle de discussion : le chat de l'app, utilisable par-dessus n'importe quelle autre appli, SANS ouvrir MiMai.
   Tout se fait dans la bulle : choix du mode et du modèle (tant que la discussion est vide), texte, voix (micro), photo
   (fonction Vision), copier / écouter / régénérer, nouvelle discussion. Même moteur que l'app (modèle local, mémoire, style
   appris), mêmes discussions enregistrées. Le mode et le modèle sont FIXÉS dès le premier message. Rien ne sort de l'appareil. */
import { useEffect, useRef } from 'react';
import { useApp } from './state';
import { generateDetailed } from './services/engine';
import { activeAdapter } from './services/training';
import { uid } from './services/db';
import type { Msg } from './services/db';
import { MODELS } from './services/net';
import { modelForMode, candidatesFor, assign, isVisionModel } from './services/modes';
import type { FnMode } from './services/modes';
import { titleFrom } from './theme';
import { speak, stopSpeaking, speakAvailable } from './services/speak';
import { listen, voiceAvailable, describeVoiceFailure } from './services/voice';
import type { Listening } from './services/voice';
import { trail } from './services/crashlog';
import { barThink, barListen, barDone } from './services/bar';
import { overlayAvailable, overlayChatOn, overlayChatText, overlayChatState, overlayChatInput, overlayChatMic } from './services/overlay';

type Mode = 'rapide' | 'reflexion' | 'vision' | 'outils';

export function OverlayChat() {
  const { data, patchData } = useApp();
  const dataRef = useRef(data);
  dataRef.current = data;
  const patchRef = useRef(patchData);
  patchRef.current = patchData;
  const convId = useRef<string | null>(null);
  const hist = useRef<Msg[]>([]);
  const busy = useRef(false);
  const modeRef = useRef<Mode | null>(null);        /* choix fait dans la bulle, avant le premier message */
  const convMode = useRef<Mode | null>(null);       /* mode et modèle FIXÉS au premier message de la discussion */
  const convModel = useRef<string | null>(null);
  const session = useRef<Listening | null>(null);
  const voiceTurn = useRef(false);

  const curMode = (): Mode => convMode.current ?? modeRef.current ?? dataRef.current.settings.mode;
  const curModel = (): string => {
    const st = dataRef.current.settings;
    return convModel.current && st.installed.includes(convModel.current) ? convModel.current : modelForMode(st.installed, st.activeModel, st.modeModels, curMode());
  };
  const defs = MODELS as unknown as Record<string, { tags?: string[] } | undefined>;

  const pushState = (reset: boolean) => {
    const st = dataRef.current.settings;
    const mode = curMode();
    const hasVision = isVisionModel(MODELS[curModel()]);
    const locked = hist.current.length > 0;
    overlayChatState(JSON.stringify({
      reset, locked, mode,
      model: MODELS[curModel()]?.name || 'moteur intégré',
      models: candidatesFor(mode as FnMode, st.installed, defs).map(id => ({ id, name: MODELS[id].name })),
      canPhoto: mode === 'vision' && hasVision,
      micOk: voiceAvailable(),
      hint: mode === 'vision' && !hasVision ? 'Aucun modèle de vision installé. Ouvrez MiMai → Modèles → Un moteur par fonction → Vision pour en installer un.' : '',
      msgs: reset ? hist.current.map(m => ({ role: m.role === 'user' ? 'user' : 'ai', text: m.text, image: m.image || undefined })) : undefined,
    }));
  };

  const answer = async (raw: string, image: string | null = null, regen = false) => {
    const text = raw.trim();
    if (!text) return;
    if (busy.current) { overlayChatText('Une réponse est déjà en cours…', true); return; }
    busy.current = true;
    const d = dataRef.current;
    const id = convId.current ?? uid('c');
    const isNew = convId.current === null;
    convId.current = id;
    if (isNew || !convMode.current) { convMode.current = curMode(); convModel.current = curModel(); pushState(false); }   /* premier message : on fige le moteur */
    const mode = curMode();
    const photo = mode === 'vision' && image ? image : null;
    barThink(true);
    trail('bulle : question ' + text.length + ' car., mode ' + mode + (photo ? ', avec photo' : '') + (regen ? ' (régénération)' : ''));
    const prev = regen ? hist.current.slice(0, -1) : hist.current;   /* en régénération, la question est déjà la dernière */
    if (!regen) {
      const um: Msg = { id: uid('m'), role: 'user', text, ts: Date.now(), feedback: null, image: photo ? 'file://' + photo.replace(/^file:\/\//, '') : null };
      hist.current = [...hist.current, um];
      patchRef.current(x => {
        if (isNew) x.convs.unshift({ id, title: titleFrom(text), ts: Date.now(), trainFlag: 'yes', msgs: [um], mode: convMode.current ?? undefined, model: convModel.current ?? undefined });
        else { const c = x.convs.find(v => v.id === id); if (c) { c.msgs.push(um); c.ts = Date.now(); } }
      });
    }
    let lastSent = 0;
    try {
      const info = await generateDetailed({
        history: prev, userText: text, mode,
        docs: d.docs, memories: d.memories, adapterRules: activeAdapter(d)?.rules || [], examples: d.tex,
        modelName: curModel(), image: photo,
        onText: t => { const n = Date.now(); if (n - lastSent > 120) { lastSent = n; overlayChatText(t, false); } },
      });
      const am: Msg = { id: uid('m'), role: 'ai', text: info.text, ts: Date.now(), feedback: null, model: info.real ? (MODELS[curModel()]?.name || 'local') : 'Moteur intégré' };
      hist.current = [...hist.current, am];
      patchRef.current(x => { const c = x.convs.find(v => v.id === id); if (c) c.msgs.push(am); });
      overlayChatText(info.text, true);
      barDone('eureka');
      if ((voiceTurn.current || dataRef.current.settings.comp.speak) && speakAvailable()) speak(info.text);
    } catch {
      overlayChatText('Mìmir n’a pas pu répondre. Réessayez.', true);
      barDone('confus');
    }
    voiceTurn.current = false;
    busy.current = false;
  };

  /* micro de la bulle : reconnaissance sur l'appareil. Android peut refuser le micro à une appli en arrière-plan : on le dit. */
  const toggleMic = async () => {
    if (session.current) { session.current.stop(); return; }
    if (busy.current) return;
    if (!voiceAvailable()) { overlayChatText(describeVoiceFailure('unavailable'), true); return; }
    overlayChatMic(true);
    barListen(true);
    session.current = await listen({
      onPartial: t => overlayChatInput(t),
      onFinal: t => { if (t) { overlayChatInput(''); voiceTurn.current = true; stopSpeaking(); void answer(t); } },
      onEnd: () => { session.current = null; overlayChatMic(false); if (!busy.current) barListen(false); },
      onFail: r => {
        session.current = null; overlayChatMic(false);
        overlayChatText(describeVoiceFailure(r) + ' Sur certains téléphones, le micro ne marche que si MiMai est ouvert : touchez « Ouvrir MiMai » pour dicter.', true);
      },
    });
  };

  const onAction = (type: string, arg: string) => {
    const locked = hist.current.length > 0;
    if (type === 'mode' && !locked && (arg === 'rapide' || arg === 'reflexion' || arg === 'outils' || arg === 'vision')) {
      modeRef.current = arg;
      patchRef.current(x => { x.settings.mode = arg; });
      dataRef.current = { ...dataRef.current, settings: { ...dataRef.current.settings, mode: arg } };
      pushState(false);
    } else if (type === 'model' && !locked) {
      /* associe à la fonction courante le modèle choisi dans la liste de la bulle */
      const st = dataRef.current.settings;
      const mode = curMode() as FnMode;
      if (!candidatesFor(mode, st.installed, defs).includes(arg)) return;
      patchRef.current(x => { x.settings.modeModels = assign(x.settings.modeModels, mode, arg, x.settings.installed); });
      dataRef.current = { ...dataRef.current, settings: { ...dataRef.current.settings, modeModels: assign(st.modeModels, mode, arg, st.installed) } };
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
      void answer(q.text, q.image || null, true);
    } else if (type === 'speak') {
      speak(arg);
    } else if (type === 'mic') {
      void toggleMic();
    }
  };

  useEffect(() => {
    if (!overlayAvailable()) return;
    const off = overlayChatOn(
      () => { modeRef.current = null; pushState(true); },   /* ouverture : on garde la conversation en cours */
      (text, image) => { void answer(text, image || null); },
      onAction,
    );
    return () => { session.current?.cancel(); off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
