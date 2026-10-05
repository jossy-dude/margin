import React, { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, Pattern, Rect, Text as SText } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { FONT } from '../tokens/theme';
import { clockCells, fmtClock } from '../domain/time';
import { useNow, useReduceMotion } from './theme-context';
import { FS } from './fit';

export interface BarPeriod { start: number; end: number; label: string; cancelled?: boolean }
export const BAR_KINDS = [{ id: 'spines', n: 'Bookshelf', d: 'one spine per class, the current one fills' }, { id: 'glass', n: 'Sight glass', d: 'the whole day as a filling tube' }, { id: 'trace', n: 'Trace', d: 'a pen line drawn through your classes' }, { id: 'ticker', n: 'Ticker', d: 'a countdown to the next class' }] as const;
export type BarKind = (typeof BAR_KINDS)[number]['id'];
const AR = Animated.createAnimatedComponent(Rect), AP = Animated.createAnimatedComponent(Path);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Four day-progress bars, each answering a different question at a glance:
 * Bookshelf = which class am I in and what's left; Sight glass = how much of the school day is gone;
 * Trace = rhythm of the day (busy vs free); Ticker = how long until the next thing.
 * `ink` is drawn on `bg` (the command-deck slab).
 */
export function DayBar({ kind, periods, now, ink, bg, w, h = 58 }: { kind: BarKind; periods: BarPeriod[]; now: number; ink: string; bg: string; w: number; h?: number }) {
  const reduce = useReduceMotion(), t0 = periods[0]?.start ?? 0, t1 = periods[periods.length - 1]?.end ?? 1, span = Math.max(1, t1 - t0), day = clamp01((now - t0) / span);
  const dayP = useSharedValue(reduce ? day : 0);
  useEffect(() => { dayP.value = reduce ? day : withTiming(day, { duration: 900, easing: Easing.out(Easing.cubic) }); }, [day, reduce, dayP]);
  const X = (ms: number) => ((ms - t0) / span) * (w - 4) + 2;
  if (!periods.length) return <View style={{ height: h }} />;
  if (kind === 'ticker') return <Ticker periods={periods} ink={ink} bg={bg} w={w} h={h} day={day} />;
  if (kind === 'glass') return <Glass periods={periods} ink={ink} bg={bg} w={w} h={h} X={X} dayP={dayP} />;
  if (kind === 'trace') return <Trace periods={periods} now={now} ink={ink} w={w} h={h} X={X} dayP={dayP} day={day} />;
  return <Spines periods={periods} now={now} ink={ink} bg={bg} w={w} h={h} X={X} />;
}
function Spines({ periods, now, ink, w, h, X, bg }: { periods: BarPeriod[]; now: number; ink: string; bg: string; w: number; h: number; X: (m: number) => number }) {
  const reduce = useReduceMotion();
  return (
    <Svg width={w} height={h}>
      <Defs><Pattern id="hat" width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><Line x1={0} y1={0} x2={0} y2={5} stroke={ink} strokeWidth={1} strokeOpacity={0.55} /></Pattern></Defs>
      <Line x1={2} y1={h - 3} x2={w - 2} y2={h - 3} stroke={ink} strokeWidth={1.6} />
      {periods.map((p, i) => {
        const x = X(p.start) + 1.5, wd = Math.max(8, X(p.end) - X(p.start) - 3), past = now >= p.end, cur = now >= p.start && now < p.end, f = cur ? clamp01((now - p.start) / (p.end - p.start)) : past ? 1 : 0, top = 8 + ((i * 7) % 9) * 0.6, bh = h - 3 - top;
        return (
          <G key={i}>
            <Rect x={x} y={top} width={wd} height={bh} rx={2} fill={p.cancelled ? 'url(#hat)' : 'none'} stroke={ink} strokeWidth={cur ? 2 : 1.3} strokeOpacity={1} />
            {!p.cancelled && f > 0 && <AnimatedFill x={x} yb={top + bh} width={wd} h={bh * f} ink={ink} animate={!reduce} />}
            {cur && <Path d={`M${x + wd / 2 - 5} ${top - 1}h10v9l-5 -4l-5 4z`} fill={ink} />}
            <SText x={x + wd / 2} y={top + bh - 6} fontSize={11} fontFamily={FONT.type} fill={f > 0.5 && !p.cancelled ? bg : ink} textAnchor="middle">{p.label.slice(0, 1)}</SText>
          </G>
        );
      })}
    </Svg>
  );
}
function AnimatedFill({ x, yb, width, h, ink, animate }: { x: number; yb: number; width: number; h: number; ink: string; animate: boolean }) {
  const hh = useSharedValue(animate ? 0 : h);
  useEffect(() => { hh.value = animate ? withTiming(h, { duration: 800, easing: Easing.out(Easing.cubic) }) : h; }, [h, animate, hh]);
  const ap = useAnimatedProps(() => ({ y: yb - hh.value, height: hh.value }));
  return <AR x={x + 1.2} width={width - 2.4} fill={ink} fillOpacity={0.9} rx={1.2} animatedProps={ap} />;
}
function Glass({ periods, ink, bg, w, h, X, dayP }: { periods: BarPeriod[]; ink: string; bg: string; w: number; h: number; X: (m: number) => number; dayP: { value: number } }) {
  const tubeY = h / 2 - 11, ap = useAnimatedProps(() => ({ width: Math.max(0, dayP.value * (w - 10)) }));
  return (
    <Svg width={w} height={h}>
      <Defs><Pattern id="liq" width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><Line x1={0} y1={0} x2={0} y2={6} stroke={bg} strokeWidth={1} strokeOpacity={0.55} /></Pattern></Defs>
      <Rect x={2} y={tubeY} width={w - 4} height={22} rx={11} fill="none" stroke={ink} strokeWidth={1.8} />
      <AR x={5} y={tubeY + 3} height={16} rx={8} fill={ink} animatedProps={ap} />
      <AR x={5} y={tubeY + 3} height={16} rx={8} fill="url(#liq)" animatedProps={ap} />
      {periods.map((p, i) => <G key={i}><Line x1={X(p.start)} x2={X(p.start)} y1={tubeY + 24} y2={tubeY + 31} stroke={ink} strokeWidth={1.3} /><Line x1={X(p.end)} x2={X(p.end)} y1={tubeY + 24} y2={tubeY + 31} stroke={ink} strokeWidth={1.3} strokeOpacity={0.6} />{p.cancelled && <Line x1={X(p.start)} x2={X(p.end)} y1={tubeY + 28} y2={tubeY + 28} stroke={ink} strokeWidth={1} strokeDasharray="2 2" />}</G>)}
      {[0.25, 0.5, 0.75].map((f) => <Line key={f} x1={2 + f * (w - 4)} x2={2 + f * (w - 4)} y1={tubeY - 6} y2={tubeY - 1} stroke={ink} strokeWidth={1} strokeOpacity={0.6} />)}
    </Svg>
  );
}
function Trace({ periods, now, ink, w, h, X, dayP, day }: { periods: BarPeriod[]; now: number; ink: string; w: number; h: number; X: (m: number) => number; dayP: { value: number }; day: number }) {
  const base = h - 14, d = useMemo(() => {
    let s = `M2 ${base}`;
    periods.forEach((p, i) => { const a = X(p.start), b = X(p.end), top = p.cancelled ? base - 6 : 12 + (i % 3) * 3; s += `L${a} ${base}Q${a + 4} ${top} ${(a + b) / 2} ${top}T${b} ${base}`; });
    return s + `L${w - 2} ${base}`;
  }, [periods, X, w, base]);
  const len = w * 2.4, ap = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - dayP.value) }));
  const px = 2 + day * (w - 4), cur = periods.find((p) => now >= p.start && now < p.end);
  return (
    <Svg width={w} height={h}>
      <Path d={d} stroke={ink} strokeOpacity={0.35} strokeWidth={1.4} strokeDasharray="3 4" fill="none" strokeLinecap="round" />
      <AP d={d} stroke={ink} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${len} ${len}`} animatedProps={ap} />
      <Circle cx={px} cy={cur ? 16 : base} r={4.2} fill={ink} />
      <Line x1={2} x2={w - 2} y1={base + 5} y2={base + 5} stroke={ink} strokeWidth={1} strokeOpacity={0.5} />
    </Svg>
  );
}
function Ticker({ periods, ink, bg, w, h, day }: { periods: BarPeriod[]; ink: string; bg: string; w: number; h: number; day: number }) {
  // Its own wall-clock second tick: only this digit row re-renders each second, never the screen
  // that hosts the bar (which can then tick on minute boundaries like everything else).
  const t = useNow(1000);
  const next = periods.find((p) => p.start > t && !p.cancelled), cur = periods.find((p) => t >= p.start && t < p.end), target = cur ? cur.end : next?.start ?? null, secs = target ? Math.max(0, (target - t) / 1000) : 0;
  const txt = target ? fmtClock(secs) : '--:--', cell = Math.min(34, (w - 40) / txt.length), cells = useMemo(() => clockCells(txt), [txt]);
  return (
    <View style={{ height: h, justifyContent: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
        {cells.map((c) => <View key={c.key} style={{ width: c.colon ? cell * 0.45 : cell, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: c.colon ? 0 : 1.4, borderColor: ink, borderRadius: 4, backgroundColor: c.colon ? 'transparent' : bg }}><SvgText ch={c.ch} ink={ink} size={26} /></View>)}
        <SvgText ch={cur ? ' left in class' : target ? ' until next' : ' done today'} ink={ink} size={15} small />
      </View>
      <View style={{ height: 3, marginTop: 6, backgroundColor: ink + '33', borderRadius: 2 }}><View style={{ width: `${day * 100}%`, height: 3, backgroundColor: ink, borderRadius: 2 }} /></View>
    </View>
  );
}
const SvgText = ({ ch, ink, size, small }: { ch: string; ink: string; size: number; small?: boolean }) => <Text maxFontSizeMultiplier={small ? undefined : FS} style={{ color: ink, fontFamily: small ? FONT.serif : FONT.type, fontSize: size, fontVariant: ['tabular-nums'], marginBottom: small ? 2 : 0 }}>{ch}</Text>;
