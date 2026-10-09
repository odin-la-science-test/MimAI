/* Mémoire (README §6) : apprentissage immédiat — liste, ajout, activation,
   suppression. Distincte de l'entraînement. */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav-types';
import { useApp } from '../state';
import { C, F, hhmm } from '../theme';
import { Screen, IconBtn, H1, Sub, Kicker, Toggle, Row, Card, Ico } from '../ui';

export function Memory({ navigation }: NativeStackScreenProps<RootStackParamList, 'Memory'>) {
  const { data, patchData, addMemory, toggleMemory, deleteMemory, toast } = useApp();
  const [draft, setDraft] = useState('');
  const mems = data.memories;

  return (
    <Screen scroll>
      <IconBtn name="back" onPress={() => navigation.goBack()} />
      <H1 style={{ marginTop: 10 }}>Mémoire</H1>
      <Sub style={{ marginTop: 6 }}>L’apprentissage immédiat : ce que MiMai retient de vous et réinjecte dans les conversations. C’est différent de l’entraînement.</Sub>

      <Card style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontWeight: '700', fontSize: 15, fontFamily: F.bodyBold }}>Mémoire activée</Text>
          <Text style={{ fontSize: 12.5, color: C.n700 }}>Analyse locale de vos messages</Text>
        </View>
        <Toggle label="Mémoire activée" on={data.settings.memOn} onChange={() => patchData(d => { d.settings.memOn = !d.settings.memOn; })} />
      </Card>

      <View style={{ marginTop: 16, flexDirection: 'row', gap: 8 }}>
        <TextInput value={draft} onChangeText={setDraft} placeholder="Ex. : Je préfère les réponses courtes" accessibilityLabel="Nouveau souvenir" maxLength={300} returnKeyType="done" maxFontSizeMultiplier={1.3} numberOfLines={1} onSubmitEditing={() => { if (draft.trim()) { addMemory(draft.trim()); setDraft(''); toast('Ajouté à votre mémoire locale'); } }}
          style={{ flex: 1, minWidth: 0, height: 48, borderRadius: 24, backgroundColor: C.surface, borderWidth: 1, borderColor: C.divider, paddingHorizontal: 16, paddingVertical: 0, fontSize: 14, fontFamily: F.body, color: C.text }} placeholderTextColor={C.n600} />
        <TouchableOpacity disabled={!draft.trim()} accessibilityRole="button" accessibilityLabel="Ajouter le souvenir"
          onPress={() => { addMemory(draft.trim()); setDraft(''); toast('Ajouté à votre mémoire locale'); }}
          style={{ width: 48, height: 48, borderRadius: 24, flexShrink: 0, backgroundColor: draft.trim() ? C.accent : C.n200, alignItems: 'center', justifyContent: 'center' }}>
          <Ico name="plus" size={18} color={draft.trim() ? C.bg : C.n600} />
        </TouchableOpacity>
      </View>

      <Kicker style={{ marginTop: 20 }}>{mems.length} souvenir(s)</Kicker>
      <View style={{ marginTop: 6 }}>
        {mems.map(m => (
          <Row key={m.id}>
            <View style={{ width: 38, height: 38, borderRadius: 19, flexShrink: 0, backgroundColor: m.kind === 'style' ? C.a200 : C.g200, alignItems: 'center', justifyContent: 'center' }}>
              <Ico name={m.kind === 'style' ? 'pen' : m.kind === 'préférence' ? 'spark' : 'list'} size={15} color={m.kind === 'style' ? C.a800 : C.g800} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={6} style={{ fontSize: 14.5, lineHeight: 20, fontWeight: '600', color: C.text }}>{m.text}</Text>
              <Text style={{ fontSize: 11.5, color: C.n700 }}>{m.kind} · {hhmm(m.ts)}</Text>
            </View>
            <Toggle label={'Activer : ' + m.text} on={m.enabled} onChange={() => toggleMemory(m.id)} />
            <TouchableOpacity onPress={() => deleteMemory(m.id)} accessibilityRole="button" accessibilityLabel={'Supprimer le souvenir : ' + m.text} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} style={{ padding: 10, flexShrink: 0 }}>
              <Ico name="trash" size={16} color={C.n700} />
            </TouchableOpacity>
          </Row>
        ))}
        {!mems.length ? (
          <Card style={{ backgroundColor: C.g100 }}>
            <Text style={{ fontSize: 13.5, lineHeight: 20, color: C.g900 }}>Aucun souvenir pour l’instant. Dites par exemple « Retiens que je préfère les réponses courtes » dans une conversation, ou ajoutez-en un ici.</Text>
          </Card>
        ) : null}
      </View>

      <View style={{ marginTop: 16, borderRadius: 22, backgroundColor: C.n100, padding: 14 }}>
        <Text style={{ fontSize: 13, lineHeight: 19, color: C.n800 }}>Les souvenirs désactivés ne quittent pas l’appareil : ils sont simplement ignorés. Tout reste dans la base locale de l’appareil.</Text>
      </View>
      <View style={{ height: 24 }} />
    </Screen>
  );
}
