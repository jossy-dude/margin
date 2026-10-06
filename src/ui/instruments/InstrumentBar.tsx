import React, { useEffect, useMemo, useRef } from 'react';
import Svg, { Circle, G, Line, Path, Rect, Text as SText } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { FONT } from '../../tokens/theme';
import { instrument } from './catalogue';
import { resolveInk, twoInks, type Inks } from './ink';
import { HBAND, type InstrumentId, type Shape } from './types';

const APath = Animated.createAnimatedComponent(Path);

/** How long a machine takes to change identity: 240 ms, ease-out cubic.
 *
 *  WHY: the one moment the pixels actually jump is the period boundary — the bar goes from "0:00,
 *  class over" to "47:00, next class, all of it still ahead", which is a different set of shapes, not
 *  the same shapes at a new value. Without something, the swap reads as a glitch.
 *  WHY 240: below ~150 ms two unrelated drawings read as one flicker rather than as a change; above
 *  ~300 ms the new reading is delayed behind motion, and the reading is the point. Ease-out puts
 *  most of the movement in the first third, so the new machine has settled before the hand leaves the
 *  screen. Under reduce-motion it is instant: the information is the deliverable, not the transition. */
export const ENTER_MS = 240;

/** One instrument. `p` is 0..1 REMAINING, from real clock time — see `time.ts`. */
export function InstrumentBar({ id, p, total, left, enter, ink, slab, acc, warn, late, w, label }: {
  id: string;
  /** 0..1 remaining, from real clock time (`activePeriod`). */
  p: number;
  /** the active period's real length and real remainder, in ms. The odometer PRINTS these, and the
   *  dial and the gauge glass label their scales in real minutes, so a 45-minute seminar prints
   *  45:00 — never the 50:00 the reference assumed. */
  total: number;
  left: number;
  enter: SharedValue<number>;
  ink: string; slab: string; acc: string; warn: string; late: boolean;
  w: number;
  label?: string;
}) {
  const def = instrument(id);
  const inks = useMemo<Inks>(() => twoInks(ink, slab, acc, warn), [ink, slab, acc, warn]);
  const shapes = useMemo(() => (def ? def.build({ p, w, total, left, late }) : []), [def, p, w, total, left, late]);
  const { plain, runs } = useMemo(() => {
    const a: Shape[] = [], b: Shape[] = [];
    for (const s of shapes) (s.t === 'run' ? b : a).push(s);
    return { plain: a, runs: b as Extract<Shape, { t: 'run' }>[] };
  }, [shapes]);
  const fade = useAnimatedStyle(() => ({ opacity: enter.value }));

  // width and height ARE the viewBox, one user unit to one pixel. There is no preserveAspectRatio
  // override to get wrong, which is the whole of the "flattened every disc into an oval" fix.
  return (
    <Animated.View style={[{ width: w, height: HBAND }, fade]}>
      <Svg width={w} height={HBAND} viewBox={`0 0 ${w} ${HBAND}`} accessibilityRole="image" accessibilityLabel={label}>
        {plain.map((s, i) => <Node key={i} s={s} k={inks} />)}
        {runs.map((s, i) => <Run key={i} s={s} k={inks} enter={enter} />)}
      </Svg>
    </Animated.View>
  );
}

/** A `run`: the whole line as the resting draw, then the live part as a dash window slid along it.
 *  `strokeDashoffset` is a plain number, so this is the only part of the system that can move on the
 *  UI thread with no React render — which is the entire reason the `run` primitive exists. */
function Run({ s, k, enter }: { s: Extract<Shape, { t: 'run' }>; k: Inks; enter: SharedValue<number> }) {
  const colour = resolveInk(s.ink, k);
  const rest = <Path d={s.d} fill="none" stroke={k.rest} strokeWidth={s.sw} strokeOpacity={0.5} opacity={s.op} />;
  const ap = useAnimatedProps(() => ({ strokeDashoffset: s.len * (1 - enter.value) }));
  // nothing to reveal, so nothing to draw: `dasharray="0 0"` means SOLID, which would leave a dot
  // at the start of the groove of a machine that has run out. The hook still runs, in order.
  return <>{rest}{s.len < 0.5 ? null : <APath d={s.d} fill="none" stroke={colour} strokeWidth={s.sw} opacity={s.op} strokeLinecap={s.cap ?? 'butt'} strokeLinejoin="round" strokeDasharray={`${s.len} ${s.len}`} animatedProps={ap} />}</>;
}

function Node({ s, k }: { s: Shape; k: Inks }) {
  if (s.t === 'g') return <G transform={s.tf}>{s.ch.map((q, i) => <Node key={i} s={q} k={k} />)}</G>;
  const c = resolveInk(s.ink, k);
  const op = s.op;
  switch (s.t) {
    case 'p':
      return <Path d={s.d} stroke={c} strokeWidth={s.sw ?? 1.5} fill={s.f ? c : 'none'} opacity={op} strokeDasharray={s.dash} strokeLinecap={s.cap ?? 'butt'} strokeLinejoin="round" />;
    case 'r':
      return <Rect x={s.x} y={s.y} width={Math.max(0, s.w)} height={Math.max(0, s.h)} rx={s.rx} fill={s.f ? c : 'none'} stroke={s.f ? 'none' : c} strokeWidth={s.sw ?? 1.4} opacity={op} />;
    case 'c':
      return <Circle cx={s.cx} cy={s.cy} r={s.r} fill={s.f ? c : 'none'} stroke={s.f ? 'none' : c} strokeWidth={s.sw ?? 1.4} opacity={op} />;
    case 'l':
      return <Line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={c} strokeWidth={s.sw ?? 1.3} opacity={op} strokeDasharray={s.dash} strokeLinecap={s.cap ?? 'butt'} />;
    case 'x':
      // No `dominantBaseline`: its support in react-native-svg's Android text path is uneven and
      // there is no device here to check it against, so `y` is the text's CENTRE and the baseline
      // offset is applied by hand — the same arithmetic the offline renderer uses, which is the only
      // reason the PNGs in /tmp/render can be trusted as a preview of the phone.
      return <SText x={s.x} y={s.y + (s.size ?? 8) * 0.35} fill={c} opacity={op} fontSize={s.size ?? 8} fontFamily={FONT.type} textAnchor={s.anchor ?? 'start'}>{s.s}</SText>;
  }
}

/**
 * The `enter` value: 1 at rest, and re-run only when the PERIOD IDENTITY changes — not on every
 * second. Nothing here is keyed on the clock, so a bar that is on screen is not running an animation
 * per second; see the report for why a 50-minute period needs no per-frame work at all.
 */
export function useEnter(key: string, reduce: boolean): SharedValue<number> {
  const v = useSharedValue(1);
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (prev.current !== null && prev.current !== key) v.value = reduce ? 1 : withTiming(1, { duration: ENTER_MS, easing: Easing.out(Easing.cubic) });
    prev.current = key;
  }, [key, reduce, v]);
  return v;
}

/** Narrow a stored setting to a catalogue id, or undefined when it names one of the app's own day bars. */
export const asInstrument = (id: string): InstrumentId | undefined => (instrument(id) ? (id as InstrumentId) : undefined);