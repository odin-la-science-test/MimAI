/* Modèles : installés (actif / utiliser / retirer) + sélecteur d'une centaine de modèles
   (recommandés pour CE téléphone, recherche, filtres, tri, compatibilité) ; le téléchargement passe
   par la fenêtre réseau explicite de 15 min et la vérification SHA-256 (flux inchangé). */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Alert, FlatList, ScrollView, TouchableOpacity } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as DeviceInfo from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';
import type { RootStackParamList } from '../nav-types';
import { useApp, ORDER, MODELS } from '../state';
import { C, F, fmtGo } from '../theme';
import { Screen, IconBtn, H1, Sub, Kicker, Card, Btn, Tag, Bar, Dialog, DialogActions, SearchBar } from '../ui';
import type { ModelManifest, ModelDef } from '../services/net';
import { describeInstallError } from '../services/net';
import { fitFor, recommend, qualityScore, sizeBucket, matchesQuery, quantSpeedNote, LEVEL_ORDER } from '../services/fit';
import type { Fit, FitLevel, DeviceProfile, SizeBucket } from '../services/fit';
import { SPECIALTIES, ADVISOR_NOTE, rankForSpecialty } from '../services/advisor';
import { DEFAULT_MODEL_ID } from '../services/catalog';
import { scanModelFiles, importModelFile } from '../services/modelFiles';
import type { ImportPhase } from '../services/modelFiles';
import { reconcile, describeImportFailure } from '../services/installed';
import type { SpecialtyId } from '../services/advisor';

/* ─────────── profil réel de l'appareil (RAM + disque libre) ─────────── */
export function useDeviceProfile(): { profile: DeviceProfile; loaded: boolean } {
  const [state, setState] = useState<{ profile: DeviceProfile; loaded: boolean }>({ profile: { ramGb: null, freeDiskGb: null }, loaded: false });
  useEffect(() => {
    let alive = true;
    (async () => {
      const ramGb = DeviceInfo.totalMemory ? DeviceInfo.totalMemory / 1e9 : null;
      let freeDiskGb: number | null = null;
      try { freeDiskGb = (await FileSystem.getFreeDiskStorageAsync()) / 1e9; } catch { /* indisponible */ }
      if (alive) setState({ profile: { ramGb, freeDiskGb }, loaded: true });
    })();
    return () => { alive = false; };
  }, []);
  return state;
}

/* ─────────── badge de compatibilité (texte + couleur, jamais la couleur seule) ─────────── */
const BADGE: Record<FitLevel, { bg: string; fg: string }> = {
  ideal: { bg: C.g200, fg: C.g900 },
  ok: { bg: C.g100, fg: C.g800 },
  limite: { bg: C.a100, fg: C.a800 },
  'trop-lourd': { bg: C.a300, fg: C.a900 },
};
export function FitBadge({ fit }: { fit: Fit }) {
  const b = BADGE[fit.level];
  return (
    <View accessible accessibilityLabel={'Compatibilité : ' + fit.label} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: b.bg, maxWidth: '100%' }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: b.fg, flexShrink: 0 }} />
      <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ fontSize: 11.5, fontWeight: '700', fontFamily: F.bodyBold, color: b.fg, flexShrink: 1 }}>{fit.label}</Text>
    </View>
  );
}

/* ─────────── puce de filtre (≥ 48 dp avec la zone de toucher étendue) ─────────── */
function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} activeOpacity={0.85}
      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
      style={{ minHeight: 40, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 20, backgroundColor: on ? C.accent : C.surface }}>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ fontSize: 13, fontWeight: '700', fontFamily: F.bodyBold, color: on ? C.bg : C.n800 }}>{label}</Text>
    </TouchableOpacity>
  );
}
function ChipRow({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={label} style={{ flexGrow: 0, marginTop: 8 }} contentContainerStyle={{ gap: 8, paddingVertical: 4, paddingRight: 8 }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

const TAG_LABEL: Record<string, string> = { francais: 'Français', multilingue: 'Multilingue', code: 'Code', raisonnement: 'Raisonnement', leger: 'Léger', equilibre: 'Équilibré', precis: 'Précis', 'long-contexte': 'Long contexte', maths: 'Maths' };
const SIZE_FILTERS: { key: SizeBucket | ''; label: string }[] = [
  { key: '', label: 'Toutes tailles' }, { key: 'leger', label: 'Léger < 1 Go' }, { key: 'moyen', label: 'Moyen 1–2,5 Go' }, { key: 'lourd', label: 'Lourd > 2,5 Go' },
];
const TAG_FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'Tous usages' }, { key: 'francais', label: 'Français' }, { key: 'code', label: 'Code' }, { key: 'raisonnement', label: 'Raisonnement' },
];
type SortKey = 'reco' | 'taille' | 'nom';
const SORTS: { key: SortKey; label: string }[] = [{ key: 'reco', label: 'Recommandé' }, { key: 'taille', label: 'Taille' }, { key: 'nom', label: 'Nom' }];

const fmtMo = (b: number) => (b / 1048576).toFixed(1).replace('.', ',') + ' Mo';

/* ─────────── ligne de modèle + carte détaillée au toucher ─────────── */
interface RowProps {
  m: ModelDef; fit: Fit; open: boolean; busy: boolean; locked: boolean;
  phase: string; pct: number;
  onToggle: () => void; onDownload: () => void;
}
const ModelRow = React.memo(function ModelRow({ m, fit, open, busy, locked, phase, pct, onToggle, onDownload }: RowProps) {
  const disk = fit.level === 'trop-lourd' && fit.blockedBy === 'disk';
  return (
    <View style={{ marginTop: 8, borderRadius: 24, backgroundColor: open ? C.a100 : C.surface, borderWidth: open ? 1 : 0, borderColor: C.accent, overflow: 'hidden' }}>
      <TouchableOpacity onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={m.name + ', ' + m.params + ', ' + fmtGo(m.sizeBytes / 1e9) + ', ' + fit.label}
        accessibilityHint={open ? 'Masquer les détails' : 'Afficher les détails'} activeOpacity={0.85}
        style={{ minHeight: 64, paddingHorizontal: 14, paddingVertical: 12, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={{ fontWeight: '700', fontSize: 15, fontFamily: F.bodyBold, color: C.text }}>{m.name}</Text>
            <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={{ fontSize: 12.5, color: C.n700 }}>{m.family} · {String(m.paramsB).replace('.', ',')} B · {fmtGo(m.sizeBytes / 1e9)} · {m.quant}</Text>
          </View>
          {busy ? (
            <View style={{ width: 110, flexShrink: 0, gap: 4 }}>
              <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 11.5, fontWeight: '700', color: C.a700, textAlign: 'right' }}>{phaseLabel(phase)} {Math.round(pct)} %</Text>
              <Bar pct={pct} h={6} />
            </View>
          ) : <View style={{ flexShrink: 1, maxWidth: 120 }}><FitBadge fit={fit} /></View>}
        </View>
      </TouchableOpacity>
      {open ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
          <Text style={{ fontSize: 13.5, lineHeight: 20, color: C.n800 }}>{m.explain}</Text>
          <View style={{ gap: 6 }}>
            <FitBadge fit={fit} />
            <Text style={{ fontSize: 12.5, lineHeight: 18, color: C.n800 }}>{fit.reason}</Text>
            <Text style={{ fontSize: 12, lineHeight: 17, color: C.n700 }}>{fit.speedLabel}</Text>
            {quantSpeedNote(m.quant) ? <Text style={{ fontSize: 12, lineHeight: 17, color: C.a700 }}>{quantSpeedNote(m.quant)}</Text> : null}
          </View>
          {m.tags.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {m.tags.map(t => <Tag key={t} kind="neutral">{TAG_LABEL[t] || t}</Tag>)}
            </View>
          ) : null}
          <View style={{ gap: 5 }}>
            <Spec k="Paramètres" v={m.params} />
            <Spec k="Quantification" v={m.quant} />
            <Spec k="Contexte" v={m.ctx} />
            <Spec k="Licence" v={m.license + (m.licenseNote ? ' — ' + m.licenseNote : '')} />
            <Spec k="Taille exacte" v={fmtMo(m.sizeBytes) + ' (' + m.sizeBytes.toLocaleString('fr-FR') + ' octets)'} />
            <Spec k="Mémoire requise" v={'≈ ' + fmtGo(m.needRamGb)} />
            <Spec k="SHA-256" v={m.sha256} mono />
            <Spec k="Dépôt" v={m.repo} />
          </View>
          {busy ? null : (
            <Btn kind={fit.level === 'trop-lourd' ? 'secondary' : 'primary'} height={48} fontSize={14}
              title={disk ? 'Espace insuffisant' : fit.level === 'trop-lourd' ? 'Télécharger quand même' : 'Télécharger'}
              disabled={disk || locked} onPress={onDownload} />
          )}
        </View>
      ) : null}
    </View>
  );
});
const Spec = ({ k, v, mono }: { k: string; v: string; mono?: boolean }) => (
  <View style={{ flexDirection: 'row', gap: 10 }}>
    <Text maxFontSizeMultiplier={1.3} style={{ width: 104, flexShrink: 0, fontSize: 12.5, color: C.n700 }}>{k}</Text>
    <Text selectable maxFontSizeMultiplier={1.3} style={{ flex: 1, minWidth: 0, fontSize: mono ? 11 : 12.5, lineHeight: mono ? 16 : 18, fontWeight: mono ? '400' : '700', fontFamily: mono ? 'monospace' : F.bodyBold, color: C.text }}>{v}</Text>
  </View>
);

export function Models({ navigation }: NativeStackScreenProps<RootStackParamList, 'Models'>) {
  const { data, patchData, installModelFlow, setActiveModel, removeModel, authorizeNet, blockNet, toast } = useApp();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);
  const [pending, setPending] = useState<string | null>(null);
  const [phase, setPhase] = useState('');
  const [pct, setPct] = useState(0);
  const [shaInfo, setShaInfo] = useState<{ got: string; ok: boolean } | null>(null);
  const [confirmNet, setConfirmNet] = useState<string | null>(null);
  const [manifest, setManifest] = useState<ModelManifest | null>(null);

  const [query, setQuery] = useState('');
  const [family, setFamily] = useState('');
  const [size, setSize] = useState<SizeBucket | ''>('');
  const [tag, setTag] = useState('');
  const [sort, setSort] = useState<SortKey>('reco');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [spec, setSpec] = useState<SpecialtyId | ''>('');
  const [importing, setImporting] = useState<{ phase: ImportPhase; pct: number } | null>(null);
  const { profile, loaded } = useDeviceProfile();

  const installed = data.settings.installed.filter(id => MODELS[id]);
  const all = useMemo(() => ORDER.map(id => MODELS[id]).filter((m): m is ModelDef => !!m), []);
  const fits = useMemo(() => {
    const out: Record<string, Fit> = {};
    for (const m of all) out[m.id] = fitFor(m, profile);
    return out;
  }, [all, profile]);
  const families = useMemo(() => Array.from(new Set(all.map(m => m.family))).sort((a, b) => a.localeCompare(b)), [all]);

  const available = useMemo(() => all.filter(m => !installed.includes(m.id)), [all, installed.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const recos = useMemo(() => recommend(available, profile, 4), [available, profile]);
  /* conseiller par spécialité : classement des modèles non installés qui tiennent sur ce téléphone */
  const ranked = useMemo(() => (spec ? rankForSpecialty(available, spec, profile, 5) : []), [available, spec, profile]);
  const specInfo = SPECIALTIES.find(s => s.id === spec);

  const list = useMemo(() => {
    const f = available.filter(m =>
      matchesQuery(m, query) && (!family || m.family === family) && (!size || sizeBucket(m.sizeBytes) === size) && (!tag || m.tags.includes(tag)));
    const grp = (m: ModelDef) => { const l = fits[m.id].level; return l === 'trop-lourd' ? 2 : l === 'limite' ? 1 : 0; };
    if (sort === 'taille') f.sort((a, b) => a.sizeBytes - b.sizeBytes || a.name.localeCompare(b.name));
    else if (sort === 'nom') f.sort((a, b) => a.name.localeCompare(b.name));
    else f.sort((a, b) => grp(a) - grp(b) || qualityScore(b) - qualityScore(a) || LEVEL_ORDER[fits[a.id].level] - LEVEL_ORDER[fits[b.id].level] || a.id.localeCompare(b.id));
    return f;
  }, [available, query, family, size, tag, sort, fits]);

  /* détection : les fichiers présents sur l'appareil font foi */
  const rescan = async () => {
    const onDisk = await scanModelFiles();
    if (!onDisk) { toast('Lecture du stockage impossible'); return; }
    const r = reconcile(data.settings.installed, onDisk, data.settings.activeModel, DEFAULT_MODEL_ID);
    patchData(d => { d.settings.installed = r.installed; d.settings.activeModel = r.activeModel; });
    if (r.added.length) toast(r.added.length + ' modèle' + (r.added.length > 1 ? 's' : '') + ' détecté' + (r.added.length > 1 ? 's' : '') + ' : ' + r.added.map(id => MODELS[id]?.name || id).join(', '));
    else if (r.removed.length) toast(r.removed.length + ' modèle' + (r.removed.length > 1 ? 's' : '') + ' introuvable' + (r.removed.length > 1 ? 's' : '') + ' retiré' + (r.removed.length > 1 ? 's' : '') + ' de la liste');
    else toast(onDisk.length ? 'Tout est à jour : ' + onDisk.length + ' modèle' + (onDisk.length > 1 ? 's' : '') + ' installé' + (onDisk.length > 1 ? 's' : '') : 'Aucun modèle trouvé sur cet appareil');
  };
  const importFile = async () => {
    if (pending || importing) return;
    setImporting({ phase: 'choose', pct: 0 });
    const r = await importModelFile((phase, pct) => setImporting({ phase, pct }));
    setImporting(null);
    if (r.ok) {
      patchData(d => { if (!d.settings.installed.includes(r.id)) d.settings.installed.push(r.id); d.settings.activeModel = r.id; });
      toast((MODELS[r.id]?.name || r.id) + ' importé et vérifié');
    } else if (r.failure !== 'canceled') toast(describeImportFailure(r.failure, r.extra));
  };

  const filtersOn = !!(query || family || size || tag);
  const resetFilters = () => { setQuery(''); setFamily(''); setSize(''); setTag(''); };

  const startInstall = async (id: string) => {
    setConfirmNet(null);
    setPending(id); setPct(0); setShaInfo(null); setManifest(null);
    authorizeNet('Installation de ' + MODELS[id].name);
    try {
      const mf = await installModelFlow(id, (ph, p, info) => {
        setPhase(ph); setPct(p);
        if (info && 'got' in info && info.got) setShaInfo({ got: info.got, ok: !!(info as { ok?: boolean }).ok });
      });
      setManifest(mf);
      timers.current.push(setTimeout(() => { setPending(null); setManifest(null); }, 1600));
    } catch (err) {
      const m = err instanceof Error ? err.message : '';
      toast(describeInstallError(m));
      setPending(null);
    }
  };

  /* même flux pour tous : dialogue d'autorisation réseau 15 min, puis installModelFlow ; confirmation si « trop lourd » */
  const requestDownload = useCallback((id: string) => {
    const f = fits[id];
    if (f && f.level === 'trop-lourd') {
      if (f.blockedBy === 'disk') { toast(f.reason); return; }
      Alert.alert('Modèle trop lourd pour cet appareil', f.reason + '\nIl risque d’être très lent ou de faire fermer l’application. Télécharger quand même ?', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Télécharger quand même', style: 'destructive', onPress: () => setConfirmNet(id) },
      ]);
      return;
    }
    setConfirmNet(id);
  }, [fits, toast]);

  const renderRow = (m: ModelDef, section: string) => {
    const k = section + ':' + m.id;
    return (
      <ModelRow key={k} m={m} fit={fits[m.id]} open={openKey === k} busy={pending === m.id} locked={!!pending}
        phase={phase} pct={pct}
        onToggle={() => setOpenKey(o => (o === k ? null : k))} onDownload={() => requestDownload(m.id)} />
    );
  };

  const dl = data.settings.netUntil && data.settings.netUntil > Date.now();

  const header = (
    <View>
      <IconBtn name="back" onPress={() => navigation.goBack()} />
      <H1 style={{ marginTop: 10 }}>Modèles</H1>
      <Sub style={{ marginTop: 6 }}>Le cerveau de MiMai, exécuté sur cet appareil. {all.length} modèle{all.length > 1 ? 's' : ''} au choix.</Sub>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        <Btn kind="secondary" title="Détecter mes modèles" height={46} fontSize={13.5} style={{ flex: 1, minWidth: 150 }} onPress={() => { void rescan(); }} />
        <Btn kind="secondary" title="Importer un fichier .gguf" height={46} fontSize={13.5} style={{ flex: 1, minWidth: 150 }} onPress={() => { void importFile(); }} />
      </View>
      <Text style={{ marginTop: 6, fontSize: 12, lineHeight: 17, color: C.n700 }}>MiMai reconnaît automatiquement les modèles déjà présents. Un fichier importé n’est accepté que s’il correspond exactement à un modèle du catalogue (taille et SHA-256).</Text>

      <Kicker style={{ marginTop: 22 }}>Installés</Kicker>
      {installed.length === 0 ? <Text style={{ marginTop: 8, fontSize: 13.5, lineHeight: 20, color: C.n700 }}>Aucun modèle installé : MiMai répond avec son moteur intégré. Choisissez-en un ci-dessous.</Text> : null}
      {installed.map(id => {
        const m = MODELS[id];
        const act = id === data.settings.activeModel;
        return (
          <Card key={id} style={{ marginTop: 10, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, flexShrink: 0, backgroundColor: C.a200, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: F.heading, fontSize: 18, color: C.a800 }}>{m.name.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={{ fontWeight: '700', fontSize: 16, fontFamily: F.bodyBold }}>{m.name}</Text>
                <Text numberOfLines={2} style={{ fontSize: 12.5, color: C.n700 }}>{fmtGo(m.sizeBytes / 1e9)} · {m.quant} · {m.ctx}</Text>
                <Text numberOfLines={2} style={{ fontSize: 12.5, color: C.g800 }}>{data.settings.speed?.[id] ? 'Vitesse mesurée sur ce téléphone : ' + String(data.settings.speed[id]).replace('.', ',') + ' jetons/s' : 'Vitesse : pas encore mesurée (posez une question)'}</Text>
              </View>
              {act ? <Tag kind="accent2">Actif</Tag> : null}
            </View>
            {!act ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Btn title="Utiliser" height={48} fontSize={14} style={{ flex: 1, minWidth: 120 }} onPress={() => setActiveModel(id)} />
                <Btn kind="ghost" title="Retirer" height={48} fontSize={14} onPress={() => Alert.alert('Retirer ' + m.name + ' ?', 'Les poids seront supprimés de l’appareil.', [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Retirer', style: 'destructive', onPress: () => removeModel(id) },
                ])} />
              </View>
            ) : null}
          </Card>
        );
      })}

      <Kicker style={{ marginTop: 22 }}>Que voulez-vous en faire ?</Kicker>
      <ChipRow label="Spécialité recherchée">
        {SPECIALTIES.map(s => <Chip key={s.id} label={s.label} on={spec === s.id} onPress={() => setSpec(spec === s.id ? '' : s.id)} />)}
      </ChipRow>
      {!spec ? <Text style={{ marginTop: 6, fontSize: 12.5, lineHeight: 18, color: C.n700 }}>Choisissez un usage : MiMai classe les modèles les plus adaptés, à votre téléphone et à cet usage.</Text> : (
        <View style={{ marginTop: 6 }}>
          <Text style={{ fontSize: 13.5, lineHeight: 20, color: C.n800 }}><Text style={{ fontWeight: '700', fontFamily: F.bodyBold }}>{specInfo?.label}</Text> — {specInfo?.hint}</Text>
          {!loaded ? <Text style={{ marginTop: 8, fontSize: 13.5, color: C.n700 }}>Analyse de votre téléphone…</Text>
            : ranked.length === 0 ? <Text style={{ marginTop: 8, fontSize: 13.5, lineHeight: 20, color: C.n700 }}>Aucun modèle non installé ne convient confortablement à cet usage sur ce téléphone. Parcourez la liste complète plus bas.</Text>
              : ranked.map((r, i) => (
                <View key={'spec:' + r.model.id}>
                  {renderRow(r.model, 'spec')}
                  <Text numberOfLines={3} style={{ marginTop: 4, marginHorizontal: 6, fontSize: 12.5, lineHeight: 18, color: C.g800 }}>{'N°' + (i + 1) + ' · ' + r.why.join(' · ')}</Text>
                </View>
              ))}
          <Text style={{ marginTop: 8, fontSize: 11.5, lineHeight: 16, color: C.n700 }}>{ADVISOR_NOTE}</Text>
        </View>
      )}

      <Kicker style={{ marginTop: 22 }}>Recommandés pour votre téléphone</Kicker>
      <Text style={{ marginTop: 6, fontSize: 12.5, lineHeight: 18, color: C.n700 }}>
        {profile.ramGb != null ? 'Mémoire détectée : ' + fmtGo(profile.ramGb) : 'Mémoire non détectée'}{profile.freeDiskGb != null ? ' · stockage libre : ' + fmtGo(profile.freeDiskGb) : ''}. Les vitesses sont de simples estimations.
      </Text>
      {!loaded ? <Text style={{ marginTop: 10, fontSize: 13.5, color: C.n700 }}>Analyse de votre téléphone…</Text>
        : recos.length === 0 ? <Text style={{ marginTop: 10, fontSize: 13.5, lineHeight: 20, color: C.n700 }}>Aucun modèle du catalogue n’est confortable sur cet appareil pour le moment (mémoire ou stockage). Vous pouvez tout de même parcourir la liste complète.</Text>
          : recos.map(m => renderRow(m, 'reco'))}

      <Kicker style={{ marginTop: 26 }}>Tous les modèles</Kicker>
      <View style={{ marginTop: 8 }}><SearchBar value={query} onChange={setQuery} placeholder="Rechercher (nom, famille)" /></View>
      <ChipRow label="Filtre par famille">
        <Chip label="Toutes familles" on={!family} onPress={() => setFamily('')} />
        {families.map(f => <Chip key={f} label={f} on={family === f} onPress={() => setFamily(family === f ? '' : f)} />)}
      </ChipRow>
      <ChipRow label="Filtre par taille">
        {SIZE_FILTERS.map(s => <Chip key={s.key || 'all'} label={s.label} on={size === s.key} onPress={() => setSize(s.key)} />)}
      </ChipRow>
      <ChipRow label="Filtre par usage">
        {TAG_FILTERS.map(t => <Chip key={t.key || 'all'} label={t.label} on={tag === t.key} onPress={() => setTag(t.key)} />)}
      </ChipRow>
      <ChipRow label="Tri">
        <Text style={{ alignSelf: 'center', fontSize: 12.5, color: C.n700 }}>Trier :</Text>
        {SORTS.map(s => <Chip key={s.key} label={s.label} on={sort === s.key} onPress={() => setSort(s.key)} />)}
      </ChipRow>
      <Text accessibilityLiveRegion="polite" style={{ marginTop: 6, fontSize: 12.5, color: C.n700 }}>{list.length} modèle{list.length > 1 ? 's' : ''}{filtersOn ? ' (filtres actifs)' : ''}</Text>
    </View>
  );

  const footer = (
    <View style={{ marginTop: 14, marginBottom: 12, borderRadius: 22, backgroundColor: C.g100, padding: 14, gap: 6 }}>
      <Text style={{ fontSize: 13, lineHeight: 19, color: C.g900 }}>Le réseau n’est utilisé que pour télécharger un modèle, sur action explicite. Vérification : taille → SHA-256 → manifeste → licence, puis blocage automatique. Vos données ne partent jamais.</Text>
      <Text style={{ fontSize: 12, color: C.g700 }}>État : {dl ? 'réseau autorisé (15 min)' : 'réseau bloqué'}</Text>
    </View>
  );

  const empty = (
    <View style={{ marginTop: 14, padding: 16, borderRadius: 22, backgroundColor: C.surface, gap: 10, alignItems: 'flex-start' }}>
      <Text style={{ fontSize: 14, lineHeight: 20, color: C.n800 }}>{all.length === 0 ? 'Le catalogue de modèles est vide ou illisible.' : available.length === 0 ? 'Tous les modèles du catalogue sont déjà installés.' : 'Aucun modèle ne correspond à ces critères.'}</Text>
      {filtersOn ? <Btn kind="secondary" title="Réinitialiser les filtres" height={48} fontSize={14} onPress={resetFilters} /> : null}
    </View>
  );

  return (
    <Screen>
      <FlatList
        style={{ flex: 1 }}
        data={list}
        keyExtractor={m => m.id}
        renderItem={({ item }) => renderRow(item, 'all')}
        extraData={[openKey, pending, pct, phase, fits]}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        showsVerticalScrollIndicator={false}
      />

      <Dialog visible={!!importing && importing.phase !== 'choose'} onClose={() => { /* import en cours : pas de fermeture */ }}>
        <Text maxFontSizeMultiplier={1.25} style={{ fontFamily: F.heading, fontSize: 22, lineHeight: 28 }}>Import du modèle</Text>
        <Text style={{ fontSize: 14, lineHeight: 21, color: C.n700 }}>{importing?.phase === 'copy' ? 'Copie du fichier dans MiMai… cela peut prendre quelques minutes pour un gros modèle.' : 'Vérification SHA-256 : ' + Math.floor(importing?.pct ?? 0) + ' %'}</Text>
        {importing?.phase === 'sha' ? <Bar pct={importing.pct} h={10} /> : null}
        <Text style={{ fontSize: 12.5, color: C.n700 }}>Rien n’est envoyé sur Internet.</Text>
      </Dialog>

      {/* confirmation d'ouverture du réseau (README §2.2) */}
      <Dialog visible={!!confirmNet} onClose={() => setConfirmNet(null)}>
            <Text maxFontSizeMultiplier={1.25} style={{ fontFamily: F.heading, fontSize: 22, lineHeight: 28 }}>Installer {confirmNet && MODELS[confirmNet] ? MODELS[confirmNet].name : ''} ?</Text>
            <Text style={{ fontSize: 14, lineHeight: 21, color: C.n700 }}>Cette opération nécessite Internet{confirmNet && MODELS[confirmNet] ? ' (' + fmtGo(MODELS[confirmNet].sizeBytes / 1e9) + ')' : ''}. Aucun message, document, mémoire ou historique ne sera envoyé.</Text>
            <DialogActions>
              <Btn kind="secondary" title="Annuler" height={48} onPress={() => setConfirmNet(null)} />
              <Btn title="Autoriser 15 min" height={48} onPress={() => confirmNet && void startInstall(confirmNet)} />
            </DialogActions>
      </Dialog>

      {/* progression complète */}
      <Dialog visible={!!pending} onClose={() => { }}>
            <Text maxFontSizeMultiplier={1.25} style={{ fontFamily: F.heading, fontSize: 22, lineHeight: 28 }}>{pending && MODELS[pending] ? MODELS[pending].name : ''}</Text>
            <Bar pct={pct} h={10} />
            <Text style={{ fontSize: 13.5, color: C.n700 }}>{phaseLabel(phase)} · {Math.round(pct)} %</Text>
            {shaInfo ? <Text style={{ fontSize: 11, lineHeight: 15, fontFamily: 'monospace', color: shaInfo.ok ? C.g700 : C.a800 }} numberOfLines={2}>SHA-256 {shaInfo.got.slice(0, 40)}… {shaInfo.ok ? '✓' : '✗'}</Text> : null}
            {manifest ? (
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 12.5, color: C.g800, fontWeight: '700' }}>Manifeste vérifié</Text>
                <Text style={{ fontSize: 12, lineHeight: 17, color: C.n700 }}>v{manifest.version} · {manifest.format} · {manifest.quantization} · licence {manifest.license}</Text>
              </View>
            ) : null}
            {!manifest ? <Btn kind="secondary" title="Annuler le téléchargement" height={48} onPress={() => { blockNet('annulation'); setPending(null); }} /> : null}
      </Dialog>
    </Screen>
  );
}

function phaseLabel(p: string): string {
  return ({ download: 'Téléchargement', size: 'Taille', sha: 'SHA-256', manifest: 'Manifeste', license: 'Licence', install: 'Installation' } as Record<string, string>)[p] || p;
}
