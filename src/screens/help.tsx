/* Aide et gestes : ce que fait chaque geste et chaque mode, en quelques cartes (français / anglais). */
import React from 'react';
import { View } from 'react-native';
import { Text } from '../i18n/Text';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav-types';
import { useApp } from '../state';
import { C, F } from '../theme';
import { Screen, IconBtn, H1, Sub, Card, Btn } from '../ui';
import { bi } from '../i18n';

export function Help({ navigation }: NativeStackScreenProps<RootStackParamList, 'Help'>) {
  const { patchData } = useApp();
  const cards: { t: string; b: string[] }[] = [
    { t: bi('Le petit bonhomme', 'The little character'), b: [
      bi('Touchez-le : la bulle de discussion s’ouvre, par-dessus n’importe quelle appli.', 'Tap it: the chat bubble opens over any app.'),
      bi('Glissez-le du doigt : posez-le où vous voulez sur l’écran, il garde sa place.', 'Drag it with your finger: put it anywhere on the screen, it stays there.'),
      bi('Restez appuyé 3 secondes : le téléphone vibre et MiMai bascule entre le mode hors ligne et le mode en ligne.', 'Press and hold for 3 seconds: the phone vibrates and MiMai switches between offline and online mode.'),
    ] },
    { t: bi('Orange ou bleu ?', 'Orange or blue?'), b: [
      bi('Orange = hors ligne : tout se passe sur votre téléphone, rien n’est envoyé.', 'Orange = offline: everything happens on your phone, nothing is sent.'),
      bi('Bleu = en ligne : vos questions sont traitées par le fournisseur gratuit que vous avez connecté, et le modèle du téléphone reste en veille.', 'Blue = online: your questions are handled by the free provider you connected, and the phone model stays idle.'),
      bi('Sans Internet, MiMai repasse tout seul en orange et reprend en bleu quand la connexion revient.', 'Without Internet, MiMai goes back to orange by itself and returns to blue when the connection is back.'),
    ] },
    { t: bi('La bulle de discussion', 'The chat bubble'), b: [
      bi('Écrivez, ou touchez le micro : votre voix est transformée en texte, envoyée, et la réponse est lue à voix haute.', 'Type, or tap the microphone: your voice becomes text, is sent, and the answer is read aloud.'),
      bi('Le mode (Rapide, Réflexion, Outils, Vision) est choisi au début et fixé pour toute la discussion.', 'The mode (Fast, Reasoning, Tools, Vision) is chosen at the start and fixed for the whole conversation.'),
    ] },
    { t: bi('Documents et photos', 'Documents and photos'), b: [
      bi('Dans une discussion, « ＋ Joindre » : texte, Word, Excel, PowerPoint, PDF ou photo. Le document est lu sur votre téléphone.', 'In a conversation, “＋ Attach”: text, Word, Excel, PowerPoint, PDF or photo. The document is read on your phone.'),
      bi('Il reste actif pour vos questions suivantes, jusqu’à ce que vous le retiriez.', 'It stays active for your next questions until you remove it.'),
    ] },
    { t: bi('IA en ligne gratuite', 'Free online AI'), b: [
      bi('Menu → IA en ligne gratuite : collez vos propres clés gratuites. MiMai suit les limites du jour et change de modèle tout seul.', 'Menu → Free online AI: paste your own free keys. MiMai tracks the daily limits and switches models by itself.'),
      bi('L’Atelier crée des images et des vocaux avec ces mêmes clés.', 'The Studio creates images and voice clips with those same keys.'),
    ] },
    { t: bi('Vos données', 'Your data'), b: [
      bi('Confidentialité → Sauvegarde : exportez vos discussions, votre mémoire et vos documents dans un fichier pour changer de téléphone, ou importez-le.', 'Privacy → Backup: export your conversations, memory and documents to a file to change phones, or import it.'),
    ] },
  ];
  return (
    <Screen scroll>
      <IconBtn name="back" onPress={() => navigation.goBack()} />
      <H1 style={{ marginTop: 10 }}>{bi('Aide et gestes', 'Help and gestures')}</H1>
      <Sub style={{ marginTop: 6 }}>{bi('L’essentiel en une minute.', 'The essentials in one minute.')}</Sub>
      <View style={{ marginTop: 16, gap: 12 }}>
        {cards.map(c => (
          <Card key={c.t} style={{ gap: 8 }}>
            <Text maxFontSizeMultiplier={1.3} style={{ fontWeight: '700', fontSize: 16, fontFamily: F.bodyBold }}>{c.t}</Text>
            {c.b.map((x, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent, marginTop: 8 }} />
                <Text maxFontSizeMultiplier={1.3} style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 21, color: C.n800 }}>{x}</Text>
              </View>
            ))}
          </Card>
        ))}
      </View>
      <Btn title={bi('Compris', 'Got it')} height={52} style={{ marginTop: 18, marginBottom: 30 }} onPress={() => { patchData(d => { d.settings.helpSeen = true; }); navigation.goBack(); }} />
    </Screen>
  );
}
