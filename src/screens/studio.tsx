/* Atelier : créer des images et des vocaux avec les fournisseurs en ligne gratuits déjà connectés (Cloudflare, Gemini).
   Mêmes clés, mêmes limites suivies que le reste de l'IA en ligne. Rien n'est envoyé sans que vous touchiez « Créer ». */
import React, { useState } from 'react';
import { View, Text, TextInput, Image } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav-types';
import { useApp } from '../state';
import { C, F } from '../theme';
import { Screen, IconBtn, H1, Sub, Kicker, Card, Btn } from '../ui';
import { runIntent } from '../services/cloud/studio';
import { cloudEngine } from '../services/cloud';
import { isOnlineMode } from '../services/cloud/mode';

interface Item { id: number; kind: 'image' | 'voice'; prompt: string; text: string; image?: string | null; ok: boolean }

export function Studio({ navigation }: NativeStackScreenProps<RootStackParamList, 'Studio'>) {
  const { data, toast } = useApp();
  const online = isOnlineMode(data.settings.cloud);
  const e = cloudEngine();
  const canImage = !!e?.mediaAvailable('image');
  const canVoice = !!e?.mediaAvailable('tts');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState<null | 'image' | 'voice'>(null);
  const [items, setItems] = useState<Item[]>([]);

  const create = async (kind: 'image' | 'voice') => {
    const t = prompt.trim();
    if (!t || busy) return;
    setBusy(kind);
    try {
      const r = await runIntent({ kind, prompt: t }, data.settings.voice?.id ?? null);
      setItems(list => [{ id: Date.now(), kind, prompt: t, text: r.text, image: r.image, ok: r.ok }, ...list].slice(0, 20));
      if (!r.ok) toast('Création impossible pour l’instant');
    } finally { setBusy(null); }
  };

  return (
    <Screen scroll>
      <IconBtn name="back" onPress={() => navigation.goBack()} />
      <H1 style={{ marginTop: 10 }}>Atelier</H1>
      <Sub style={{ marginTop: 6 }}>Créez des images et des vocaux avec vos fournisseurs en ligne gratuits.</Sub>

      {!online || (!canImage && !canVoice) ? (
        <Card style={{ marginTop: 16, gap: 8 }}>
          <Text style={{ fontWeight: '700', fontSize: 15, fontFamily: F.bodyBold }}>Il faut le mode en ligne</Text>
          <Text style={{ fontSize: 13, lineHeight: 19, color: C.n700 }}>Activez « IA en ligne gratuite » et connectez Cloudflare Workers AI ou Google Gemini : ce sont eux qui créent les images et les vocaux.</Text>
          <Btn title="Ouvrir IA en ligne gratuite" kind="secondary" height={44} fontSize={14} onPress={() => navigation.navigate('Cloud')} />
        </Card>
      ) : (
        <>
          <TextInput value={prompt} onChangeText={setPrompt} multiline placeholder="Décrivez ce que vous voulez (ex. : un renard roux dans la neige, style aquarelle)" accessibilityLabel="Description"
            style={{ marginTop: 16, minHeight: 96, borderRadius: 22, backgroundColor: C.n100, borderWidth: 1, borderColor: C.divider, padding: 14, fontSize: 15, color: C.text, textAlignVertical: 'top' }} placeholderTextColor={C.n600} maxLength={600} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <Btn title={busy === 'image' ? 'Création…' : 'Créer une image'} height={48} fontSize={14.5} disabled={!canImage || !!busy || !prompt.trim()} onPress={() => void create('image')} />
            <Btn title={busy === 'voice' ? 'Création…' : 'Lire à voix haute'} kind="secondary" height={48} fontSize={14.5} disabled={!canVoice || !!busy || !prompt.trim()} onPress={() => void create('voice')} />
          </View>
          <Text style={{ fontSize: 12, lineHeight: 17, color: C.n700, marginTop: 10 }}>
            Le texte saisi est envoyé au fournisseur pour créer le résultat. Les images sont enregistrées dans l’espace privé de MiMai.
            {!canImage ? ' Aucun fournisseur d’images connecté.' : ''}
          </Text>
        </>
      )}

      {items.length ? <Kicker style={{ marginTop: 22 }}>Vos créations</Kicker> : null}
      <View style={{ marginTop: 8, gap: 12 }}>
        {items.map(it => (
          <Card key={it.id} style={{ gap: 8 }}>
            {it.image ? <Image source={{ uri: it.image }} style={{ width: '100%', aspectRatio: 1, borderRadius: 20, backgroundColor: C.n200 }} resizeMode="cover" /> : null}
            <Text style={{ fontSize: 13.5, lineHeight: 19, color: it.ok ? C.text : C.a800 }}>{it.text}</Text>
            <Text style={{ fontSize: 11.5, color: C.n700 }} numberOfLines={2}>{it.kind === 'image' ? 'Image' : 'Vocal'} · {it.prompt}</Text>
          </Card>
        ))}
      </View>

      <Card style={{ marginTop: 22, marginBottom: 30, gap: 6 }}>
        <Text style={{ fontWeight: '700', fontSize: 14.5, fontFamily: F.bodyBold }}>Vidéo</Text>
        <Text style={{ fontSize: 12.5, lineHeight: 18, color: C.n700 }}>La génération de vidéo n’est pas encore disponible : aucun fournisseur gratuit ne la propose aujourd’hui (les services vidéo sont payants). MiMai ne fait pas semblant.</Text>
      </Card>
    </Screen>
  );
}
