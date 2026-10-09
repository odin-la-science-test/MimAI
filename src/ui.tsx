/* Composants de design « Organic » — fidèles aux maquettes disagne/. */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, TextInput, Modal, ScrollView, KeyboardAvoidingView, Platform, Keyboard, useWindowDimensions } from 'react-native';
import Svg, { Path, Circle, G } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, shadow } from './theme';
import { BuddyMove, MOVES } from './art';

/* ─────────── icônes (traits lucide, comme dans les maquettes) ─────────── */
const ICONS: Record<string, { d: string; extra?: React.ReactNode }> = {
  back: { d: 'M19 12H5 M12 19l-7-7 7-7' },
  dots: { d: '', extra: <><Circle cx={12} cy={5} r={1.1} /><Circle cx={12} cy={12} r={1.1} /><Circle cx={12} cy={19} r={1.1} /></> },
  plus: { d: 'M5 12h14 M12 5v14' },
  send: { d: 'M5 12l7-7 7 7 M12 19V5' },
  chevron: { d: 'M9 18l6-6-6-6' },
  home: { d: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8 M3 10a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  chat: { d: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z' },
  book: { d: 'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20' },
  search: { d: 'M21 21l-4.3-4.3 M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z' },
  lock: { d: 'M3 11h18v11H3z M7 11V7a5 5 0 0 1 10 0v4' },
  phone: { d: 'M5 2h14v20H5z M12 18h.01' },
  shield: { d: 'M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.5 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z M9 12l2 2 4-4' },
  wifiOff: { d: 'M12 20h.01 M8.5 16.4a5 5 0 0 1 7 0 M5 12.9a10 10 0 0 1 5.2-2.7 M19 12.9a10 10 0 0 0-2-1.5 M2 8.8a15 15 0 0 1 4.2-2.6 M22 8.8a15 15 0 0 0-11.3-3.8 M2 2l20 20' },
  spark: { d: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z' },
  brain: { d: 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5 M9 18h6 M10 22h4' },
  pen: { d: 'M12 20h9 M16.4 3.6a1 1 0 0 1 3 3L7.4 18.6a2 2 0 0 1-.9.5l-2.9.9a.5.5 0 0 1-.6-.6l.8-2.9a2 2 0 0 1 .5-.9z' },
  chart: { d: 'M3 3v16a2 2 0 0 0 2 2h16 M19 9l-5 5-4-4-3 3' },
  code: { d: 'M16 18l6-6-6-6 M8 6l-6 6 6 6' },
  cpu: { d: 'M15 7h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2 M6 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h1 m1-10V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2 m-7 2h4 m-4 4h4 M22 11v2' },
  thermo: { d: 'M14 4v10.5a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z' },
  clock: { d: 'M12 12m-10 0a10 10 0 1 0 20 0 10 10 0 1 0-20 0 M12 6v6l4 2' },
  grad: { d: 'M21.4 10.9a1 1 0 0 0 0-1.8L12.8 5.2a2 2 0 0 0-1.7 0L2.6 9.1a1 1 0 0 0 0 1.8l8.6 3.9a2 2 0 0 0 1.7 0z M22 10v6 M6 12.5V16a6 3 0 0 0 12 0v-3.5' },
  layers: { d: 'M12.8 2.2a2 2 0 0 0-1.7 0L2.6 6.1a1 1 0 0 0 0 1.8l8.6 3.9a2 2 0 0 0 1.7 0l8.6-3.9a1 1 0 0 0 0-1.8z M22 17.6l-9.2 4.2a2 2 0 0 1-1.7 0L2 17.6 M22 12.6l-9.2 4.2a2 2 0 0 1-1.7 0L2 12.6' },
  user: { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  eye: { d: 'M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M12 12m-1 0a1 1 0 1 0 2 0 1 1 0 1 0-2 0 M18.9 12.3a1 1 0 0 0 0-.7 7.5 7.5 0 0 0-13.9 0 1 1 0 0 0 0 .7 7.5 7.5 0 0 0 13.9 0' },
  mic: { d: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3' },
  trash: { d: 'M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M10 11v6 M14 11v6' },
  download: { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3' },
  check: { d: 'M20 6L9 17l-5-5' },
  x: { d: 'M18 6L6 18 M6 6l12 12' },
  translate: { d: 'M5 8l6 6 M4 14l6-6 2-3 M2 5h12 M7 2h1 M22 22l-5-10-5 10 M14 18h6' },
  reply: { d: 'M9 17L4 12l5-5 M20 18v-2a4 4 0 0 0-4-4H4' },
  file: { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z M14 2v4a2 2 0 0 0 2 2h4 M16 13H8 M16 17H8' },
  list: { d: 'M12 7v14 M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z' },
  battery: { d: 'M2 7h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H2z M22 11v2' },
  filter: { d: 'M3 17l2 2 4-4 M3 7l2 2 4-4 M13 6h8 M13 12h8 M13 18h8' },
};

export function Ico({ name, size = 18, color }: { name: keyof typeof ICONS | string; size?: number; color?: string }) {
  const ic = ICONS[name];
  if (!ic) return null;
  const col = color || C.text;
  const paths = (ic.d || '').trim().split(/\s+[Mm]/).map((seg, i) => (i === 0 ? seg : 'M' + seg)).filter(Boolean);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <G stroke={col} fill={ic.extra ? col : 'none'} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
        {paths.map((d, i) => <Path key={i} d={d} />)}
        {ic.extra}
      </G>
    </Svg>
  );
}

/* ─────────── primitives ─────────── */
export function Btn({ title, kind = 'primary', onPress, style, disabled, children, height = 56, fontSize = 16 }:
  { title?: string; kind?: 'primary' | 'secondary' | 'ghost'; onPress?: () => void; style?: object; disabled?: boolean; children?: React.ReactNode; height?: number; fontSize?: number }) {
  const bg = kind === 'primary' ? { backgroundColor: C.accent } : kind === 'secondary' ? { borderWidth: 1, borderColor: C.divider } : {};
  const fg = kind === 'primary' ? { color: C.bg } : kind === 'ghost' ? { color: C.a700 } : { color: C.text };
  return (
    <TouchableOpacity disabled={disabled} onPress={onPress} accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled }}
      style={[s.btn, bg, { minHeight: Math.max(48, height) }, disabled && { opacity: 0.45 }, style]} activeOpacity={0.85}>
      {children}
      {title ? <Text numberOfLines={2} maxFontSizeMultiplier={1.25} style={[s.btnT, fg, { fontSize }]}>{title}</Text> : null}
    </TouchableOpacity>
  );
}

const ICON_LABELS: Record<string, string> = { back: 'Retour', dots: 'Plus d’options', plus: 'Ajouter', send: 'Envoyer', trash: 'Supprimer', x: 'Fermer', check: 'Valider' };
export function IconBtn({ name, onPress, color, size = 18, bg, label }: { name: string; onPress?: () => void; color?: string; size?: number; bg?: string; label?: string }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={label || ICON_LABELS[name] || name} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }} style={[s.iconBtn, bg ? { backgroundColor: bg } : { borderWidth: 1, borderColor: C.divider }]} activeOpacity={0.85}>
      <Ico name={name} size={size} color={color} />
    </TouchableOpacity>
  );
}

export function Tag({ children, kind = 'accent', style, onPress, dot }:
  { children: React.ReactNode; kind?: 'accent' | 'accent2' | 'neutral' | 'dark'; style?: object; onPress?: () => void; dot?: boolean }) {
  const bgs = { accent: C.a100, accent2: C.g100, neutral: C.n100, dark: C.accent };
  const fgs = { accent: C.a800, accent2: C.g800, neutral: C.n800, dark: C.bg };
  const inner = (
    <View style={[s.tag, { backgroundColor: bgs[kind] }, style]}>
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fgs[kind], flexShrink: 0 }} /> : null}
      <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ color: fgs[kind], fontSize: 11.5, fontWeight: '700', fontFamily: F.bodyBold, flexShrink: 1 }}>{children}</Text>
    </View>
  );
  if (!onPress) return inner;
  return <TouchableOpacity onPress={onPress} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }} activeOpacity={0.85} style={{ maxWidth: '100%', flexShrink: 1 }}>{inner}</TouchableOpacity>;
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: object; onPress?: () => void }) {
  if (onPress) return <TouchableOpacity onPress={onPress} accessibilityRole="button" style={[s.card, style]} activeOpacity={0.9}>{children}</TouchableOpacity>;
  return <View style={[s.card, style]}>{children}</View>;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: () => void; label?: string }) {
  return (
    <Pressable onPress={onChange} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label} hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }} style={[s.tg, { backgroundColor: on ? C.g600 : C.n300 }]}>
      <View style={[s.tgDot, on && { alignSelf: 'flex-end' }]} />
    </Pressable>
  );
}

export function CheckCircle({ on, onChange, size = 24, label }: { on: boolean; onChange: () => void; size?: number; label?: string }) {
  return (
    <Pressable onPress={onChange} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label} hitSlop={12} style={[{ width: size, height: size, borderRadius: size, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
      on ? { backgroundColor: C.g600 } : { borderWidth: 2, borderColor: C.n400 }]}>
      {on ? <Ico name="check" size={size * 0.55} color={C.bg} /> : null}
    </Pressable>
  );
}

export function RadioDot({ on }: { on: boolean }) {
  return (
    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent, opacity: on ? 1 : 0 }} />
    </View>
  );
}

export function AvatarIc({ name, size = 42, tone = 'a', children }:
  { name?: string; size?: number; tone?: 'a' | 'g' | 'n' | 'a1'; children?: React.ReactNode }) {
  const bgs = { a: C.a200, g: C.g200, n: C.n200, a1: C.a100 };
  const fgs = { a: C.a800, g: C.g800, n: C.n800, a1: C.a800 };
  return (
    <View style={{ width: size, height: size, borderRadius: size, backgroundColor: bgs[tone], alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {children || <Ico name={name || 'check'} size={size * 0.44} color={fgs[tone]} />}
    </View>
  );
}

export function Bar({ pct, h = 8, bgC = C.n200, fgC = C.accent }: { pct: number; h?: number; bgC?: string; fgC?: string }) {
  return (
    <View style={{ height: h, borderRadius: h, backgroundColor: bgC, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', borderRadius: h, backgroundColor: fgC }} />
    </View>
  );
}

export function H1({ children, size = 36, style }: { children: React.ReactNode; size?: number; style?: object }) {
  return <Text maxFontSizeMultiplier={1.25} style={[{ fontFamily: F.heading, fontSize: size, lineHeight: size * 1.1, color: C.text, flexShrink: 1 }, style]}>{children}</Text>;
}
export const Sub = ({ children, style }: { children: React.ReactNode; style?: object }) =>
  <Text maxFontSizeMultiplier={1.4} style={[{ fontSize: 14.5, lineHeight: 21, color: C.n700 }, style]}>{children}</Text>;
export const Kicker = ({ children, style }: { children: React.ReactNode; style?: object }) =>
  <Text maxFontSizeMultiplier={1.3} style={[{ fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: C.n700 }, style]}>{children}</Text>;

/* clavier ouvert ? (masque la barre de navigation flottante, resserre les marges) */
export function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', () => setOpen(true));
    const b = Keyboard.addListener('keyboardDidHide', () => setOpen(false));
    return () => { a.remove(); b.remove(); };
  }, []);
  return open;
}

/* ─────────── structure d'écran ─────────── */
/* marge haute sous la barre d'état (zone sûre réelle de l'appareil) */
export const useTopPad = (extra = 12) => useSafeAreaInsets().top + extra;

export function Screen({ children, scroll = false, pad = true, style }: { children: React.ReactNode; scroll?: boolean; pad?: boolean; style?: object }) {
  const insets = useSafeAreaInsets();
  const padStyle = { paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 30 + insets.bottom };
  /* tablette : contenu centré, largeur lisible */
  const col = { width: '100%' as const, maxWidth: 640, alignSelf: 'center' as const };
  return (
    <View style={[{ flex: 1, backgroundColor: C.bg }, style]}>
      {scroll
        ? <ScrollView style={{ flex: 1 }} contentContainerStyle={[{ flexGrow: 1 }, col, pad ? padStyle : null]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>{children}</ScrollView>
        : <View style={[{ flex: 1 }, col, pad ? padStyle : null]}>{children}</View>}
    </View>
  );
}

export function TopBack({ onBack, right }: { onBack: () => void; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
      <IconBtn name="back" onPress={onBack} />
      {right}
    </View>
  );
}

export function Row({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: object }) {
  if (onPress) return <TouchableOpacity onPress={onPress} accessibilityRole="button" style={[s.row, style]} activeOpacity={0.9}>{children}</TouchableOpacity>;
  return <View style={[s.row, style]}>{children}</View>;
}

export function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (t: string) => void; placeholder: string }) {
  return (
    <View style={s.search}>
      <Ico name="search" size={17} color={C.n700} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} accessibilityLabel={placeholder} style={s.searchIn} placeholderTextColor={C.n600} returnKeyType="search" autoCorrect={false} maxFontSizeMultiplier={1.3} />
    </View>
  );
}

export function Composer({ value, onChange, onSend, placeholder, busy, onMic, listening }:
  { value: string; onChange: (t: string) => void; onSend: () => void; placeholder: string; busy?: boolean; onMic?: () => void; listening?: boolean }) {
  const on = value.trim().length > 0 && !busy;
  return (
    <View style={s.composer}>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} accessibilityLabel={placeholder} style={s.composerIn} placeholderTextColor={C.n600}
        onSubmitEditing={onSend} returnKeyType="send" editable={!busy && !listening} multiline={false} maxFontSizeMultiplier={1.3} />
      {onMic ? (
        <TouchableOpacity onPress={onMic} disabled={busy && !listening} accessibilityRole="button" accessibilityLabel={listening ? 'Arrêter l’écoute' : 'Parler à MiMai'} accessibilityState={{ selected: !!listening }}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }} style={[s.send, { marginRight: 6 }, listening && { backgroundColor: C.a700 }]} activeOpacity={0.85}>
          <Ico name="mic" size={18} color={listening ? C.bg : C.n800} />
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity onPress={onSend} disabled={!on} accessibilityRole="button" accessibilityLabel="Envoyer" hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }} style={[s.send, on && { backgroundColor: C.accent }]} activeOpacity={0.85}>
        <Ico name="send" size={18} color={on ? C.bg : C.n600} />
      </TouchableOpacity>
    </View>
  );
}

/* barre de navigation pill (Accueil · Chats · Bibliothèque) */
export function Navbar({ active, onGo }: { active: 'home' | 'chats' | 'library'; onGo: (k: 'home' | 'chats' | 'library') => void }) {
  const insets = useSafeAreaInsets();
  const kb = useKeyboardOpen();
  const items: [keyof typeof ICONS | string, string, 'home' | 'chats' | 'library'][] = [['home', 'Accueil', 'home'], ['chat', 'Chats', 'chats'], ['book', 'Bibliothèque', 'library']];
  if (kb) return null;
  return (
    <View pointerEvents="box-none" style={[s.navWrap, { bottom: 14 + insets.bottom }]}>
    <View style={s.navbar}>
      {items.map(([ic, label, key]) => {
        const on = key === active;
        return (
          <TouchableOpacity key={key} onPress={() => onGo(key)} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: on }} style={[{ flex: on ? 1.8 : 1, minWidth: 0, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, height: 50 },
            on && { backgroundColor: C.accent }]} activeOpacity={0.85}>
            <Ico name={ic} size={19} color={on ? C.bg : C.n300} />
            {on ? <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={{ color: C.bg, fontSize: 14, fontWeight: '700', fontFamily: F.bodyBold, flexShrink: 1 }}>{label}</Text> : null}
          </TouchableOpacity>
        );
      })}
    </View>
    </View>
  );
}

/* menu bas (bouton ⋮ de l'accueil) */
export function MenuSheet({ onClose, items, visible = true }: { onClose: () => void; visible?: boolean; items: { icon: string; title: string; sub?: string; on: () => void; custom?: React.ReactNode }[] }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <TouchableOpacity accessibilityLabel="Fermer le menu" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(32,30,29,.4)' }} onPress={onClose} />
        <View style={[s.sheet, { marginBottom: 12 + insets.bottom, maxHeight: height - insets.top - insets.bottom - 40, maxWidth: 520, alignSelf: 'center', width: '96%' }]}>
          <View style={s.grab} />
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={{ flexGrow: 0 }}>
          {items.map(it => (
            <TouchableOpacity key={it.title} onPress={() => { onClose(); it.on(); }} accessibilityRole="button" style={s.sheetItem} activeOpacity={0.9}>
              <AvatarIc name={it.icon} size={40}>{it.custom}</AvatarIc>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontWeight: '700', fontSize: 15, fontFamily: F.bodyBold, color: C.text }}>{it.title}</Text>
                {it.sub ? <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={{ fontSize: 12.5, color: C.n700 }}>{it.sub}</Text> : null}
              </View>
            </TouchableOpacity>
          ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* toast global */
export function Toast({ text }: { text: string }) {
  const insets = useSafeAreaInsets();
  if (!text) return null;
  return (
    <View style={[s.toastWrap, { bottom: 100 + insets.bottom }]} pointerEvents="none" accessibilityLiveRegion="polite">
      <View style={s.toast}><Text numberOfLines={4} maxFontSizeMultiplier={1.2} style={{ color: C.bg, fontSize: 13.5, fontWeight: '600', textAlign: 'center', fontFamily: F.bodySemi }}>{text}</Text></View>
    </View>
  );
}

/* dialog générique */
export function Dialog({ children, onClose, visible = true }: { children: React.ReactNode; onClose: () => void; visible?: boolean }) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableOpacity accessibilityLabel="Fermer" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(32,30,29,.5)' }} onPress={onClose} />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 20, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={s.dialog}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* rangée de boutons d'un dialogue : passe à la ligne si un libellé est long */
export const DialogActions = ({ children }: { children: React.ReactNode }) =>
  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>{children}</View>;

/* personnage animé (raccourci) */
export const Mimir = ({ size, move = 0 }: { size: number; move?: number }) => <BuddyMove size={size} move={MOVES[move] || MOVES[0]} />;

const s = StyleSheet.create({
  btn: { borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 18, paddingVertical: 8, flexShrink: 1, maxWidth: '100%' },
  btnT: { fontFamily: F.heading, lineHeight: 22, textAlign: 'center', flexShrink: 1 },
  iconBtn: { flexShrink: 0, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  tag: { maxWidth: '100%', flexShrink: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 },
  card: { backgroundColor: C.surface, borderRadius: 32, padding: 17, gap: 9 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 22 },
  tg: { flexShrink: 0, width: 46, height: 28, borderRadius: 14, padding: 3 },
  tgDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.bg },
  search: { marginTop: 14, height: 48, borderRadius: R.pill, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  searchIn: { flex: 1, minWidth: 0, fontSize: 15, color: C.text, fontFamily: F.body, paddingVertical: 0 },
  composer: { height: 56, borderRadius: R.pill, backgroundColor: C.n100, borderWidth: 1, borderColor: C.divider, flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 7, gap: 8 },
  composerIn: { flex: 1, minWidth: 0, fontSize: 15, color: C.text, fontFamily: F.body, paddingVertical: 0 },
  send: { flexShrink: 0, width: 42, height: 42, borderRadius: 21, backgroundColor: C.n200, alignItems: 'center', justifyContent: 'center' },
  navWrap: { position: 'absolute', left: 14, right: 14, alignItems: 'center' },
  navbar: { width: '100%', maxWidth: 520, height: 62, borderRadius: R.pill, backgroundColor: C.text, flexDirection: 'row', gap: 4, padding: 6, ...shadow(3) },
  sheet: { marginHorizontal: 10, borderRadius: 32, backgroundColor: C.bg, padding: 10, paddingTop: 4, ...shadow(3) },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: C.n300, alignSelf: 'center', marginTop: 6, marginBottom: 10 },
  sheetItem: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 9, borderRadius: 22 },
  toastWrap: { position: 'absolute', left: 20, right: 20, bottom: 110, alignItems: 'center', zIndex: 50 },
  toast: { backgroundColor: C.text, borderRadius: R.pill, paddingVertical: 11, paddingHorizontal: 18, ...shadow(3) },
  dialog: { width: '100%', maxWidth: 360, borderRadius: 32, backgroundColor: C.bg, padding: 20, gap: 12, ...shadow(3) },
});
