/* Confidentialité (README §17, §21-23) : état réel du stockage local, journal
   réseau, export de diagnostic manuel, suppression des données.
   Aucun compte : l'app n'en a pas (ADR-002). */
import React, { useState } from 'react';
import { View, Text, Share } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav-types';
import { useApp } from '../state';
import { C, F, hhmm } from '../theme';
import { Screen, IconBtn, H1, Sub, Kicker, Card, Btn, Tag, Toggle, Row, AvatarIc, Ico, Dialog, DialogActions } from '../ui';
import { cryptoMode } from '../services/crypto';

/* ─────────── Confidentialité ─────────── */
export function Privacy({ navigation }: NativeStackScreenProps<RootStackParamList, 'Privacy'>) {
  const { data, blockNet, authorizeNet, wipe, exportDiagnostic, toast } = useApp();
  const [confirm, setConfirm] = useState<null | 'data'>(null);
  const netOn = !!(data.settings.netUntil && data.settings.netUntil > Date.now());
  const localRows: [string, string][] = [
    ['Conversations', data.convs.length + (cryptoMode === 'js' ? ' (test, en clair)' : ' chiffrées')],
    ['Mémoire', data.memories.length + (data.memories.length > 1 ? ' souvenirs' : ' souvenir')],
    ['Documents', data.docs.length + ' indexés localement'],
    ['Modèles et compétences', data.settings.installed.length + ' modèles · ' + data.adapters.length + ' adaptateurs'],
  ];

  return (
    <Screen scroll>
      <IconBtn name="back" onPress={() => navigation.goBack()} />
      <H1 style={{ marginTop: 10 }}>Confidentialité</H1>
      <Sub style={{ marginTop: 6 }}>Où vont vos données : nulle part ailleurs.</Sub>

      <View style={{ marginTop: 18, borderRadius: 32, backgroundColor: C.text, padding: 22, gap: 12 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: C.n300 }}>Vos données</Text>
        <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: F.heading, fontSize: 34, color: C.bg, lineHeight: 40 }}>Sur cet appareil</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          <View style={{ flex: 1, minWidth: 0 }}><Text style={{ fontSize: 12.5, color: C.n300 }}>Événements réseau (journal)</Text><Text style={{ fontFamily: F.heading, fontSize: 22, color: C.bg }}>{data.netLog.length}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}><Text style={{ fontSize: 12.5, color: C.n300 }}>Réseau</Text><Text style={{ fontFamily: F.heading, fontSize: 22, color: C.bg }}>{netOn ? 'Autorisé' : 'Bloqué'}</Text></View>
        </View>
      </View>

      <Kicker style={{ marginTop: 22 }}>Sur cet appareil</Kicker>
      {cryptoMode === 'js' ? (
        <View style={{ marginTop: 8, borderRadius: 22, backgroundColor: C.n100, padding: 12 }}>
          <Text style={{ fontSize: 12.5, lineHeight: 18, color: C.n800 }}>Test Expo Go : le module de chiffrement natif n’est pas disponible ici, les données de test restent en clair. Dans la version installée (.aab), elles sont chiffrées (AES-256-GCM, clé dans le Keystore).</Text>
        </View>
      ) : null}
      <View style={{ marginTop: 4 }}>
        {localRows.map(([k, v]) => (
          <Row key={k}>
            <Text style={{ flex: 1, minWidth: 0, fontSize: 15, color: C.text }}>{k}</Text>
            <Text style={{ flexShrink: 1, maxWidth: '46%', fontSize: 12.5, color: C.n700, textAlign: 'right' }}>{v}</Text>
            <View style={{ flexShrink: 0 }}><Tag kind="accent2">Local</Tag></View>
          </Row>
        ))}
      </View>

      <Kicker style={{ marginTop: 18 }}>Connexion Internet</Kicker>
      <Card style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center' }}>
        <AvatarIc name="wifiOff" size={40} tone="n" />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ fontWeight: '700', fontSize: 15, fontFamily: F.bodyBold }}>{netOn ? 'Autorisée · 15 min' : 'Désactivée'}</Text>
          <Text style={{ fontSize: 12.5, lineHeight: 17, color: C.n700 }}>Uniquement pour télécharger un modèle.</Text>
        </View>
        <Toggle label="Autoriser Internet pendant 15 minutes" on={netOn} onChange={() => {
          if (netOn) { blockNet('depuis Confidentialité'); toast('Internet coupé'); }
          else { authorizeNet('manuel (Confidentialité)'); toast('Internet autorisé pour 15 min'); }
        }} />
      </Card>

      <Kicker style={{ marginTop: 18 }}>Journal réseau</Kicker>
      <View style={{ marginTop: 6 }}>
        {data.netLog.slice(0, 6).map((n, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(32,30,29,.08)' }}>
            <Text style={{ fontSize: 12, color: C.n700, fontVariant: ['tabular-nums'], flexShrink: 0 }}>{hhmm(n.t)}</Text>
            <Text style={{ flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 17, color: C.n700 }}>{n.ev}</Text>
          </View>
        ))}
        {!data.netLog.length ? <Text style={{ fontSize: 13, color: C.n700, paddingVertical: 6 }}>Aucun événement réseau. MiMai n’a rien demandé.</Text> : null}
      </View>

      <Kicker style={{ marginTop: 18 }}>Diagnostic et données</Kicker>
      <View style={{ marginTop: 6 }}>
        <Row onPress={() => { void Share.share({ message: exportDiagnostic() }).catch(() => toast('Export impossible')); }}>
          <AvatarIc name="download" size={32} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14.5, color: C.text }}>Exporter le diagnostic</Text>
            <Text style={{ fontSize: 12, lineHeight: 16, color: C.n700 }}>Contient vos souvenirs et réglages : relisez avant de partager.</Text>
          </View>
          <Ico name="chevron" size={15} color={C.n600} />
        </Row>
        <Row onPress={() => setConfirm('data')}>
          <AvatarIc name="trash" size={32} />
          <Text style={{ flex: 1, minWidth: 0, fontSize: 14.5, color: C.text }}>Supprimer les données locales</Text>
          <Ico name="chevron" size={15} color={C.n600} />
        </Row>
      </View>

      <Text style={{ marginTop: 12, fontSize: 13, lineHeight: 19, color: C.n700 }}>MiMai fonctionne entièrement hors ligne. Ce n’est pas une limite, c’est le principe.</Text>
      <View style={{ height: 12 }} />

      <Dialog visible={confirm !== null} onClose={() => setConfirm(null)}>
        <Text maxFontSizeMultiplier={1.25} style={{ fontFamily: F.heading, fontSize: 22, lineHeight: 28 }}>Supprimer les données ?</Text>
        <Text style={{ fontSize: 14, lineHeight: 20, color: C.n700 }}>Conversations, mémoire, documents et exemples d’entraînement seront réinitialisés. Action irréversible, entièrement locale.</Text>
        <DialogActions>
          <Btn kind="secondary" title="Annuler" height={48} onPress={() => setConfirm(null)} />
          <Btn title="Supprimer" height={48} onPress={() => { wipe('data'); setConfirm(null); }} />
        </DialogActions>
      </Dialog>
    </Screen>
  );
}
