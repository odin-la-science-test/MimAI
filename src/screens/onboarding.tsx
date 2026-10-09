/* Écrans d'onboarding : splash, bienvenue, appareil (infos réelles),
   téléchargement réel du modèle (Hugging Face + SHA-256), prêt.
   Aucun compte : l'app n'en a pas besoin (README §1, ADR-002). */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, useWindowDimensions, AppState } from 'react-native';
import { overlayAvailable, overlayGranted, overlayRequest, overlayShow } from '../services/overlay';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav-types';
import { useApp, MODELS } from '../state';
import { DEFAULT_MODEL_ID } from '../services/catalog';
import { fitFor, recommend } from '../services/fit';
import { FitBadge } from './models';
import { describeInstallError } from '../services/net';
import { C, F, fmtGo } from '../theme';
import { Mark, FillMark, BuddyMove, ShakeBuddy, MOVES, STATES } from '../art';
import { useIsFocused } from '@react-navigation/native';
import { Btn, IconBtn, Tag, Card, H1, Sub, Screen, AvatarIc, Ico, Bar } from '../ui';
import * as DeviceInfo from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';

const Wordmark = ({ color = C.text, h = 13 }: { color?: string; h?: number }) => (
  <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: F.heading, fontSize: h * 1.6, color, letterSpacing: 0.5 }}>{'MiMai'}</Text>
);

/* ─────────── Splash ─────────── */
export function Splash({ navigation }: NativeStackScreenProps<RootStackParamList, 'Splash'>) {
  const { data, ready } = useApp();
  const [minShown, setMinShown] = useState(false);
  /* on attend la fin de la lecture de la base : sans cela on ignore si l'installation est déjà faite */
  const onboarded = data.settings.onboarded;
  const go = () => {
    /* un lien (barre Mìmir, raccourci) a pu ouvrir un autre écran pendant le splash : on ne l'écrase pas */
    if (!navigation.isFocused()) return;
    navigation.reset({ index: 0, routes: [{ name: onboarded ? 'Home' : 'Welcome' }] });
  };
  useEffect(() => { const t = setTimeout(() => setMinShown(true), onboarded ? 1400 : 3000); return () => clearTimeout(t); }, [onboarded]);
  useEffect(() => { if (ready && minShown) go(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, minShown]);
  return (
    <TouchableOpacity style={{ flex: 1, backgroundColor: C.accent }} onPress={() => { if (ready) go(); }} activeOpacity={1} accessibilityRole="button" accessibilityLabel="MiMai. Toucher pour continuer">
      <View style={{ position: 'absolute', top: -90, right: -110, width: 280, height: 280, borderRadius: 140, backgroundColor: C.a400 }} />
      <View style={{ position: 'absolute', bottom: -140, left: -120, width: 340, height: 340, borderRadius: 170, backgroundColor: C.a600 }} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Mark size={112} color={C.bg} starFill={C.bg} mode="build" />
        <View style={{ marginTop: 30 }}><Wordmark color={C.bg} h={17} /></View>
        <Text maxFontSizeMultiplier={1.3} style={{ marginTop: 14, color: C.bg, fontSize: 15, fontWeight: '600', fontFamily: F.bodySemi, textAlign: 'center', paddingHorizontal: 24 }}>Intelligence. Localement.</Text>
      </View>
    </TouchableOpacity>
  );
}

/* ─────────── Bienvenue ─────────── */
export function Welcome({ navigation }: NativeStackScreenProps<RootStackParamList, 'Welcome'>) {
  const pillars: [string, string, string, 'a' | 'g' | 'n'][] = [
    ['phone', 'Local', 'Vos conversations restent sur votre appareil.', 'a'],
    ['lock', 'Privé', 'Aucune donnée n’est envoyée sans votre accord.', 'g'],
    ['wifiOff', 'Hors ligne', 'L’IA continue de fonctionner sans Internet.', 'n'],
  ];
  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Mark size={26} color={C.accent} starFill={C.accent} />
        <Wordmark h={10} />
      </View>
      <View style={{ flexGrow: 1, justifyContent: 'center', gap: 14, paddingVertical: 16 }}>
        <H1 size={40}>Votre intelligence. À votre portée.</H1>
        <Sub>MiMai exécute l’intelligence artificielle directement sur votre appareil. Sans compte, sans serveur, sans données collectées.</Sub>
        <View style={{ gap: 14, marginTop: 8 }}>
          {pillars.map(([ic, t, sub, tone]) => (
            <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <AvatarIc name={ic} size={46} tone={tone} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontWeight: '700', fontSize: 15, fontFamily: F.bodyBold }}>{t}</Text>
                <Text style={{ fontSize: 13.5, lineHeight: 19, color: C.n700 }}>{sub}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
      <Btn title="Commencer" height={56} fontSize={17} onPress={() => navigation.replace('Device')} style={{ marginBottom: 8 }} />
    </Screen>
  );
}

/* ─────────── Votre appareil (infos réelles) ─────────── */
export function Device({ navigation }: NativeStackScreenProps<RootStackParamList, 'Device'>) {
  const { data, patchData } = useApp();
  const [choice, setChoice] = useState(data.settings.activeModel || DEFAULT_MODEL_ID);
  const [loaded, setLoaded] = useState(false);
  const [dev, setDev] = useState<{ name: string; os: string; ramGo: number | null; diskGo: number | null; cpu: string }>({ name: 'Appareil Android', os: '', ramGo: null, diskGo: null, cpu: '—' });

  useEffect(() => {
    let alive = true;
    (async () => {
      const name = [DeviceInfo.deviceName || DeviceInfo.modelName].filter(Boolean).join(' ') || 'Appareil Android';
      const os = DeviceInfo.osName === 'Android' ? 'Android ' + (DeviceInfo.osVersion || '') : (DeviceInfo.osName || '');
      const ramGo = DeviceInfo.totalMemory ? DeviceInfo.totalMemory / 1e9 : null;
      let diskGo: number | null = null;
      try { diskGo = (await FileSystem.getFreeDiskStorageAsync()) / 1e9; } catch { /* indisponible */ }
      const cpu = DeviceInfo.supportedCpuArchitectures?.[0] || '—';
      if (alive) { setDev({ name, os, ramGo, diskGo, cpu }); setLoaded(true); }
    })();
    return () => { alive = false; };
  }, []);

  const compatible = dev.ramGo == null || dev.ramGo >= 3;
  /* les 3 meilleurs modèles réellement adaptés à CE téléphone ; à défaut, le plus léger (avec son niveau de compatibilité) */
  const profile = useMemo(() => ({ ramGb: dev.ramGo, freeDiskGb: dev.diskGo }), [dev.ramGo, dev.diskGo]);
  const shown = useMemo(() => {
    const r = recommend(Object.values(MODELS), profile, 3).map(x => x.id);
    const base = r.length ? r : (MODELS[DEFAULT_MODEL_ID] ? [DEFAULT_MODEL_ID] : []);
    /* un modèle déjà installé (ex. via « Voir tous les modèles ») reste visible et sélectionné */
    const inst = data.settings.installed.filter(id => MODELS[id] && !base.includes(id));
    return [...inst, ...base];
  }, [profile, data.settings.installed]);
  useEffect(() => { const a = data.settings.activeModel; if (a && data.settings.installed.includes(a)) setChoice(a); }, [data.settings.activeModel, data.settings.installed]);
  useEffect(() => { if (loaded && shown.length && !shown.includes(choice) && !data.settings.installed.includes(choice)) setChoice(shown[0]); }, [loaded, shown]); // eslint-disable-line react-hooks/exhaustive-deps
  const m = MODELS[choice] || MODELS[shown[0]] || MODELS[DEFAULT_MODEL_ID];
  const mFit = m ? fitFor(m, profile) : null;
  const choiceInstalled = !!m && data.settings.installed.includes(m.id);
  const ramPct = dev.ramGo ? Math.min(100, Math.round((dev.ramGo / 12) * 100)) : 0;

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconBtn name="back" onPress={() => navigation.goBack()} />
        <Tag kind="neutral">Étape 1 sur 2</Tag>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 14 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <H1 size={34} style={{ marginTop: 12 }}>Votre appareil</H1>
        <Card style={{ marginTop: 14, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <AvatarIc name="phone" size={42} tone="g" />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontWeight: '700', fontSize: 15, fontFamily: F.bodyBold }} numberOfLines={2}>{dev.name}{dev.os ? ' · ' + dev.os : ''}</Text>
              <Text style={{ fontSize: 12.5, color: C.n700 }}>Détecté automatiquement</Text>
            </View>
            <Tag kind={compatible ? 'accent2' : 'neutral'}>{compatible ? 'Compatible' : 'Limité'}</Tag>
          </View>
          {dev.ramGo != null ? (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 13, color: C.n700 }}>Mémoire</Text>
                <Text style={{ fontSize: 13, fontWeight: '700' }}>{fmtGo(dev.ramGo)}</Text>
              </View>
              <Bar pct={ramPct} fgC={C.g600} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}><Text style={{ fontSize: 13, color: C.n700 }}>Processeur</Text><Text style={{ fontSize: 13, fontWeight: '700' }} numberOfLines={1}>{dev.cpu}</Text></View>
            <View style={{ flex: 1, minWidth: 0 }}><Text style={{ fontSize: 13, color: C.n700 }}>Stockage libre</Text><Text style={{ fontSize: 13, fontWeight: '700' }}>{dev.diskGo != null ? fmtGo(dev.diskGo) : '—'}</Text></View>
          </View>
        </Card>
        <Kicker2>Recommandés pour ce téléphone</Kicker2>
        {!loaded ? <Text style={{ marginTop: 8, fontSize: 13.5, color: C.n700 }}>Analyse de votre appareil…</Text> : null}
        <View style={{ gap: 8, marginTop: 8 }}>
          {loaded ? shown.map(id => {
            const on = choice === id;
            const md = MODELS[id];
            const f = fitFor(md, profile);
            return (
              <TouchableOpacity key={id} onPress={() => setChoice(id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={md.name + ', ' + md.params + ', ' + fmtGo(md.sizeBytes / 1e9) + ', compatibilité ' + f.label}
                style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 24, backgroundColor: on ? C.a100 : C.surface, borderWidth: on ? 2 : 0, borderColor: C.accent }}>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent, opacity: on ? 1 : 0 }} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    <Text numberOfLines={2} style={{ fontWeight: '700', fontSize: 15, fontFamily: F.bodyBold, flexShrink: 1 }}>{md.name}</Text>
                    {id === shown.find(x => !data.settings.installed.includes(x)) ? <Tag kind="accent">Recommandé</Tag> : data.settings.installed.includes(id) ? <Tag kind="accent2">Installé</Tag> : null}
                  </View>
                  <Text numberOfLines={2} style={{ fontSize: 12.5, color: C.n700 }}>{md.tier} · {md.params} · {fmtGo(md.sizeBytes / 1e9)}</Text>
                  <FitBadge fit={f} />
                </View>
              </TouchableOpacity>
            );
          }) : null}
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Models')} accessibilityRole="button" accessibilityLabel="Voir tous les modèles"
          style={{ minHeight: 48, justifyContent: 'center', marginTop: 4 }}>
          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 14.5, fontWeight: '700', fontFamily: F.bodyBold, color: C.a700 }}>Voir tous les modèles ({Object.keys(MODELS).length})</Text>
        </TouchableOpacity>
        {m && mFit ? (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4, alignItems: 'flex-start' }}>
            <AvatarIc size={24}><Ico name="spark" size={12} color={C.a700} /></AvatarIc>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={{ fontSize: 13.5, lineHeight: 20, color: C.n800 }}>{m.explain}</Text>
              <Text style={{ fontSize: 13, lineHeight: 19, color: C.n800 }}>{mFit.reason}</Text>
              <Text style={{ fontSize: 12, lineHeight: 17, color: C.n700 }}>{mFit.speedLabel}</Text>
            </View>
          </View>
        ) : null}
        <View style={{ marginTop: 12, borderRadius: 22, backgroundColor: C.g100, padding: 14 }}>
          <Text style={{ fontSize: 13, lineHeight: 19, color: C.g900 }}>Cette opération nécessite Internet (Wi-Fi ou données mobiles ; le fichier est volumineux, le Wi-Fi est conseillé). Aucun message, document, mémoire ou historique ne sera envoyé. Le fichier est vérifié (taille + SHA-256) puis le réseau est re-bloqué automatiquement.</Text>
        </View>
      </ScrollView>
      <Btn title={choiceInstalled ? 'Continuer' : 'Télécharger et continuer'} height={56} style={{ alignSelf: 'stretch' }} disabled={!m}
        onPress={() => {
          if (!m) return;
          patchData(d => { d.settings.activeModel = m.id; });
          if (choiceInstalled) navigation.navigate('Ready'); else navigation.navigate('Download', { modelId: m.id });
        }} />
      <TouchableOpacity onPress={() => navigation.navigate('Ready')} accessibilityRole="button" accessibilityLabel="Choisir un modèle plus tard"
        style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
        <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 15, fontWeight: '700', fontFamily: F.bodyBold, color: C.n700 }}>Choisir plus tard</Text>
      </TouchableOpacity>
    </Screen>
  );
}
const Kicker2 = ({ children }: { children: React.ReactNode }) => (
  <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: C.n700, marginTop: 18 }}>{children}</Text>
);

/* ─────────── Téléchargement réel ─────────── */
export function Download({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Download'>) {
  const { installModelFlow, authorizeNet, toast, patchData } = useApp();
  const modelId = route.params?.modelId || 'qwen05b';
  const m = MODELS[modelId];
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState('download');
  const [mbps, setMbps] = useState<number | null>(null);
  const started = useRef(false);
  const [sha, setSha] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const lastRef = useRef<{ t: number; pct: number }>({ t: Date.now(), pct: 0 });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    authorizeNet('Installation de ' + m.name);
    installModelFlow(modelId, (ph, p, info) => {
      setPhase(ph); setPct(p);
      const now = Date.now();
      if (ph === 'download' && p > lastRef.current.pct) {
        const dt = (now - lastRef.current.t) / 1000;
        const dBytes = ((p - lastRef.current.pct) / 100) * m.sizeBytes;
        if (dt > 0.3 && dBytes > 0) setMbps(dBytes / dt / 1e6);
        lastRef.current = { t: now, pct: p };
      }
      if (info && 'got' in info && info.got) setSha(info.got);
    }).then(() => {
      patchData(d => { d.settings.installed = Array.from(new Set([...d.settings.installed, modelId])); d.settings.activeModel = modelId; });
      timers.current.push(setTimeout(() => navigation.replace('Ready'), 700));
    }).catch((e2: Error) => {
      setErr(describeInstallError(e2.message));
      toast('Installation annulée');
      timers.current.push(setTimeout(() => navigation.replace('Device'), 6000));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const phaseLabels: Record<string, string> = { download: 'Téléchargement', size: 'Vérification de la taille', sha: 'Empreinte SHA-256', manifest: 'Manifeste', license: 'Licence', install: 'Installation' };
  const remainMin = mbps ? Math.max(1, Math.ceil(((100 - pct) / 100) * (m.sizeBytes / 1e6) / mbps / 60)) : null;
  return (
    <Screen>
      <View style={{ alignSelf: 'flex-end' }}><Tag kind="neutral">Étape 2 sur 2</Tag></View>
      <View style={{ flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center' }}>
        <FillMark size={120} p={phase === 'download' ? pct / 100 : 1} base={C.n300} fill={C.accent} clipId="dlclip" />
        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: F.heading, fontSize: 28, lineHeight: 34, marginTop: 26, textAlign: 'center' }}>Préparation de MiMai</Text>
        <Text style={{ fontSize: 14, color: C.n700, marginTop: 6, textAlign: 'center', paddingHorizontal: 20 }}>{m.name} · {fmtGo(m.sizeBytes / 1e9)}</Text>
        <Text maxFontSizeMultiplier={1.15} style={{ fontFamily: F.heading, fontSize: 48, lineHeight: 56, marginTop: 14 }}>{Math.floor(pct)} %</Text>
        <View style={{ width: '86%', marginTop: 14 }}><Bar pct={pct} h={10} /></View>
        <Text style={{ marginTop: 12, fontSize: 13, lineHeight: 18, color: C.n700, textAlign: 'center', paddingHorizontal: 20 }}>{phaseLabels[phase] || phase}{phase === 'download' && mbps ? ' · ' + mbps.toFixed(1).replace('.', ',') + ' Mo/s' : ''}{phase === 'download' && remainMin != null ? ' · ~' + remainMin + ' min' : ''}</Text>
        {sha ? <Text style={{ marginTop: 6, fontSize: 10.5, fontFamily: 'monospace', color: C.a700, textAlign: 'center', paddingHorizontal: 30 }} numberOfLines={2}>SHA-256 {sha.slice(0, 32)}… ✓</Text> : null}
        {err ? <Text style={{ marginTop: 10, color: C.a800, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 }}>{err}</Text> : null}
      </View>
      <Card style={{ paddingVertical: 6, gap: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
          <Text style={{ color: C.n700, fontSize: 14, flex: 1 }}>Taille exacte</Text><Text style={{ fontWeight: '700', fontSize: 14 }}>{(m.sizeBytes / 1048576).toFixed(1).replace('.', ',')} Mo</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
          <Text style={{ color: C.n700, fontSize: 14 }}>Vérification</Text><Text numberOfLines={2} style={{ fontWeight: '700', fontSize: 14, flex: 1, textAlign: 'right', marginLeft: 12 }}>SHA-256 · {m.license}</Text>
        </View>
      </Card>
    </Screen>
  );
}

/* ─────────── MiMai est prêt ─────────── */
export function Ready({ navigation }: NativeStackScreenProps<RootStackParamList, 'Ready'>) {
  const focused = useIsFocused();
  const { data, patchData, toast } = useApp();
  const noModel = !data.settings.installed.length;
  const { height: winH } = useWindowDimensions();
  /* bulle Mìmir par-dessus les autres applis : proposée UNE fois, avec explication claire, jamais activée d'office */
  useEffect(() => { patchData(d => { d.settings.onboarded = true; }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const bubbleOffered = overlayAvailable();
  const [bubble, setBubble] = useState<'idle' | 'asked' | 'on'>(data.settings.comp.on && data.settings.comp.overlay ? 'on' : 'idle');
  useEffect(() => {
    if (!bubbleOffered) return;
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') void overlayGranted().then(g => { if (g) setBubble(b => (b === 'asked' ? 'on' : b)); });
    });
    return () => sub.remove();
  }, [bubbleOffered]);
  const enableBubble = async () => {
    patchData(d => { d.settings.comp.on = true; d.settings.comp.overlay = true; });
    if (await overlayGranted()) { await overlayShow(); setBubble('on'); toast('La barre Mìmir est active.'); }
    else { setBubble('asked'); overlayRequest(); }
  };
  const disc = Math.max(150, Math.min(230, Math.round(winH * 0.28)));
  const finish = () => {
    patchData(d => { d.settings.onboarded = true; });
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };
  return (
    <Screen>
      <View style={{ position: 'absolute', bottom: -150, left: -120, width: 340, height: 340, borderRadius: 170, backgroundColor: C.g200 }} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 }} showsVerticalScrollIndicator={false}>
        <View style={{ width: disc, height: disc, borderRadius: disc / 2, backgroundColor: C.a200, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: Math.round(disc * 0.11) }}>
          <ShakeBuddy size={Math.round(disc * 0.56)} state="happy" enabled={focused} />
        </View>
        <H1 size={40} style={{ marginTop: 24, textAlign: 'center' }}>MiMai est prêt.</H1>
        <Text style={{ fontSize: 15.5, lineHeight: 23, color: C.n700, marginTop: 10, textAlign: 'center', maxWidth: 300 }}>Votre intelligence. Sur votre appareil. Mìmir vous accompagne.</Text>
        {noModel ? <Text style={{ fontSize: 13.5, lineHeight: 20, color: C.n700, marginTop: 12, textAlign: 'center', maxWidth: 290 }}>Aucun modèle installé pour l’instant : MiMai répond avec son moteur intégré. Vous pourrez en choisir un plus tard dans Modèles.</Text> : null}
        {bubbleOffered ? (
          <View style={{ marginTop: 16, alignSelf: 'stretch', borderRadius: 24, backgroundColor: C.surface, padding: 16, gap: 10 }}>
            <Text style={{ fontFamily: F.heading, fontSize: 17 }}>Mìmir à portée, discrètement</Text>
            {bubble === 'on' ? (
              <Text style={{ fontSize: 13.5, lineHeight: 20, color: C.g900 }}>La barre est active, autour de la caméra : touchez-la, même depuis une autre application, pour parler à MiMai. Vous pouvez la retirer à tout moment dans Compagnon.</Text>
            ) : (
              <>
                <Text style={{ fontSize: 13.5, lineHeight: 20, color: C.n800 }}>MiMai peut afficher une petite puce dans la barre d’état, près de la caméra (comme un lecteur de musique), pour ouvrir en un toucher une fenêtre de discussion flottante avec l’assistant, par-dessus vos autres applications. Une barre noire autour de la caméra est aussi proposée, en option. Il n’y a aucun personnage à l’écran. Elle ne lit pas votre écran et n’enregistre rien. Android vous demandera d’autoriser « Afficher par-dessus d’autres applis », une seule fois.</Text>
                {bubble === 'asked' ? <Text style={{ fontSize: 12.5, color: C.a700 }}>Autorisez dans l’écran Android, puis revenez ici : la barre apparaîtra toute seule.</Text> : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Btn title={bubble === 'asked' ? 'Ouvrir l’autorisation' : 'Activer la barre'} height={48} fontSize={14} style={{ flex: 1, minWidth: 150 }} onPress={() => { void enableBubble(); }} />
                </View>
              </>
            )}
          </View>
        ) : null}
      </ScrollView>
      <Btn title="Commencer" height={56} fontSize={17} style={{ alignSelf: 'stretch' }} onPress={finish} />
    </Screen>
  );
}
