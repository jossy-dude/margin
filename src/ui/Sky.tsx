import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { V2, nextSkyChange, skyFor, type Scheme, type SkyKey } from '../tokens/v2';
import { useReduceMotion } from './theme-context';


/**
 * v0.7 U3 — the sky behind everything (DESIGN.md D-3). It follows the clock in six keyframes and changes by ONE
 * timer set for the next keyframe (nothing ticks in between); the change is a 60 s cross-fade (a cut with reduced
 * motion). `still` keeps one sky per theme (noon / night); `off` is the flat ground.
 *
 * v0.7.7.5 (SPEC §1 A): each keyframe is a baked image (`assets/sky`, made by `tools/sky.mjs`) with a sun or moon
 * glow, a haze band, soft clouds and stars at night — something for the glass panes to be glass over. The old
 * two-stop gradient had nothing in it to see through a pane.
 */
const IMG: Record<Scheme, Record<SkyKey, ImageSourcePropType>> = {
  light: {
    dawn: require('../../assets/sky/light-dawn.webp'), morning: require('../../assets/sky/light-morning.webp'), noon: require('../../assets/sky/light-noon.webp'),
    afternoon: require('../../assets/sky/light-afternoon.webp'), dusk: require('../../assets/sky/light-dusk.webp'), night: require('../../assets/sky/light-night.webp'),
  },
  dark: {
    dawn: require('../../assets/sky/dark-dawn.webp'), morning: require('../../assets/sky/dark-morning.webp'), noon: require('../../assets/sky/dark-noon.webp'),
    afternoon: require('../../assets/sky/dark-afternoon.webp'), dusk: require('../../assets/sky/dark-dusk.webp'), night: require('../../assets/sky/dark-night.webp'),
  },
};
/* v0.7.7 (SPEC §6): the first sky of a session fades in over 200 ms onto the splash's mid-sky window colour, so
   Daylight never cuts from flat colour to sky. Later skies (other pages) appear at once. */
let firstSky = true;
const minutesNow = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

function Baked({ scheme, k }: { scheme: Scheme; k: SkyKey }) {
  return <Image source={IMG[scheme][k]} resizeMode="cover" fadeDuration={0} style={StyleSheet.absoluteFill} accessibilityIgnoresInvertColors />;
}

export function Sky({ mode, scheme }: { mode: 'live' | 'still' | 'off'; scheme: Scheme }) {
  const reduce = useReduceMotion();
  /* `stamp` moves only when the keyframe changes (the one timer below); the sky itself is derived in render */
  const [stamp, setStamp] = useState(minutesNow);
  const [prev, setPrev] = useState<SkyKey | null>(null);
  const k = skyFor(mode, scheme, stamp);
  const [entering] = useState(() => { const f = firstSky && mode !== 'off'; if (f) firstSky = false; return f; });
  const fade = useSharedValue(entering && !reduce ? 0 : 1);
  useEffect(() => { if (entering && !reduce) fade.set(withTiming(1, { duration: 200 })); }, [entering, reduce, fade]);
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
      {prev ? <Baked scheme={scheme} k={prev} /> : null}
      <Animated.View style={[StyleSheet.absoluteFill, top]}><Baked scheme={scheme} k={k} /></Animated.View>
    </View>
  );
}
