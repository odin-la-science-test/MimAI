/* La Garde des Étoiles : jeu HTML autonome (React, polices et images embarqués) affiché dans une WebView, HORS LIGNE.
   - Aucun accès réseau : politique de sécurité (CSP) injectée dans la page + navigations externes refusées.
   - Se joue à l'horizontale : l'écran passe en paysage tant qu'il est ouvert, puis revient en portrait.
   - La progression (étoiles, sorts débloqués) est gardée par le jeu dans le stockage de la WebView, sur l'appareil.
     « Supprimer les données locales » la remet à zéro à la prochaine ouverture du jeu. */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav-types';
import { useApp, MODELS } from '../state';
import { llmComplete, llamaAvailable } from '../services/engine';
import { modelFilePath } from '../services/net';
import { buildPrompt, parseDecision } from '../services/gameAi';
import type { AiRequest } from '../services/gameAi';
import { C, F } from '../theme';
import { Btn } from '../ui';
import { GARDE_HTML, GARDE_HTML_AI } from '../games/gardeHtml';

/* origine fictive : sert uniquement à donner un stockage local (localStorage) à la page ; rien n'est jamais contacté */
const BASE_URL = 'https://mimai.local/garde/';
const ALLOWED = /^(about:|blob:|data:|https:\/\/mimai\.local\/)/;

export function Game({ navigation }: NativeStackScreenProps<RootStackParamList, 'Game'>) {
  const { data, patchData } = useApp();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const wv = useRef<WebView>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  /* IA de combat (mode Défi) : le modèle local de MiMai joue Mìmir. Désactivée si aucun modèle n'est installé ou si le moteur
     natif est absent (Expo Go) : le jeu garde alors son IA d'origine. */
  const activeId = data.settings.activeModel;
  const model = MODELS[activeId];
  /* GARDE_HTML_AI : vrai seulement si cette version du jeu a un mode Défi dont l'IA a été branchée (la v6 n'en a pas) */
  const aiPossible = GARDE_HTML_AI && !!model && data.settings.installed.includes(activeId) && llamaAvailable();
  const inject = useCallback((js: string) => { wv.current?.injectJavaScript(js + ';true;'); }, []);
  const aiInit = useRef(GARDE_HTML_AI ? 'window.MIMAI_AI=' + JSON.stringify({ enabled: false, model: model ? model.name : '', seq: 0 }) + ';' : '').current;
  /* lu une seule fois : si l'utilisateur a supprimé ses données, la progression du jeu est effacée avant le chargement */
  const reset = useRef(!!data.settings.gameReset);

  useFocusEffect(useCallback(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => { /* non bloquant */ });
    return () => { void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => { /* non bloquant */ }); };
  }, []));

  /* préchargement du modèle : la 1re décision ne doit pas payer le chargement en mémoire. L'IA du modèle n'est activée
     dans le jeu qu'une fois le modèle prêt ; avant cela (ou en cas d'échec) le jeu utilise son IA d'origine. */
  useEffect(() => {
    if (!aiPossible || state !== 'ready') return;
    let cancelled = false;
    void llmComplete(modelFilePath(activeId), [{ role: 'user', content: 'Réponds : ok' }], { maxTokens: 1, temperature: 0 })
      .then(t => { if (!cancelled && alive.current && t !== null) inject('if(window.MIMAI_AI){window.MIMAI_AI.enabled=true;}'); })
      .catch(() => { /* le jeu garde son IA d'origine */ });
    return () => { cancelled = true; };
  }, [aiPossible, activeId, state, inject]);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    const raw = e.nativeEvent.data;
    if (typeof raw !== 'string' || raw.length > 20000) return;
    let msg: AiRequest;
    try { msg = JSON.parse(raw) as AiRequest; } catch { return; }
    if (!msg || msg.type !== 'ai_request' || typeof msg.id !== 'number' || !aiPossible) return;
    if (busy.current) return;                           /* une décision à la fois ; le jeu en redemande une plus tard */
    busy.current = true;
    const answer = (p: Record<string, unknown>) => { if (alive.current) inject('window.__miAiReply&&window.__miAiReply(' + JSON.stringify({ id: msg.id, ...p }) + ')'); };
    llmComplete(modelFilePath(activeId), buildPrompt(msg), { maxTokens: 28, temperature: 0.3 })
      .then(text => {
        if (text === null) { answer({ ok: false }); return; }
        const d = parseDecision(text, msg.ready);
        answer({ ok: true, spell: d.spell, say: d.say });
      })
      .catch(() => answer({ ok: false }))
      .finally(() => { busy.current = false; });
  }, [aiPossible, activeId, inject]);

  useEffect(() => {
    if (reset.current && state === 'ready') patchData(d => { d.settings.gameReset = false; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <View style={{ flex: 1, backgroundColor: C.accent, paddingLeft: insets.left, paddingRight: insets.right }}>
      <StatusBar hidden />
      {state === 'error' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }}>
          <Text style={{ fontFamily: F.heading, fontSize: 24, color: C.bg, textAlign: 'center' }}>Le jeu n’a pas pu s’afficher</Text>
          <Text style={{ fontSize: 14, color: C.bg, textAlign: 'center', maxWidth: 380 }}>Le moteur d’affichage du téléphone (WebView) a rencontré un problème. Vos données ne sont pas touchées.</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn title="Réessayer" height={48} fontSize={15} onPress={() => { setState('loading'); setAttempt(a => a + 1); }} />
            <Btn kind="ghost" title="Retour" height={48} fontSize={15} onPress={() => navigation.goBack()} />
          </View>
        </View>
      ) : (
        <WebView
          key={attempt}
          style={{ flex: 1, backgroundColor: C.accent }}
          ref={wv}
          source={{ html: GARDE_HTML, baseUrl: BASE_URL }}
          onMessage={onMessage}
          originWhitelist={['https://mimai.local*', 'about:*', 'blob:*', 'data:*']}
          onShouldStartLoadWithRequest={req => ALLOWED.test(req.url)}
          injectedJavaScriptBeforeContentLoaded={aiInit + (reset.current ? 'try{localStorage.clear();}catch(e){}' : '') + 'true;'}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          allowFileAccess={false}
          allowUniversalAccessFromFileURLs={false}
          mixedContentMode="never"
          geolocationEnabled={false}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          textZoom={100}
          androidLayerType="hardware"
          onLoadEnd={() => setState(s => (s === 'error' ? s : 'ready'))}
          onError={() => setState('error')}
          onRenderProcessGone={() => setState('error')}
          accessibilityLabel="La Garde des Étoiles, jeu hors ligne"
        />
      )}
      {state === 'loading' ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent }}>
          <ActivityIndicator color={C.bg} />
          <Text style={{ marginTop: 10, fontFamily: F.heading, fontSize: 18, color: C.bg }}>La Garde des Étoiles</Text>
        </View>
      ) : null}
    </View>
  );
}
