/* Art vectoriel MiMai : logo animé, Mìmir (63 mouvements), créatures de l'arène.
   Portage de disagne/mimai-core.js en composants react-native-svg.
   Les données/maths des mouvements (pivots, primitives, MOVES) vivent dans motion.ts (pur, testé sous Node) ;
   ici : le moteur d'animation (matrices numériques + horloge partagée) et le rendu. */
import React, { useMemo, useRef, useEffect, useState, useContext, createContext } from 'react';
import { AppState, View } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import Svg, { G, Path, Circle, Rect, ClipPath, Defs, Text as SvgText } from 'react-native-svg';
import { C } from './theme';
import { useShake } from './useShake';
import {
  PIV, VB, ROOM, MOVES, moveIndex, parseSpec, compileMotion, phaseAt, stillTime, createTicker, spiralPath, FX_SPECS, SHAKE_REACTIONS, pickReaction, moveOnceMs,
  type MoveSpec, type Pt, type PivotKey, type Frame,
} from './motion';

export { MOVES, moveIndex };
export type { MoveSpec };

const L = 'M304 300Q304 291 312 296.5L559 466.3Q567 472 565.5 482L550 584L522 563L402 478L402 758L304 690Z';
const A = 'M625 452L676 556L676 762L625 846L574 762L574 556Z';
const S = 'M625 252Q645 308 696 328Q645 348 625 404Q605 348 554 328Q605 308 625 252Z';

export type Pal = { body: string; star: string; eye: string };
export const PAL: Pal = { body: C.text, star: C.accent, eye: C.text };

/* ───────────────────────── moteur d'animation ───────────────────────── */
/* Aucune chaîne `transform`, aucun Animated : chaque groupe animé reçoit directement une MATRICE numérique [a b c d e f]
   (+ opacité) calculée par motion.ts (compileMotion) et poussée via G.setNativeProps({ matrix, opacity }).
   - le parseur PEG de react-native-svg (extractTransform) n'est jamais appelé par image (G.setNativeProps le saute si `matrix` est fourni) ;
   - ne JAMAIS envoyer la propriété `transform` (chaîne) au natif : Android la refuse (« String cannot be cast to ReadableArray ») ;
   - UNE seule boucle requestAnimationFrame pour toute l'app (createTicker), en pause quand l'app passe en arrière-plan ;
   - un <G> par spec (matrice composée de tous ses canaux + opacité) au lieu d'une chaîne de <G> imbriqués ;
   - aucun setState / re-render React par image. */
let appSub: { remove: () => void } | null = null;
const ticker = createTicker(
  { raf: cb => requestAnimationFrame(cb), caf: h => cancelAnimationFrame(h as number) },
  {
    onBusy: () => {
      if (appSub) return;
      const apply = (s: string) => ticker.setPaused(s === 'background' || s === 'inactive');
      apply(AppState.currentState);
      appSub = AppState.addEventListener('change', apply);
    },
    onIdle: () => { appSub?.remove(); appSub = null; },
  },
);

/* « Mìmir est-il visible ? » : l'écran qui le porte est au premier plan (toute la chaîne de navigateurs parents).
   Hors navigation (ex. Mark dans l'onboarding) : toujours vrai. `enabled=false` : aucun abonnement. */
type Nav = NonNullable<React.ContextType<typeof NavigationContext>>;
const chainFocused = (n: Nav | undefined) => {
  for (let c: Nav | undefined = n; c; c = c.getParent?.() as Nav | undefined) if (!c.isFocused()) return false;
  return true;
};
function useScreenFocused(enabled: boolean): boolean {
  const nav = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => chainFocused(nav));
  useEffect(() => {
    if (!enabled || !nav) return;
    const upd = () => setFocused(chainFocused(nav));
    const offs: (() => void)[] = [];
    for (let c: Nav | undefined = nav; c; c = c.getParent?.() as Nav | undefined) {
      offs.push(c.addListener('focus', upd), c.addListener('blur', upd));
    }
    upd();
    return () => offs.forEach(o => o());
  }, [enabled, nav]);
  return focused;
}

/* contexte de mouvement d'un personnage : actif (visible) ? cadence max ? image fixe (t) ? */
type MotionCtxV = { active: boolean; minDt: number; still?: number };
const MotionCtx = createContext<MotionCtxV>({ active: true, minDt: 0 });
function useMotionCtx(size: number, opts: { still?: number; fps?: number; live: boolean }): MotionCtxV {
  const focused = useScreenFocused(opts.live);
  const minDt = opts.fps ? Math.round(1000 / opts.fps) : size <= 70 ? 33 : 0; // petits sprites : ~30 images/s suffisent
  const { still } = opts;
  return useMemo(() => ({ active: focused, minDt, still }), [focused, minDt, still]);
}

type AnimProps = {
  spec?: string; pivotKey?: PivotKey; pivot?: Pt;
  /** lecture unique (réactions) : n cycles puis arrêt ; sinon boucle infinie */
  once?: boolean; rep?: number;
  children: React.ReactNode;
};
type NativeG = { setNativeProps: (p: object) => void };
const sameFrame = (a: Frame, b: Frame) => {
  if (a.op !== b.op) return false;
  if (!a.m || !b.m) return a.m === b.m;
  for (let i = 0; i < 6; i++) if (a.m[i] !== b.m[i]) return false;
  return true;
};

/* Un spec « prim durée délai [n] » = UN <G> dont la matrice compose tous les canaux (canal 0 = le plus externe, comme
   `transform: A B` en CSS). Le temps normalisé t∈[0,1] vient du temps écoulé (délai appliqué une seule fois), l'easing
   ease-in-out de chaque intervalle de keyframes est cuit dans les clés (expandKeys). */
function AnimG({ spec, pivotKey, pivot, once, rep, children }: AnimProps) {
  const { active, minDt, still } = useContext(MotionCtx);
  const parsed = useMemo(() => parseSpec(spec), [spec]);
  const px = pivot?.x, py = pivot?.y;
  const comp = useMemo(() => {
    if (!parsed) return null;
    const pv: Pt = px !== undefined && py !== undefined ? { x: px, y: py } : PIV[pivotKey || 'fig'];
    return compileMotion(parsed, pv);
  }, [parsed, pivotKey, px, py]);
  const count = parsed ? (parsed.n ?? rep ?? 1) : 1;
  const init = useMemo(() => (comp ? comp.at(still ?? 0) : null), [comp, still]);
  const ref = useRef<NativeG | null>(null);
  const elapsed = useRef(0);
  const shown = useRef<Frame | null>(null);

  const push = (fr: Frame) => {
    if (shown.current && sameFrame(shown.current, fr)) return;
    shown.current = fr;
    const p: { matrix?: number[]; opacity?: number } = {};
    if (fr.m) p.matrix = fr.m;
    if (fr.op !== null) p.opacity = fr.op;
    ref.current?.setNativeProps(p);
  };

  /* nouveau spec / nouveau mode : on repart de zéro et on réaffiche l'état initial */
  useEffect(() => {
    elapsed.current = 0;
    shown.current = null;
    if (init) push(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp, once, count, still]);

  useEffect(() => {
    if (!comp || comp.constant || !active || still !== undefined) return;
    return ticker.add(minDt, dt => {
      elapsed.current += dt;
      const { t, done } = phaseAt(comp.delay, comp.dur, !!once, count, elapsed.current);
      push(comp.at(t));
      return done;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp, once, count, active, minDt, still]);

  if (!comp || !init) return <G>{children}</G>;
  return <G ref={ref as unknown as React.Ref<G<object>>} transform={init.m ?? undefined} opacity={init.op ?? undefined}>{children}</G>;
}

/* ───────────────────────── le personnage Mìmir ───────────────────────── */
function Eyes({ kind, eye, once, rep }: { kind: MoveSpec['eyes']; eye: string; once?: boolean; rep?: number }) {
  const ln = { fill: 'none' as const, stroke: eye, strokeWidth: 6, strokeLinecap: 'round' as const };
  if (kind === 'happy')
    return <>{<Path d="M603 331 Q611 320 619 331" {...ln} />}{<Path d="M631 331 Q639 320 647 331" {...ln} />}</>;
  if (kind === 'closed')
    return <>{<Path d="M603 327 H619" {...ln} />}{<Path d="M631 327 H647" {...ln} />}</>;
  if (kind === 'wink')
    return <>{<Circle cx={611} cy={326} r={9} fill={eye} />}{<Path d="M631 329 Q639 320 647 329" {...ln} />}</>;
  if (kind === 'dizzy')
    /* yeux en spirale : chacun tourne autour de son propre centre */
    return (
      <>
        {[611, 639].map(cx => (
          <AnimG key={cx} spec="eSpin .6 0 6" pivot={{ x: cx, y: 326 }} once={once} rep={rep}>
            <Path d={spiralPath(cx, 326, 11)} {...ln} strokeWidth={3.5} />
          </AnimG>
        ))}
      </>
    );
  const dy = kind === 'up' ? -6 : kind === 'down' ? 6 : 0;
  const rr = kind === 'wide' ? 12 : 9;
  return <>{<Circle cx={611} cy={326 + dy} r={rr} fill={eye} />}{<Circle cx={639} cy={326 + dy} r={rr} fill={eye} />}</>;
}

/* effets annexes : étoiles en orbite (étourdi), « Atchoum ! » et gouttelettes (éternuement) */
function Fx({ kind, pal, once, rep }: { kind: NonNullable<MoveSpec['fx']>; pal: Pal; once?: boolean; rep: number }) {
  const specs = FX_SPECS[kind](rep);
  const ctl = { once, rep };
  if (kind === 'dizzy')
    return (
      <>
        {specs.map((s, i) => (
          <AnimG key={i} spec={s} {...ctl}>
            <G transform="translate(625 205) scale(.17) translate(-625 -328)"><Path d={S} fill={pal.star} /></G>
          </AnimG>
        ))}
      </>
    );
  return (
    <>
      <AnimG spec={specs[0]} {...ctl}>
        <SvgText x={738} y={262} fontSize={50} fontWeight="bold" fill={pal.star}>Atchoum !</SvgText>
      </AnimG>
      {[[specs[1], 325], [specs[2], 312], [specs[3], 338]].map(([s, y]) => (
        <AnimG key={s as string} spec={s as string} {...ctl}><Circle cx={735} cy={y as number} r={7} fill={pal.star} /></AnimG>
      ))}
    </>
  );
}

/* size = largeur du personnage ; l'<Svg> est agrandi de ROOM autour du viewBox de base (overflow visible, pointerEvents none)
   pour qu'aucun membre ne soit coupé pendant les mouvements. `fit` : au contraire tout le cadre (marges comprises) tient dans `size`
   (vignettes dans un conteneur qui rogne). */
/* `still` : image fixe (aucune animation, aucun abonnement à l'horloge) — vignettes ; `fps` : cadence maximale. */
export const BuddyMove = React.memo(function BuddyMove({ size, move, pal, once, rep, fit, still, fps }: { size: number; move?: MoveSpec; pal?: Pal; once?: boolean; rep?: number; fit?: boolean; still?: boolean; fps?: number }) {
  const p = pal || PAL;
  const m = move || MOVES[0];
  const bf = m.tone === 'dim' ? C.n400 : m.tone === 'frost' ? C.n500 : p.body;
  const sf = m.tone === 'dim' ? C.a300 : m.tone === 'frost' ? C.g300 : p.star;
  const eyeSpec = m.e || (m.eyes === 'open' || !m.eyes ? 'bBlink 4' : undefined);
  const r = rep ?? m.rep ?? 1;
  const ctl = { once, rep: r };
  const flash = parseSpec(m.h)?.prim === 'hFlash';
  const fw = VB.w + ROOM.l + ROOM.r, fh = VB.h + ROOM.t + ROOM.b;
  const k = fit ? size / fw : size / VB.w;
  const mctx = useMotionCtx(size, { still: still ? stillTime(m) : undefined, fps, live: !still });
  const svg = (
    <MotionCtx.Provider value={mctx}>
    <Svg viewBox={`${VB.x - ROOM.l} ${VB.y - ROOM.t} ${fw} ${fh}`} width={fw * k} height={fh * k}>
      <AnimG spec={m.f} pivotKey={m.fo === 'mid' ? 'figMid' : 'fig'} {...ctl}>
        <AnimG spec={m.l} pivotKey="armL" {...ctl}><Path d={L} fill={bf} /></AnimG>
        <AnimG spec={m.r} pivotKey="armR" {...ctl}>
          <G transform="matrix(-1 0 0 1 1252 0)"><Path d={L} fill={bf} /></G>
        </AnimG>
        <AnimG spec={m.b} pivotKey="fig" {...ctl}><Path d={A} fill={bf} /></AnimG>
        <AnimG spec={flash ? undefined : m.h} pivotKey="head" {...ctl}>
          <G transform="translate(625 318) scale(1.4) translate(-625 -328)">
            <AnimG spec={m.s} pivotKey="star" {...ctl}><Path d={S} fill={sf} /></AnimG>
            {flash ? <AnimG spec={m.h} {...ctl}><Path d={S} fill="#FFFFFF" /></AnimG> : null}
            <AnimG spec={eyeSpec} pivotKey="eyes" {...ctl}><Eyes kind={m.eyes || 'open'} eye={p.eye} {...ctl} /></AnimG>
          </G>
        </AnimG>
        {m.fx ? <Fx kind={m.fx} pal={{ ...p, star: sf }} {...ctl} /> : null}
      </AnimG>
    </Svg>
    </MotionCtx.Provider>
  );
  if (fit) return <View pointerEvents="none" style={{ width: size, height: Math.round(fh * k) }}>{svg}</View>;
  return (
    <View pointerEvents="none" style={{ width: size, height: Math.round((size * VB.h) / VB.w), overflow: 'visible' }}>
      <View style={{ position: 'absolute', left: -ROOM.l * k, top: -ROOM.t * k }}>{svg}</View>
    </View>
  );
});

/* états simples utilisés dans l'app */
export const STATES = { idle: 0, wave: 1, listen: 14, think: 13, happy: 4, sleep: 12 } as const;
export function Buddy({ size, state, pal }: { size: number; state: keyof typeof STATES | number; pal?: Pal }) {
  const idx = typeof state === 'number' ? state : STATES[state];
  return <BuddyMove size={size} move={MOVES[idx]} pal={pal} />;
}

/* Mìmir qui réagit à une secousse du téléphone : animation tirée au hasard parmi SHAKE_REACTIONS, jouée une fois,
   puis retour au mouvement de repos. Remplace <Buddy>/<BuddyMove> là où Mìmir doit être interactif. */
export function ShakeBuddy({ size, state = 'idle', move, pal, enabled = true, fit, onReact }: {
  size: number; state?: keyof typeof STATES | number; move?: MoveSpec; pal?: Pal; enabled?: boolean; fit?: boolean; onReact?: (name: string) => void;
}) {
  const rest = move || MOVES[typeof state === 'number' ? state : STATES[state]];
  const [act, setAct] = useState<{ id: number; m: MoveSpec; rep?: number } | null>(null);
  const last = useRef(-1);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useShake(() => {
    if (busy.current) return;
    const i = pickReaction(last.current);
    last.current = i;
    const rc = SHAKE_REACTIONS[i];
    const m = MOVES[moveIndex(rc.n)];
    busy.current = true;
    setAct({ id: Date.now(), m, rep: rc.rep });
    onReact?.(rc.n);
    timer.current = setTimeout(() => { busy.current = false; setAct(null); }, moveOnceMs(m, rc.rep) + 250);
  }, { enabled });
  return <BuddyMove key={act ? act.id : 'rest'} size={size} move={act ? act.m : rest} pal={pal} fit={fit} once={!!act} rep={act?.rep} />;
}

/* ───────────────────────── logo MiMai ───────────────────────── */
export function Mark({ size, color, starFill, mode }: { size: number; color: string; starFill: string; mode?: 'build' | 'think' }) {
  const mctx = useMotionCtx(size, { live: mode === 'think' });
  return (
    <MotionCtx.Provider value={mctx}>
    <Svg viewBox="300 248 652 602" width={size} height={Math.round((size * 602) / 652)}>
      <AnimG spec={mode === 'think' ? 'mmPulseL 1.5' : undefined}><Path d={L} fill={color} /></AnimG>
      <AnimG spec={mode === 'think' ? 'mmPulseR 1.5 .4' : undefined}>
        <G transform="matrix(-1 0 0 1 1252 0)"><Path d={L} fill={color} /></G>
      </AnimG>
      <AnimG spec={mode === 'think' ? 'mmPulseA 1.5 .2' : undefined}><Path d={A} fill={color} /></AnimG>
      <AnimG spec={mode === 'think' ? 'sFast 1.5' : undefined} pivotKey="star">
        <Path d={S} fill={starFill} />
      </AnimG>
    </Svg>
    </MotionCtx.Provider>
  );
}

/* logo de progression : remplissage vertical selon p ∈ [0,1] */
export function FillMark({ size, p, base, fill, clipId }: { size: number; p: number; base: string; fill: string; clipId: string }) {
  const q = Math.max(0, Math.min(1, p));
  const y = 248 + 602 * (1 - q);
  const h = 602 * q + 2;
  return (
    <Svg viewBox="300 248 652 602" width={size} height={Math.round((size * 602) / 652)}>
      <Defs>
        <ClipPath id={clipId}><Rect x={300} y={y} width={652} height={h} /></ClipPath>
      </Defs>
      <G>
        <Path d={L} fill={base} />
        <G transform="matrix(-1 0 0 1 1252 0)"><Path d={L} fill={base} /></G>
        <Path d={A} fill={base} />
        <Path d={S} fill={base} />
      </G>
      <G clipPath={`url(#${clipId})`}>
        <Path d={L} fill={fill} />
        <G transform="matrix(-1 0 0 1 1252 0)"><Path d={L} fill={fill} /></G>
        <Path d={A} fill={fill} />
        <Path d={S} fill={fill} />
      </G>
    </Svg>
  );
}

/* icône étoile seule (remplace les masques mimai-star.svg) */
export function StarIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg viewBox="605 242 40 172" width={size} height={Math.round((size * 172) / 40)}>
      <Path d={S} fill={color} />
    </Svg>
  );
}

/* ───────────────────────── créatures de l'arène ───────────────────────── */
export type CreatureDef = { id: string; name: string; hp: number; speed: number; range: number; dmg: number; rate: number; size: number; fly: boolean; color: string; boss?: boolean };
export const CREATURES: Record<string, CreatureDef> = {
  mage: { id: 'mage', name: 'Mage', hp: 40, speed: 22, range: 175, dmg: 6, rate: 1.3, size: 60, fly: false, color: C.g600 },
  knight: { id: 'knight', name: 'Chevalier', hp: 70, speed: 14, range: 105, dmg: 9, rate: 1.2, size: 64, fly: false, color: C.n500 },
  dragon: { id: 'dragon', name: 'Dragon', hp: 130, speed: 10, range: 150, dmg: 14, rate: 1.6, size: 84, fly: true, color: C.a700 },
  king: { id: 'king', name: 'Roi Dragon', hp: 650, speed: 6, range: 165, dmg: 24, rate: 2, size: 112, fly: true, color: C.a800, boss: true },
};

export function Creature({ type, size }: { type: string; size: number }) {
  const c = CREATURES[type];
  const vb = type === 'king' ? '480 180 290 280' : '495 180 260 270';
  const eye = C.text;
  const brow = { fill: 'none' as const, stroke: eye, strokeWidth: 7, strokeLinecap: 'round' as const };
  const parts: React.ReactNode[] = [];
  if (type === 'dragon')
    parts.push(
      <Path key="w1" d="M585 305 L505 235 L548 338 Z" fill={C.a500} />,
      <Path key="w2" d="M665 305 L745 235 L702 338 Z" fill={C.a500} />,
      <Path key="t" d="M625 400 Q596 446 552 428" fill="none" stroke={C.a700} strokeWidth={12} strokeLinecap="round" />
    );
  if (type === 'king')
    parts.push(
      <Path key="w1" d="M582 300 L490 210 L540 345 Z" fill={C.a600} />,
      <Path key="w2" d="M668 300 L760 210 L710 345 Z" fill={C.a600} />,
      <Path key="t" d="M625 400 Q590 452 540 432" fill="none" stroke={C.a800} strokeWidth={14} strokeLinecap="round" />
    );
  parts.push(<Path key="b" d={S} fill={c.color} />);
  if (type === 'knight')
    parts.push(
      <Rect key="v" x={588} y={309} width={74} height={30} rx={12} fill={C.n800} />,
      <Rect key="e1" x={600} y={320} width={18} height={7} rx={3} fill={C.a300} />,
      <Rect key="e2" x={632} y={320} width={18} height={7} rx={3} fill={C.a300} />,
      <Path key="p" d="M625 256 Q642 214 668 222" fill="none" stroke={C.a600} strokeWidth={10} strokeLinecap="round" />,
      <Rect key="s" x={700} y={262} width={9} height={128} rx={3} fill={C.n300} />,
      <Rect key="g" x={687} y={368} width={35} height={9} rx={4} fill={C.n700} />
    );
  else if (type === 'king')
    parts.push(
      <Circle key="e1" cx={611} cy={334} r={10} fill={C.a300} />,
      <Circle key="e2" cx={639} cy={334} r={10} fill={C.a300} />,
      <Path key="br" d="M596 312 L620 322 M654 312 L630 322" {...brow} />,
      <Path key="cw" d="M588 262 L598 222 L613 248 L625 210 L637 248 L652 222 L662 262 Z" fill={C.a300} />
    );
  else
    parts.push(
      <Circle key="e1" cx={611} cy={332} r={9} fill={eye} />,
      <Circle key="e2" cx={639} cy={332} r={9} fill={eye} />,
      <Path key="br" d="M598 312 L620 320 M652 312 L630 320" {...brow} />
    );
  if (type === 'mage')
    parts.push(
      <Path key="hat" d="M625 186 L586 270 L664 270 Z" fill={C.g800} />,
      <Path key="hs" d="M625 214 l5 10 l10 1 l-8 7 l3 10 l-10 -6 l-10 6 l3 -10 l-8 -7 l10 -1 z" fill={C.a300} />,
      <Path key="st" d="M704 250 L704 420" fill="none" stroke={C.n800} strokeWidth={8} strokeLinecap="round" />,
      <Circle key="orb" cx={704} cy={242} r={13} fill={C.a300} />
    );
  if (type === 'dragon')
    parts.push(
      <Path key="h1" d="M603 264 L594 232 L616 258 Z" fill={C.a900} />,
      <Path key="h2" d="M647 264 L656 232 L634 258 Z" fill={C.a900} />
    );
  return (
    <Svg viewBox={vb} width={size} height={Math.round((size * 280) / 290)}>
      {parts}
    </Svg>
  );
}
