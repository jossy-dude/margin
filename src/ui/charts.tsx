import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SText } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useReduceMotion, useTheme } from './theme-context';
import { FONT, hexA } from '../tokens/theme';
import { level } from '../domain/analytics';

const AR = Animated.createAnimatedComponent(Rect), AC = Animated.createAnimatedComponent(Circle), AP = Animated.createAnimatedComponent(Path);
const shade = (ink: string, l: number) => hexA(ink, [0.07, 0.25, 0.45, 0.7, 0.95][l] ?? 0.07);

/** weeks × 7 grid (GitHub-style). `values` is oldest→newest and is padded at the front so the last column ends on the last cell. */
export function Heatmap({ values, w, accent, labels = ['M', '', 'W', '', 'F', '', ''], startWd, unit = '' }: { values: number[]; w: number; accent?: string; labels?: string[]; startWd: number; unit?: string }) {
  const { c } = useTheme(), col = accent ?? c.acc, pad = [...new Array(startWd).fill(-1), ...values], weeks = Math.ceil(pad.length / 7), cell = Math.min(24, (w - 18) / weeks - 3), max = Math.max(1, ...values), h = 7 * (cell + 3) + 4;
  return (
    <Svg width={w} height={h} accessibilityRole="image" accessibilityLabel={`Heatmap, ${values.reduce((a, b) => a + b, 0)}${unit} in total`}>
      {labels.map((l, i) => <SText key={i} x={0} y={i * (cell + 3) + cell * 0.8} fontSize={11} fontFamily={FONT.type} fill={c.mut}>{l}</SText>)}
      {pad.map((v, i) => { if (v < 0) return null; const wk = Math.floor(i / 7), d = i % 7, l = level(v, max); return <Rect key={i} x={18 + wk * (cell + 3)} y={d * (cell + 3)} width={cell} height={cell} rx={3} fill={l ? hexA(col, [0, 0.28, 0.5, 0.75, 1][l] ?? 1) : hexA(c.ink, 0.07)} stroke={hexA(c.ink, l ? 0.35 : 0.12)} strokeWidth={0.8} />; })}
    </Svg>
  );
}
export function HBars({ items, w, fmt = (v: number) => String(v), max }: { items: { label: string; value: number; note?: string }[]; w: number; fmt?: (v: number) => string; max?: number }) {
  const { c } = useTheme(), reduce = useReduceMotion(), m = max ?? Math.max(1, ...items.map((i) => i.value)), rowH = 34, labelW = Math.min(118, w * 0.36);
  return (
    <Svg width={w} height={items.length * rowH + 2} accessibilityRole="image" accessibilityLabel={items.map((i) => `${i.label} ${fmt(i.value)}`).join(', ')}>
      {items.map((it, i) => <G key={it.label}>
        <SText x={0} y={i * rowH + 20} fontSize={15} fontFamily={FONT.hand} fill={c.ink}>{it.label.length > 16 ? it.label.slice(0, 15) + '…' : it.label}</SText>
        <Rect x={labelW} y={i * rowH + 7} width={w - labelW - 56} height={16} rx={8} fill="none" stroke={hexA(c.ink, 0.35)} strokeWidth={1} />
        <Bar x={labelW + 2} y={i * rowH + 9} w={Math.max(4, ((w - labelW - 60) * it.value) / m)} h={12} color={c.acc} delay={i * 70} reduce={reduce} />
        <SText x={w} y={i * rowH + 20} fontSize={15} fontFamily={FONT.type} fill={c.ink} textAnchor="end">{fmt(it.value)}</SText>
      </G>)}
    </Svg>
  );
}
function Bar({ x, y, w, h, color, delay, reduce }: { x: number; y: number; w: number; h: number; color: string; delay: number; reduce: boolean }) {
  const p = useSharedValue(reduce ? 1 : 0); useEffect(() => { p.value = reduce ? 1 : withDelay(delay, withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })); }, [w, delay, reduce, p]);
  const ap = useAnimatedProps(() => ({ width: w * p.value })); return <AR x={x} y={y} height={h} rx={6} fill={color} animatedProps={ap} />;
}
/** 24 vertical bars: hour of day */
export function Hist24({ values, w, h = 90, accent }: { values: number[]; w: number; h?: number; accent?: string }) {
  const { c } = useTheme(), reduce = useReduceMotion(), max = Math.max(1, ...values), bw = (w - 8) / 24;
  return (
    <Svg width={w} height={h + 20} accessibilityRole="image" accessibilityLabel={`Activity by hour, busiest hour ${values.indexOf(Math.max(...values))}:00`}>
      <Line x1={0} x2={w} y1={h} y2={h} stroke={c.ink} strokeWidth={1.4} />
      {values.map((v, i) => <VBar key={i} x={4 + i * bw + 1} base={h} w={bw - 2} hh={(v / max) * (h - 8)} color={accent ?? c.acc} delay={i * 18} reduce={reduce} />)}
      {[0, 6, 12, 18, 23].map((hr) => <SText key={hr} x={4 + hr * bw + bw / 2} y={h + 15} fontSize={12} fontFamily={FONT.type} fill={c.mut} textAnchor="middle">{hr}</SText>)}
    </Svg>
  );
}
function VBar({ x, base, w, hh, color, delay, reduce }: { x: number; base: number; w: number; hh: number; color: string; delay: number; reduce: boolean }) {
  const p = useSharedValue(reduce ? 1 : 0); useEffect(() => { p.value = reduce ? 1 : withDelay(delay, withTiming(1, { duration: 600, easing: Easing.out(Easing.back(1.2)) })); }, [hh, delay, reduce, p]);
  const ap = useAnimatedProps(() => ({ y: base - Math.max(1.5, hh) * p.value, height: Math.max(1.5, hh) * p.value })); return <AR x={x} width={w} rx={2} fill={color} animatedProps={ap} />;
}
/** A hand-inked line with dots; used for mark history and weekly focus */
export function Line2({ values, labels, w, h = 100, goal, max = 100 }: { values: number[]; labels?: string[]; w: number; h?: number; goal?: number | null; max?: number }) {
  const { c } = useTheme(), reduce = useReduceMotion(), n = values.length, X = (i: number) => 12 + (n <= 1 ? (w - 24) / 2 : (i * (w - 24)) / (n - 1)), Y = (v: number) => h - 6 - (Math.max(0, Math.min(max, v)) / max) * (h - 16);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(''), len = w * 3, p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => { p.value = reduce ? 1 : withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }); }, [d, reduce, p]);
  const ap = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - p.value) }));
  return (
    <Svg width={w} height={h + 18} accessibilityRole="image" accessibilityLabel={`Line chart: ${values.map((v, i) => `${labels?.[i] ?? i + 1} ${Math.round(v)}`).join(', ')}`}>
      <Line x1={6} x2={w - 4} y1={h - 6} y2={h - 6} stroke={c.ink} strokeWidth={1.2} />
      {goal != null && <><Line x1={6} x2={w - 4} y1={Y(goal)} y2={Y(goal)} stroke={c.warn} strokeWidth={1.3} strokeDasharray="5 4" /><SText x={w - 4} y={Y(goal) - 4} fontSize={12} fontFamily={FONT.type} fill={c.warn} textAnchor="end">goal {goal}</SText></>}
      {n > 1 && <AP d={d} fill="none" stroke={c.acc} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${len} ${len}`} animatedProps={ap} />}
      {values.map((v, i) => <G key={i}><Circle cx={X(i)} cy={Y(v)} r={4.2} fill={c.card} stroke={c.ink} strokeWidth={1.6} />{labels?.[i] && n <= 9 && <SText x={X(i)} y={h + 12} fontSize={11.5} fontFamily={FONT.type} fill={c.mut} textAnchor="middle">{labels[i]!.slice(0, 5)}</SText>}</G>)}
    </Svg>
  );
}
export function Ring({ value, size = 76, label, sub }: { value: number | null; size?: number; label: string; sub?: string }) {
  const { c } = useTheme(), reduce = useReduceMotion(), r = size / 2 - 7, circ = 2 * Math.PI * r, p = useSharedValue(reduce ? 1 : 0), v = value ?? 0;
  useEffect(() => { p.value = reduce ? 1 : withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }); }, [v, reduce, p]);
  const ap = useAnimatedProps(() => ({ strokeDashoffset: circ * (1 - v * p.value) }));
  return (
    <View style={{ alignItems: 'center', width: size + 8 }} accessible accessibilityLabel={`${label}: ${value === null ? 'no data' : Math.round(v * 100) + ' percent'}`}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={hexA(c.ink, 0.15)} strokeWidth={7} fill="none" />
        <AC cx={size / 2} cy={size / 2} r={r} stroke={c.acc} strokeWidth={7} fill="none" strokeLinecap="round" strokeDasharray={`${circ} ${circ}`} rotation={-90} originX={size / 2} originY={size / 2} animatedProps={ap} />
        <SText x={size / 2} y={size / 2 + 7} fontSize={20} fontFamily={FONT.marker} fill={c.ink} textAnchor="middle">{value === null ? '—' : Math.round(v * 100) + '%'}</SText>
      </Svg>
      <View><SText2 t={label} />{sub ? <SText2 t={sub} dim /> : null}</View>
    </View>
  );
}
const SText2 = ({ t, dim }: { t: string; dim?: boolean }) => { const { c } = useTheme(); return <Text style={{ fontFamily: FONT.hand, fontSize: dim ? 13.5 : 16, color: dim ? c.mut : c.ink, textAlign: 'center' }}>{t}</Text>; };
export { shade };
