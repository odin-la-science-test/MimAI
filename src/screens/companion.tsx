/* Mìmir, le compagnon.
   - Dans la version installée (.apk/.aab) : bulle système réelle par-dessus
     TOUTES les applis (module natif MimirOverlay : permission « Afficher par-
     dessus » + service avant-plan). Toucher la bulle ouvre l'assistant.
   - Dans Expo Go (ou si la permission est refusée) : Mìmir flotte dans l'app.
   - FloatingMimir : compagnon glissable présent sur tous les écrans. */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, PanResponder, TouchableOpacity, Dimensions } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav-types';
import { useApp } from '../state';
import { C, F } from '../theme';
import { ShakeBuddy } from '../art';
import { Screen, IconBtn, H1, Sub, Toggle, Row, AvatarIc, Btn, MenuSheet, Tag } from '../ui';
import { navigationRef } from '../nav';
import { voiceAvailable, describeVoiceFailure } from '../services/voice';
import { speakAvailable, speak, stopSpeaking, listVoices, setVoicePrefs, VOICE_STYLES, type VoiceInfo } from '../services/speak';
import * as Clipboard from 'expo-clipboard';
import { overlayStatus, appExits, overlayNotifSettings } from '../services/overlay';
import { setCompat } from '../services/engine';
import { overlayAvailable, overlayIncluded, overlayGranted, overlayRequest, overlayShow, overlayHide } from '../services/overlay';

export function Companion({ navigation }: NativeStackScreenProps<RootStackParamList, 'Companion'>) {
  const { data, patchData, toast } = useApp();
  const c = data.settings.comp;
  const [granted, setGranted] = useState<boolean | null>(null);
  const native = overlayAvailable();
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  useEffect(() => { if (speakAvailable()) void listVoices().then(setVoices); }, []);
  const vp = data.settings.voice || { id: null, rate: 1, pitch: 1 };
  const setVoice = (patch: Partial<typeof vp>) => {
    const next = { ...vp, ...patch };
    setVoicePrefs(next);
    patchData(d => { d.settings.voice = next; });
    stopSpeaking();
    speak('Bonjour, je suis Mìmir. Voici ma voix.');
  };
  /* diagnostic de la barre : lisible dans l'app, copiable, sans câble ni outil */
  const [diag, setDiag] = useState<string | null>(null);
  const runDiag = async () => {
    const lines: string[] = [];
    lines.push('Barre incluse dans cette version : ' + (overlayIncluded ? 'oui' : 'non'));
    lines.push('Module natif chargé : ' + (native ? 'oui' : 'non'));
    if (native) {
      const before = overlayStatus();
      if (before?.permission) { await overlayShow(c.bar !== false, c.pos); await new Promise(r => setTimeout(r, 1500)); }
      const s = overlayStatus();
      if (s) {
        lines.push('Android : API ' + s.sdk + ' · ' + s.fabricant + ' ' + s.modele);
        lines.push('Permission « Afficher par-dessus » : ' + (s.permission ? 'accordée' : 'NON accordée'));
        if (s.etoile) lines.push('Étoile animée (156 animations) : ' + s.etoile);
        lines.push('Service de la barre actif : ' + (s.serviceActif ? 'oui' : 'non'));
        lines.push('Notifications autorisées : ' + (s.notifications === undefined ? '?' : s.notifications ? 'oui' : 'NON (la puce ne peut pas s\u2019afficher)'));
        lines.push('Puce dans la barre d\u2019état (mises à jour en direct, Android 16) : ' + (s.puceAutorisee === undefined ? '?' : s.puceAutorisee ? 'autorisée' : 'non autorisée ou non disponible'));
        lines.push('Caméra / encoche : ' + s.encoche);
        lines.push('Dernier événement : ' + s.dernierEvenement);
        if (/xiaomi|redmi|poco|oppo|realme|vivo|huawei|honor|oneplus/i.test(s.fabricant)) {
          lines.push('Conseil : sur ce téléphone, autorisez aussi « Afficher des fenêtres contextuelles » / « Démarrage automatique » et retirez l’optimisation de batterie pour MiMai (Réglages Android → Applications → MiMai).');
        }
      } else lines.push('État natif illisible.');
    }
    lines.push('Réglage MiMai : activée = ' + (c.on && c.overlay ? 'oui' : 'non'));
    lines.push('Mìmir près de la caméra : ' + (c.bar !== false ? 'oui' : 'non (puce seule)'));
    lines.push('Mode compatibilité : ' + (data.settings.compat ? 'oui' : 'non'));
    /* pourquoi Android a fermé MiMai ces dernières fois */
    const exits = appExits();
    lines.push(exits.length ? '— Dernières fermetures de MiMai (donnés par Android) —' : 'Fermetures : aucune information (Android 11+ requis, ou version sans module natif).');
    exits.slice(0, 3).forEach(x => {
      lines.push('• ' + new Date(x.time).toLocaleString('fr-FR') + ' : ' + x.reason + (x.desc ? ' — ' + x.desc : '') + (x.rssMb ? ' — mémoire ' + x.rssMb + ' Mo' : ''));
      if (x.trace) lines.push('  trace : ' + x.trace.slice(0, 700));
    });
    setDiag(lines.join('\n'));
  };
  /* après l'autorisation système, on finit l'activation tout seul au retour dans l'app */
  const pendingEnable = useRef(false);
  const enableRef = useRef<() => void>(() => {});
  const focused = useIsFocused();

  useEffect(() => {
    void overlayGranted().then(setGranted);
  }, []);
  /* au retour des réglages système, on rafraîchit l'état de la permission */
  useEffect(() => {
    const id = navigation.addListener('focus', () => {
      void overlayGranted().then(g => {
        setGranted(g);
        if (g && pendingEnable.current) { pendingEnable.current = false; enableRef.current(); }
      });
    });
    return id;
  }, [navigation]);
  /* si activé et autorisé : la bulle est (re)affichée à l'ouverture de l'app */
  useEffect(() => {
    if (native && c.on && c.overlay && granted) { void overlayShow(c.bar !== false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [native, c.on, c.overlay, granted, c.bar, c.pos]);

  const enableOverlay = async () => {
    if (!native) {
      patchData(d => { d.settings.comp.on = true; });
      toast('Dans Expo Go : Mìmir vit dans l’app. La barre système demande la version installée.');
      return;
    }
    const g = await overlayGranted();
    if (!g) { pendingEnable.current = true; overlayRequest(); toast('Autorisez « Afficher par-dessus » puis revenez ici : la barre s’affichera toute seule.'); setGranted(null); return; }
    const ok = await overlayShow(c.bar !== false);
    if (ok) {
      patchData(d => { d.settings.comp.on = true; d.settings.comp.overlay = true; });
      toast('Mìmir est présent dans toutes vos applis.');
    } else toast('Impossible d’afficher la barre.');
  };

  enableRef.current = () => { void enableOverlay(); };

  const disableOverlay = async () => {
    await overlayHide();
    patchData(d => { d.settings.comp.overlay = false; });
    toast('Barre rangée.');
  };

  const overlayOn = c.on && c.overlay && (granted === true);

  return (
    <Screen scroll>
      <IconBtn name="back" onPress={() => navigation.goBack()} />
      <View style={{ marginTop: 12, height: 210, borderRadius: 32, backgroundColor: C.a200, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', width: 184, height: 184, borderRadius: 92, backgroundColor: C.bg }} />
        <ShakeBuddy size={150} state="wave" enabled={focused} />
      </View>
      <Text style={{ marginTop: 8, textAlign: 'center', fontSize: 12.5, color: C.n700 }}>Secouez le téléphone : Mìmir réagit (étourdi, atchoum, danse, saut, pirouette, tremblement, surprise).</Text>
      <H1 size={32} style={{ marginTop: 18 }}>Mìmir, toujours à portée.</H1>
      <Sub style={{ marginTop: 6 }}>{overlayIncluded
        ? 'Dans la version installée, Mìmir reste à portée dans la barre d’état, par-dessus vos applis. Touchez la puce près de la caméra : une fenêtre de discussion flottante s’ouvre par-dessus l’appli en cours. Vous pouvez aussi écrire dans la notification ou toucher « Parler ». Tout est traité sur l’appareil, sans réseau.'
        : 'Mìmir vous accompagne dans l’application. La barre autour de la caméra n’est pas incluse dans cette version.'}</Sub>
      <View style={{ marginTop: 14 }}>
        <Row>
          <AvatarIc name="layers" size={36} tone="g" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14.5 }}>Par-dessus les autres applis</Text>
            {!overlayIncluded ? (
              <Text style={{ fontSize: 12, color: C.n700 }}>Non incluse dans cette version de MiMai.</Text>
            ) : !native ? (
              <Text style={{ fontSize: 12, color: C.n700 }}>Version installée (.apk/.aab) requise</Text>
            ) : granted === false ? (
              <Text style={{ fontSize: 12, color: C.a700 }}>Permission « Afficher par-dessus » à accorder</Text>
            ) : null}
          </View>
          {overlayOn ? <Tag kind="accent2">Actif</Tag> : null}
          {overlayIncluded
            ? <Toggle label="Afficher Mìmir par-dessus les autres applis" on={overlayOn} onChange={() => (overlayOn ? void disableOverlay() : void enableOverlay())} />
            : <Tag kind="neutral">Bientôt</Tag>}
        </Row>
        {native && overlayIncluded ? (
          <>
            <Row>
              <AvatarIc name="layers" size={36} tone="n" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14.5 }}>Puce dans la barre d’état</Text>
                <Text style={{ fontSize: 12.5, color: C.n700 }}>Comme un lecteur de musique : sur Android 16 (Samsung compris), Mìmir apparaît en pastille près de la caméra. Touchez-la pour discuter, ou écrivez directement dans la notification. Si la pastille n’apparaît pas, autorisez les « mises à jour en direct » pour MiMai.</Text>
              </View>
            </Row>
            <Btn kind="secondary" title="Régler la puce (notifications)" height={44} fontSize={13.5} style={{ marginTop: 6 }} onPress={() => overlayNotifSettings(true)} />
            <View style={{ paddingHorizontal: 4, paddingVertical: 8, gap: 8 }}>
              <Text style={{ fontSize: 14.5, fontWeight: '700' }}>Où se tient Mìmir ?</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {([['camera', 'À côté de la caméra'], ['below', 'Sous la barre d’état']] as const).map(([id, label]) => {
                  const on = (c.pos ?? (/samsung/i.test(overlayStatus()?.fabricant || '') ? 'below' : 'camera')) === id;
                  return (
                    <TouchableOpacity key={id} onPress={() => { patchData(d => { d.settings.comp.pos = id; }); void overlayShow(c.bar !== false, id); }} accessibilityRole="radio" accessibilityState={{ selected: on }}
                      style={{ minHeight: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: on ? C.a200 : C.n100, justifyContent: 'center' }}>
                      <Text style={{ fontSize: 13, fontWeight: on ? '700' : '500', color: on ? C.a800 : C.n800 }}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={{ fontSize: 12, lineHeight: 17, color: C.n700 }}>Sur certains téléphones (Samsung notamment), Android garde les touchers de la barre d’état : Mìmir y est visible mais on ne peut pas le toucher. « Sous la barre d’état » marche partout ; c’est le choix par défaut sur Samsung.</Text>
            </View>
            <Row>
              <AvatarIc name="layers" size={36} tone="g" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14.5 }}>Mìmir près de la caméra</Text>
                <Text style={{ fontSize: 12.5, color: C.n700 }}>Le petit être Mìmir (yeux, 156 animations) se tient sous la caméra, sans barre. Touchez-le pour ouvrir la bulle de discussion. Activé par défaut.</Text>
              </View>
              <Toggle label="Afficher Mìmir près de la caméra" on={c.bar !== false}
                onChange={() => { const v = c.bar === false; patchData(d => { d.settings.comp.bar = v; }); void overlayShow(v); }} />
            </Row>
          </>
        ) : null}
        <Row>
          <AvatarIc name="eye" size={36} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14.5 }}>Lire l’écran à la demande</Text>
            <Text style={{ fontSize: 12.5, color: C.n700 }}>Pas encore disponible.</Text>
          </View>
          <Tag kind="neutral">Bientôt</Tag>
        </Row>
        <Row>
          <AvatarIc name="mic" size={36} tone="g" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14.5 }}>Commande vocale</Text>
            <Text style={{ fontSize: 12.5, color: C.n700 }}>{voiceAvailable()
              ? 'Bouton micro dans le chat. Appui long sur la barre de la caméra pour parler directement. Reconnaissance sur l’appareil, rien ne part sur Internet.'
              : 'Version installée requise.'}</Text>
          </View>
          <Toggle label="Parler directement en touchant la barre" on={!!c.voice && voiceAvailable()}
            onChange={() => { if (!voiceAvailable()) { toast(describeVoiceFailure('unavailable')); return; } patchData(d => { d.settings.comp.voice = !d.settings.comp.voice; }); }} />
        </Row>
        <Row>
          <AvatarIc name="mic" size={36} tone="g" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14.5 }}>Réponses vocales</Text>
            <Text style={{ fontSize: 12.5, color: C.n700 }}>{speakAvailable()
              ? 'MiMai lit ses réponses à voix haute. Si vous posez la question à la voix, il répond toujours à la voix. Voix du téléphone, rien n’est envoyé par MiMai.'
              : 'Version installée requise.'}</Text>
          </View>
          <Toggle label="Lire les réponses à voix haute" on={!!c.speak && speakAvailable()}
            onChange={() => { if (!speakAvailable()) { toast('La lecture vocale demande la version installée de MiMai.'); return; } patchData(d => { d.settings.comp.speak = !d.settings.comp.speak; }); }} />
        </Row>
        {speakAvailable() ? (
          <View style={{ paddingHorizontal: 4, paddingVertical: 8, gap: 8 }}>
            <Text style={{ fontSize: 14.5, fontWeight: '700' }}>Voix de Mìmir</Text>
            <Text style={{ fontSize: 12.5, color: C.n700 }}>Touchez une voix ou un style pour l’entendre. Les voix sont celles installées sur votre téléphone (Réglages Android → Synthèse vocale pour en ajouter).</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {VOICE_STYLES.map(v => {
                const on = Math.abs(vp.rate - v.rate) < 0.01 && Math.abs(vp.pitch - v.pitch) < 0.01;
                return (
                  <TouchableOpacity key={v.id} onPress={() => setVoice({ rate: v.rate, pitch: v.pitch })} accessibilityRole="radio" accessibilityState={{ selected: on }}
                    style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: on ? C.a200 : C.n100, justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, fontWeight: on ? '700' : '500', color: on ? C.a800 : C.n800 }}>{v.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {voices.length ? voices.map(v => {
              const on = (vp.id || null) === v.id;
              return (
                <TouchableOpacity key={v.id} onPress={() => setVoice({ id: v.id })} accessibilityRole="radio" accessibilityState={{ selected: on }}
                  style={{ minHeight: 44, borderRadius: 14, paddingHorizontal: 12, backgroundColor: on ? C.a200 : C.surface, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: on ? '700' : '500' }}>{v.label}</Text>
                </TouchableOpacity>
              );
            }) : <Text style={{ fontSize: 12.5, color: C.n700 }}>Aucune voix française listée : la voix par défaut du téléphone est utilisée.</Text>}
            {vp.id ? <TouchableOpacity onPress={() => setVoice({ id: null })} style={{ paddingVertical: 8 }}><Text style={{ fontSize: 13, color: C.a700, fontWeight: '700' }}>Revenir à la voix par défaut</Text></TouchableOpacity> : null}
          </View>
        ) : null}
        <Row>
          <AvatarIc name="mic" size={36} tone="n" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14.5 }}>Réveil « Hé Mìmir »</Text>
            <Text style={{ fontSize: 12.5, color: C.n700 }}>Non proposé : écouter en permanence viderait la batterie et contredit la vie privée. Touchez le micro ou la barre de la caméra.</Text>
          </View>
          <Tag kind="neutral">Non</Tag>
        </Row>
      </View>
      {c.on && !overlayOn ? (
        <Btn kind="secondary" title="Désactiver la barre Mìmir" height={48} fontSize={14} style={{ marginTop: 8 }}
          onPress={() => { patchData(d => { d.settings.comp.on = false; }); toast('Barre désactivée'); }} />
      ) : null}
      <View style={{ marginTop: 14, borderRadius: 22, backgroundColor: C.n100, padding: 14 }}>
        <Text style={{ fontSize: 13, lineHeight: 19, color: C.n800 }}>{overlayIncluded
          ? 'La barre Mìmir fonctionne partout grâce à la permission Android « Afficher par-dessus les autres applis » et un service local discret (une notification permanente l’indique). « Lire l’écran » et le réveil vocal ne sont pas encore disponibles.'
          : 'Cette version n’utilise ni la permission « Afficher par-dessus les autres applis », ni service permanent : Mìmir reste dans l’application. La barre autour de la caméra pourra arriver dans une mise à jour. « Lire l’écran » et le réveil vocal ne sont pas encore disponibles.'}</Text>
      </View>
      {overlayIncluded ? (
        <View style={{ marginTop: 14, borderRadius: 22, backgroundColor: C.surface, padding: 14, gap: 10 }}>
          <Text style={{ fontFamily: F.heading, fontSize: 16 }}>La barre ne s’affiche pas ?</Text>
          <Text style={{ fontSize: 12.5, lineHeight: 18, color: C.n700 }}>Ce diagnostic essaie d’afficher la barre et dit exactement où ça bloque. Aucune donnée personnelle n’y figure.</Text>
          <Row>
            <AvatarIc name="cpu" size={36} tone="n" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14.5 }}>Mode compatibilité</Text>
              <Text style={{ fontSize: 12.5, color: C.n700 }}>Si MiMai se ferme quand vous posez une question : active ce mode (calcul plus simple, plus lent, mais plus sûr). Le modèle est rechargé.</Text>
            </View>
            <Toggle label="Mode compatibilité du moteur" on={!!data.settings.compat}
              onChange={() => { const v = !data.settings.compat; setCompat(v); patchData(d => { d.settings.compat = v; }); toast(v ? 'Mode compatibilité activé' : 'Mode compatibilité désactivé'); }} />
          </Row>
          <Btn kind="secondary" title="Lancer le diagnostic" height={48} fontSize={14} onPress={() => { void runDiag(); }} />
          {diag ? (
            <View style={{ gap: 8 }}>
              <Text selectable style={{ fontSize: 12.5, lineHeight: 18, color: C.n800 }}>{diag}</Text>
              <Btn kind="ghost" title="Copier le diagnostic" height={44} fontSize={13.5} onPress={() => { void Clipboard.setStringAsync(diag).then(() => toast('Diagnostic copié')); }} />
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={{ height: 20 }} />
    </Screen>
  );
}

/* ─────────── Mìmir flottant (réel, dans l'app) ─────────── */
export function FloatingMimir() {
  const { data, patchData } = useApp();
  const [pos, setPos] = useState({ x: 288, y: 520 });
  const [menu, setMenu] = useState(false);
  const moved = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const posRef = useRef(pos);
  posRef.current = pos;

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 4,
    onPanResponderGrant: () => { start.current = posRef.current; moved.current = false; },
    onPanResponderMove: (_e, g) => {
      if (Math.abs(g.dx) + Math.abs(g.dy) > 6) moved.current = true;
      const { width, height } = Dimensions.get('window');
      setPos({
        x: Math.max(0, Math.min(width - 78, start.current.x + g.dx)),
        y: Math.max(60, Math.min(height - 120, start.current.y + g.dy)),
      });
    },
    onPanResponderRelease: () => {
      if (!moved.current) setMenu(m => !m);
      moved.current = false;
    },
  })).current;

  /* Choix produit : AUCUN personnage Mìmir ne reste affiché en permanence à l'écran. Seule la fine barre autour de la
     caméra (système) existe. L'ancien compagnon flottant dans l'app est désactivé. */
  const SHOW_FLOATING_CHARACTER = false;
  if (!SHOW_FLOATING_CHARACTER || !data.settings.comp.on) return null;
  if (data.settings.comp.overlay && overlayAvailable()) return null;
  return (
    <>
      <View pointerEvents="box-none" style={{ position: 'absolute', left: pos.x, top: pos.y, width: 78, height: 88, zIndex: 90 }}>
        <TouchableOpacity activeOpacity={0.9} {...pan.panHandlers} accessibilityRole="button" accessibilityLabel="Mìmir, ouvrir le menu"
          accessibilityActions={[{ name: 'activate' }]} onAccessibilityAction={() => setMenu(true)} style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'flex-end' }}>
          <ShakeBuddy size={72} state="idle" />
        </TouchableOpacity>
      </View>
      <MenuSheet
        visible={menu}
        onClose={() => setMenu(false)}
        items={[
          { icon: 'chat', title: 'Parler à MiMai', on: () => navigationRef.navigate('Chat', {}) },
          { icon: 'spark', title: 'Arène', sub: 'Mini-jeu', on: () => navigationRef.navigate('Arena') },
          { icon: 'pen', title: 'Animations', sub: 'Galerie de Mìmir', on: () => navigationRef.navigate('Moves') },
          { icon: 'trash', title: 'Ranger Mìmir', on: () => patchData(d => { d.settings.comp.on = false; }) },
        ]}
      />
    </>
  );
}

