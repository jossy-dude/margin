import React, { memo, useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import Animated, { useAnimatedStyle, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { compositeSvg, dialPal, dialSvg, faceById, handAngles, handSvg, type FaceSpec } from './faces';
import { FONT } from '../../tokens/theme';
import { useTheme, useReduceMotion } from '../theme-context';

/** A hand, turned about the dial centre by a shared value — on the UI thread, nothing re-renders per frame. */
function Hand({ xml, size, angle }: { xml: string; size: number; angle: SharedValue<number> }) {
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, st]}><SvgXml xml={xml} width={size} height={size} /></Animated.View>;
}
/** The day of the month, for a face with a date window; it changes at local midnight (and on resume). */
function useDayOfMonth(on: boolean) {
  const [d, setD] = useState(() => new Date().getDate());
  useEffect(() => {
    if (!on) return;
    let t: ReturnType<typeof setTimeout>;
    const arm = () => { const n = new Date(), next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 1); setD(n.getDate()); t = setTimeout(arm, next.getTime() - n.getTime()); };
    arm();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setD(new Date().getDate()); });
    return () => { clearTimeout(t); sub.remove(); };
  }, [on]);
  return d;
}
/** The numerals' face: the look's own sans, so the clock speaks the app's type. */
const NUM_FONT = FONT.sansMid;

/** A live dial. One frame callback drives the three hands on the UI thread; `live` false (a hidden screen, a
 *  pinned `time`) runs no frames at all. Reduce-motion steps the second once a second. */
export const ClockFace = memo(function ClockFace({ id, size, live = true, hands = true, time }: { id: string; size: number; live?: boolean; hands?: boolean; time?: { h: number; m: number; s: number } }) {
  const { dark, c } = useTheme(), reduce = useReduceMotion(), face: FaceSpec = faceById(id), pal = useMemo(() => dialPal(c, dark), [c, dark]);
  const day = useDayOfMonth(!!face.date);
  const base = useMemo(() => dialSvg(face, pal, NUM_FONT, size, face.date ? day : undefined), [face, pal, size, day]);
  const hx = useMemo(() => ({ hour: handSvg('hour', face, pal, size), minute: handSvg('minute', face, pal, size), second: handSvg('second', face, pal, size) }), [face, pal, size]);
  const ha = useSharedValue(0), ma = useSharedValue(0), sa = useSharedValue(0);
  const ticking = live && !time && hands;
  /** The timezone offset, re-read on resume and once a minute: a DST change must reach a clock left open across it. */
  const tz = useSharedValue(new Date().getTimezoneOffset() * 60_000);
  useEffect(() => {
    if (!ticking) return;
    const read = () => { const v = new Date().getTimezoneOffset() * 60_000; if (v !== tz.get()) tz.set(v); };
    read();
    const t = setInterval(read, 60_000), sub = AppState.addEventListener('change', (s) => { if (s === 'active') read(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [tz, ticking]);
  /* The beat is the watch's: a quartz field watch steps once a second with a hair of overshoot, a mechanical
     diver steps eight times a second, the studio hand sweeps. Reduce-motion: one plain step a second. */
  const beat = face.beat;
  const frame = useFrameCallback(() => {
    const a = handAngles(Date.now(), tz.value), sec = a.sec;
    let s = sec;
    if (reduce) s = Math.floor(sec);
    else if (beat === 'mech') s = Math.floor(sec * 8) / 8;
    else if (beat === 'tick') { const b = Math.floor(sec), t = Math.min(1, (sec - b) / 0.12), c1 = 1.70158, c3 = c1 + 1; s = b - 1 + (1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)); }
    sa.value = s * 6; ma.value = a.ma; ha.value = a.ha;
  }, ticking);
  useEffect(() => { frame.setActive(ticking); }, [ticking, frame]);
  useEffect(() => { if (time) { ha.value = (time.h % 12) * 30 + time.m * 0.5; ma.value = time.m * 6 + time.s * 0.1; sa.value = time.s * 6; } }, [time, ha, ma, sa]);
  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel={`${face.n} watch`}>
      <SvgXml xml={base} width={size} height={size} />
      {hands && <>
        <Hand xml={hx.hour} size={size} angle={ha} /><Hand xml={hx.minute} size={size} angle={ma} /><Hand xml={hx.second} size={size} angle={sa} />
      </>}
    </View>
  );
});
/** Static thumbnail for pickers (no frame loop at all), at 10:10:30. */
export const FaceThumb = memo(function FaceThumb({ id, size }: { id: string; size: number }) {
  const { dark, c } = useTheme(), face = faceById(id), pal = useMemo(() => dialPal(c, dark), [c, dark]);
  const xml = useMemo(() => compositeSvg(face, pal, NUM_FONT, { h: 10, m: 10, s: 30 }, size, new Date().getDate()), [face, pal, size]);
  return <SvgXml xml={xml} width={size} height={size} />;
});
