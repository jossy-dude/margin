import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { useNow, useReduceMotion, useTheme } from './theme-context';
import { activePeriod, LATE_MS, type BarPeriod } from './instruments/time';
import { asInstrument, InstrumentBar, useEnter } from './instruments/InstrumentBar';
import { BAR_KINDS, type BarKind } from './instruments/legacyKinds';
import type { InstrumentId } from './instruments/types';

export type { BarPeriod };
export { BAR_KINDS };
export type { BarKind };
/** What a saved setting may hold: the app's one day-wide bar, or one of the sixteen instruments. */
export type AnyBarKind = BarKind | InstrumentId;

const AR = Animated.createAnimatedComponent(Rect);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * One bar strip: either the app's one day-wide bar (Sight glass), or one of the sixteen instruments
 * driven by real clock time. `ink` is drawn on `bg`, the command-deck slab. Every id that is not an
 * instrument — including one saved by an older build — is Sight glass, so a stale setting can never
 * render an empty strip.
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
  return <DayBars periods={periods} ink={ink} w={w} h={h} day={day} X={(ms: number) => ((ms - t0) / span) * (w - 4) + 2} live={live} />;
}

/**
 * The sixteen. `p` is percent REMAINING of the active period, recomputed on a 1 Hz wall-clock
 * aligned tick rather than on `now`, which the hosting screen may only refresh every 30 s.
 *
 * The band is a fixed 44px inside whatever box the caller offers, centred: the app's `h` is a layout
 * box, not a drawing height, and centring a fixed band is what keeps a disc a disc.
 *
 * The tick is gated on `live` (A1 PERF #7): Today stays mounted behind the page you went to, so an
 * ungated 1 Hz re-render of the instrument kept burning frames on a screen nobody can see.
 */
function Period({ id, periods, now, ink, bg, w, h, live }: { id: InstrumentId; periods: BarPeriod[]; now: number; ink: string; bg: string; w: number; h: number; live: boolean }) {
  const { c } = useTheme(), reduce = useReduceMotion();
  const t = useNow(live ? 1000 : 60_000);
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

/** The one day-wide bar: Sight glass. Every non-instrument id lands here. */
function DayBars({ periods, ink, w, h, day, X, live }: { periods: BarPeriod[]; ink: string; w: number; h: number; day: number; X: (m: number) => number; live: boolean }) {
  const reduce = useReduceMotion();
  const dayP = useSharedValue(reduce ? day : 0);
  /* `live` is the off-screen gate (A1 PERF #7): `day` re-keys every 30 s from the hosting screen's
   * `now`, so while Today sits behind another page this 900 ms tween used to re-fire off-screen every
   * thirty seconds, forever — one second of animation per minute on a screen nobody can see, on a JS
   * thread that is also about to mount the page you tapped. Off-screen the value is assigned instead:
   * correct picture, no motion. Retargeting (rather than resetting) means coming back animates from
   * wherever it already is, so there is no snap when `live` flips. */
  useEffect(() => {
    if (!live || reduce) { dayP.set(day); return; }
    dayP.set(withTiming(day, { duration: 900, easing: Easing.out(Easing.cubic) }));
  }, [day, reduce, live, dayP]);
  return <Glass periods={periods} ink={ink} w={w} h={h} X={X} dayP={dayP} />;
}

/**
 * Sight glass: the whole day as a filling tube.
 *
 * The liquid used to carry a second pattern hatch, id `liq`, over the fill. It is a solid fill now, for
 * three reasons in order: an id per bar that collides when Settings mounts the picker, a
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
