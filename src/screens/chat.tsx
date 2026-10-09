/* Conversation : étapes de réflexion locales, streaming, modes, feedback, correction. */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav-types';
import { useApp, MODELS } from '../state';
import { C, F } from '../theme';
import { Mark, ShakeBuddy } from '../art';
import { useIsFocused } from '@react-navigation/native';
import { IconBtn, Tag, Composer, Ico, MenuSheet, useTopPad } from '../ui';
import { FeedbackBar, CorrectionDialog } from '../feedback';
import { listen, voiceAvailable, describeVoiceFailure } from '../services/voice';
import { speak, stopSpeaking, speakAvailable } from '../services/speak';
import type { Listening } from '../services/voice';
import type { Msg } from '../services/db';

const MODES: [string, string][] = [['rapide', 'Rapide'], ['reflexion', 'Réflexion'], ['vision', 'Vision'], ['outils', 'Outils']];

export function Chat({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'Chat'>) {
  const focused = useIsFocused();
  const { data, e, set, sendMessage, newChat, deleteConv, feedback, saveCorrection, regenerate, patchData, toast } = useApp();
  const am = MODELS[data.settings.activeModel];
  const conv = e.chatId ? data.convs.find(c => c.id === e.chatId) : null;
  const scrollRef = useRef<ScrollView>(null);
  const [menu, setMenu] = useState(false);
  const top = useTopPad(4);
  const bottom = useSafeAreaInsets().bottom;

  /* params d'entrée */
  useEffect(() => {
    if (route.params?.chatId != null) set(s => ({ ...s, chatId: route.params?.chatId ?? null }));
    if (route.params?.mode) patchData(d => { d.settings.mode = route.params!.mode!; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.chatId, route.params?.mode, route.params?.preset]);

  useEffect(() => { scrollRef.current?.scrollToEnd({ animated: true }); }, [conv?.msgs.length, e.stream?.text, e.thinking]);

  /* réponse vocale : lecture à voix haute par la synthèse du téléphone */
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const voiceTurn = useRef(false);
  const seen = useRef<{ id: string | null; len: number }>({ id: conv?.id ?? null, len: conv?.msgs.length ?? 0 });
  const readAloud = (m: Msg) => {
    if (speakingId === m.id) { stopSpeaking(); setSpeakingId(null); return; }
    if (!speakAvailable()) { toast('La lecture vocale demande la version installée de MiMai.'); return; }
    setSpeakingId(m.id);
    const ok = speak(m.text, () => setSpeakingId(cur => (cur === m.id ? null : cur)));
    if (!ok) setSpeakingId(null);
  };
  useEffect(() => {
    const msgs = conv?.msgs || [];
    const last = msgs[msgs.length - 1];
    /* on ne lit que les NOUVELLES réponses de la conversation ouverte, jamais l'historique */
    if (seen.current.id === (conv?.id ?? null) && msgs.length > seen.current.len && last?.role === 'ai' && !e.busy) {
      if ((data.settings.comp.speak || voiceTurn.current) && speakAvailable()) readAloud(last);
      voiceTurn.current = false;
    }
    seen.current = { id: conv?.id ?? null, len: msgs.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv?.id, conv?.msgs.length, e.busy]);
  useEffect(() => { if (!focused) { stopSpeaking(); setSpeakingId(null); } }, [focused]);
  useEffect(() => () => stopSpeaking(), []);

  /* commande vocale : reconnaissance sur l'appareil ; la phrase terminée est envoyée comme message */
  const [listening, setListening] = useState(false);
  const session = useRef<Listening | null>(null);
  const startVoice = async () => {
    if (listening) { session.current?.stop(); return; }
    if (e.busy) return;
    if (!voiceAvailable()) { toast(describeVoiceFailure('unavailable')); return; }
    setListening(true);
    session.current = await listen({
      onPartial: t => set(s => ({ ...s, draft: t })),
      onFinal: t => { if (t) { voiceTurn.current = true; stopSpeaking(); set(s => ({ ...s, draft: '' })); void sendMessage(t); } },
      onEnd: () => { setListening(false); session.current = null; },
      onFail: r => { setListening(false); set(s => ({ ...s, draft: '' })); toast(describeVoiceFailure(r)); },
    });
  };
  /* arrêt du micro en quittant l'écran ou l'application */
  useEffect(() => { if (!focused) session.current?.cancel(); }, [focused]);
  useEffect(() => () => session.current?.cancel(), []);
  /* ouverture depuis le micro de l'accueil, ou depuis la bulle si l'option est activée */
  useEffect(() => {
    const v = route.params?.voice;
    if (v === 'mic' || (v === 'bubble' && data.settings.comp.voice)) { const t = setTimeout(() => { void startVoice(); }, 500); return () => clearTimeout(t); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.voice]);

  const closeDialog = () => set(s => ({ ...s, dialog: null }));
  const doSend = () => { const t = e.draft; stopSpeaking(); setSpeakingId(null); set(s => ({ ...s, draft: '' })); void sendMessage(t); };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: top, paddingBottom: 8 }}>
        <IconBtn name="back" onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontWeight: '700', fontSize: 16, fontFamily: F.bodyBold }}>{conv ? conv.title : 'Nouvelle conversation'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.g600 }} />
            <Text style={{ fontSize: 12, color: C.g700 }}>Local · {am ? am.name : 'modèle local'}</Text>
          </View>
        </View>
        <IconBtn name="dots" onPress={() => setMenu(true)} />
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingVertical: 12 }}>
        {!conv || conv.msgs.length === 0 ? (
          /* page vierge : aucun texte pré-écrit, seulement le logo */
          <View style={{ minHeight: 360, flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: C.a100, alignItems: 'center', justifyContent: 'center' }}>
              <ShakeBuddy size={66} state="idle" enabled={focused} />
            </View>
          </View>
        ) : null}

        {(conv?.msgs || []).map(m => <Bubble key={m.id} m={m} convId={conv!.id} onFeedback={feedback} busy={e.busy} isLast={m.id === conv!.msgs[conv!.msgs.length - 1]?.id} onRegenerate={() => regenerate(conv!, m)} onCopied={() => toast('Réponse copiée')} onSpeak={() => readAloud(m)} speaking={speakingId === m.id} />)}

        {e.thinking ? (
          <View style={{ gap: 14, marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: C.a100, alignItems: 'center', justifyContent: 'center' }}>
                <Mark size={34} color={C.text} starFill={C.accent} mode="think" />
              </View>
              <View style={{ gap: 6, flex: 1, minWidth: 0 }}>
                <Text style={{ fontWeight: '700', fontSize: 16, fontFamily: F.bodyBold }}>{(e.steps[e.step] || 'Analyse') + '…'}</Text>
                <Tag kind="accent">{(MODES.find(m => m[0] === data.settings.mode)?.[1] || 'Rapide') + ' · ' + (am ? am.name : '')}</Tag>
              </View>
            </View>
            <View style={{ backgroundColor: C.surface, borderRadius: 32, padding: 16, gap: 12 }}>
              {e.steps.map((label, i) => (
                <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: i < e.step ? C.g600 : 'transparent', borderWidth: i === e.step ? 2 : i > e.step ? 2 : 0, borderColor: i === e.step ? C.accent : C.n400 }}>
                    {i < e.step ? <Ico name="check" size={12} color={C.bg} /> : i === e.step ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent }} /> : null}
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: i === e.step ? '700' : '400', color: i <= e.step ? C.text : C.n700 }}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {e.stream ? (
          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.a200, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 12, height: 13 }}><Ico name="spark" size={12} color={C.a700} /></View>
              </View>
              <Text style={{ fontFamily: F.heading, fontSize: 16 }}>MiMai</Text>
            </View>
            <Text style={{ fontSize: 15, lineHeight: 23 }}>{e.stream.text}<Text style={{ color: C.accent }}>▍</Text></Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingBottom: 8 }}>
        {MODES.map(([id, label]) => {
          const on = data.settings.mode === id;
          return (
            <TouchableOpacity key={id} onPress={() => patchData(d => { d.settings.mode = id as typeof d.settings.mode; })}
              accessibilityRole="button" accessibilityLabel={'Mode ' + label} accessibilityState={{ selected: on }}
              hitSlop={{ top: 7, bottom: 7 }}
              style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: on ? C.a200 : C.n100, justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: on ? '700' : '500', color: on ? C.a800 : C.n800 }}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ paddingHorizontal: 14, paddingBottom: Math.max(bottom, 12) + 8 }}>
        <Composer value={e.draft} onChange={t => set(s => ({ ...s, draft: t }))} onSend={doSend} placeholder={listening ? 'Je vous écoute…' : 'Écrire à MiMai…'} busy={e.busy} onMic={() => { void startVoice(); }} listening={listening} />
      </View>

      <MenuSheet visible={menu} onClose={() => setMenu(false)} items={[
        { icon: 'chat', title: 'Nouvelle conversation', on: () => { newChat(); } },
        { icon: 'cpu', title: 'Changer de modèle', on: () => navigation.navigate('Models') },
        { icon: 'grad', title: conv ? 'Entraîner avec cette discussion' : 'Entraînement', sub: conv ? 'Marquer TRAINING = YES' : undefined, on: () => { if (conv) { patchData(d => { const c = d.convs.find(x => x.id === conv.id); if (c) c.trainFlag = 'yes'; }); navigation.navigate('Training'); } else navigation.navigate('Training'); } },
        { icon: 'trash', title: 'Supprimer cette conversation', on: () => {
          if (!conv) return;
          Alert.alert('Supprimer cette conversation ?', 'Elle sera effacée de cet appareil.', [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Supprimer', style: 'destructive', onPress: () => { deleteConv(conv.id); navigation.navigate('Home'); } },
          ]);
        } },
      ]} />

      {/* correction utilisateur (README §13) */}
      <CorrectionDialog
        visible={e.dialog?.kind === 'correction'}
        question={(() => { const i = conv && e.dialog?.msg ? conv.msgs.findIndex(x => x.id === e.dialog!.msg!.id) : -1; return i > 0 ? conv!.msgs[i - 1].text : (conv?.title || ''); })()}
        answer={e.dialog?.msg?.text || ''}
        onClose={closeDialog}
        onSave={(fix, tags) => { if (conv && e.dialog?.msg) saveCorrection(conv, e.dialog.msg, fix, tags); closeDialog(); }} />
    </KeyboardAvoidingView>
  );
}

function Bubble({ m, convId, onFeedback, busy, isLast, onRegenerate, onCopied, onSpeak, speaking }: { m: Msg; convId: string; busy?: boolean; isLast?: boolean; onRegenerate: () => void; onCopied: () => void; onSpeak: () => void; speaking?: boolean; onFeedback: (convId: string, m: Msg, k: 'good' | 'bad') => void }) {
  if (m.role === 'user') {
    return (
      <View style={{ alignItems: 'flex-end', marginBottom: 20 }}>
        <View style={{ maxWidth: '82%', flexShrink: 1, backgroundColor: C.surface, borderRadius: 22, borderTopRightRadius: 6, paddingVertical: 12, paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 15, lineHeight: 22 }}>{m.text}</Text>
        </View>
      </View>
    );
  }
  const paras = m.text.split(/\n{2,}/).filter(Boolean);
  return (
    <View style={{ marginBottom: 24, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.a200, alignItems: 'center', justifyContent: 'center' }}>
          <View><Ico name="spark" size={12} color={C.a700} /></View>
        </View>
        <Text style={{ fontFamily: F.heading, fontSize: 16 }}>MiMai</Text>
      </View>
      {paras.map((p, i) => <Text key={i} style={{ fontSize: 15, lineHeight: 23, flexShrink: 1 }}>{p}</Text>)}
      {m.source || m.model ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {m.source ? <Tag kind="accent" style={{ maxWidth: '100%' }}>Source · {m.source.length > 28 ? m.source.slice(0, 27) + '…' : m.source}</Tag> : null}
          {m.model ? <Tag kind="accent2" style={{ maxWidth: '100%' }}>{m.model} · local</Tag> : null}
        </View>
      ) : null}
      <FeedbackBar value={m.feedback} disabled={busy} text={m.text} onRegenerate={isLast ? onRegenerate : undefined} onCopied={onCopied} onGood={() => onFeedback(convId, m, 'good')} onBad={() => onFeedback(convId, m, 'bad')} onSpeak={onSpeak} speaking={speaking} />
    </View>
  );
}
