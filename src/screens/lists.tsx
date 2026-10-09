/* Listes : Chats (historique + recherche + drapeau d'entraînement),
   Bibliothèque (documents RAG locaux) et vue document (résumé local cité). */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, TextInput } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav-types';
import { useApp } from '../state';
import { C, F, hhmm, dayOf, fmtSize } from '../theme';
import { Screen, H1, Sub, Kicker, SearchBar, IconBtn, Tag, Navbar, Card, Btn, Ico, Row, AvatarIc, Dialog, DialogActions, MenuSheet } from '../ui';
import { summarize } from '../services/rag';
import type { Conv } from '../services/db';

/* ─────────── Chats ─────────── */
export function Chats({ navigation }: NativeStackScreenProps<RootStackParamList, 'Chats'>) {
  const { data, set, newChat, deleteConv, setTrainFlag } = useApp();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Conv | null>(null);
  const groups = useMemo(() => {
    const norm = q.trim().toLowerCase();
    const match = (c: Conv) => !norm || c.title.toLowerCase().includes(norm) || c.msgs.some(m => m.text.toLowerCase().includes(norm));
    const byDay = (d: number) => data.convs.filter(c => dayOf(c.ts) === d && match(c));
    return [
      { label: 'Aujourd’hui', items: byDay(0) },
      { label: 'Hier', items: byDay(1) },
      { label: 'Plus tôt', items: data.convs.filter(c => dayOf(c.ts) > 1 && match(c)) },
    ].filter(g => g.items.length);
  }, [q, data.convs]);

  const snippet = (c: Conv) => {
    const last = [...c.msgs].reverse().find(m => m.role === 'ai') || c.msgs[c.msgs.length - 1];
    return last ? last.text.split('\n')[0] : '';
  };
  const open = (c: Conv) => { set(s => ({ ...s, chatId: c.id })); navigation.navigate('Chat', { chatId: c.id }); };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Screen scroll>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <H1>Chats</H1>
          <TouchableOpacity onPress={() => { newChat(); navigation.navigate('Chat', {}); }} accessibilityRole="button" accessibilityLabel="Nouvelle conversation"
            style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ico name="plus" size={18} color={C.bg} />
          </TouchableOpacity>
        </View>
        <SearchBar value={q} onChange={setQ} placeholder="Rechercher une conversation" />
        {groups.map(g => (
          <View key={g.label}>
            <Kicker style={{ marginTop: 16, marginBottom: 6 }}>{g.label}</Kicker>
            {g.items.map(c => (
              <Row key={c.id} onPress={() => open(c)} style={{ alignItems: 'flex-start' }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={{ fontWeight: '700', fontSize: 15, fontFamily: F.bodyBold }}>{c.title}</Text>
                  <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontSize: 13, color: C.n700, marginTop: 2 }}>{snippet(c)}</Text>
                  {c.trainFlag !== 'yes' ? <Tag kind="neutral" style={{ marginTop: 6 }}>{c.trainFlag === 'no' ? 'Hors entraînement' : 'Mémoire seule'}</Tag> : null}
                </View>
                <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 12, color: C.n700, paddingTop: 2, flexShrink: 0 }}>{hhmm(c.ts)}</Text>
                <TouchableOpacity onPress={() => setSel(c)} accessibilityRole="button" accessibilityLabel={'Options de la conversation ' + c.title}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 6, flexShrink: 0 }}>
                  <Ico name="dots" size={16} color={C.n700} />
                </TouchableOpacity>
              </Row>
            ))}
          </View>
        ))}
        {!groups.length ? <Text style={{ padding: 30, fontSize: 14, lineHeight: 20, color: C.n700, textAlign: 'center' }}>{data.convs.length ? 'Aucune conversation ne correspond à votre recherche.' : 'Aucune conversation pour l’instant. Touchez + pour en démarrer une.'}</Text> : null}
        <View style={{ height: 110 }} />
      </Screen>
      <Navbar active="chats" onGo={k => navigation.navigate(k === 'home' ? 'Home' : k === 'chats' ? 'Chats' : 'Library')} />
      <MenuSheet visible={sel !== null} onClose={() => setSel(null)} items={sel ? [
        { icon: 'brain', title: 'Utiliser pour l’entraînement', sub: 'TRAINING = YES', on: () => setTrainFlag(sel.id, 'yes') },
        { icon: 'layers', title: 'Mémoire seulement', sub: 'MEMORY_ONLY', on: () => setTrainFlag(sel.id, 'memory') },
        { icon: 'lock', title: 'Hors entraînement', sub: 'TRAINING = NO', on: () => setTrainFlag(sel.id, 'no') },
        { icon: 'trash', title: 'Supprimer', on: () => Alert.alert('Supprimer cette conversation ?', 'Elle sera effacée de cet appareil.', [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Supprimer', style: 'destructive', onPress: () => deleteConv(sel.id) },
        ]) },
      ] : []} />
    </View>
  );
}

const TEXT_EXT = ['txt', 'md', 'markdown', 'csv', 'json', 'log', 'xml', 'html'];

export function Library({ navigation }: NativeStackScreenProps<RootStackParamList, 'Library'>) {
  const { data, addDoc, removeDoc, toast } = useApp();
  const [note, setNote] = useState<{ title: string; text: string } | null>(null);
  const [noteText, setNoteText] = useState('');

  /* import réel : sélecteur de fichiers du système (expo-document-picker) */
  const importFile = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets?.length) return;
      const f = r.assets[0];
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (!TEXT_EXT.includes(ext)) {
        toast(ext.toUpperCase() + ' : format non pris en charge pour l’instant. Importez un fichier texte (txt, md, csv…).');
        return;
      }
      const text = await FileSystem.readAsStringAsync(f.uri, { encoding: FileSystem.EncodingType.UTF8 });
      addDoc({ name: f.name, type: ext.toUpperCase().slice(0, 4), text });
      toast(f.name + ' importé et indexé localement');
    } catch {
      toast('Import impossible : fichier illisible');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Screen scroll>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12, rowGap: 12 }}>
          <H1>Bibliothèque</H1>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={() => setNote({ title: 'Note ' + new Date().toLocaleDateString('fr-FR'), text: '' })} accessibilityRole="button" accessibilityLabel="Créer une note"
              style={{ height: 48, paddingHorizontal: 16, borderRadius: 24, borderWidth: 1, borderColor: C.divider, alignItems: 'center', justifyContent: 'center' }}>
              <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 14, fontWeight: '600', color: C.text }}>Note</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void importFile()} accessibilityRole="button" accessibilityLabel="Importer un fichier texte"
              style={{ height: 48, paddingHorizontal: 16, borderRadius: 24, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}>
              <Ico name="plus" size={15} color={C.bg} /><Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ fontSize: 14, fontWeight: '600', color: C.bg }}>Importer</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Sub style={{ marginTop: 6 }}>MiMai répond à partir de vos documents. Ils restent sur cet appareil.</Sub>
        <Kicker style={{ marginTop: 20 }}>{data.docs.length} {data.docs.length > 1 ? 'documents' : 'document'}</Kicker>
        <View style={{ marginTop: 6, gap: 2 }}>
          {data.docs.map(d => (
            <Row key={d.id} onPress={() => (d.indexed ? navigation.navigate('DocView', { docId: d.id }) : toast('Indexation en cours…'))}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={{ fontSize: 10.5, fontWeight: '700', color: C.n800 }}>{d.type}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={2} ellipsizeMode="middle" maxFontSizeMultiplier={1.3} style={{ fontWeight: '700', fontSize: 15, fontFamily: F.bodyBold }}>{d.name}</Text>
                <Text numberOfLines={2} style={{ fontSize: 12.5, color: C.n700 }}>{fmtSize(d.text.length)} · {d.text.split(/\s+/).filter(Boolean).length} mots</Text>
                {!d.indexed ? <Text style={{ fontSize: 12, color: C.a700, marginTop: 2 }}>Indexation en cours…</Text> : null}
              </View>
              <Ico name="chevron" size={16} color={C.n600} />
              <TouchableOpacity onPress={() => removeDoc(d.id)} accessibilityRole="button" accessibilityLabel={'Retirer ' + d.name} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }} style={{ padding: 10, flexShrink: 0 }}>
                <Ico name="trash" size={16} color={C.n700} />
              </TouchableOpacity>
            </Row>
          ))}
        </View>
        <View style={{ marginTop: 12, borderRadius: 22, backgroundColor: C.a100, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <AvatarIc size={24}><Ico name="spark" size={12} color={C.a700} /></AvatarIc>
          <Text style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 19, color: C.a900 }}>Touchez un document : MiMai en tire un résumé local, sur l’appareil.</Text>
        </View>
        {!data.docs.length ? (
          <View style={{ marginTop: 18, borderRadius: 22, backgroundColor: C.n100, padding: 16 }}>
            <Text style={{ fontSize: 13.5, lineHeight: 20, color: C.n800 }}>Votre bibliothèque est vide. Importez un fichier texte (.txt, .md, .csv, .json…) ou créez une note : tout est indexé sur l’appareil pour le RAG local.</Text>
          </View>
        ) : null}
        <View style={{ height: 110 }} />
      </Screen>
      <Navbar active="library" onGo={k => navigation.navigate(k === 'home' ? 'Home' : k === 'chats' ? 'Chats' : 'Library')} />
      <Dialog visible={note !== null} onClose={() => setNote(null)}>
        <Text style={{ fontFamily: F.heading, fontSize: 22 }}>Nouvelle note</Text>
        <TextInput value={note?.title || ''} onChangeText={t => setNote(n => (n ? { ...n, title: t } : n))}
          placeholder="Titre" accessibilityLabel="Titre de la note" maxLength={80} returnKeyType="next" maxFontSizeMultiplier={1.3} style={{ height: 48, borderRadius: 24, backgroundColor: C.surface, paddingHorizontal: 14, color: C.text, fontFamily: F.body, fontSize: 15 }} placeholderTextColor={C.n600} />
        <TextInput value={noteText} onChangeText={setNoteText} multiline placeholder="Votre texte…" accessibilityLabel="Texte de la note" maxFontSizeMultiplier={1.3} style={{ minHeight: 110, maxHeight: 220, borderRadius: 16, backgroundColor: C.surface, padding: 12, textAlignVertical: 'top', color: C.text, fontFamily: F.body, fontSize: 15 }} placeholderTextColor={C.n600} />
        <DialogActions>
          <Btn kind="secondary" title="Annuler" height={48} onPress={() => { setNote(null); setNoteText(''); }} />
          <Btn title="Enregistrer" height={48} disabled={!noteText.trim()}
            onPress={() => { if (note) { addDoc({ name: (note.title.trim() || 'Note') + '.md', type: 'MD', text: noteText }); toast('Note enregistrée localement'); } setNote(null); setNoteText(''); }} />
        </DialogActions>
      </Dialog>
    </View>
  );
}

/* ─────────── Vue document : résumé extractif local ─────────── */
export function DocView({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'DocView'>) {
  const { data, set } = useApp();
  const doc = data.docs.find(d => d.id === route.params.docId);
  const docText = doc?.text;
  const bullets = useMemo(() => (docText ? summarize(docText, 4) : []), [docText]);
  if (!doc) return null;
  return (
    <Screen scroll>
      <IconBtn name="back" onPress={() => navigation.goBack()} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={{ fontSize: 10.5, fontWeight: '700', color: C.n800 }}>{doc.type}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={3} ellipsizeMode="middle" style={{ fontWeight: '700', fontSize: 17, fontFamily: F.bodyBold }}>{doc.name}</Text>
          <Text style={{ fontSize: 12.5, color: C.n700 }}>{doc.text.split(/\s+/).filter(Boolean).length} mots · {doc.indexed ? 'indexé localement' : 'indexation en cours'}</Text>
        </View>
      </View>
      <Card style={{ marginTop: 14, backgroundColor: C.a100 }}>
        <Kicker style={{ color: C.a700 }}>Résumé local (extraction sur l’appareil)</Kicker>
        {!bullets.length ? <Text style={{ fontSize: 14, lineHeight: 20, color: C.a900 }}>Document trop court pour être résumé.</Text> : null}
        {bullets.map((b, i) => (
          <Text key={i} style={{ fontSize: 14.5, lineHeight: 22, color: C.a900 }}>• {b}</Text>
        ))}
      </Card>
      <Text style={{ marginTop: 16, fontSize: 14, lineHeight: 22, color: C.n800 }} numberOfLines={8}>{doc.text}</Text>
      <Btn title="Poser une question sur ce document" style={{ marginTop: 16 }}
        onPress={() => { set(s => ({ ...s, chatId: null })); navigation.navigate('Chat', {}); }} />
    </Screen>
  );
}
