import React, { useEffect, useMemo } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SText } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { FONT } from '../tokens/theme';
import { clockCells, fmtClock } from '../domain/time';
import { useNow, useReduceMotion, useTheme } from './theme-context';
import { FS } from './fit';
import { activePeriod, LATE_MS, type BarPeriod } from './instruments/time';
import { asInstrument, InstrumentBar, useEnter } from './instruments/InstrumentBar';
import { hatch } from './instruments/hatch';
import { BAR_KINDS, type BarKind } from './instruments/legacyKinds';
import type { InstrumentId } from './instruments/types';

export type { BarPeriod };
export { BAR_KINDS };
export type { BarKind };
/** What a saved setting may hold: the app's own four, or one of the twenty-two instruments. */
export type AnyBarKind = BarKind | InstrumentId;

const AR = Animated.createAnimatedComponent(Rect), AP = Animated.createAnimatedComponent(Path);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * One bar strip: either one of the app's four day bars, or one of the twenty-two instruments driven by
 * real clock time. `ink` is drawn on `bg`, the command-deck slab.
 *
 * `live` is the off-screen gate from A1's handoff: `false` swaps the instrument in instantly instead of
 * animating it, so a bar on a page the user cannot see costs no animation. It defaults to `true`, so
 * no existing call site changes behaviour until its owner passes it.
 */
export function DayBar({ kind, periods, now, ink, bg, w, h = 58, live = true }: { kind: AnyBarKind; periods: BarPeriod[]; now: number; ink: string; bg: string; w: number; h?: number; live?: boolean }) {
  const t0 = periods[0]?.start ?? 0, t1 = periods[periods.length - 1]?.end ?? 1, span = Math.max(1, t1 - t0);
  const day = clamp01((now - t0) / span);
  const id = asInstrument(kind);
  if (!periods.length) return <View style={{ height: h }} />;
  if (id) return <Period id={id} periods={periods} now={now} ink={ink} bg={bg} w={w} h={h} live={live} />;
  if (kind === 'ticker') return <Ticker periods={periods} ink={ink} bg={bg} w={w} h={h} day={day} live={live} />;
  return <DayBars kind={kind} periods={periods} now={now} ink={ink} bg={bg} w={w} h={h} day={day} X={(ms: number) => ((ms - t0) / span) * (w - 4) + 2} />;
}

/**
 * The twenty-two. `p` is percent REMAINING of the active period, recomputed on a 1 Hz wall-clock
 * aligned tick rather than on `now`, which the hosting screen may only refresh every 30 s.
 *
 * The band is a fixed 44px inside whatever box the caller offers, centred: the app's `h` is a layout
 * box, not a drawing height, and centring a fixed band is what keeps a disc a disc.
 */
function Period({ id, periods, now, ink, bg, w, h, live }: { id: InstrumentId; periods: BarPeriod[]; now: number; ink: string; bg: string; w: number; h: number; live: boolean }) {
  const { c } = useTheme(), reduce = useReduceMotion();
  const t = useNow(1000);
  const a = activePeriod(periods, t || now);
  const enter = useEnter(a ? `${id}|${a.period.start}` : id, reduce || !live);
  if (!a) return <View style={{ height: h }} />;
  const p = a.phase === 'before' ? 1 : a.left / (a.total || 1);
  const pct = Math.round(Math.max(0, Math.min(1, p)) * 100);
  return (
    <View style={{ height: h, justifyContent: 'center' }}>
      <InstrumentBar
        id={id} p={p} total={a.total} left={a.phase === 'before' ? a.total : a.left} enter={enter} ink={ink} slab={bg} acc={c.acc} warn={c.warn}
        late={a.left > 0 && a.left <= LATE_MS} w={Math.max(80, w)}
        label={`${id}, ${pct} percent of ${a.period.label} remaining${a.phase === 'before' ? ', not started' : a.ended ? ', period over' : ''}`}
      />
    </View>
  );
}

/** The three day-wide bars that are not the Ticker. */
function DayBars({ kind, periods, now, ink, bg, w, h, day, X }: { kind: AnyBarKind; periods: BarPeriod[]; now: number; ink: string; bg: string; w: number; h: number; day: number; X: (m: number) => number }) {
  const reduce = useReduceMotion();
  const dayP = useSharedValue(reduce ? day : 0);
  useEffect(() => { dayP.value = reduce ? day : withTiming(day, { duration: 900, easing: Easing.out(Easing.cubic) }); }, [day, reduce, dayP]);
  if (kind === 'trace') return <Trace periods={periods} now={now} ink={ink} w={w} h={h} X={X} dayP={dayP} day={day} />;
  if (kind === 'glass') return <Glass periods={periods} ink={ink} w={w} h={h} X={X} dayP={dayP} />;
  return <Spines periods={periods} now={now} ink={ink} bg={bg} w={w} h={h} X={X} />;
}

/**
 * Bookshelf. The cancelled-class hatch used to be a pattern fill pointing at a hardcoded id, `hat`.
 * Settings renders every bar kind LIVE in one sheet, so two copies of Bookshelf in one tree means two
 * elements called `hat` and whichever loses, loses — the documented `SvgXml` id collision
 * (`prompt.md` R11). It is drawn as clipped geometry now: no id at all, and no dependence on a
 * rotated pattern, which `qa/EXPO_GO_AUDIT.md` B2 records as never reached on a device.
 */
function Spines({ periods, now, ink, bg, w, h, X }: { periods: BarPeriod[]; now: number; ink: string; bg: string; w: number; h: number; X: (m: number) => number }) {
  return (
    <Svg width={w} height={h}>
      <Line x1={2} y1={h - 3} x2={w - 2} y2={h - 3} stroke={ink} strokeWidth={1.6} />
      {periods.map((p, i) => {
        const x = X(p.start) + 1.5, wd = Math.max(8, X(p.end) - X(p.start) - 3);
        const past = now >= p.end, cur = now >= p.start && now < p.end;
        const f = cur ? clamp01((now - p.start) / (p.end - p.start)) : past ? 1 : 0;
        const top = 8 + ((i * 7) % 9) * 0.6, bh = h - 3 - top;
        return (
          <React.Fragment key={i}>
            <Rect x={x} y={top} width={wd} height={bh} rx={2} fill="none" stroke={ink} strokeWidth={cur ? 2 : 1.3} />
            {p.cancelled && hatch(x, top, wd, bh, 5).map((g, j) => <Line key={j} {...g} stroke={ink} strokeWidth={1} strokeOpacity={0.5} />)}
            {!p.cancelled && f > 0 && <AnimatedFill x={x} yb={top + bh} width={wd} h={bh * f} ink={ink} animate />}
            {cur && <Path d={`M${x + wd / 2 - 5} ${top - 1}h10v9l-5 -4l-5 4z`} fill={ink} />}
            <SText x={x + wd / 2} y={top + bh - 6} fontSize={11} fontFamily={FONT.type} fill={f > 0.5 && !p.cancelled ? bg : ink} textAnchor="middle">{p.label.slice(0, 1)}</SText>
          </React.Fragment>
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

/**
 * Sight glass: the whole day as a filling tube.
 *
 * The liquid used to carry a second pattern hatch, id `liq`, over the fill. It is a solid fill now, for
 * three reasons in order: an id per bar that collides when Settings mounts the picker (R11 again), a
 * rotated-pattern dependency that has never been seen on a device (EXPO_GO_AUDIT B2), and a second
 * texture on a 16px-tall tube is decoration, which is the thing this system is not.
 */
function Glass({ periods, ink, w, h, X, dayP }: { periods: BarPeriod[]; ink: string; w: number; h: number; X: (m: number) => number; dayP: { value: number } }) {
  const tubeY = h / 2 - 11;
  const ap = useAnimatedProps(() => ({ width: Math.max(0, dayP.value * (w - 10)) }));
  return (
    <Svg width={w} height={h}>
      <Rect x={2} y={tubeY} width={w - 4} height={22} rx={11} fill="none" stroke={ink} strokeWidth={1.8} />
      <AR x={5} y={tubeY + 3} height={16} rx={8} fill={ink} animatedProps={ap} />
      {periods.map((p, i) => (
        <React.Fragment key={i}>
          <Line x1={X(p.start)} x2={X(p.start)} y1={tubeY + 24} y2={tubeY + 31} stroke={ink} strokeWidth={1.3} />
          <Line x1={X(p.end)} x2={X(p.end)} y1={tubeY + 24} y2={tubeY + 31} stroke={ink} strokeWidth={1.3} strokeOpacity={0.6} />
          {p.cancelled && <Line x1={X(p.start)} x2={X(p.end)} y1={tubeY + 28} y2={tubeY + 28} stroke={ink} strokeWidth={1} strokeDasharray="2 2" />}
        </React.Fragment>
      ))}
      {[0.25, 0.5, 0.75].map((f) => <Line key={f} x1={2 + f * (w - 4)} x2={2 + f * (w - 4)} y1={tubeY - 6} y2={tubeY - 1} stroke={ink} strokeWidth={1} strokeOpacity={0.6} />)}
    </Svg>
  );
}

/** Trace: a pen line drawn through the classes of the day. */
function Trace({ periods, now, ink, w, h, X, dayP, day }: { periods: BarPeriod[]; now: number; ink: string; w: number; h: number; X: (m: number) => number; dayP: { value: number }; day: number }) {
  const base = h - 14;
  const d = useMemo(() => {
    let s = `M2 ${base}`;
    periods.forEach((p, i) => {
      const a = X(p.start), b = X(p.end), top = p.cancelled ? base - 6 : 12 + (i % 3) * 3;
      s += `L${a} ${base}Q${a + 4} ${top} ${(a + b) / 2} ${top}T${b} ${base}`;
    });
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

/**
 * Ticker: mm:ss to the end of the current class or the start of the next one. Its own wall-clock
 * second tick, so only the digit row re-renders each second and never the screen hosting the bar. The
 * digit boxes key off `clockCells` by ROLE, not by index (BUG-016), or a box is silently re-purposed
 * into an opaque colon at the hour boundary.
 */
function Ticker({ periods, ink, bg, w, h, day, live }: { periods: BarPeriod[]; ink: string; bg: string; w: number; h: number; day: number; live: boolean }) {
  const t = useNow(live ? 1000 : 60_000);
  const next = periods.find((p) => p.start > t && !p.cancelled), cur = periods.find((p) => t >= p.start && t < p.end);
  const target = cur ? cur.end : next?.start ?? null, secs = target ? Math.max(0, (target - t) / 1000) : 0;
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

// referenced so the linter sees the catalogue lookup this dispatcher relies on
void BAR_KINDS;