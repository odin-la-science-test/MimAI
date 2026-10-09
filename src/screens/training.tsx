/* Apprentissage local — écrans honnêtes.
   Ce qui est affiché est ce qui est RÉEL :
   - « Profil » (niveau 1) : exemples/corrections pertinents + règles de style injectés
     dans le prompt ; les poids du modèle ne changent pas.
   - « LoRA » (niveau 2) : adaptateur GGUF entraîné sur PC, importé, vérifié, évalué
     localement puis activé ou refusé.
   - Entraînement des poids sur l'appareil : indisponible (voir docs/TRAINING.md).
   Aucune progression simulée : les pourcentages viennent des étapes réellement exécutées. */
import React, { useEffect, useRef, useState } from 'react';
import * as Battery from 'expo-battery';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav-types';
import { useApp } from '../state';
import { C, F, fmtSize } from '../theme';
import { Screen, IconBtn, H1, Sub, Kicker, Card, Btn, Tag, Toggle, CheckCircle, Row, Bar, Ico, AvatarIc } from '../ui';
import {
  datasetFrom, rollbackToPrevious, activateExclusive, applyOutcome, parseMeta, visibleRules, fmtVersion, planRollback,
  reportFor, PHASES, MIN_PAIRS, type AdapterMeta, type TrainReport,
} from '../services/training';
import { getDeviceCaps, exportDataset, importLora, deleteAdapterFiles, verifyAdapter, type DeviceCaps, type ImportPhase } from '../services/lora';
import { uid, type Adapter } from '../services/db';
import { BenchPanel, BenchCompare } from './benchpanel';

const pct1 = (n: number | null | undefined) => (n === null || n === undefined ? 'non mesuré' : String(Math.round(n * 10) / 10).replace('.', ',') + ' %');
const KIND_LABEL: Record<AdapterMeta['kind'], string> = { profile: 'Profil de style', lora: 'Adaptateur LoRA' };
const EVAL_LABEL: Record<AdapterMeta['evalMode'], string> = { generative: 'Benchmark génératif local', retrieval: 'Couverture lexicale (pas de modèle)', none: 'Non évalué' };

function adapterLine(a: Adapter): string {
  const m = parseMeta(a.rules);
  const kind = m ? KIND_LABEL[m.kind] : 'Profil de style';
  const score = !m ? 'style ' + a.styleScore + ' %'
    : m.evalMode === 'generative' ? 'style ' + pct1(m.baseStyle) + ' → ' + pct1(m.style)
    : m.evalMode === 'retrieval' ? 'couverture ' + pct1(m.style) : 'non évalué';
  return fmtVersion(a.v) + ' · ' + kind + ' · ' + a.examples + ' exemples · ' + score;
}

/* ─────────── hub Entraînement ─────────── */
export function Training({ navigation }: NativeStackScreenProps<RootStackParamList, 'Training'>) {
  const { data, patchData, toast } = useApp();
  const lastRun = data.runs[0];
  const ds = datasetFrom(data, { useExamples: true, useConvs: true, useDocs: false });
  const active = data.adapters.find(a => a.active) || null;
  const activeMeta = active ? parseMeta(active.rules) : null;
  const [caps, setCaps] = useState<DeviceCaps | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [phase, setPhase] = useState<{ p: ImportPhase; pct: number } | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'ko'; lines: string[] } | null>(null);

  useEffect(() => { void getDeviceCaps(data).then(setCaps).catch(() => setCaps(null)); /* eslint-disable-next-line */ }, [data.settings.activeModel, data.settings.installed.length]);

  const phaseLabel: Record<ImportPhase, string> = { pick: 'Choix du fichier', header: 'Lecture des métadonnées GGUF', sha: 'Calcul SHA-256', copy: 'Copie dans l’espace privé de l’app', bench: 'Benchmark local (modèle de base vs adaptateur)', decide: 'Décision' };

  const doExport = async () => {
    setBusy('export'); setMsg(null);
    try {
      const r = await exportDataset(data, 'chat');
      setMsg({ tone: r.ok ? 'ok' : 'ko', lines: [r.message, ...(r.files.length ? ['Fichiers : ' + r.files.join(', '), r.counts ? r.counts.train + ' exemples d’entraînement, ' + r.counts.eval + ' de test, ' + r.counts.preference + ' paire(s) de préférence.' : ''] : [])].filter(Boolean) });
    } catch (e) { setMsg({ tone: 'ko', lines: ['Export impossible : ' + String((e as Error).message || e)] }); }
    setBusy(null);
  };
  const doImport = async () => {
    setBusy('import'); setMsg(null); setPhase(null);
    try {
      const r = await importLora(data, 1, (p, pct) => setPhase({ p, pct }));
      if (r.status === 'cancelled') { /* rien */ }
      else if (r.status === 'rejected') setMsg({ tone: 'ko', lines: ['Adaptateur refusé avant évaluation :', ...r.errors] });
      else if (r.outcome) {
        const out = r.outcome;
        patchData(d => { applyOutcome(d, out); });
        setMsg({ tone: out.adapter ? 'ok' : 'ko', lines: [out.adapter ? 'Adaptateur validé et activé. L’ancienne version reste disponible.' : 'Adaptateur refusé par le benchmark (fichier supprimé).', ...out.report.reasons, ...r.warnings.map(w => 'Note : ' + w)] });
        toast(out.adapter ? 'Adaptateur activé' : 'Adaptateur refusé');
      }
    } catch (e) { setMsg({ tone: 'ko', lines: ['Import impossible : ' + String((e as Error).message || e)] }); }
    setBusy(null); setPhase(null);
  };
  const remove = (a: Adapter) => {
    const meta = parseMeta(a.rules);
    patchData(d => { d.adapters = d.adapters.filter(x => x.id !== a.id); });
    void deleteAdapterFiles(meta?.file);
    toast('Version supprimée');
  };
  const verify = async (a: Adapter) => {
    const m = parseMeta(a.rules); if (!m) return;
    const r = await verifyAdapter(m); toast(fmtVersion(a.v) + ' : ' + r.reason);
  };
  const canRollback = data.adapters.some(a => a.active);
  const rb = planRollback(data.adapters);

  return (
    <Screen scroll>
      <IconBtn name="back" onPress={() => navigation.goBack()} />
      <H1 style={{ marginTop: 10 }}>Entraînement</H1>
      <Sub style={{ marginTop: 6 }}>Apprenez à MiMai votre style. Tout reste sur cet appareil, rien n’est envoyé.</Sub>

      {/* état réel */}
      <TouchableOpacity
        onPress={() => { if (lastRun) navigation.navigate('TrainResult', { runId: lastRun.id }); else navigation.navigate('TrainNew'); }}
        accessibilityRole="button" style={{ marginTop: 18, borderRadius: 32, backgroundColor: C.text, padding: 18, gap: 6 }}>
        {active ? <Tag kind="accent2">{fmtVersion(active.v)} active</Tag> : <Tag kind="dark">Modèle de base seul</Tag>}
        <Text numberOfLines={2} maxFontSizeMultiplier={1.25} style={{ fontFamily: F.heading, fontSize: 20, lineHeight: 26, color: C.bg }}>{active ? active.name : 'Aucune personnalisation active'}</Text>
        <Text style={{ fontSize: 13, color: C.n300 }}>
          {active ? (activeMeta ? KIND_LABEL[activeMeta.kind] + ' · ' + EVAL_LABEL[activeMeta.evalMode] : 'Profil de style')
            : ds.size + ' exemple(s) exploitable(s) sur ' + (MIN_PAIRS + 2) + ' minimum'}
        </Text>
        {lastRun ? <Text style={{ fontSize: 12.5, color: C.n400 }}>Dernier essai : {lastRun.status === 'pass' ? 'validé' : lastRun.status === 'fail' ? 'refusé' : 'en cours'} — voir le détail</Text> : null}
      </TouchableOpacity>

      <Kicker style={{ marginTop: 22 }}>Compétences (versions)</Kicker>
      <View style={{ marginTop: 6 }}>
        {[...data.adapters].sort((a, b) => b.v - a.v).map(a => {
          const m = parseMeta(a.rules);
          return (
            <Row key={a.id}>
              <AvatarIc name="grad" size={42} tone="g" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={2} style={{ fontWeight: '700', fontSize: 15, fontFamily: F.bodyBold }}>{a.name}</Text>
                <Text style={{ fontSize: 12.5, lineHeight: 17, color: C.n700 }}>{adapterLine(a)}</Text>
                {m?.kind === 'lora' ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, marginTop: 2 }}>
                    <TouchableOpacity onPress={() => verify(a)} accessibilityRole="button" hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }} style={{ paddingVertical: 6 }}><Text style={{ fontSize: 12.5, color: C.a700, fontWeight: '700' }}>Vérifier l’intégrité</Text></TouchableOpacity>
                    {!a.active ? <TouchableOpacity onPress={() => remove(a)} accessibilityRole="button" hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }} style={{ paddingVertical: 6 }}><Text style={{ fontSize: 12.5, color: C.n700, fontWeight: '700' }}>Supprimer</Text></TouchableOpacity> : null}
                  </View>
                ) : null}
              </View>
              <Toggle on={a.active} onChange={() => patchData(d => { activateExclusive(d.adapters, a.active ? null : a.id); })} />
            </Row>
          );
        })}
        {!data.adapters.length ? (
          <Text style={{ fontSize: 13.5, color: C.n700, paddingHorizontal: 12 }}>Aucune version pour l’instant. Un seul adaptateur est actif à la fois ; les anciennes versions restent disponibles.</Text>
        ) : null}
      </View>
      {canRollback ? (
        <Btn kind="secondary" title={rb.to ? 'Revenir à la version précédente' : 'Revenir au modèle de base'} height={42} fontSize={14} style={{ alignSelf: 'flex-start', marginTop: 10, maxWidth: '100%' }}
          onPress={() => { patchData(d => { rollbackToPrevious(d); }); toast(rb.to ? 'Version précédente réactivée' : 'Modèle de base seul'); }} />
      ) : null}

      <Kicker style={{ marginTop: 22 }}>Niveau 1 · Profil de style</Kicker>
      <View style={{ marginTop: 8, borderRadius: 22, backgroundColor: C.n100, padding: 14, gap: 6 }}>
        <Text style={{ fontSize: 13, lineHeight: 19, color: C.n800 }}>
          MiMai choisit, à chaque question, vos exemples et corrections les plus proches et les ajoute au prompt, avec des règles de style. Les poids du modèle ne changent pas : c’est immédiat, réversible et mesuré par un benchmark sur des exemples mis de côté.
        </Text>
        <Text style={{ fontSize: 12.5, color: C.n700 }}>{ds.pairs.length} paire(s) exploitable(s) · {data.convs.filter(c => c.trainFlag === 'yes').length} conversation(s) TRAINING = YES · {data.convs.filter(c => c.trainFlag === 'memory').length} en mémoire seule</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <Btn kind="secondary" title="Ajouter des exemples" height={48} fontSize={14} style={{ flex: 1, paddingHorizontal: 12 }} onPress={() => navigation.navigate('TrainExample')} />
        <Btn title="Créer un profil" height={48} fontSize={14} style={{ flex: 1, paddingHorizontal: 12 }} onPress={() => navigation.navigate('TrainNew')} />
      </View>

      <Kicker style={{ marginTop: 22 }}>Niveau 2 · Adaptateur LoRA (avancé)</Kicker>
      <View style={{ marginTop: 8, borderRadius: 22, backgroundColor: C.n100, padding: 14, gap: 8 }}>
        <Text style={{ fontSize: 13, lineHeight: 19, color: C.n800 }}>
          Un vrai adaptateur LoRA modifie le comportement du modèle. Le moteur embarqué (llama.rn) sait le charger mais pas l’entraîner : 1) exportez votre jeu de données, 2) entraînez-le sur votre PC avec le script fourni (scripts/train-lora-pc.md), 3) importez le fichier .gguf ici. Il est vérifié (SHA-256, métadonnées, dimensions), évalué sur vos exemples de test et sur des questions générales, puis activé seulement s’il ne dégrade rien.
        </Text>
        <Btn kind="secondary" title={busy === 'export' ? 'Export…' : 'Exporter le dataset (JSONL)'} height={48} fontSize={14} disabled={!!busy} onPress={doExport} />
        <Btn title={busy === 'import' ? 'Import en cours…' : 'Importer un adaptateur .gguf'} height={48} fontSize={14} disabled={!!busy || (caps ? !caps.loraImport : false)} onPress={doImport} />
        {caps && !caps.loraImport ? <Text style={{ fontSize: 12.5, color: C.n700 }}>{caps.loraReason}</Text> : null}
        {phase ? (
          <View style={{ gap: 4 }}>
            <Bar pct={phase.pct} />
            <Text style={{ fontSize: 12.5, color: C.n700 }}>{phaseLabel[phase.p]} · {Math.round(phase.pct)} %</Text>
          </View>
        ) : null}
        {msg ? (
          <View style={{ borderRadius: 16, padding: 12, backgroundColor: msg.tone === 'ok' ? C.g100 : C.a100, gap: 3 }}>
            {msg.lines.map((l, i) => <Text key={i} style={{ fontSize: 13, lineHeight: 18, color: C.n900, fontWeight: i === 0 ? '700' : '400' }}>{l}</Text>)}
          </View>
        ) : null}
      </View>

      <BenchPanel />

      <Kicker style={{ marginTop: 22 }}>Ce que cet appareil peut faire</Kicker>
      <Card style={{ marginTop: 8, gap: 8 }}>
        {([
          ['Moteur llama.rn', caps ? (caps.llama ? 'présent' : 'absent (Expo Go)') : '…'],
          ['Modèle de base installé', caps ? (caps.modelInstalled ? 'oui' : 'non') : '…'],
          ['Mémoire', caps && caps.ramGb ? caps.ramGb + ' Go' : 'inconnue'],
          ['Batterie', caps && caps.battery !== null ? Math.round(caps.battery * 100) + ' %' + (caps.charging ? ' · en charge' : '') : 'inconnue'],
          ['Benchmark local', caps ? (caps.generativeBench ? 'disponible' : 'indisponible') : '…'],
          ['Entraînement des poids sur l’appareil', caps ? (caps.onDeviceFinetune ? 'disponible' : 'indisponible') : '…'],
        ] as [string, string][]).map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ fontSize: 13.5, color: C.n700, flex: 1, minWidth: 0 }}>{k}</Text>
            <Text style={{ fontSize: 13.5, fontWeight: '700', flexShrink: 0, maxWidth: '45%', textAlign: 'right' }}>{v}</Text>
          </View>
        ))}
        {caps && !caps.onDeviceFinetune ? <Text style={{ fontSize: 12.5, lineHeight: 18, color: C.n700 }}>{caps.onDeviceReason}</Text> : null}
      </Card>
      <View style={{ height: 16 }} />
    </Screen>
  );
}

/* ─────────── nouvel entraînement (profil) ─────────── */
export function TrainNew({ navigation }: NativeStackScreenProps<RootStackParamList, 'TrainNew'>) {
  const { data } = useApp();
  const [goal, setGoal] = useState('style');
  const [opts, setOpts] = useState({ useExamples: true, useConvs: true, useDocs: false });
  const goals: [string, string, string, string][] = [['style', 'Mon style', 'Écrire comme moi', 'pen'], ['sujet', 'Un sujet', 'Connaître mes documents', 'list'], ['format', 'Un format', 'Suivre une structure', 'filter']];
  const ds = datasetFrom(data, opts);
  const flagged = data.convs.filter(c => c.trainFlag === 'yes').length;
  const enough = ds.pairs.length >= MIN_PAIRS + 2;

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <IconBtn name="back" onPress={() => navigation.goBack()} />
        <Tag kind="neutral">Profil de style</Tag>
      </View>
      <H1 size={34} style={{ marginTop: 12 }}>Nouveau profil</H1>
      <Sub style={{ marginTop: 6 }}>Choisissez ce que MiMai doit retenir de vos exemples, puis il sera évalué avant activation.</Sub>
      <Kicker style={{ marginTop: 20 }}>Objectif</Kicker>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        {goals.map(([id, t, sub, ic]) => {
          const on = goal === id;
          return (
            <TouchableOpacity key={id} onPress={() => setGoal(id)}
              accessibilityRole="radio" accessibilityState={{ selected: on }}
              style={{ flex: 1, minWidth: 0, minHeight: 124, gap: 8, borderRadius: 24, padding: 12, backgroundColor: on ? C.a200 : C.surface, borderWidth: on ? 2 : 0, borderColor: C.accent, justifyContent: 'space-between' }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Ico name={ic} size={16} color={C.a800} />
              </View>
              <View>
                <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ fontWeight: '700', fontSize: 14, fontFamily: F.bodyBold }}>{t}</Text>
                <Text numberOfLines={3} maxFontSizeMultiplier={1.2} style={{ fontSize: 11.5, lineHeight: 15, color: on ? C.a800 : C.n700 }}>{sub}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <Kicker style={{ marginTop: 20 }}>Données</Kicker>
      <View style={{ marginTop: 6 }}>
        <Row onPress={() => setOpts(o => ({ ...o, useExamples: !o.useExamples }))}>
          <CheckCircle on={opts.useExamples} onChange={() => setOpts(o => ({ ...o, useExamples: !o.useExamples }))} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontWeight: '700', fontSize: 15, fontFamily: F.bodyBold }}>Exemples</Text>
            <Text style={{ fontSize: 13, color: C.n700 }}>{data.tex.length} paires question → réponse</Text>
          </View>
        </Row>
        <Row onPress={() => setOpts(o => ({ ...o, useConvs: !o.useConvs }))}>
          <CheckCircle on={opts.useConvs} onChange={() => setOpts(o => ({ ...o, useConvs: !o.useConvs }))} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontWeight: '700', fontSize: 15, fontFamily: F.bodyBold }}>Conversations</Text>
            <Text style={{ fontSize: 13, color: C.n700 }}>{flagged} marquée(s) TRAINING = YES · les réponses 👎 sont exclues</Text>
          </View>
        </Row>
        <Row onPress={() => setOpts(o => ({ ...o, useDocs: !o.useDocs }))}>
          <CheckCircle on={opts.useDocs} onChange={() => setOpts(o => ({ ...o, useDocs: !o.useDocs }))} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontWeight: '700', fontSize: 15, fontFamily: F.bodyBold }}>Documents</Text>
            <Text style={{ fontSize: 13, color: C.n700 }}>Non appris : les documents sont lus à la demande (bibliothèque), pas entraînés</Text>
          </View>
        </Row>
      </View>
      <Card style={{ marginTop: 12, gap: 6, paddingVertical: 14 }}>
        <Text style={{ fontWeight: '700', fontSize: 15, color: C.text }}>{ds.pairs.length} paire(s) exploitable(s)</Text>
        <Text style={{ fontSize: 12.5, lineHeight: 18, color: C.n700 }}>
          Écartées : {ds.skipped.flagNo} conv. « NO », {ds.skipped.flagMemory} conv. « mémoire seule », {ds.skipped.bad} réponse(s) 👎, {ds.skipped.duplicate} doublon(s), {ds.skipped.invalid} invalide(s).
        </Text>
        <Text style={{ fontSize: 12.5, lineHeight: 18, color: C.n700 }}>
          Durée : quelques secondes à quelques minutes (benchmark). Aucun poids n’est modifié ; stockage négligeable.
        </Text>
        {!enough ? <Text style={{ fontSize: 12.5, color: C.a700, fontWeight: '700' }}>Il faut au moins {MIN_PAIRS + 2} paires ; ajoutez des exemples ou notez des réponses 👍.</Text> : null}
      </Card>
      <Btn title="Créer et évaluer le profil" height={56} style={{ marginTop: 14 }} disabled={!enough} onPress={() => navigation.navigate('TrainRun', { goal, opts })} />
      <View style={{ height: 8 }} />
    </Screen>
  );
}

/* ─────────── par l'exemple ─────────── */
const EXAMPLES: { q: string; cur: string; mine: string }[] = [
  { q: 'Rédige un message pour décaler la réunion de jeudi.', cur: 'Bonjour à tous, je me permets de vous informer que la réunion initialement prévue jeudi doit malheureusement être reportée à une date ultérieure.', mine: 'Salut à tous, on décale la réunion de jeudi à vendredi 10 h. Ça vous va ?' },
  { q: 'Écris un message pour remercier Léa de son aide.', cur: 'Chère Léa, je tenais à vous adresser mes plus sincères remerciements pour l’aide précieuse que vous m’avez apportée.', mine: 'Merci Léa, ton coup de main m’a vraiment sauvé la journée !' },
  { q: 'Annonce que le document est prêt.', cur: 'Je vous informe que le document est désormais finalisé et disponible pour consultation.', mine: 'C’est bon, le document est prêt. Je vous l’envoie !' },
];
const TAGS: [string, string][] = [['court', 'Plus court'], ['direct', 'Plus direct'], ['tu', 'Tutoiement'], ['formel', 'Plus formel']];

export function TrainExample({ navigation }: NativeStackScreenProps<RootStackParamList, 'TrainExample'>) {
  const { data, patchData, toast } = useApp();
  const [idx, setIdx] = useState(0);
  const [tags, setTags] = useState<Record<string, boolean>>({ court: true, direct: true, tu: true, formel: false });
  const ex = EXAMPLES[idx % EXAMPLES.length];
  const [mine, setMine] = useState(ex.mine);
  const count = data.tex.length;
  const next = (save: boolean) => {
    if (save && mine.trim().length >= 2) {
      /* la réponse « actuelle » devient la réponse rejetée (paire de préférence), les tags choisis sont conservés */
      patchData(d => { d.tex.push({ id: uid('e'), q: ex.q, base: ex.cur, target: mine.trim(), tags: Object.keys(tags).filter(k => tags[k]), ts: Date.now(), src: 'manual' }); });
      toast('Exemple enregistré');
    }
    const n = idx + 1; setIdx(n); setMine(EXAMPLES[n % EXAMPLES.length].mine);
  };
  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <IconBtn name="back" onPress={() => navigation.goBack()} />
        <Tag kind="neutral">{count} exemple(s)</Tag>
      </View>
      <H1 size={30} style={{ marginTop: 12 }}>Montrez la bonne réponse.</H1>
      <Sub style={{ marginTop: 6 }}>Modifiez « votre version » pour qu’elle sonne comme vous : c’est elle que MiMai imitera.</Sub>
      <Text style={{ marginTop: 18, fontSize: 15.5, fontWeight: '700', lineHeight: 22, fontFamily: F.bodyBold }}>{ex.q}</Text>
      <View style={{ marginTop: 12, borderRadius: 22, backgroundColor: C.n200, padding: 14, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.a200, alignItems: 'center', justifyContent: 'center' }}>
            <Ico name="spark" size={10} color={C.a700} />
          </View>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.n700 }}>Réponse à éviter</Text>
        </View>
        <Text style={{ fontSize: 14, lineHeight: 21, color: C.n700, textDecorationLine: 'line-through' }}>{ex.cur}</Text>
      </View>
      <View style={{ marginTop: 10, borderRadius: 22, backgroundColor: C.n100, borderWidth: 2, borderColor: C.accent, padding: 14, gap: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: C.a700 }}>Votre version</Text>
        <TextInput value={mine} onChangeText={setMine} multiline accessibilityLabel="Votre version de la réponse" maxLength={600} maxFontSizeMultiplier={1.3} textAlignVertical="top" style={{ fontSize: 15, lineHeight: 22, color: C.text, fontFamily: F.body, padding: 0, minHeight: 44, maxHeight: 200 }} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        {TAGS.map(([k, label]) => {
          const on = tags[k];
          return (
            <TouchableOpacity key={k} onPress={() => setTags(t => ({ ...t, [k]: !t[k] }))} accessibilityRole="checkbox" accessibilityState={{ checked: !!on }}
              hitSlop={{ top: 7, bottom: 7, left: 2, right: 2 }}
              style={{ minHeight: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: on ? C.g200 : C.n200, justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: on ? '700' : '500', color: on ? C.g800 : C.n800 }}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ marginTop: 16 }}>
        <Bar pct={Math.min(100, (count / 50) * 100)} />
        <Text style={{ fontSize: 12.5, color: C.n700, marginTop: 6, textAlign: 'center' }}>{count} / 50 recommandés (minimum {MIN_PAIRS + 2} pour un profil)</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 8 }}>
        <Btn kind="secondary" title="Passer" height={56} style={{ flexShrink: 0 }} onPress={() => next(false)} />
        <Btn title="Enregistrer l’exemple" height={56} style={{ flex: 1 }} onPress={() => next(true)} />
      </View>
    </Screen>
  );
}

/* ─────────── exécution : progression RÉELLE des étapes ─────────── */
export function TrainRun({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'TrainRun'>) {
  const { data, runTraining } = useApp();
  const [batt, setBatt] = useState<{ lvl: number | null; charging: boolean | null }>({ lvl: null, charging: null });
  useEffect(() => {
    (async () => {
      try {
        const l = await Battery.getBatteryLevelAsync();
        const st = await Battery.getBatteryStateAsync();
        setBatt({ lvl: l >= 0 ? Math.round(l * 100) : null, charging: st === Battery.BatteryState.CHARGING || st === Battery.BatteryState.FULL });
      } catch { /* indisponible */ }
    })();
  }, []);
  const goal = route.params?.goal || 'style';
  const opts = route.params?.opts || { useExamples: true, useConvs: true, useDocs: false };
  const startedAt = useRef(Date.now());
  const startedRef = useRef(false);
  const [p, setP] = useState(0);
  const [phase, setPhase] = useState(0);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    runTraining(goal, opts, (prog, ph) => { setP(prog); setPhase(ph); })
      .then(() => setFinished(true))
      .catch(e => setError(String((e as Error)?.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = data.runs[0] && data.runs[0].startedAt >= startedAt.current - 1 ? data.runs[0] : null;
  useEffect(() => {
    if (finished && run) {
      const t = setTimeout(() => navigation.replace('TrainResult', { runId: run.id }), 600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, run?.id]);

  const name = ({ style: 'Style d’écriture', sujet: 'Mes documents', format: 'Mon format' } as Record<string, string>)[goal] || goal;
  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <IconBtn name="back" onPress={() => navigation.goBack()} />
        {error ? <Tag kind="neutral">Erreur</Tag> : finished ? <Tag kind="accent2">Terminé</Tag> : <Tag kind="accent">En cours</Tag>}
      </View>
      <View style={{ alignItems: 'center', marginTop: 26, marginBottom: 22 }}>
        <View style={{ width: 180, height: 180, borderRadius: 90, backgroundColor: C.n200, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 150, height: 150, borderRadius: 75, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Text maxFontSizeMultiplier={1.1} style={{ fontFamily: F.heading, fontSize: 32, lineHeight: 38 }}>{Math.round(p)} %</Text>
            <Text maxFontSizeMultiplier={1.1} style={{ fontSize: 12, color: C.n700 }}>étapes réalisées</Text>
          </View>
        </View>
        <Text maxFontSizeMultiplier={1.25} style={{ fontFamily: F.heading, fontSize: 22, lineHeight: 28, marginTop: 18, textAlign: 'center' }}>{name}</Text>
        <Text style={{ fontSize: 13, lineHeight: 18, color: C.n700, marginTop: 4, textAlign: 'center', paddingHorizontal: 12 }}>{error ? error : finished ? 'Ouverture du résultat…' : PHASES[Math.min(phase, PHASES.length - 1)]}</Text>
      </View>
      <Card style={{ padding: 14, gap: 8 }}>
        <Text style={{ fontWeight: '700', fontSize: 14, fontFamily: F.bodyBold }}>Étapes</Text>
        {PHASES.map((l, i) => {
          const done = finished || i < phase;
          const cur = !finished && i === phase;
          return (
            <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, flexShrink: 0, backgroundColor: done ? C.g600 : cur ? C.accent : C.n300 }} />
              <Text style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: done || cur ? C.text : C.n700, fontWeight: cur ? '700' : '400' }}>{l}</Text>
            </View>
          );
        })}
        <Text style={{ fontSize: 12, color: C.n700, marginTop: 4 }}>Ce profil ne modifie pas les poids du modèle : il n’y a donc pas de courbe de perte.</Text>
      </Card>
      <View style={{ marginTop: 10 }}>
        <Row><AvatarIc size={34}><Ico name="battery" size={15} color={C.a800} /></AvatarIc><Text style={{ flex: 1, minWidth: 0, fontSize: 14, color: C.text }}>Batterie</Text><Text style={{ flexShrink: 1, textAlign: 'right', fontSize: 14, fontWeight: '700', color: C.text }}>{batt.lvl === null ? 'inconnue' : batt.lvl + ' %'}<Text style={{ color: C.n700, fontWeight: '400' }}>{batt.charging === null ? '' : batt.charging ? ' · en charge' : ' · sur batterie'}</Text></Text></Row>
      </View>
      {error ? <Btn title="Retour" height={52} style={{ marginTop: 12 }} onPress={() => navigation.goBack()} /> : null}
      <View style={{ height: 8 }} />
    </Screen>
  );
}

/* ─────────── résultat : mesures réelles, rollback ─────────── */
export function TrainResult({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'TrainResult'>) {
  const { data, patchData, toast } = useApp();
  const run = data.runs.find(r => r.id === route.params?.runId) || data.runs[0];
  const report: TrainReport | null = run ? reportFor(run.id) : null;
  const adapter = run ? data.adapters.filter(a => a.name === run.name && Math.abs(a.createdAt - (run.finishedAt || 0)) < 600000).sort((a, b) => b.v - a.v)[0] : undefined;
  const meta = adapter ? parseMeta(adapter.rules) : null;
  const failed = run?.status === 'fail';
  const mode = report?.evalMode || meta?.evalMode || null;
  const bench = report?.bench;
  const reasons = report?.reasons || meta?.reasons || [];
  const ba = run ? (data.benches || []).find(b => b.runId === run.id && b.phase === 'avant') : undefined;
  const bb = run ? (data.benches || []).find(b => b.runId === run.id && b.phase === 'apres') : undefined;

  const rollback = () => {
    patchData(d => { rollbackToPrevious(d); });
    toast('Version précédente réactivée');
    navigation.replace('Training');
  };

  if (!run) {
    return (<Screen scroll><IconBtn name="back" onPress={() => navigation.replace('Training')} /><H1 size={30} style={{ marginTop: 10 }}>Aucun résultat</H1></Screen>);
  }
  return (
    <Screen scroll>
      <IconBtn name="back" onPress={() => navigation.replace('Training')} />
      <H1 size={34} style={{ marginTop: 10 }}>{run.name}</H1>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {failed ? <Tag kind="neutral">Refusé</Tag> : <Tag kind="accent2">{adapter ? fmtVersion(adapter.v) + ' active' : 'Validé'}</Tag>}
        {mode ? <Tag kind="neutral">{EVAL_LABEL[mode]}</Tag> : null}
      </View>

      {reasons.length ? (
        <View style={{ marginTop: 14, borderRadius: 22, backgroundColor: failed ? C.a100 : C.n100, padding: 14, gap: 4 }}>
          {reasons.map((r, i) => <Text key={i} style={{ fontSize: 13.5, lineHeight: 19, color: C.n900 }}>{r}</Text>)}
        </View>
      ) : null}

      <Card style={{ marginTop: 14, gap: 10 }}>
        <Text style={{ fontSize: 13.5, color: C.n700 }}>{mode === 'retrieval' ? 'Couverture de style (proxy lexical)' : 'Proximité avec vos réponses (jeu de test)'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {bench ? (<><Text maxFontSizeMultiplier={1.2} style={{ fontFamily: F.heading, fontSize: 26, color: C.n700 }}>{pct1(bench.base.style)}</Text><Ico name="chevron" size={18} color={C.n600} /></>) : null}
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: F.heading, fontSize: 36, lineHeight: 44, flexShrink: 1 }}>{pct1(run.styleScore ?? meta?.style)}</Text>
        </View>
        <Text style={{ fontSize: 12.5, color: C.n700 }}>
          Capacités générales : {bench ? pct1(bench.base.general) + ' → ' + pct1(bench.cand.general) + ' (' + bench.cand.generalN + ' questions)' : 'non mesurées'}
          {bench ? ' · jeu de test : ' + bench.cand.holdoutN + ' exemple(s)' : ''}
        </Text>
        {report ? <Text style={{ fontSize: 12.5, color: C.n700 }}>Données : {report.dataset.pairs} paire(s), {report.dataset.train} pour le profil, {report.dataset.holdout} mises de côté pour le test.</Text> : <Text style={{ fontSize: 12.5, color: C.n700 }}>Le détail de l’évaluation n’est conservé que pour la session en cours.</Text>}
      </Card>

      {bench && bench.samples.length ? (
        <View style={{ marginTop: 6 }}>
          <Kicker style={{ marginTop: 14 }}>Réponses réelles du modèle (jeu de test)</Kicker>
          {bench.samples.slice(0, 2).map((s, i) => (
            <View key={i} style={{ marginTop: 8 }}>
              <Text style={{ fontSize: 14.5, fontWeight: '700', lineHeight: 21, fontFamily: F.bodyBold }}>{s.q}</Text>
              <View style={{ marginTop: 6, borderRadius: 18, backgroundColor: C.n200, padding: 12, gap: 3 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.n700 }}>Sans profil</Text>
                <Text style={{ fontSize: 13.5, lineHeight: 19, color: C.n700 }}>{s.base || '(vide)'}</Text>
              </View>
              <View style={{ marginTop: 6, borderRadius: 18, backgroundColor: C.g100, borderWidth: 1.5, borderColor: C.g500, padding: 12, gap: 3 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.g800 }}>Avec profil</Text>
                <Text style={{ fontSize: 14, lineHeight: 20 }}>{s.cand || '(vide)'}</Text>
              </View>
              <Text style={{ fontSize: 12, color: C.n700, marginTop: 4 }}>Votre réponse attendue : {s.target}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {ba && bb ? (
        <View style={{ marginTop: 14 }}>
          <Kicker style={{ marginBottom: 8 }}>Benchmark avant / après</Kicker>
          <BenchCompare a={ba} b={bb} />
        </View>
      ) : null}

      {adapter && visibleRules(adapter.rules).length ? (
        <View style={{ marginTop: 14, borderRadius: 22, backgroundColor: C.n100, padding: 14, gap: 4 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.n700 }}>Règles de style appliquées</Text>
          {visibleRules(adapter.rules).map((r, i) => <Text key={i} style={{ fontSize: 13.5, color: C.n900 }}>• {r}</Text>)}
        </View>
      ) : null}
      {adapter?.rules && meta?.sha256 ? <Text style={{ fontSize: 11.5, color: C.n700, marginTop: 10 }}>SHA-256 {meta.sha256.slice(0, 16)}… · {fmtSize(meta.sizeBytes || 0)}</Text> : null}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 18, marginBottom: 8 }}>
        <Btn kind="secondary" title="Nouveau profil" height={56} style={{ flexShrink: 0 }} onPress={() => navigation.replace('TrainNew')} />
        {!failed && data.adapters.some(a => a.active) ? (
          <Btn title="Rollback" height={56} style={{ flex: 1 }} onPress={rollback} />
        ) : (
          <Btn title="Retour" height={56} style={{ flex: 1 }} onPress={() => navigation.replace('Training')} />
        )}
      </View>
    </Screen>
  );
}
