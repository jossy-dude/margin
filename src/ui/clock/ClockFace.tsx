import React, { memo, useEffect, useId, useMemo } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import Animated, { useAnimatedStyle, useFrameCallback, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { compositeSvg, dialPal, faceById, handAngles, handSvg, spinLayers, staticSvg, type SpinLayer } from './faces';
import { FONT } from '../../tokens/theme';
import { useTheme, useReduceMotion } from '../theme-context';

function SpinView({ l, k, clock, still }: { l: SpinLayer; k: number; clock: SharedValue<number>; still: boolean }) {
  const st = useAnimatedStyle(() => {
    const t = clock.value / 1000, deg = still ? 0 : l.osc ? Math.sin((t / l.osc.period) * 2 * Math.PI) * l.osc.swing : (l.dps * t) % 360;
    return { transform: [{ rotate: `${deg}deg` }] };
  });
  const s = l.R * 2 * k;
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 100 * k + (l.x - l.R) * k, top: 100 * k + (l.y - l.R) * k, width: s, height: s }, st]}><SvgXml xml={l.svg} width={s} height={s} /></Animated.View>;
}
function Hand({ xml, size, angle }: { xml: string; size: number; angle: SharedValue<number> }) {
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, st]}><SvgXml xml={xml} width={size} height={size} /></Animated.View>;
}
/** A live dial. One frame callback drives every moving part on the UI thread; nothing re-renders per frame. */
export const ClockFace = memo(function ClockFace({ id, size, live = true, hands = true, time }: { id: string; size: number; live?: boolean; hands?: boolean; time?: { h: number; m: number; s: number } }) {
  const { dark, c } = useTheme(), reduce = useReduceMotion(), face = faceById(id), pal = useMemo(() => dialPal(face, c, dark), [face, c, dark]), k = size / 200;
  // every drawing is generated at `size`, because stroke weight and numeral size are compensated for the render
  // scale (see faces.ts): the same ornament drawn 200-unit-wide for a 96 dp picker would stipple its own hairlines
  /** Scales and Lily is the one face that emits an element id (its scale band's `clipPath`). Two copies of it can
   *  be mounted at once — the live clock on Today and its thumbnail in Settings → Clock face — and two documents
   *  both answering to `url(#sc)` is `prompt.md` R11 exactly. `useId()` is unique per instance; the replace is
   *  because React's ids can contain characters that are not legal in an XML name and this is parsed as XML.
   *  (`PaperBg` and `HStrip` use `useId()` unsanitised; the same reasoning applies to them and it is a
   *  separate, smaller question than this one.) */
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const base = useMemo(() => staticSvg(face, pal, FONT.serifB, size, uid), [face, pal, size, uid]), layers = useMemo(() => spinLayers(face.id, pal, size), [face, pal, size]);
  const hx = useMemo(() => ({ hour: handSvg('hour', pal, size), minute: handSvg('minute', pal, size), second: handSvg('second', pal, size) }), [pal, size]);
  const clock = useSharedValue(0), ha = useSharedValue(0), ma = useSharedValue(0), sa = useSharedValue(0);
  const fixed = !!time;
  /** `live` is the host's promise that this dial is the one on screen. `useFrameCallback`'s second argument is only
   *  read at mount, so the activation is driven explicitly from the effect below — a hidden screen must not burn
   *  frames (prompt.md V17), and `live && !fixed` is the only condition under which the callback may run. */
  const ticking = live && !fixed;
  /** The timezone offset, re-read rather than captured (`prompt.md` R6). Two triggers, because the two ways a DST
   *  change reaches a live clock differ: the app was backgrounded across the transition (an `AppState` resume) or
   *  it sat open across it (a minute's poll). Both only run while the frame loop is already running, so a face
   *  that is not on screen — or a pinned `time` thumbnail — costs nothing. */
  const tz = useSharedValue(new Date().getTimezoneOffset() * 60_000);
  useEffect(() => {
    if (!ticking) return;
    const read = () => { const v = new Date().getTimezoneOffset() * 60_000; if (v !== tz.get()) tz.set(v); };
    read();
    const id = setInterval(read, 60_000), sub = AppState.addEventListener('change', (s) => { if (s === 'active') read(); });
    return () => { clearInterval(id); sub.remove(); };
  }, [tz, ticking]);
  const frame = useFrameCallback(() => {
    const now = Date.now(), a = handAngles(now, tz.value);
    clock.value = now; sa.value = (reduce ? Math.floor(a.sec) : a.sec) * 6; ma.value = a.ma; ha.value = a.ha;
  }, ticking);
  useEffect(() => { frame.setActive(ticking); }, [ticking, frame]);
  useEffect(() => { if (time) { ha.value = (time.h % 12) * 30 + time.m * 0.5; ma.value = time.m * 6 + time.s * 0.1; sa.value = time.s * 6; } }, [time, ha, ma, sa]);
  if (!live && !hands && !fixed) return <View style={{ width: size, height: size }}><SvgXml xml={compositeSvg(face, pal, FONT.serifB, { h: 10, m: 10, s: 30 }, 0, size, uid)} width={size} height={size} /></View>;
  return (
    <View style={{ width: size, height: size }} accessible accessibilityRole="image" accessibilityLabel={`${face.n} clock face`}>
      <SvgXml xml={base} width={size} height={size} />
      {layers.map((l) => <SpinView key={l.key} l={l} k={k} clock={clock} still={!live || reduce} />)}
      {hands && <>
        <Hand xml={hx.hour} size={size} angle={ha} /><Hand xml={hx.minute} size={size} angle={ma} />
        {!face.nosec && <Hand xml={hx.second} size={size} angle={sa} />}
      </>}
    </View>
  );
});
/** Static thumbnail for pickers (no frame loop at all) */
export const FaceThumb = memo(function FaceThumb({ id, size }: { id: string; size: number }) {
  const { dark, c } = useTheme(), face = faceById(id), pal = useMemo(() => dialPal(face, c, dark), [face, c, dark]);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, ''); // see ClockFace: one id, two mounted copies
  const xml = useMemo(() => compositeSvg(face, pal, FONT.serifB, { h: 10, m: 10, s: 30 }, 0, size, uid), [face, pal, size, uid]);
  return <SvgXml xml={xml} width={size} height={size} />;
});
