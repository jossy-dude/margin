import React, { memo, useEffect, useMemo } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { dialPal, dialSvg, handAngles, handSvg, type Arc } from './faces';
import { useTheme, useReduceMotion } from '../theme-context';

/** A hand, turned about the dial centre by a shared value — on the UI thread, nothing re-renders per tick. */
function Hand({ xml, size, angle }: { xml: string; size: number; angle: SharedValue<number> }) {
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, st]}><SvgXml xml={xml} width={size} height={size} /></Animated.View>;
}
/** The second hand's step: a short ease that overshoots a hair and settles, like a good quartz movement. */
const STEP = { duration: 240, easing: Easing.out(Easing.back(2.4)) };

/**
 * The live dial. It BEATS ONCE A SECOND: a timer aligned to the wall clock's second boundary writes the three
 * angles, and the second hand eases into its new place for a quarter of a second. Between beats nothing runs.
 *
 * It used to be a frame callback — sixty writes a second for as long as Today was open, which kept the UI
 * thread and the compositor awake for a clock nobody watches, and meant the screen never went idle (the
 * accessibility tree could not even be dumped on the phone). One beat a second is what a watch does anyway.
 *
 * `live` false (a hidden page) or a pinned `time` runs no timer at all. Reduce-motion steps without the ease.
 * The timezone offset is read on every beat, so a DST change reaches a clock left open across it.
 */
export const ClockFace = memo(function ClockFace({ size, live = true, time, arcs }: { size: number; live?: boolean; time?: { h: number; m: number; s: number }; arcs?: Arc[] }) {
  const { dark, c, tints } = useTheme(), reduce = useReduceMotion(), pal = useMemo(() => dialPal(c, dark, tints), [c, dark, tints]);
  /* The arcs arrive as a fresh array on every render of the screen; the key keeps the dial from being rebuilt for it. */
  const arcKey = arcs?.map((a) => `${a.from}-${a.to}-${a.done ? 1 : 0}`).join(',') ?? '';
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `arcKey` stands in for `arcs`
  const base = useMemo(() => dialSvg(pal, size, arcs), [pal, size, arcKey]);
  const hx = useMemo(() => ({ hour: handSvg('hour', pal, size), minute: handSvg('minute', pal, size), second: handSvg('second', pal, size) }), [pal, size]);
  const ha = useSharedValue(0), ma = useSharedValue(0), sa = useSharedValue(0);
  const ticking = live && !time;
  useEffect(() => {
    if (!ticking) return;
    let t: ReturnType<typeof setTimeout> | undefined, last = -1;
    const beat = (ease: boolean) => {
      const now = Date.now(), a = handAngles(now, new Date().getTimezoneOffset() * 60_000);
      ha.value = a.ha; ma.value = a.ma;
      /* Ease only one step forward. A resume, a clock change or midnight (the cumulative angle starts over)
         is a jump, and a jump is set outright — easing it would sweep the hand round the dial. */
      sa.value = ease && !reduce && a.sa - last === 6 ? withTiming(a.sa, STEP) : a.sa;
      last = a.sa;
      t = setTimeout(() => beat(true), 1000 - (now % 1000) + 8);
    };
    beat(false);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') { clearTimeout(t); beat(false); } });
    return () => { clearTimeout(t); sub.remove(); };
  }, [ticking, reduce, ha, ma, sa]);
  useEffect(() => { if (time) { ha.value = (time.h % 12) * 30 + time.m * 0.5; ma.value = time.m * 6 + time.s * 0.1; sa.value = time.s * 6; } }, [time, ha, ma, sa]);
  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel="Clock">
      <SvgXml xml={base} width={size} height={size} />
      <Hand xml={hx.hour} size={size} angle={ha} /><Hand xml={hx.minute} size={size} angle={ma} /><Hand xml={hx.second} size={size} angle={sa} />
    </View>
  );
});
