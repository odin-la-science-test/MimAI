/* MiMai — état global : données persistées (SQLite chiffré) + état éphémère.
   Actions : conversation, mémoire, RAG, modèles, entraînement, réseau, compte. */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AppData, Conv, Doc, Msg, Memory, TEx } from './services/db';
import { freshData, loadAll, saveAll, wipeData, uid } from './services/db';
import { NET, installModel, MODELS, ORDER, setNetLogger, deleteModelFile } from './services/net';
import { DEFAULT_MODEL_ID } from './services/catalog';
import { scanModelFiles } from './services/modelFiles';
import { reconcile } from './services/installed';
import type { ModelManifest, PhaseInfo } from './services/net';
import { generateDetailed, planSteps, prewarm, seedSpeed, takeSnapshot, setCompat } from './services/engine';
import { MAX_SNAPSHOTS } from './services/bench';
import { setVoicePrefs } from './services/speak';
import { trail, recordJsError } from './services/crashlog';
import { appExits } from './services/overlay';
import { extractMemory } from './services/memory';
import { ensureIndexed } from './services/rag';
import { activeAdapter, trainAndEvaluate, rollbackToPrevious, applyOutcome } from './services/training';
import { titleFrom, nowHM, fmtGo } from './theme';

export type DlState = { id: string; phase: string; pct: number; info?: PhaseInfo } | null;

interface Ephemeral {
  chatId: string | null;
  draft: string;
  busy: boolean;
  thinking: boolean;
  steps: string[];
  step: number;
  stream: { text: string } | null;
  streamSource: string | null;
  toast: string;
  dialog: { kind: 'correction' | 'deleteConv' | 'confirm'; msg?: Msg; conv?: Conv; text?: string } | null;
  dl: DlState;
  island: boolean;
}

interface AppCtx {
  data: AppData;
  ready: boolean;
  e: Ephemeral;
  set: React.Dispatch<React.SetStateAction<Ephemeral>>;
  patchData: (fn: (d: AppData) => void) => void;
  toast: (t: string) => void;
  /* conversation */
  sendMessage: (text: string, forcedDoc?: Doc | null, regenOf?: string) => Promise<void>;
  /* régénère une réponse : repose la même question (sans la dupliquer) et remplace la réponse `msg` */
  regenerate: (conv: Conv, msg: Msg) => void;
  newChat: () => void;
  deleteConv: (id: string) => void;
  setTrainFlag: (id: string, flag: Conv['trainFlag']) => void;
  feedback: (convId: string, msg: Msg, kind: 'good' | 'bad') => void;
  saveCorrection: (conv: Conv, msg: Msg, fix: string, tags?: string[]) => void;
  /* bibliothèque */
  addDoc: (doc: { name: string; type: string; text: string }) => void;
  removeDoc: (id: string) => void;
  /* mémoire */
  addMemory: (text: string) => void;
  toggleMemory: (id: string) => void;
  deleteMemory: (id: string) => void;
  /* modèles */
  installModelFlow: (id: string, onPhase: (phase: string, pct: number, info?: PhaseInfo) => void) => Promise<ModelManifest>;
  setActiveModel: (id: string) => void;
  removeModel: (id: string) => void;
  /* réseau */
  authorizeNet: (reason: string) => void;
  blockNet: (reason: string) => void;
  /* entraînement */
  /* instantané de benchmark pris à la main (vitesse + qualité de la configuration active) */
  snapshot: (label: string, onTick: (pct: number) => void) => Promise<boolean>;
  runTraining: (goal: string, opts: { useExamples: boolean; useConvs: boolean; useDocs: boolean }, onTick: (p: number, step: number) => void) => Promise<void>;
  rollback: () => void;
  toggleAdapter: (id: string) => void;
  addExample: (q: string, target: string) => void;
  /* divers */
  wipe: (what: 'data' | 'all') => void;
  exportDiagnostic: () => string;
}

const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp hors provider');
  return v;
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(freshData);
  const [ready, setReady] = useState(false);
  const [e, set] = useState<Ephemeral>({
    chatId: null, draft: '', busy: false, thinking: false, steps: [], step: 0,
    stream: null, streamSource: null, toast: '', dialog: null, dl: null, island: false,
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runToken = useRef(0);

  const dataRef = useRef<AppData>(data);
  dataRef.current = data;

  const onErr = (msg: string, stack?: string) => {
    setData(d => ({ ...d, crashes: [{ t: Date.now(), msg: msg.slice(0, 200), stack: (stack || '').slice(0, 600) }, ...d.crashes].slice(0, 10) }));
  };

  useEffect(() => {
    let alive = true;
    /* DEFAULT DENY : au démarrage le réseau est toujours bloqué (rien n'est restauré) */
    NET.block();
    setNetLogger(ev => {
      setData(d => {
        const netLog = [{ t: Date.now(), ev }, ...d.netLog].slice(0, 40);
        return { ...d, netLog };
      });
    });
    /* l'état « Internet autorisé » affiché par les écrans suit la politique réseau réelle */
    const unsubNet = NET.subscribe(until => {
      setData(d => (d.settings.netUntil === until ? d : { ...d, settings: { ...d.settings, netUntil: until } }));
    });
    (async () => {
      try {
        const loaded = await loadAll();
        /* une base écrite par une ancienne version peut référencer un modèle disparu du catalogue */
        loaded.settings.installed = (loaded.settings.installed || []).filter(id => !!MODELS[id]);
        setVoicePrefs(loaded.settings.voice);
        setCompat(!!loaded.settings.compat);
        seedSpeed(loaded.settings.speed); /* vitesses mesurées lors des sessions précédentes : longueur de réponse adaptée dès la 1re question */
        /* « Wi-Fi uniquement » n'a aucune option dans l'app : une ancienne valeur true bloquerait la 4G/5G sans recours */
        loaded.settings.wifiOnly = false;
        loaded.settings.comp = { ...freshData().settings.comp, ...loaded.settings.comp }; /* nouveaux réglages (speak) pour les anciennes bases */
        if (!MODELS[loaded.settings.activeModel]) loaded.settings.activeModel = loaded.settings.installed[0] || DEFAULT_MODEL_ID;
        /* détection des modèles déjà présents : les FICHIERS font foi (mise à jour de l'app, réglages réinitialisés, fichier
           importé…). Un modèle dont le fichier a disparu est retiré de la liste ; un fichier valide non listé y est ajouté. */
        const onDisk = await scanModelFiles();
        if (onDisk) {
          const r = reconcile(loaded.settings.installed, onDisk, loaded.settings.activeModel, DEFAULT_MODEL_ID);
          loaded.settings.installed = r.installed;
          loaded.settings.activeModel = r.activeModel;
        }
        /* Android a-t-il fermé MiMai de façon anormale depuis la dernière fois ? On le dit et on indique où trouver le rapport. */
        const bad = appExits().find(x => /plantage|MÉMOIRE|ne répond/.test(x.reason));
        if (bad && bad.time > (loaded.settings.crashSeen || 0)) {
          loaded.settings.crashSeen = bad.time;
          trail('fermeture anormale détectée au démarrage : ' + bad.reason);
          setTimeout(() => toast('MiMai s’est fermé la dernière fois. Menu ⋯ → Rapport de plantage : copiez-le pour qu’on corrige.'), 2500);
        }
        if (alive) setData(d => ({ ...loaded, netLog: [...d.netLog, ...loaded.netLog].slice(0, 40) }));
      } catch (err) {
        onErr('Lecture de la base impossible : ' + (err instanceof Error ? err.message : String(err)));
      }
      if (alive) setReady(true);
    })();
    /* journalise les erreurs JS non gérées, puis laisse le gestionnaire d'origine agir */
    type Handler = (e: { message?: string; stack?: string }, isFatal?: boolean) => void;
    const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler?: () => Handler; setGlobalHandler: (h: Handler) => void } };
    const previous = g.ErrorUtils?.getGlobalHandler?.();
    g.ErrorUtils?.setGlobalHandler((err, isFatal) => {
      onErr(err.message || 'Erreur', err.stack);
      previous?.(err, isFatal);
    });
    return () => { alive = false; unsubNet(); if (previous) g.ErrorUtils?.setGlobalHandler(previous); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* persistance différée (400 ms) + sauvegarde immédiate quand l'app passe en arrière-plan */
  const persist = () => { saveAll(dataRef.current).catch(err => { onErr('Sauvegarde impossible : ' + (err instanceof Error ? err.message : String(err))); }); };
  useEffect(() => {
    if (!ready) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveTimer.current = null; persist(); }, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ready]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', st => {
      if (st !== 'active' && ready) {
        if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
        persist();
      }
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  /* préchauffage : le modèle actif est chargé et son prompt système traité avant la première question */
  useEffect(() => {
    if (!ready || !data.settings.installed.includes(data.settings.activeModel)) return;
    const t = setTimeout(() => { void prewarm(data.settings.activeModel, { memories: data.memories, adapterRules: activeAdapter(data)?.rules || [], docs: [] }); }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, data.settings.activeModel, data.settings.installed.length, data.adapters, data.memories]);

  const patchData = (fn: (d: AppData) => void) => setData(prev => { const copy: AppData = JSON.parse(JSON.stringify(prev)); fn(copy); return copy; });

  const toast = (t: string) => {
    set(s => ({ ...s, toast: t }));
    setTimeout(() => set(s => (s.toast === t ? { ...s, toast: '' } : s)), 2600);
  };

  /* ─────────── conversation ─────────── */
  const sendMessage = async (text0: string, forcedDoc?: Doc | null, regenOf?: string) => {
    const text = text0.trim();
    if (!text || e.busy) return;
    const token = ++runToken.current;
    trail('question reçue : ' + text.length + ' car., mode ' + data.settings.mode + ', modèle ' + data.settings.activeModel);

    const convId = e.chatId || uid('c');
    const isNew = !e.chatId || !data.convs.some(c => c.id === convId);
    const um: Msg = { id: uid('m'), role: 'user', text, ts: Date.now(), feedback: null };
    /* régénération : l'historique s'arrête avant la question (qui reste en place) ; la réponse remplacée est retirée plus bas */
    const convMsgs = isNew ? [] : (data.convs.find(c => c.id === convId)?.msgs || []);
    const regenIdx = regenOf ? convMsgs.findIndex(m => m.id === regenOf) : -1;
    const regen = regenIdx > 0;
    const prevMsgs: Msg[] = regen ? convMsgs.slice(0, regenIdx - 1) : convMsgs;

    const steps = planSteps({ history: prevMsgs, userText: text, mode: data.settings.mode, docs: data.docs, memories: data.memories, adapterRules: [], examples: data.tex, modelName: data.settings.activeModel, forcedDoc });
    set(s => ({
      ...s, chatId: convId, draft: '', busy: true, thinking: true, steps, step: 0, stream: null, streamSource: null,
    }));

    patchData(d => {
      if (regen) {
        const c = d.convs.find(x => x.id === convId);
        if (c) { c.msgs = c.msgs.filter(m => m.id !== regenOf); c.ts = Date.now(); }
        return;
      }
      if (isNew) {
        d.convs.unshift({ id: convId, title: titleFrom(text), ts: Date.now(), trainFlag: 'yes', msgs: [um] });
      } else {
        const c = d.convs.find(x => x.id === convId)!;
        c.msgs.push(um);
        c.ts = Date.now();
      }
      /* mémoire immédiate (README §6-7) */
      if (d.settings.memOn) {
        const mem = extractMemory(text);
        if (mem) d.memories.unshift(mem);
      }
    });

    /* étapes affichées tant que le premier mot n'est pas arrivé */
    let i = 0;
    const stepTimer = setInterval(() => {
      if (i < steps.length - 2) { i += 1; set(s => ({ ...s, step: i })); }
    }, 450);
    /* affichage en direct : la réponse apparaît mot à mot, au rythme réel du modèle (plus de délai artificiel) */
    let lastPaint = 0, first = true;
    const onText = (t: string) => {
      if (runToken.current !== token) return;
      const now = Date.now();
      if (!first && now - lastPaint < 60) return;
      first = false; lastPaint = now;
      set(s => ({ ...s, thinking: false, stream: { text: t } }));
    };

    let answer: string;
    let usedRealModel = false;
    try {
      const info = await generateDetailed({
        history: prevMsgs, userText: text, mode: data.settings.mode, docs: data.docs,
        memories: data.memories, adapterRules: activeAdapter(data)?.rules || [], examples: data.tex,
        modelName: data.settings.activeModel, forcedDoc, onText,
      });
      answer = info.text;
      usedRealModel = info.real;
      /* vitesse mesurée de ce modèle sur ce téléphone (affichée dans Modèles) */
      if (info.real && info.tps && info.tps > 0) {
        const id = data.settings.activeModel, v = Math.round(info.tps * 10) / 10;
        patchData(d => { d.settings.speed = { ...(d.settings.speed || {}), [id]: v }; });
      }
      /* modèle installé mais en échec : on le dit, au lieu de répondre en silence avec le moteur intégré */
      if (info.engineError && data.settings.installed.includes(data.settings.activeModel)) {
        onErr('Modèle ' + data.settings.activeModel + ' : ' + info.engineError.slice(0, 200));
        toast('Le modèle n’a pas pu répondre : moteur intégré utilisé.');
      }
    } catch (err) {
      /* le moteur a échoué : on libère l'interface au lieu de rester « en réflexion » */
      clearInterval(stepTimer);
      if (runToken.current === token) {
        set(s => ({ ...s, busy: false, thinking: false, stream: null, streamSource: null }));
        toast('Mìmir n’a pas pu répondre. Réessayez.');
        onErr('Génération : ' + (err instanceof Error ? err.message : String(err)));
        recordJsError('génération', err);
      }
      return;
    }
    clearInterval(stepTimer);
    if (runToken.current !== token) return;

    /* moteur intégré (sans modèle) : pas de jetons en direct, la réponse est affichée d'un coup */
    if (!usedRealModel) set(s => ({ ...s, thinking: false, stream: { text: answer } }));

    const doc = forcedDoc || null;
    const am: Msg = { id: uid('m'), role: 'ai', text: answer, ts: Date.now(), feedback: null, source: doc ? doc.name : null, model: usedRealModel ? (MODELS[data.settings.activeModel]?.name || 'local') : 'Moteur intégré' };
    patchData(d => {
      const c = d.convs.find(x => x.id === convId);
      if (c) c.msgs.push(am);
    });
    set(s => ({ ...s, busy: false, thinking: false, stream: null, streamSource: null }));
    trail('réponse enregistrée (' + answer.length + ' car.)');
  };

  const newChat = () => set(s => ({ ...s, chatId: null, draft: '', stream: null, thinking: false, busy: false }));

  const deleteConv = (id: string) => {
    patchData(d => { d.convs = d.convs.filter(c => c.id !== id); });
    set(s => (s.chatId === id ? { ...s, chatId: null } : s));
    toast('Conversation supprimée');
  };

  const setTrainFlag = (id: string, flag: Conv['trainFlag']) => patchData(d => { const c = d.convs.find(x => x.id === id); if (c) c.trainFlag = flag; });

  const feedback = (convId: string, msg: Msg, kind: 'good' | 'bad') => {
    patchData(d => {
      const c = d.convs.find(x => x.id === convId);
      const m = c?.msgs.find(x => x.id === msg.id);
      if (m) m.feedback = kind;
    });
    if (kind === 'bad') set(s => ({ ...s, dialog: { kind: 'correction', msg } }));
    else toast('Merci ! Utile pour l\u2019entraînement');
  };

  const regenerate = (conv: Conv, msg: Msg) => {
    if (e.busy) return;
    const idx = conv.msgs.findIndex(m => m.id === msg.id);
    const q = conv.msgs[idx - 1];
    if (idx < 1 || !q || q.role !== 'user') return;
    const doc = msg.source ? data.docs.find(d => d.name === msg.source) || null : null;
    void sendMessage(q.text, doc, msg.id);
  };

  const saveCorrection = (conv: Conv, msg: Msg, fix: string, tags: string[] = []) => {
    if (!fix.trim()) return;
    const idx = conv.msgs.findIndex(m => m.id === msg.id);
    const q = conv.msgs[idx - 1];
    const ex: TEx = { id: uid('e'), q: q ? q.text : conv.title, base: msg.text, target: fix.trim(), tags, ts: Date.now(), src: 'conv' };
    patchData(d => { d.tex.push(ex); });
    toast('Correction enregistrée pour l\u2019entraînement');
  };

  /* ─────────── bibliothèque ─────────── */
  const addDoc = (doc: { name: string; type: string; text: string }) => {
    const d0: Doc = { id: uid('d'), name: doc.name, type: doc.type, sizeMb: Math.max(0.01, doc.text.length / 1e6), addedAt: Date.now(), text: doc.text, indexed: false };
    patchData(d => { d.docs.unshift(d0); });
    /* indexation locale réelle : découpage en passages (chunks) hors du fil d'affichage */
    setTimeout(() => {
      patchData(dd => { const x = dd.docs.find(y => y.id === d0.id); if (x) { ensureIndexed(x); x.indexed = true; } });
      toast(doc.name + ' indexé localement');
    }, 250);
  };
  const removeDoc = (id: string) => { patchData(d => { d.docs = d.docs.filter(x => x.id !== id); }); toast('Document retiré'); };

  /* ─────────── mémoire ─────────── */
  const addMemory = (text: string) => {
    const m: Memory = { id: uid('mem'), text, kind: 'fait', ts: Date.now(), enabled: true };
    patchData(d => { d.memories.unshift(m); });
  };
  const toggleMemory = (id: string) => patchData(d => { const m = d.memories.find(x => x.id === id); if (m) m.enabled = !m.enabled; });
  const deleteMemory = (id: string) => patchData(d => { d.memories = d.memories.filter(x => x.id !== id); });

  /* ─────────── modèles ─────────── */
  const installModelFlow = async (id: string, onPhase: (phase: string, pct: number, info?: PhaseInfo) => void): Promise<ModelManifest> => {
    set(s => ({ ...s, dl: { id, phase: 'download', pct: 0 } }));
    try {
      const manifest = await installModel(id, (phase, pct, info) => {
        set(s => ({ ...s, dl: { id, phase, pct, info } }));
        onPhase(phase, pct, info);
      }, { wifiOnly: data.settings.wifiOnly });
      patchData(d => {
        if (!d.settings.installed.includes(id)) d.settings.installed.push(id);
        d.settings.activeModel = id;
      });
      toast(MODELS[id].name + ' installé et vérifié');
      return manifest;
    } finally {
      set(s => ({ ...s, dl: null }));
      NET.block(); /* ceinture et bretelles : retour au mode bloqué quoi qu'il arrive */
    }
  };
  const setActiveModel = (id: string) => { patchData(d => { d.settings.activeModel = id; }); toast(MODELS[id].name + ' est maintenant actif'); };
  const removeModel = (id: string) => {
    patchData(d => {
      d.settings.installed = d.settings.installed.filter(x => x !== id);
      if (d.settings.activeModel === id && d.settings.installed.length) d.settings.activeModel = d.settings.installed[0];
    });
    void deleteModelFile(id); /* supprime aussi les poids du disque (ADR-004) */
    toast('Modèle retiré de l\u2019appareil');
  };

  /* ─────────── réseau ─────────── */
  /* l'état affiché (settings.netUntil) est mis à jour par l'abonnement à NET */
  const authorizeNet = (reason: string) => { NET.authorize(reason); };
  const blockNet = (reason: string) => { NET.block(reason); };

  /* ─────────── entraînement ─────────── */
  const runTraining = async (goal: string, opts: { useExamples: boolean; useConvs: boolean; useDocs: boolean }, onTick: (p: number, step: number) => void) => {
    const result = await trainAndEvaluate(data, goal, opts, onTick);
    patchData(d => { applyOutcome(d, result); });
  };
  const snapshot = async (label: string, onTick: (pct: number) => void): Promise<boolean> => {
    const snap = await takeSnapshot(dataRef.current, label, onTick);
    if (!snap) return false;
    patchData(d => { d.benches = [...(d.benches || []), snap].slice(-MAX_SNAPSHOTS); });
    return true;
  };
  const rollback = () => patchData(d => { rollbackToPrevious(d); });
  const toggleAdapter = (id: string) => patchData(d => { const a = d.adapters.find(x => x.id === id); if (a) a.active = !a.active; });
  const addExample = (q: string, target: string) => {
    const ex: TEx = { id: uid('e'), q, base: '(réponse actuelle)', target, tags: ['court'], ts: Date.now(), src: 'manual' };
    patchData(d => { d.tex.push(ex); });
  };

  const wipe = (what: 'data' | 'all') => {
    /* annule toute sauvegarde différée de l'ancien contenu avant d'effacer */
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    /* la progression du jeu vit dans la WebView : on demande son effacement à la prochaine ouverture du jeu */
    const base = what === 'all'
      ? { ...freshData().settings, onboarded: data.settings.onboarded }
      : data.settings;
    const keep = { ...base, gameReset: true };
    wipeData(keep)
      .then(fresh => { setData(fresh); toast('Données locales supprimées'); })
      .catch(() => toast('Suppression impossible, réessayez'));
  };

  const exportDiagnostic = () => {
    const d = data;
    const dump = {
      exportedAt: new Date().toISOString(), app: 'MiMai', version: '1.0.0',
      counts: { conversations: d.convs.length, documents: d.docs.length, memories: d.memories.length, examples: d.tex.length, adapters: d.adapters.length },
      netLog: d.netLog, crashes: d.crashes,
      settings: d.settings,
    };
    return JSON.stringify(dump, null, 2);
  };

  const value = useMemo<AppCtx>(() => ({
    data, ready, e, set, patchData, toast,
    sendMessage, regenerate, newChat, deleteConv, setTrainFlag, feedback, saveCorrection,
    addDoc, removeDoc, addMemory, toggleMemory, deleteMemory,
    installModelFlow, setActiveModel, removeModel, authorizeNet, blockNet,
    runTraining, snapshot, rollback, toggleAdapter, addExample,
    wipe, exportDiagnostic,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data, ready, e]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export { ORDER, MODELS, fmtGo, nowHM };
