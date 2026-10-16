/* Confidentialité (README §17, §21-23) : état réel du stockage local, journal
   réseau, export de diagnostic manuel, suppression des données.
   Aucun compte : l'app n'en a pas (ADR-002). */
import React, { useState } from 'react';
import { View, Share } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { buildBackup, mergeBackup, backupFileName } from '../services/backup';
import { uid } from '../services/db';
import { bi } from '../i18n';
import { Text } from '../i18n/Text';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav-types';
import { useApp } from '../state';
import { C, F, hhmm } from '../theme';
import { Screen, IconBtn, H1, Sub, Kicker, Card, Btn, Tag, Toggle, Row, AvatarIc, Ico, Dialog, DialogActions } from '../ui';
import { cryptoMode } from '../services/crypto';
import { isOnlineMode } from '../services/cloud/mode';
import { PROVIDER_BY_ID } from '../services/cloud/providers';

/* ─────────── Confidentialité ─────────── */
export function Privacy({ navigation }: NativeStackScreenProps<RootStackParamList, 'Privacy'>) {
  const { data, patchData, blockNet, authorizeNet, wipe, exportDiagnostic, toast } = useApp();
  const cl = data.settings.cloud;
  const online = isOnlineMode(cl);
  const names = Object.keys(cl?.providers || {}).filter(id => cl!.providers[id].enabled).map(id => PROVIDER_BY_ID[id]?.name || id).join(', ');
  const [confirm, setConfirm] = useState<null | 'data'>(null);
  const netOn = !!(data.settings.netUntil && data.settings.netUntil > Date.now());
  const localRows: [string, string][] = [
    ['Conversations', data.convs.length + (cryptoMode === 'js' ? ' (test, en clair)' : ' chiffrées')],
    ['Mémoire', data.memories.length + (data.memories.length > 1 ? ' souvenirs' : ' souvenir')],
    ['Documents', data.docs.length + ' indexés localement'],
    ...(online ? [] : [['Modèles et compétences', data.settings.installed.length + ' modèles · ' + data.adapters.length + ' adaptateurs'] as [string, string]]),
  ];

  const lang = data.settings.lang || 'auto';
  const [busyB, setBusyB] = useState(false);
  const exportBackup = async () => {
    if (busyB) return;
    setBusyB(true);
    try {
      const uri = (FileSystem.cacheDirectory || '') + backupFileName();
      await FileSystem.writeAsStringAsync(uri, JSON.stringify(buildBackup(data)), { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: bi('Sauvegarde MiMai', 'MiMai backup') });
      else toast(bi('Partage indisponible sur cet appareil.', 'Sharing is not available on this device.'));
    } catch { toast(bi('Export impossible.', 'Export failed.')); }
    finally { setBusyB(false); }
  };
  const importBackup = async () => {
    if (busyB) return;
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets?.length) return;
      setBusyB(true);
      const raw = JSON.parse(await FileSystem.readAsStringAsync(r.assets[0].uri, { encoding: FileSystem.EncodingType.UTF8 }));
      /* la fusion se fait sur une copie : le résultat est connu tout de suite, puis appliqué d'un coup */
      const copy = JSON.parse(JSON.stringify({ convs: data.convs, memories: data.memories, docs: data.docs, tex: data.tex })) as { convs: typeof data.convs; memories: typeof data.memories; docs: typeof data.docs; tex: typeof data.tex };
      const x = mergeBackup(copy, raw, uid);
      if ('error' in x) toast(x.error);
      else {
        patchData(d => { d.convs = copy.convs; d.memories = copy.memories; d.docs = copy.docs; d.tex = copy.tex; });
        toast(bi('Restauré : ', 'Restored: ') + x.convs + bi(' discussion(s), ', ' conversation(s), ') + x.memories + bi(' souvenir(s), ', ' memory item(s), ') + x.docs + bi(' document(s).', ' document(s).'));
      }
    } catch { toast(bi('Fichier de sauvegarde illisible.', 'Unreadable backup file.')); }
    finally { setBusyB(false); }
  };

  return (
    <Screen scroll>
      <IconBtn name="back" onPress={() => navigation.goBack()} />
      <H1 style={{ marginTop: 10 }}>Confidentialité</H1>
      <Sub style={{ marginTop: 6 }}>{online ? 'Mode en ligne : le stockage reste sur l’appareil, mais vos questions partent chez un fournisseur.' : 'Où vont vos données : nulle part ailleurs.'}</Sub>
      {online ? (
        <View style={{ marginTop: 14, borderRadius: 24, backgroundColor: C.a100, borderWidth: 1.5, borderColor: C.accent, padding: 16, gap: 6 }}>
          <Text style={{ fontFamily: F.bodyBold, fontWeight: '700', fontSize: 15, color: C.a800 }}>Mode en ligne actif : tout n’est PAS local</Text>
          <Text style={{ fontSize: 13, lineHeight: 19, color: C.a800 }}>Envoyé à {names || 'votre fournisseur'} : le texte de vos questions et l’historique récent de la discussion{cl?.shareContext ? ', votre mémoire, vos documents et vos exemples' : ''}{cl?.sharePhotos ? ', vos photos (Vision)' : ''}. Les images et voix en ligne envoient aussi le texte à créer ou à lire.</Text>
          <Text style={{ fontSize: 13, lineHeight: 19, color: C.a800 }}>Resté sur l’appareil : l’historique, la mémoire, les documents et les clés (coffre Android){cl?.shareContext ? '' : ' — mémoire, documents et exemples ne sont pas envoyés'}{cl?.sharePhotos ? '' : ' ; les photos non plus'}.</Text>
          <Text style={{ fontSize: 13, lineHeight: 19, color: C.a800 }}>Pour revenir à un fonctionnement 100 % local : Menu → IA en ligne gratuite → désactiver.</Text>
        </View>
      ) : null}

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

      <Kicker style={{ marginTop: 18 }}>Langue</Kicker>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {([['auto', bi('Automatique', 'Automatic')], ['fr', 'Français'], ['en', 'English']] as const).map(([k, label]) => (
          <Btn key={k} title={label} kind={lang === k ? 'primary' : 'secondary'} height={44} fontSize={14} onPress={() => patchData(d => { d.settings.lang = k; })} />
        ))}
      </View>
      <Text style={{ fontSize: 12, lineHeight: 17, color: C.n700, marginTop: 8 }}>{bi('Une partie des textes est encore en français quand l’anglais est choisi.', 'Some texts are still in French when English is selected.')}</Text>

      <Kicker style={{ marginTop: 18 }}>Sauvegarde</Kicker>
      <Card style={{ marginTop: 8, gap: 10 }}>
        <Text style={{ fontSize: 13, lineHeight: 19, color: C.n800 }}>{bi('Un fichier avec vos discussions, votre mémoire, vos documents et vos exemples, pour changer de téléphone. Il n’est pas chiffré : gardez-le en lieu sûr. Les clés des fournisseurs, les photos et les modèles n’en font pas partie.', 'A file with your conversations, memory, documents and examples, to change phones. It is not encrypted: keep it safe. Provider keys, photos and models are not included.')}</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Btn title={busyB ? '…' : bi('Exporter mes données', 'Export my data')} height={44} fontSize={14} disabled={busyB} onPress={() => void exportBackup()} />
          <Btn title={bi('Importer une sauvegarde', 'Import a backup')} kind="secondary" height={44} fontSize={14} disabled={busyB} onPress={() => void importBackup()} />
        </View>
      </Card>

      <Kicker style={{ marginTop: 18 }}>Diagnostic et données</Kicker>
      <View style={{ marginTop: 6 }}>
        <Row onPress={() => navigation.navigate('CrashLog')}>
          <Text style={{ flex: 1, minWidth: 0, fontSize: 15, color: C.text }}>Rapport de plantage (à copier)</Text>
          <Ico name="chevron" size={16} color={C.n600} />
        </Row>
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

      <Text style={{ marginTop: 12, fontSize: 13, lineHeight: 19, color: C.n700 }}>{online ? 'En mode en ligne, MiMai utilise Internet pour les réponses (voir ci-dessus). Hors ligne, il fonctionne entièrement sur le téléphone : c’est le principe, et vous pouvez y revenir à tout moment.' : 'MiMai fonctionne entièrement hors ligne. Ce n’est pas une limite, c’est le principe.'}</Text>
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
