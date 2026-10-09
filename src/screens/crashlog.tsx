/* Rapport de plantage : tout ce qu'il faut pour comprendre un problème, à copier-coller. Rien n'est envoyé automatiquement. */
import React, { useCallback, useState } from 'react';
import { View, Text, Share } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav-types';
import { useApp } from '../state';
import { C } from '../theme';
import { Screen, IconBtn, H1, Sub, Btn, Card } from '../ui';
import { buildReport, clearReport, trail } from '../services/crashlog';
import { llamaAvailable } from '../services/engine';

export function CrashLog({ navigation }: NativeStackScreenProps<RootStackParamList, 'CrashLog'>) {
  const { data, patchData, toast } = useApp();
  const [report, setReport] = useState('');
  const refresh = useCallback(() => {
    setReport(buildReport(data, ['Moteur llama.rn : ' + (llamaAvailable() ? 'présent' : 'absent')]));
  }, [data]);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  return (
    <Screen scroll>
      <IconBtn name="back" onPress={() => navigation.goBack()} />
      <H1 size={32} style={{ marginTop: 10 }}>Rapport de plantage</H1>
      <Sub style={{ marginTop: 6 }}>
        Si MiMai se ferme ou affiche une erreur : rouvrez-le, venez ici, copiez le rapport et envoyez-le. Il contient l’appareil, les erreurs, les raisons de fermeture données par Android et les dernières étapes avant le problème. Aucune conversation, aucun document : rien n’est envoyé sans votre geste.
      </Sub>
      <View style={{ gap: 8, marginTop: 14 }}>
        <Btn title="Copier le rapport" height={52} onPress={() => { void Clipboard.setStringAsync(report).then(() => toast('Rapport copié')); }} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn kind="secondary" title="Partager…" height={48} fontSize={14} style={{ flex: 1 }} onPress={() => { void Share.share({ message: report }); }} />
          <Btn kind="secondary" title="Actualiser" height={48} fontSize={14} style={{ flex: 1 }} onPress={() => { trail('rapport actualisé'); refresh(); }} />
        </View>
      </View>
      <Card style={{ marginTop: 14, padding: 12 }}>
        <Text selectable style={{ fontSize: 11.5, lineHeight: 16, color: C.n900 }}>{report}</Text>
      </Card>
      <Btn kind="ghost" title="Effacer le journal" height={44} fontSize={13.5} style={{ marginTop: 10 }}
        onPress={() => { clearReport(); patchData(d => { d.crashes = []; }); refresh(); toast('Journal effacé'); }} />
      <View style={{ height: 12 }} />
    </Screen>
  );
}
