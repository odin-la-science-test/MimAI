/* Benchmarks avant / après entraînement : instantanés de vitesse + qualité MESURÉS sur cet appareil. */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useApp } from '../state';
import { C, F } from '../theme';
import { Card, Btn, Kicker, Bar } from '../ui';
import { compare, verdictLines, secs, type BenchSnapshot } from '../services/bench';
import { MODELS } from '../services/net';

const when = (ts: number) => { const d = new Date(ts); return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
const PHASE: Record<BenchSnapshot['phase'], string> = { avant: 'Avant', apres: 'Après', manuel: 'Manuel' };

/* tableau de comparaison de deux instantanés (le plus ancien d'abord) */
export function BenchCompare({ a, b }: { a: BenchSnapshot; b: BenchSnapshot }) {
  const [x, y] = a.ts <= b.ts ? [a, b] : [b, a];
  const rows = compare(x, y);
  return (
    <Card style={{ gap: 8, paddingVertical: 14 }}>
      <Text style={{ fontWeight: '700', fontSize: 14, fontFamily: F.bodyBold }}>{x.label} → {y.label}</Text>
      {x.modelId !== y.modelId ? <Text style={{ fontSize: 12.5, color: C.a700, fontWeight: '700' }}>Modèles différents : la comparaison mélange le modèle et l’entraînement.</Text> : null}
      {rows.map(r => (
        <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.n800 }}>{r.label}</Text>
          <Text style={{ fontSize: 12.5, color: C.n700 }}>{r.before} → {r.after}</Text>
          <Text style={{ width: 62, textAlign: 'right', fontSize: 12.5, fontWeight: '700', color: r.better === null ? C.n700 : r.better ? C.g800 : C.a700 }}>{r.delta}</Text>
        </View>
      ))}
      {verdictLines(rows).map((l, i) => <Text key={i} style={{ fontSize: 12.5, lineHeight: 18, color: C.n700 }}>{l}</Text>)}
    </Card>
  );
}

export function BenchPanel() {
  const { data, snapshot, toast } = useApp();
  const list = [...(data.benches || [])].sort((p, q) => q.ts - p.ts);
  const [sel, setSel] = useState<string[]>([]);
  const [pct, setPct] = useState<number | null>(null);

  const take = async () => {
    if (pct !== null) return;
    setPct(0);
    try {
      const ok = await snapshot('Manuel · ' + (MODELS[data.settings.activeModel]?.name || data.settings.activeModel), p => setPct(p));
      toast(ok ? 'Mesure enregistrée' : 'Mesure impossible : modèle ou moteur indisponible (version installée requise).');
    } catch (e) { toast('Mesure interrompue : ' + String((e as Error)?.message || e).slice(0, 80)); }
    setPct(null);
  };
  const toggle = (id: string) => setSel(s => (s.includes(id) ? s.filter(x => x !== id) : [...s.slice(-1), id]));
  const pair = sel.map(id => list.find(b => b.id === id)).filter((b): b is BenchSnapshot => !!b);

  return (
    <View>
      <Kicker style={{ marginTop: 22 }}>Benchmarks · avant / après</Kicker>
      <View style={{ marginTop: 8, borderRadius: 22, backgroundColor: C.n100, padding: 14, gap: 8 }}>
        <Text style={{ fontSize: 13, lineHeight: 19, color: C.n800 }}>
          Chaque entraînement est mesuré au départ et à l’arrivée : temps de réponse (court, moyen), vitesse, qualité de style et culture générale. Vous pouvez aussi prendre une mesure à tout moment, puis comparer deux mesures en les touchant.
        </Text>
        <Btn kind="secondary" title={pct === null ? 'Mesurer maintenant (≈ 1 à 3 min)' : 'Mesure en cours… ' + Math.round(pct) + ' %'} height={48} fontSize={14} disabled={pct !== null} onPress={take} />
        {pct !== null ? <Bar pct={pct} /> : null}
      </View>
      {list.slice(0, 10).map(b => {
        const on = sel.includes(b.id);
        const c = b.speed.find(p => p.kind === 'court');
        return (
          <TouchableOpacity key={b.id} onPress={() => toggle(b.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
            style={{ marginTop: 8, borderRadius: 18, padding: 12, backgroundColor: on ? C.a200 : C.surface, borderWidth: on ? 2 : 0, borderColor: C.accent, gap: 2 }}>
            <Text numberOfLines={2} style={{ fontWeight: '700', fontSize: 14, fontFamily: F.bodyBold }}>{b.label}</Text>
            <Text style={{ fontSize: 12.5, color: C.n700 }}>
              {PHASE[b.phase]} · {when(b.ts)} · {MODELS[b.modelId]?.name || b.modelId}
              {c ? ' · court ' + String(secs(c.ms)).replace('.', ',') + ' s' : ''}
              {b.style !== null ? ' · style ' + String(b.style).replace('.', ',') + ' %' : ''}
              {b.general !== null ? ' · général ' + String(b.general).replace('.', ',') + ' %' : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
      {!list.length ? <Text style={{ marginTop: 8, fontSize: 13, color: C.n700 }}>Aucune mesure pour l’instant.</Text> : null}
      {list.length > 1 && pair.length < 2 ? <Text style={{ marginTop: 8, fontSize: 12.5, color: C.n700 }}>Touchez deux mesures pour les comparer.</Text> : null}
      {pair.length === 2 ? <View style={{ marginTop: 10 }}><BenchCompare a={pair[0]} b={pair[1]} /></View> : null}
    </View>
  );
}
