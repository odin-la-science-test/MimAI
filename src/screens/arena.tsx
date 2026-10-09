/* Arène : mini-jeu de défense — Mìmir défend son étoile contre les créatures.
   IA de Mìmir avec cooldowns (éclair, onde, pluie d'étoiles, bouclier, soin),
   exactement comme dans les maquettes. Puis la galerie des animations (dont les réactions à la secousse). */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, AppState, useWindowDimensions } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../nav-types';
import { C, F } from '../theme';
import { useIsFocused } from '@react-navigation/native';
import { BuddyMove, ShakeBuddy, MOVES, CREATURES, Creature, moveIndex } from '../art';
import { Screen, IconBtn, Tag, Btn, Bar, useTopPad } from '../ui';

interface Foe { id: string; type: string; hp: number; max: number; x: number; y: number; atk: number; hit: number; dead: number }
interface Fx { id: string; kind: string; t: number; life: number; x?: number; y?: number; v?: string; foe?: string }
interface Game { hp: number; foes: Foe[]; fx: Fx[]; cd: Record<string, number>; shield: number; wins: number; banner: { t: string; at: number }; mv: number }

const MIM_X = 26, MIM_Y = 44;

export function Arena({ navigation }: NativeStackScreenProps<RootStackParamList, 'Arena'>) {
  const [g, setG] = useState<Game | null>(null);
  const top = useTopPad(0);
  const last = useRef(Date.now());
  const ai = useRef(0);
  /* le jeu se met en pause (et Mìmir cesse d'être animé) quand l'écran n'est plus au premier plan ou l'app en arrière-plan */
  const focused = useIsFocused();
  const foc = useRef(true), fg = useRef(true);
  foc.current = focused;
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { fg.current = s === 'active'; });
    return () => sub.remove();
  }, []);

  const start = () => {
    last.current = Date.now();
    setG({ hp: 100, foes: [], fx: [], cd: { zap: 0, wave: 0, rain: 0, heal: 0, shield: 0 }, shield: 0, wins: 0, banner: { t: 'Invoquez des créatures !', at: Date.now() }, mv: 0 });
  };
  useEffect(() => { start(); return () => { if (timer.current) clearInterval(timer.current); }; }, []);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (g && !timer.current) {
      timer.current = setInterval(() => tick(), 80);
    }
    return () => { };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!g]);

  const tick = () => {
    if (!foc.current || !fg.current) { last.current = Date.now(); return; }
    setG(prev => {
      if (!prev) return prev;
      const now = Date.now();
      const dt = Math.min(0.2, (now - last.current) / 1000);
      last.current = now;
      let hp = prev.hp;
      const fx = prev.fx.filter(f => now - f.t < f.life);
      const foes: Foe[] = [];
      const shielded = prev.shield > now;
      for (const f0 of prev.foes) {
        const cf = CREATURES[f0.type];
        const f = { ...f0 };
        if (f.dead) { if (now - f.dead < 460) foes.push(f); continue; }
        if (f.x > cf.range) f.x -= cf.speed * dt * 2;
        else if (now - f.atk > cf.rate * 1000) {
          f.atk = now;
          fx.push({ id: 'a' + now + f.id, kind: 'atk', foe: f.type, t: now, life: 450 });
          if (shielded) fx.push({ id: 'b' + now + f.id, kind: 'block', t: now, life: 800 });
          else { hp = Math.max(1, hp - cf.dmg); fx.push({ id: 'd' + now + f.id, kind: 'dmg', v: '−' + cf.dmg, t: now, life: 900 }); }
        }
        foes.push(f);
      }
      let next: Game = { ...prev, hp, fx, foes };
      if (now - ai.current > 650) { ai.current = now; next = mimirAI(next, now); }
      return next;
    });
  };

  const summon = (type: string) => () => {
    setG(prev => {
      if (!prev) return prev;
      if (prev.foes.filter(f => !f.dead).length >= 6) return prev;
      const cf = CREATURES[type];
      return { ...prev, foes: [...prev.foes, { id: 'f' + Date.now() + Math.random(), type, hp: cf.hp, max: cf.hp, x: 300, y: cf.fly ? 150 + Math.random() * 50 : Math.random() * 30, atk: 0, hit: 0, dead: 0 }] };
    });
  };

  const mimirAI = (g0: Game, now: number): Game => {
    const cd = { ...g0.cd };
    const fx = g0.fx.slice();
    const foes = g0.foes.map(f => ({ ...f }));
    let hp = g0.hp, shield = g0.shield, wins = g0.wins, banner = g0.banner, mvName: string | null = null;
    const alive = () => foes.filter(f => !f.dead);
    const ready = (k: string) => cd[k] <= now;
    const hit = (f: Foe, dmg: number) => {
      f.hp -= dmg; f.hit = now;
      fx.push({ id: 'n' + now + f.id + dmg, kind: 'num', x: f.x, y: f.y, v: '−' + dmg, t: now, life: 900 });
      if (f.hp <= 0) { f.dead = now; wins++; }
    };
    const say = (t: string, m: string) => { banner = { t, at: now }; mvName = m; };
    const had = alive().length;
    if (hp < 45 && ready('heal')) { hp = Math.min(100, hp + 30); cd.heal = now + 9000; fx.push({ id: 'h' + now, kind: 'heal', t: now, life: 1200 }); say('Soin stellaire', 'Zen'); }
    else if (had && (alive().some(f => f.type === 'dragon') || alive().filter(f => f.x <= CREATURES[f.type].range + 4).length >= 2) && ready('shield')) { shield = now + 3500; cd.shield = now + 11000; say('Bouclier d’étoiles', 'Méditation'); }
    else if (had >= 3 && ready('wave')) { cd.wave = now + 7000; fx.push({ id: 'w' + now, kind: 'wave', t: now, life: 900 }); alive().forEach(f => hit(f, 30)); say('Onde cosmique', 'Pulsation'); }
    else if (alive().some(f => f.type !== 'mage') && ready('rain')) { const t = alive().sort((a, b) => b.hp - a.hp)[0]; cd.rain = now + 8000; fx.push({ id: 'r' + now, kind: 'rain', x: t.x, y: t.y, t: now, life: 1100 }); hit(t, 60); say('Pluie d’étoiles', 'Super-héros'); }
    else if (had && ready('zap')) { const t = alive().sort((a, b) => a.x - b.x)[0]; cd.zap = now + 1100; fx.push({ id: 'z' + now, kind: 'zap', x: t.x, y: t.y, t: now, life: 360 }); hit(t, 22); mvName = 'Boxe'; }
    if (had && !alive().length) say('Victoire de Mìmir !', 'Victoire');
    let mv = g0.mv;
    if (mvName) mv = moveIndex(mvName);
    return { ...g0, cd, fx, foes, hp, shield, wins, banner, mv };
  };

  const now = Date.now();
  const g2 = g;
  return (
    <Screen scroll pad={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: top + 6 }}>
        <IconBtn name="back" onPress={() => navigation.goBack()} />
        <Text style={{ flex: 1, fontFamily: F.heading, fontSize: 28 }}>Arène</Text>
        <Tag kind="accent">{g2 ? g2.wins : 0} vaincus</Tag>
        <Btn kind="ghost" title="Rejouer" height={36} fontSize={13} onPress={start} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingHorizontal: 18 }}>
        <Text style={{ fontSize: 12.5, fontWeight: '700' }}>Mìmir</Text>
        <View style={{ flex: 1 }}><Bar pct={g2 ? g2.hp : 100} h={10} fgC={g2 && g2.hp < 40 ? C.accent : C.g600} /></View>
        <Text style={{ fontSize: 12.5, fontWeight: '700', width: 52, textAlign: 'right' }}>{g2 ? Math.round(g2.hp) : 100} PV</Text>
      </View>
      {/* champ de bataille */}
      <View style={{ marginHorizontal: 18, marginTop: 12, height: 380, borderRadius: 28, backgroundColor: C.g100, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', right: -60, top: -70, width: 200, height: 200, borderRadius: 100, backgroundColor: C.g200 }} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 44, backgroundColor: C.g300 }} />
        {g2 && g2.shield > now ? (
          <View style={{ position: 'absolute', left: MIM_X - 22, bottom: MIM_Y - 16, width: 130, height: 130, borderRadius: 65, backgroundColor: C.g200, borderWidth: 4, borderColor: C.g500, opacity: 0.7 }} />
        ) : null}
        {g2 ? <View style={{ position: 'absolute', left: MIM_X, bottom: MIM_Y, width: 86 }}><BuddyMove size={86} move={MOVES[g2.mv] || MOVES[0]} /></View> : null}
        {(g2?.foes || []).map(f => {
          const cf = CREATURES[f.type];
          return (
            <View key={f.id} style={{ position: 'absolute', left: f.x, bottom: MIM_Y + f.y, width: cf.size, alignItems: 'center', gap: 4, opacity: f.dead ? 0.4 : 1 }}>
              <View style={{ width: 44, height: 6, borderRadius: 3, backgroundColor: C.n300, overflow: 'hidden' }}>
                <View style={{ width: `${Math.max(0, (f.hp / f.max) * 100)}%`, height: '100%', backgroundColor: C.accent }} />
              </View>
              <Creature type={f.type} size={cf.size} />
            </View>
          );
        })}
        {(g2?.fx || []).map(e => {
          const age = now - e.t;
          const op = 1 - age / e.life;
          if (e.kind === 'num' || e.kind === 'dmg' || e.kind === 'block')
            return <Text key={e.id} style={{ position: 'absolute', left: (e.x || MIM_X) + 14, bottom: MIM_Y + (e.y || 60) + 60, fontFamily: F.heading, fontSize: 18, color: C.a700, opacity: op }}>{e.v || 'Bloqué'}</Text>;
          if (e.kind === 'atk')
            return <View key={e.id} style={{ position: 'absolute', left: MIM_X + 50, bottom: MIM_Y + 40, width: e.foe === 'dragon' ? 54 : 34, height: e.foe === 'dragon' ? 54 : 34, borderRadius: 27, backgroundColor: e.foe === 'dragon' ? C.a500 : e.foe === 'mage' ? C.g300 : C.n400, opacity: op }} />;
          if (e.kind === 'wave')
            return <View key={e.id} style={{ position: 'absolute', left: MIM_X + 13, bottom: MIM_Y + 13, width: 60, height: 60, borderRadius: 30, borderWidth: 6, borderColor: C.accent, opacity: op }} />;
          if (e.kind === 'zap')
            return <View key={e.id} style={{ position: 'absolute', left: (e.x || 0) + 26, bottom: MIM_Y + (e.y || 0) + 34, width: 5, height: 60, borderRadius: 3, backgroundColor: C.accent, opacity: op }} />;
          if (e.kind === 'heal')
            return <Text key={e.id} style={{ position: 'absolute', left: MIM_X + 30, bottom: MIM_Y + 60, fontFamily: F.heading, fontSize: 24, color: C.g700, opacity: op }}>+ +</Text>;
          return null;
        })}
        {g2 && now - g2.banner.at < 1700 ? (
          <View style={{ position: 'absolute', left: 0, right: 0, top: 14, alignItems: 'center' }}>
            <View style={{ backgroundColor: C.text, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ color: C.bg, fontFamily: F.heading, fontSize: 17 }}>{g2.banner.t}</Text>
            </View>
          </View>
        ) : null}
      </View>
      <Text style={{ marginTop: 14, paddingHorizontal: 18, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: C.n700 }}>Invoquer une créature</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 18, marginTop: 8 }}>
        {['mage', 'knight', 'dragon'].map(t => {
          const cf = CREATURES[t];
          return (
            <TouchableOpacity key={t} onPress={summon(t)} accessibilityRole="button" accessibilityLabel={'Invoquer ' + cf.name} style={{ flex: 1, height: 86, borderRadius: 22, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
              <View style={{ height: 44, justifyContent: 'flex-end' }}><Creature type={t} size={40} /></View>
              <Text style={{ fontWeight: '700', fontSize: 13, fontFamily: F.bodyBold }}>{cf.name}</Text>
              <Text style={{ fontSize: 11, color: C.n700 }}>{cf.hp} PV</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={{ paddingHorizontal: 18, marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
        <Text style={{ fontSize: 11.5, color: C.n700, marginRight: 2 }}>Pouvoirs de Mìmir :</Text>
        {['Éclair', 'Pluie d’étoiles', 'Onde', 'Bouclier', 'Soin'].map((label, i) => {
          const keys = ['zap', 'rain', 'wave', 'shield', 'heal'];
          const rd = !g2 || g2.cd[keys[i]] <= Date.now();
          return <View key={label} style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, backgroundColor: rd ? C.a200 : C.n200 }}><Text style={{ fontSize: 11.5, fontWeight: '700', color: rd ? C.a800 : C.n600 }}>{label}</Text></View>;
        })}
      </View>
      <View style={{ paddingHorizontal: 18, marginTop: 10, marginBottom: 40 }}>
        <Btn kind="primary" title="Voir les animations de Mìmir" height={48} fontSize={13} onPress={() => navigation.navigate('Moves')} />
      </View>
    </Screen>
  );
}

/* ─────────── galerie des animations (toutes celles de MOVES, dont les réactions à la secousse) ─────────── */
/* Vignette : image FIXE (aucune boucle d'animation, aucun abonnement à l'horloge) ; seule la vignette sélectionnée s'anime.
   Mémoïsée : choisir une animation ne re-rend que l'ancienne et la nouvelle sélection. */
const Thumb = React.memo(function Thumb({ i, sel, w, onPick }: { i: number; sel: boolean; w: number; onPick: (i: number) => void }) {
  const m = MOVES[i];
  return (
    <TouchableOpacity onPress={() => onPick(i)} accessibilityRole="button" accessibilityLabel={'Animation ' + m.n} accessibilityState={{ selected: sel }}
      style={{ width: w, height: 96, borderRadius: 20, backgroundColor: sel ? C.a200 : C.surface, alignItems: 'center', justifyContent: 'flex-end', gap: 6, padding: 6, overflow: 'hidden' }}>
      <View style={{ height: 58, justifyContent: 'flex-end' }}><BuddyMove size={58} move={m} fit still={!sel} /></View>
      <Text style={{ fontSize: 10, fontWeight: '700', textAlign: 'center' }}>{m.n}</Text>
    </TouchableOpacity>
  );
});
const MOVE_IDX = MOVES.map((_, i) => i);
const GAP = 8, PAD = 18, COLS = 4;

export function Moves({ navigation }: NativeStackScreenProps<RootStackParamList, 'Moves'>) {
  const [pick, setPick] = useState(1);
  const focused = useIsFocused();
  const top = useTopPad(6);
  const { width } = useWindowDimensions();
  const cell = Math.floor((width - PAD * 2 - GAP * (COLS - 1)) / COLS);
  const onPick = useCallback((i: number) => setPick(i), []);
  const renderItem = useCallback(({ item }: { item: number }) => <Thumb i={item} sel={item === pick} w={cell} onPick={onPick} />, [pick, cell, onPick]);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: top }}>
        <IconBtn name="back" onPress={() => navigation.goBack()} />
        <Text style={{ fontFamily: F.heading, fontSize: 28 }}>{MOVES.length} animations</Text>
      </View>
      <View style={{ marginHorizontal: 18, marginTop: 12, height: 170, zIndex: 2, borderRadius: 28, backgroundColor: C.a100, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 18 }}>
        <View style={{ width: 138, height: 138, borderRadius: 69, backgroundColor: C.bg, alignItems: 'flex-end', justifyContent: 'flex-end', paddingBottom: 14, overflow: 'visible' }}>
          <ShakeBuddy size={112} move={MOVES[pick]} enabled={focused} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Tag kind="accent">{pick + 1} / {MOVES.length}</Tag>
          <Text style={{ fontFamily: F.heading, fontSize: 22, lineHeight: 24 }}>{MOVES[pick].n}</Text>
          {MOVES[pick].shake ? <Tag kind="accent2">Réaction à la secousse</Tag> : null}
          <Text style={{ fontSize: 11.5, color: C.n700 }}>Secouez le téléphone : une réaction au hasard.</Text>
        </View>
      </View>
      {/* grille virtualisée : seules les vignettes proches de l'écran sont montées */}
      <FlatList
        data={MOVE_IDX}
        keyExtractor={i => String(i)}
        renderItem={renderItem}
        extraData={pick}
        numColumns={COLS}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ padding: PAD, paddingTop: 12, gap: GAP }}
        initialNumToRender={16}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews
      />
    </View>
  );
}
