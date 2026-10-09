/* Feedback sous les réponses (👍/👎 en SVG) + dialogue de correction — design « Organic ». */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Easing, Modal, KeyboardAvoidingView, Platform, ScrollView, TextInput } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { C, F } from './theme';

type Kind = 'good' | 'bad';

/* retour haptique léger ; sans effet si le matériel ou la permission manquent */
const tick = (kind: 'light' | 'ok' = 'light') => {
  try {
    if (kind === 'ok') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  } catch { /* indisponible */ }
};

const COPY_ICON = ['M9 9h10a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'];
const CHECK_ICON = ['M5 12.5 10 17.5 19 7'];
const REFRESH_ICON = ['M21 12a9 9 0 1 1-2.64-6.36', 'M21 3v6h-6'];
const SPEAKER_ICON = ['M11 5 6 9H2v6h4l5 4V5z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M19 5a10 10 0 0 1 0 14'];
const STOP_ICON = ['M7 7h10v10H7z'];

function Glyph({ paths, size = 17, color }: { paths: string[]; size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {paths.map((d, i) => <Path key={i} d={d} stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />)}
    </Svg>
  );
}

/* petite pill d'action neutre (copier, régénérer) */
function ActionPill({ paths, label, a11y, disabled, onPress }: { paths: string[]; label: string; a11y: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={() => { tick(); onPress(); }} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ disabled: !!disabled }}
      hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
      style={({ pressed }) => ({ minHeight: 36, minWidth: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12,
        borderRadius: 999, borderWidth: 1, borderColor: C.n300, backgroundColor: C.n100, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 })}>
      <Glyph paths={paths} color={C.n800} />
      <Text numberOfLines={1} style={{ fontSize: 13, fontFamily: F.bodySemi, color: C.n800 }}>{label}</Text>
    </Pressable>
  );
}

/* pouces (tracé 24x24, style trait arrondi comme Ico) */
const THUMB_UP = 'M7 10v12 M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z';
const THUMB_DOWN = 'M17 14V2 M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z';

function Thumb({ kind, size = 18, color, filled }: { kind: Kind; size?: number; color: string; filled?: boolean }) {
  const d = kind === 'good' ? THUMB_UP : THUMB_DOWN;
  const parts = d.split(/\s+M/).map((p, i) => (i === 0 ? p : 'M' + p));
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {parts.map((p, i) => <Path key={i} d={p} stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill={filled && i === 0 ? color + '33' : 'none'} />)}
    </Svg>
  );
}

const SPARKS = [0, 1, 2, 3, 4, 5].map(i => (i / 6) * Math.PI * 2 - Math.PI / 2);

/* pill d'action : repos / sélectionné / désactivé, rebond + étincelles à la sélection */
function FeedbackPill({ kind, selected, disabled, onPress }: { kind: Kind; selected: boolean; disabled?: boolean; onPress: () => void }) {
  const good = kind === 'good';
  const tone = good ? C.g700 : C.a700;
  const bg = selected ? (good ? C.g200 : C.a200) : C.n100;
  const border = selected ? (good ? C.g500 : C.a400) : C.n300;
  const label = good ? 'Utile' : 'À corriger';
  const bounce = useRef(new Animated.Value(1)).current;
  const spark = useRef(new Animated.Value(0)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!selected) return;
    bounce.setValue(0.8);
    Animated.spring(bounce, { toValue: 1, friction: 3, tension: 190, useNativeDriver: true }).start();
    if (good) {
      spark.setValue(0);
      Animated.timing(spark, { toValue: 1, duration: 560, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Pressable onPress={() => { tick(good ? 'ok' : 'light'); onPress(); }} disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={good ? 'Bonne réponse' : 'Mauvaise réponse, proposer une correction'}
      accessibilityState={{ selected, disabled: !!disabled }}
      hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
      style={({ pressed }) => ({ minHeight: 36, minWidth: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: border, backgroundColor: bg,
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1 })}>
      <Animated.View style={{ transform: [{ scale: bounce }] }}>
        <Thumb kind={kind} color={selected || !disabled ? tone : C.n600} filled={selected} />
      </Animated.View>
      <Text numberOfLines={1} style={{ fontSize: 13, fontFamily: selected ? F.bodyBold : F.bodySemi, color: selected ? (good ? C.g800 : C.a800) : C.n800 }}>{label}</Text>
      {good ? SPARKS.map((a, i) => (
        <Animated.View key={i} pointerEvents="none" style={{ position: 'absolute', left: 21, top: 16, width: 5, height: 5, borderRadius: 3, backgroundColor: i % 2 ? C.accent : C.accent2,
          opacity: spark.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
          transform: [{ translateX: spark.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * 20] }) }, { translateY: spark.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * 20] }) }, { scale: spark.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }) }] }} />
      )) : null}
    </Pressable>
  );
}

/* barre d'actions sous une réponse : retour à la ligne automatique (360 dp, grands libellés) */
export function FeedbackBar({ value, disabled, text, onGood, onBad, onRegenerate, onCopied, onSpeak, speaking }:
  { value?: Kind | null; disabled?: boolean; text?: string; onGood: () => void; onBad: () => void; onRegenerate?: () => void; onCopied?: () => void; onSpeak?: () => void; speaking?: boolean }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async () => {
    if (!text) return;
    try { await Clipboard.setStringAsync(text); setCopied(true); onCopied?.(); } catch { /* presse-papiers indisponible */ }
  };
  return (
    <View accessibilityRole="toolbar" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, maxWidth: '100%' }}>
      <FeedbackPill kind="good" selected={value === 'good'} disabled={disabled} onPress={() => { if (value !== 'good') onGood(); }} />
      <FeedbackPill kind="bad" selected={value === 'bad'} disabled={disabled} onPress={onBad} />
      {text ? <ActionPill paths={copied ? CHECK_ICON : COPY_ICON} label={copied ? 'Copié' : 'Copier'} a11y="Copier la réponse" onPress={() => { void copy(); }} /> : null}
      {onSpeak && text ? <ActionPill paths={speaking ? STOP_ICON : SPEAKER_ICON} label={speaking ? 'Arrêter' : 'Écouter'} a11y={speaking ? 'Arrêter la lecture' : 'Écouter la réponse à voix haute'} onPress={onSpeak} /> : null}
      {onRegenerate ? <ActionPill paths={REFRESH_ICON} label="Régénérer" a11y="Régénérer la réponse" disabled={disabled} onPress={onRegenerate} /> : null}
    </View>
  );
}

/* dialogue de correction : rappel question + réponse, champ multiligne, boutons fixes sous le défilement */
/* raisons rapides → tags réellement utilisés par rulesFrom() (training.ts) pour déduire des règles de style */
const REASONS: { id: string; label: string; tags: string[] }[] = [
  { id: 'faux', label: 'Information fausse', tags: [] },
  { id: 'long', label: 'Trop long', tags: ['court'] },
  { id: 'bla', label: 'Pas assez direct', tags: ['direct'] },
  { id: 'tu', label: 'Je préfère le tutoiement', tags: ['tu'] },
  { id: 'formel', label: 'Ton plus formel', tags: ['formel'] },
];

export function CorrectionDialog({ visible, question, answer, onClose, onSave }:
  { visible: boolean; question: string; answer: string; onClose: () => void; onSave: (fix: string, tags: string[]) => void }) {
  const [fix, setFix] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => { if (!visible) { setFix(''); setPicked([]); } }, [visible]);
  const toggle = (id: string) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  if (!visible) return null;
  const ok = fix.trim().length > 0;
  const box = { backgroundColor: C.surface, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12, gap: 2 } as const;
  const lab = { fontSize: 11.5, fontFamily: F.bodyBold, color: C.n700, letterSpacing: 0.6 } as const;
  return (
    <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'center', padding: 16 }}>
        <Pressable accessibilityLabel="Fermer" onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(32,30,29,.5)' }} />
        <View style={{ width: '100%', maxWidth: 400, maxHeight: '100%', alignSelf: 'center', borderRadius: 32, backgroundColor: C.bg, padding: 20, gap: 12 }}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }} contentContainerStyle={{ gap: 12 }}>
            <Text style={{ fontFamily: F.heading, fontSize: 22, lineHeight: 28 }}>Quelle était la bonne réponse ?</Text>
            <View style={box}>
              <Text style={lab}>VOTRE QUESTION</Text>
              <Text numberOfLines={3} style={{ fontSize: 14, lineHeight: 20, color: C.text }}>{question || '—'}</Text>
            </View>
            <View style={box}>
              <Text style={lab}>RÉPONSE DE MIMAI</Text>
              <Text numberOfLines={4} style={{ fontSize: 14, lineHeight: 20, color: C.n800 }}>{answer}</Text>
            </View>
            <TextInput value={fix} onChangeText={setFix} multiline autoFocus placeholder="Écrivez la réponse que vous auriez voulue…" accessibilityLabel="Votre version de la réponse"
              placeholderTextColor={C.n600} scrollEnabled
              style={{ minHeight: 96, maxHeight: 180, borderRadius: 16, backgroundColor: C.n100, borderWidth: 1, borderColor: C.n300, paddingVertical: 12, paddingHorizontal: 14, textAlignVertical: 'top', color: C.text, fontSize: 15, lineHeight: 21, fontFamily: F.body }} />
            <Text style={lab}>CE QUI NE VA PAS (FACULTATIF)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {REASONS.map(r => {
                const on = picked.includes(r.id);
                return (
                  <Pressable key={r.id} onPress={() => { tick(); toggle(r.id); }} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={r.label}
                    hitSlop={{ top: 6, bottom: 6 }}
                    style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: on ? C.a400 : C.n300, backgroundColor: on ? C.a200 : C.n100, maxWidth: '100%' }}>
                    <Text numberOfLines={1} style={{ fontSize: 13, fontFamily: on ? F.bodyBold : F.bodySemi, color: on ? C.a800 : C.n800 }}>{r.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable onPress={() => setFix(answer)} accessibilityRole="button" accessibilityLabel="Reprendre la réponse de MiMai pour la modifier"
              hitSlop={{ top: 8, bottom: 8 }} style={{ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.n100, borderWidth: 1, borderColor: C.n300 }}>
              <Text style={{ fontSize: 13, fontFamily: F.bodySemi, color: C.n800 }}>Partir de la réponse de MiMai</Text>
            </Pressable>
            <Text style={{ fontSize: 12.5, lineHeight: 18, color: C.n700 }}>
              Enregistré comme exemple (question, réponse à éviter, correction) pour l’entraînement local. Les raisons cochées servent à déduire vos préférences de style. Tout reste sur votre appareil.
            </Text>
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Annuler"
              style={{ flex: 1, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: C.n200, borderWidth: 1, borderColor: C.n300 }}>
              <Text style={{ fontFamily: F.heading, fontSize: 15, color: C.text }}>Annuler</Text>
            </Pressable>
            <Pressable onPress={() => { if (ok) onSave(fix, REASONS.filter(r => picked.includes(r.id)).flatMap(r => r.tags)); }} disabled={!ok} accessibilityRole="button" accessibilityLabel="Enregistrer la correction" accessibilityState={{ disabled: !ok }}
              style={{ flex: 1.3, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: ok ? C.accent : C.n300 }}>
              <Text numberOfLines={1} style={{ fontFamily: F.heading, fontSize: 15, color: ok ? C.bg : C.n600 }}>Enregistrer</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
