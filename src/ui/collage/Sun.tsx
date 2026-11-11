import React, { useEffect, useId, useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useReduceMotion, useTheme } from '../theme-context';
import { PAPER, SKY, SUN } from '../../tokens/theme';
import { nowPhase, sunRays, type SkyPhase } from './sky';

/**
 * A drawn sun: a glow that breathes, rays that turn slowly, a layered paper disc. At night it is the moon.
 * `size` is the disc's diameter; the glow reaches well past it, so the box is 2.6 × `size`.
 */
export function Sun({ size, phase, rise = false, style }: { size: number; phase?: SkyPhase; rise?: boolean; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion(), id = useId(), ph = phase ?? nowPhase(), p = SUN[ph], night = ph === 'night';
  const breath = useSharedValue(0), spin = useSharedValue(0), up = useSharedValue(rise && !reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) return;
    breath.set(withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true));
    spin.set(withRepeat(withTiming(360, { duration: 90_000, easing: Easing.linear }), -1, false));
    if (rise) up.set(withDelay(250, withSpring(0, { duration: 1400, dampingRatio: 0.7 })));
    return () => { cancelAnimation(breath); cancelAnimation(spin); cancelAnimation(up); };
  }, [reduce, rise, breath, spin, up]);
  const B = size * 2.6, r = size / 2, vb = `${-B / 2} ${-B / 2} ${B} ${B}`, rays = useMemo(() => sunRays(r), [r]);
  const glowSt = useAnimatedStyle(() => ({ opacity: 0.75 + breath.get() * 0.25, transform: [{ scale: 0.92 + breath.get() * 0.12 }] }));
  const raySt = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get()}deg` }, { scale: 1 + breath.get() * 0.04 }] }));
  const riseSt = useAnimatedStyle(() => ({ transform: [{ translateY: up.get() * size * 0.9 }] }));
  const fill = { position: 'absolute', left: 0, top: 0, width: B, height: B } as const;
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[{ width: B, height: B }, style]}>
      <Animated.View style={[fill, riseSt]}>
        <Animated.View style={[fill, glowSt]}>
          <Svg width={B} height={B} viewBox={vb}>
            <Defs>
              <RadialGradient id={id} cx={0} cy={0} r={B / 2} gradientUnits="userSpaceOnUse">
                <Stop offset={0} stopColor={p.glow} stopOpacity={0.9} /><Stop offset={0.4} stopColor={p.glow} stopOpacity={0.5} /><Stop offset={1} stopColor={p.glow} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle r={B / 2} fill={`url(#${id})`} />
          </Svg>
        </Animated.View>
        {!night && (
          <Animated.View style={[fill, raySt]}>
            <Svg width={B} height={B} viewBox={vb}><Path d={rays} fill={p.ray} stroke={p.ray} strokeWidth={r * 0.06} strokeLinejoin="round" /></Svg>
          </Animated.View>
        )}
        <Svg width={B} height={B} viewBox={vb} style={fill}>
          <Circle cy={r * 0.07} r={r} fill={p.ray} fillOpacity={0.35} />
          <Circle r={r} fill={p.disc} />
          <Circle cx={-r * 0.14} cy={-r * 0.14} r={r * 0.72} fill={p.core} fillOpacity={night ? 0.5 : 0.55} />
          {night && <><Circle cx={r * 0.3} cy={-r * 0.25} r={r * 0.16} fill={p.ray} fillOpacity={0.5} /><Circle cx={-r * 0.3} cy={r * 0.3} r={r * 0.22} fill={p.ray} fillOpacity={0.45} /><Circle cx={r * 0.34} cy={r * 0.36} r={r * 0.1} fill={p.ray} fillOpacity={0.5} /></>}
        </Svg>
      </Animated.View>
    </View>
  );
}

const CLOUD = 'M12 34a12 12 0 0 1 2-24a19 19 0 0 1 35-3a14 14 0 0 1 26 8a10 10 0 0 1 3 19Z';
function Cloud({ x, y, w, drift, o }: { x: number; y: number; w: number; drift: number; o: number }) {
  const reduce = useReduceMotion(), t = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    t.set(withRepeat(withTiming(1, { duration: 9000 + w * 30, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(t);
  }, [reduce, t, w]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: t.get() * drift }] }));
  return <Animated.View style={[{ position: 'absolute', left: x, top: y }, st]}><Svg width={w} height={w * 0.4} viewBox="0 0 90 36"><Path d={CLOUD} fill={PAPER.core} fillOpacity={o} /></Svg></Animated.View>;
}

/** The sky behind the first page: a wash that starts as bare paper at the top and deepens to the horizon. */
export function Sky({ w, h, phase }: { w: number; h: number; phase?: SkyPhase }) {
  const { dark } = useTheme(), id = useId(), ph = phase ?? nowPhase(), [top, low] = SKY[dark ? 'dark' : 'light'][ph];
  const stars = useMemo(() => Array.from({ length: 24 }, (_, i) => ({ x: ((i * 61) % 97) / 97, y: 0.16 + (((i * 37) % 53) / 53) * 0.55, r: 0.8 + (i % 3) * 0.45, o: 0.35 + (i % 4) * 0.2 })), []);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: w, height: h }}>
      <Svg width={w} height={h}>
        <Defs>
          <LinearGradient id={id} x1={0} y1={0} x2={0} y2={1}>
            <Stop offset={0} stopColor={top} stopOpacity={0} /><Stop offset={0.14} stopColor={top} stopOpacity={0} /><Stop offset={0.5} stopColor={top} stopOpacity={1} /><Stop offset={1} stopColor={low} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width={w} height={h} fill={`url(#${id})`} />
        {ph === 'night' && stars.map((s, i) => <Circle key={i} cx={s.x * w} cy={s.y * h} r={s.r} fill={SUN.night.core} fillOpacity={s.o} />)}
      </Svg>
      {ph !== 'night' && <><Cloud x={w * 0.08} y={h * 0.3} w={96} drift={16} o={dark ? 0.1 : 0.8} /><Cloud x={w * 0.5} y={h * 0.2} w={64} drift={-12} o={dark ? 0.07 : 0.6} /></>}
    </View>
  );
}
