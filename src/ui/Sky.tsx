import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { SKY, V2, nextSkyChange, skyAt, type Scheme, type SkyKey } from '../tokens/v2';
import { useReduceMotion } from './theme-context';

/**
 * v0.7 U3 — the sky behind everything (DESIGN.md D-3). It follows the clock in six keyframes and changes by ONE
 * timer set for the next keyframe (nothing ticks in between); the change is a 60 s cross-fade (a cut with reduced
 * motion). `still` keeps one sky per theme (noon / night); `off` is the flat ground. Drawn as two gradients; the
 * baked WebP skies replace the gradient later without changing this component's contract.
 */
const minutesNow = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
export function skyFor(mode: 'live' | 'still' | 'off', scheme: Scheme, minutes: number): SkyKey | null {
  if (mode === 'off') return null;
  if (mode === 'still') return scheme === 'dark' ? 'night' : 'noon';
  return skyAt(minutes);
}

function Gradient({ scheme, k }: { scheme: Scheme; k: SkyKey }) {
  const [top, bottom] = SKY[scheme][k];
  const id = `sky-${scheme}-${k}`;
  return (
    <Svg width="100%" height="100%" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
      <Defs><LinearGradient id={id} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={top} /><Stop offset="1" stopColor={bottom} /></LinearGradient></Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

export function Sky({ mode, scheme }: { mode: 'live' | 'still' | 'off'; scheme: Scheme }) {
  const reduce = useReduceMotion();
  /* `stamp` moves only when the keyframe changes (the one timer below); the sky itself is derived in render */
  const [stamp, setStamp] = useState(minutesNow);
  const [prev, setPrev] = useState<SkyKey | null>(null);
  const k = skyFor(mode, scheme, stamp);
  const fade = useSharedValue(1);
  useEffect(() => {
    if (mode !== 'live') return;
    let t: ReturnType<typeof setTimeout>;
    const arm = () => {
      t = setTimeout(() => {
        setPrev(skyFor('live', scheme, stamp));
        setStamp(minutesNow());
        fade.set(0);
        fade.set(withTiming(1, { duration: reduce ? 0 : 60_000 }));
      }, nextSkyChange(minutesNow()) * 60_000 + 1000);
    };
    arm();
    return () => clearTimeout(t);
  }, [mode, scheme, reduce, fade, stamp]);
  const top = useAnimatedStyle(() => ({ opacity: fade.get() }));
  if (!k) return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: V2[scheme].flat }]} />;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {prev ? <Gradient scheme={scheme} k={prev} /> : null}
      <Animated.View style={[StyleSheet.absoluteFill, top]}><Gradient scheme={scheme} k={k} /></Animated.View>
    </View>
  );
}
