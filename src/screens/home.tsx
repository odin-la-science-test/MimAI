/* Accueil : salutation, Mìmir, tuiles d'action, compositeur. */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav-types';
import { useApp, MODELS } from '../state';
import { C, F } from '../theme';
import { MOVES } from '../art';
import { IconBtn, Tag, Navbar, MenuSheet, Composer, AvatarIc, useTopPad, useKeyboardOpen } from '../ui';

const TILE_ICONS: Record<string, string> = { think: 'brain', write: 'pen', analyze: 'chart', code: 'code' };

export function Home({ navigation }: NativeStackScreenProps<RootStackParamList, 'Home'>) {
  const { data, e, set, newChat } = useApp();
  const top = useTopPad(6);
  const insets = useSafeAreaInsets();
  const kb = useKeyboardOpen();
  const [menu, setMenu] = useState(false);
  const am = MODELS[data.settings.activeModel];
  const netOn = data.settings.netUntil && data.settings.netUntil > Date.now();

  const tiles: { k: string; t: string; sub: string; tone: 'a' | 'g'; mode?: 'rapide' | 'reflexion' | 'vision' | 'outils' }[] = [
    { k: 'think', t: 'Réfléchir', sub: 'Structurer une idée', tone: 'a', mode: 'reflexion' },
    { k: 'write', t: 'Écrire', sub: 'Rédiger, reformuler', tone: 'g', mode: 'rapide' },
    { k: 'analyze', t: 'Analyser', sub: 'Un document, des données', tone: 'g', mode: 'rapide' },
    { k: 'code', t: 'Coder', sub: 'Écrire, expliquer, corriger', tone: 'a', mode: 'outils' },
  ];

  const openChat = () => { newChat(); navigation.navigate('Chat', {}); };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingHorizontal: 0, flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 22, paddingRight: 16, paddingTop: top }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: F.heading, fontSize: 24, color: C.accent }}>MiMai</Text>
          </View>
          <IconBtn name="dots" onPress={() => setMenu(true)} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 22, paddingTop: 10, alignItems: 'center' }}>
          <Tag kind="accent2" dot>{netOn ? 'Réseau autorisé' : 'Local · Internet bloqué'}</Tag>
          <Tag kind="neutral" onPress={() => navigation.navigate('Models')}>{am ? am.name : 'Modèle'} ›</Tag>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 14, paddingTop: 12, width: '100%', maxWidth: 640, alignSelf: 'center' }}
          keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, paddingLeft: 6 }}>
            <View style={{ gap: 8, flex: 1, minWidth: 0 }}>
              <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: F.heading, fontSize: 46, lineHeight: 52 }}>Bonjour.</Text>
              <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 17, color: C.n700 }}>Que voulez-vous faire ?</Text>
            </View>
          </View>
          <View style={st.tiles}>
            {tiles.map(t => (
              <TouchableOpacity key={t.k} style={st.tile} activeOpacity={0.9}
                accessibilityRole="button" accessibilityLabel={t.t + ' — ' + t.sub}
                onPress={() => { newChat(); navigation.navigate('Chat', { mode: t.mode }); }}>
                <AvatarIc name={TILE_ICONS[t.k]} size={38} tone={t.tone} />
                <View>
                  <Text numberOfLines={1} maxFontSizeMultiplier={1.25} style={{ fontWeight: '700', fontSize: 15, fontFamily: F.bodyBold }}>{t.t}</Text>
                  <Text numberOfLines={2} maxFontSizeMultiplier={1.25} style={{ fontSize: 12.5, color: C.n700 }}>{t.sub}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <View style={{ paddingHorizontal: 14, width: '100%', maxWidth: 640, alignSelf: 'center' }}>
          <Composer value={e.draft} onChange={t => set(s => ({ ...s, draft: t }))} onSend={openChat} placeholder="Écrire à MiMai" onMic={() => { newChat(); navigation.navigate('Chat', { voice: 'mic' }); }} />
        </View>
        {/* réserve la place de la barre de navigation flottante (+ barre de gestes), sauf clavier ouvert */}
        <View style={{ height: kb ? 10 : 90 + insets.bottom }} />
      </View>
      <Navbar active="home" onGo={k => navigation.navigate(k === 'home' ? 'Home' : k === 'chats' ? 'Chats' : 'Library')} />
      {menu ? (
        <MenuSheet onClose={() => setMenu(false)} items={[
          { icon: 'cpu', title: 'Modèles', sub: (am ? am.name : '') + ' actif', on: () => navigation.navigate('Models') },
          { icon: 'grad', title: 'Entraînement', sub: 'Compétences et exemples', on: () => navigation.navigate('Training') },
          { icon: 'layers', title: 'Mémoire', sub: data.memories.length + ' souvenir(s) actif(s)', on: () => navigation.navigate('Memory') },
          { icon: 'user', title: 'Mìmir', sub: data.settings.comp.on ? 'Affiché dans l’app' : 'Le compagnon, partout', on: () => navigation.navigate('Companion') },
          { icon: 'lock', title: 'Confidentialité', sub: 'Local, sans compte', on: () => navigation.navigate('Privacy') },
          { icon: 'spark', title: 'La Garde des Étoiles', sub: 'Jeu hors ligne avec Mìmir', on: () => navigation.navigate('Game') },
          { icon: 'spark', title: 'Arène', sub: 'Mini-jeu avec Mìmir', on: () => navigation.navigate('Arena') },
          { icon: 'pen', title: 'Animations', sub: MOVES.length + ' mouvements de Mìmir', on: () => navigation.navigate('Moves') },
        ]} />
      ) : null}
    </View>
  );
}


const st = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  tile: { width: '48.4%', minHeight: 110, borderRadius: 28, backgroundColor: C.surface, padding: 14, gap: 10, justifyContent: 'space-between' },
});
