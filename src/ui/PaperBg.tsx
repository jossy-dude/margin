import React, { useEffect, useId, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, Pattern, Rect } from 'react-native-svg';
import { EASE } from './kit';
import { useReduceMotion, useTheme } from './theme-context';
import { useStore } from '../store/store';

const GRAIN = require('../../assets/textures/grain.png');
const PHOTO = require('../../assets/textures/t1.jpg');

/**
 * The paper itself: base colour + ruling pattern + texture. Pages, sheets and Settings all use it, so a texture change shows everywhere at once.
 *
 * Three things in here are about not flashing, which is what a paper background must never do — it is
 * behind every single pixel of the app.
 *
 * **The pattern id is now per instance.** It was the literal `id="pp"`, and `prompt.md` R11 is exactly
 * this: two copies of a component that owns an SVG id, both mounted, resolving each other's `url(#pp)`.
 * It was live — opening any sheet mounts a second `PaperBg` on top of the page's, and the Settings sheet
 * holds two at once (the peek backdrop and the sheet itself). `useId()` is the fix, and it is the same
 * one `HStrip` already uses for its trailing gradient.
 *
 * **Changing the ruling or the texture cross-fades instead of swapping.** A `Pattern` node and a tiled
 * bitmap do not have a transition; before, choosing "ruled" removed one `Svg` and added another in the
 * same commit, so the paper flashed to bare cream for a frame. The ruling's opacity and the texture
 * cross-fade both over `PAPER_MS`.
 *
 * **Both texture images stay mounted.** That is the cost of a cross-fade and it is the whole cost: one
 * extra tiled bitmap on a screen. It is worth it — a texture that blinks out and in reads as a rendering
 * fault, not as a setting changing.
 *
 * Deliberately NOT animated: the base `backgroundColor` and the theme-driven opacities. A theme switch
 * changes several hundred colour props at once; cross-fading it would mean animating all of them
 * simultaneously, which is the failure `qa/RESEARCH-PERF.md` §6 measured. The desk changes at once, and
 * that reads as deliberate.
 */
const PAPER_MS = 220;

export function PaperBg({ card = false }: { card?: boolean }) {
  const { c, dark } = useTheme(), reduce = useReduceMotion(), paper = useStore((s) => s.settings.paper), tex = useStore((s) => s.settings.texture);
  const id = useId();
  /* Seeded from the settings themselves, so the very first painted frame is already correct — a
     background that fades in on arrival is a page transition wearing a second, slower one. */
  const rule = useSharedValue(1), grain = useSharedValue(tex === 'grain' ? 1 : 0), photo = useSharedValue(tex === 'photo' ? 1 : 0);
  /* One ref PER effect. A single shared flag would be written by whichever effect ran first, and the
     second one would then believe it was a change and animate a layer that had only just mounted. */
  const seenRule = useRef(false), seenTex = useRef(false);
  useEffect(() => {
    const first = !seenRule.current;
    seenRule.current = true;
    if (first || reduce) { rule.set(1); return; }
    rule.set(withTiming(1, { duration: PAPER_MS, easing: EASE }));
  }, [paper, reduce, rule]);
  useEffect(() => {
    const first = !seenTex.current;
    seenTex.current = true;
    if (first || reduce) { grain.set(tex === 'grain' ? 1 : 0); photo.set(tex === 'photo' ? 1 : 0); return; }
    grain.set(withTiming(tex === 'grain' ? 1 : 0, { duration: PAPER_MS, easing: EASE }));
    photo.set(withTiming(tex === 'photo' ? 1 : 0, { duration: PAPER_MS, easing: EASE }));
  }, [tex, reduce, grain, photo]);
  const ruleStyle = useAnimatedStyle(() => ({ opacity: rule.get() }));
  const grainStyle = useAnimatedStyle(() => ({ opacity: interpolate(grain.get(), [0, 1], [0, c.grain * (dark ? 0.55 : 0.8)]) }));
  const photoStyle = useAnimatedStyle(() => ({ opacity: photo.get() * c.photo }));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: card ? c.card : c.paper }]}>
      {paper !== 'plain' && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, ruleStyle]}>
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              {paper === 'dots' && <Pattern id={id} width={18} height={18} patternUnits="userSpaceOnUse"><Circle cx={9} cy={9} r={0.95} fill={c.dot} /></Pattern>}
              {paper === 'grid' && <Pattern id={id} width={20} height={20} patternUnits="userSpaceOnUse"><Line x1={0} y1={0.5} x2={20} y2={0.5} stroke={c.dot} strokeWidth={1} /><Line x1={0.5} y1={0} x2={0.5} y2={20} stroke={c.dot} strokeWidth={1} /></Pattern>}
              {paper === 'ruled' && <Pattern id={id} width={32} height={32} patternUnits="userSpaceOnUse"><Line x1={0} y1={31.5} x2={32} y2={31.5} stroke={c.dot} strokeWidth={1} /></Pattern>}
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${id})`} />
            {paper === 'ruled' && <Line x1={46} y1={0} x2={46} y2="100%" stroke={c.acc} strokeOpacity={0.35} strokeWidth={1.2} />}
          </Svg>
        </Animated.View>
      )}
      {/* Both textures are mounted; `pointerEvents: none` on the outer view already keeps them inert, and
          neither layer ever sits above content because the whole component is behind it. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, grainStyle]}><Image source={GRAIN} resizeMode="repeat" style={StyleSheet.absoluteFill} /></Animated.View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { mixBlendMode: dark ? 'screen' : 'multiply' }, photoStyle]}><Image source={PHOTO} resizeMode="repeat" style={StyleSheet.absoluteFill} /></Animated.View>
    </View>
  );
}