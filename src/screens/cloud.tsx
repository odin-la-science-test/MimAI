/* IA en ligne gratuite (optionnelle, désactivée par défaut).
   L'utilisateur colle sa propre clé gratuite ; MiMai suit chaque limite du jour et passe d'un modèle / fournisseur à l'autre
   tout seul, sans rien afficher dans la discussion. Les clés restent dans le coffre du téléphone. */
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav-types';
import { useApp } from '../state';
import { C, F, hhmm } from '../theme';
import { Screen, IconBtn, H1, Sub, Kicker, Card, Btn, Tag, Toggle, Bar, Dialog, DialogActions } from '../ui';
import { cloudEngine, defaultCloud } from '../services/cloud';
import { PROVIDERS, detectProvider } from '../services/cloud/providers';
import type { ProviderId } from '../services/cloud/providers';


const STATE_LABEL: Record<string, string> = { ok: 'Prêt', limited: 'Limite atteinte', auth: 'Clé refusée', down: 'Indisponible', off: 'Non connecté' };

function fmtN(n: number): string { return n >= 1000 ? (Math.round(n / 100) / 10).toString().replace('.', ',') + ' k' : String(n); }

export function Cloud({ navigation }: NativeStackScreenProps<RootStackParamList, 'Cloud'>) {
  const { data, patchData, toast } = useApp();
  const cloud = data.settings.cloud || defaultCloud();
  const [confirm, setConfirm] = useState(false);
  const [open, setOpen] = useState<ProviderId | null>(null);
  const [key, setKey] = useState('');
  const [account, setAccount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 15000); return () => clearInterval(t); }, []);

  const eng = cloudEngine();
  const rows = eng ? eng.summary() : [];
  const patch = (fn: (c: typeof cloud) => void) => patchData(d => { const c = d.settings.cloud || defaultCloud(); fn(c); d.settings.cloud = c; });

  const toggle = () => { if (cloud.enabled) patch(c => { c.enabled = false; }); else setConfirm(true); };
  const activate = () => { patch(c => { c.enabled = true; }); setConfirm(false); void eng?.refreshModels(false); };

  const openCard = async (id: ProviderId) => {
    setOpen(open === id ? null : id); setErr(''); setKey(''); setAccount(cloud.providers[id]?.account || '');
  };
  const paste = async () => {
    const t = (await Clipboard.getStringAsync()).trim();
    if (!t) { toast('Le presse-papiers est vide'); return; }
    setKey(t);
    const id = detectProvider(t);
    if (id && id !== open) { setOpen(id); toast('Clé reconnue : ' + (PROVIDERS.find(p => p.id === id)?.name || id)); }
  };
  const connect = async (id: ProviderId) => {
    if (!eng || busy) return;
    setBusy(true); setErr('');
    const r = await eng.connect(id, key, account);
    setBusy(false);
    if (r.ok) { setKey(''); setOpen(null); toast('Connecté · ' + r.models + ' modèle(s) gratuit(s)'); }
    else setErr(r.error);
  };
  const disconnect = async (id: ProviderId) => { await eng?.disconnect(id); toast('Déconnecté, clé effacée'); };
  const move = (id: ProviderId, dir: -1 | 1) => patch(c => {
    const ids = Object.keys(c.providers).sort((a, b) => c.providers[a].order - c.providers[b].order);
    const i = ids.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    ids.forEach((x, n) => { c.providers[x].order = n; });
  });

  const connected = rows.filter(r => r.status.state !== 'off').length;

  return (
    <Screen scroll>
      <IconBtn name="back" onPress={() => navigation.goBack()} />
      <H1 style={{ marginTop: 10 }}>IA en ligne gratuite</H1>
      <Sub style={{ marginTop: 6 }}>Des modèles plus puissants, avec vos propres clés gratuites. Désactivé par défaut.</Sub>

      <Card style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ fontWeight: '700', fontSize: 15, fontFamily: F.bodyBold }}>{cloud.enabled ? 'Activée' : 'Désactivée'}</Text>
          <Text style={{ fontSize: 12.5, lineHeight: 18, color: C.n700 }}>
            {cloud.enabled ? (connected ? connected + ' fournisseur(s) connecté(s). Le meilleur modèle disponible est choisi pour chaque question, et MiMai bascule seul si une limite est atteinte.' : 'Connectez au moins un fournisseur ci-dessous.')
              : 'Tout reste sur le téléphone tant que vous n’activez pas cette option.'}
          </Text>
        </View>
        <Toggle on={cloud.enabled} onChange={toggle} label="IA en ligne" />
      </Card>

      {cloud.enabled ? (
        <>
          <Card style={{ marginTop: 20 }}>
            <Text style={{ fontWeight: '700', fontSize: 14.5, fontFamily: F.bodyBold }}>Mode en ligne = modèles en ligne seulement</Text>
            <Text style={{ fontSize: 12.5, lineHeight: 18, color: C.n700, marginTop: 2 }}>Tant que l’IA en ligne est active (et un fournisseur connecté), seuls les modèles en ligne répondent, avec bascule automatique entre eux. Le modèle du téléphone reste muet et déchargé de la mémoire. Si tous les fournisseurs sont à leur limite, MiMai vous le dit au lieu de répondre en local. Désactivez l’IA en ligne pour revenir au modèle du téléphone.</Text>
          </Card>

          <Kicker style={{ marginTop: 20 }}>Ce qui est envoyé</Kicker>
          <Card style={{ marginTop: 8, gap: 12 }}>
            <Text style={{ fontSize: 12.5, lineHeight: 18, color: C.n800 }}>Le texte de votre discussion part toujours vers le fournisseur choisi. Le reste est facultatif :</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14.5, fontWeight: '600', color: C.text }}>Mémoire, documents et exemples</Text>
                <Text style={{ fontSize: 12, color: C.n700 }}>Souvenirs, extraits de la bibliothèque, style appris.</Text>
              </View>
              <Toggle on={cloud.shareContext} onChange={() => patch(c => { c.shareContext = !c.shareContext; })} label="Partager la mémoire" />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14.5, fontWeight: '600', color: C.text }}>Photos (Vision)</Text>
                <Text style={{ fontSize: 12, color: C.n700 }}>Sans cela, la fonction Vision reste sur le téléphone.</Text>
              </View>
              <Toggle on={cloud.sharePhotos} onChange={() => patch(c => { c.sharePhotos = !c.sharePhotos; })} label="Partager les photos" />
            </View>
          </Card>

          <Kicker style={{ marginTop: 20 }}>Fournisseurs</Kicker>
          <View style={{ marginTop: 8, gap: 10 }}>
            {PROVIDERS.map(def => {
              const r = rows.find(x => x.id === def.id);
              const pc = cloud.providers[def.id];
              const st = r?.status.state || 'off';
              const isOpen = open === def.id;
              const pct = r && r.limit ? Math.min(100, (r.usedToday / r.limit) * 100) : 0;
              return (
                <Card key={def.id} style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontWeight: '700', fontSize: 15.5, fontFamily: F.bodyBold }}>{def.name}</Text>
                      <Text style={{ fontSize: 12, lineHeight: 17, color: C.n700 }}>{def.note}</Text>
                    </View>
                    <Tag kind={st === 'ok' ? 'accent2' : st === 'off' ? 'neutral' : 'accent'}>{STATE_LABEL[st]}</Tag>
                  </View>

                  {pc && st !== 'off' && r ? (
                    <View style={{ gap: 6 }}>
                      {r.limit ? (
                        <>
                          <Bar pct={pct} />
                          <Text style={{ fontSize: 12, color: C.n700 }}>{fmtN(r.usedToday)} / {fmtN(r.limit)} {r.unit} aujourd’hui · {r.requests} requête(s) · {r.models} modèle(s)</Text>
                        </>
                      ) : (
                        <Text style={{ fontSize: 12, color: C.n700 }}>{fmtN(r.usedToday)} {r.unit} aujourd’hui · {r.requests} requête(s) · {r.models} modèle(s) · limite suivie d’après les réponses du fournisseur</Text>
                      )}
                      {r.status.until && r.status.until > Date.now() ? <Text style={{ fontSize: 12, color: C.n700 }}>Reprise vers {hhmm(r.status.until)}.</Text> : null}
                      {r.status.reason && st !== 'ok' ? <Text style={{ fontSize: 12, color: C.n700 }}>{r.status.reason}</Text> : null}
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        <Btn title="Priorité ↑" kind="secondary" height={38} fontSize={13} onPress={() => move(def.id, -1)} />
                        <Btn title="Priorité ↓" kind="secondary" height={38} fontSize={13} onPress={() => move(def.id, 1)} />
                        <Btn title="Changer la clé" kind="secondary" height={38} fontSize={13} onPress={() => void openCard(def.id)} />
                        <Btn title="Déconnecter" kind="ghost" height={38} fontSize={13} onPress={() => void disconnect(def.id)} />
                      </View>
                    </View>
                  ) : !isOpen ? (
                    <Btn title="Connecter" kind="secondary" height={42} fontSize={14} onPress={() => void openCard(def.id)} />
                  ) : null}

                  {isOpen ? (
                    <View style={{ gap: 8, marginTop: 4 }}>
                      <Text style={{ fontSize: 12.5, lineHeight: 18, color: C.n800 }}>{def.keyHint}</Text>
                      <Btn title="Obtenir une clé gratuite" kind="ghost" height={38} fontSize={13} onPress={() => void Linking.openURL(def.keyUrl)} />
                      {def.needsAccount ? (
                        <TextInput value={account} onChangeText={setAccount} placeholder="Identifiant de compte (Account ID)" accessibilityLabel="Identifiant de compte" autoCapitalize="none" autoCorrect={false}
                          style={{ borderRadius: 16, backgroundColor: C.n100, paddingHorizontal: 14, height: 48, fontSize: 15, color: C.text }} placeholderTextColor={C.n600} />
                      ) : null}
                      <TextInput value={key} onChangeText={setKey} placeholder="Collez votre clé ici" accessibilityLabel={'Clé ' + def.name} autoCapitalize="none" autoCorrect={false} secureTextEntry
                        style={{ borderRadius: 16, backgroundColor: C.n100, paddingHorizontal: 14, height: 48, fontSize: 15, color: C.text }} placeholderTextColor={C.n600} />
                      {err ? <Text style={{ fontSize: 12.5, color: C.a800 }}>{err}</Text> : null}
                      <Text style={{ fontSize: 11.5, lineHeight: 16, color: C.n700 }}>{def.privacy}</Text>
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        <Btn title="Coller" kind="secondary" height={44} fontSize={14} onPress={() => void paste()} />
                        <Btn title={busy ? 'Vérification…' : 'Connecter'} height={44} fontSize={14} disabled={busy || !key.trim()} onPress={() => void connect(def.id)} />
                        <Btn title="Annuler" kind="ghost" height={44} fontSize={14} onPress={() => { setOpen(null); setErr(''); setKey(''); }} />
                      </View>
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </View>

          {(cloud.events || []).length ? (
            <>
              <Kicker style={{ marginTop: 20 }}>Journal des bascules (sans contenu)</Kicker>
              <Card style={{ marginTop: 8, gap: 4 }}>
                {[...(cloud.events || [])].reverse().slice(0, 12).map((ev, i) => (
                  <Text key={i} style={{ fontSize: 12, lineHeight: 17, color: C.n800 }}>{hhmm(ev.t)} · {ev.msg}</Text>
                ))}
              </Card>
            </>
          ) : null}
        </>
      ) : null}

      <Text style={{ fontSize: 11.5, lineHeight: 16, color: C.n700, marginTop: 18, marginBottom: 30 }}>
        Les limites gratuites sont celles annoncées par chaque fournisseur ; elles peuvent changer. MiMai les suit au mieux, mais seul le fournisseur fait foi.
        Vos clés sont conservées dans le coffre sécurisé du téléphone et ne sont jamais écrites dans les sauvegardes ni les rapports.
      </Text>

      <Dialog visible={confirm} onClose={() => setConfirm(false)}>
        <Text style={{ fontFamily: F.heading, fontSize: 24, color: C.text }}>Activer l’IA en ligne ?</Text>
        <Text style={{ fontSize: 14, lineHeight: 21, color: C.n800, marginTop: 10, marginBottom: 14 }}>
          Quand elle est activée, le texte de vos questions est envoyé par Internet au fournisseur dont vous avez collé la clé (par exemple Groq ou Google), et non plus traité uniquement sur votre téléphone.
          Votre mémoire, vos documents et vos photos ne sont envoyés que si vous le choisissez ci-dessous. Vous pouvez désactiver à tout moment.
        </Text>
        <DialogActions>
          <Btn title="Annuler" kind="ghost" height={44} fontSize={14} onPress={() => setConfirm(false)} />
          <Btn title="Activer" height={44} fontSize={14} onPress={activate} />
        </DialogActions>
      </Dialog>
    </Screen>
  );
}
