import React, { useEffect, useId, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { Asset } from 'expo-asset';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, Pattern, Rect } from 'react-native-svg';
import { EASE } from './kit';
import { useReduceMotion, useTheme } from './theme-context';
import { useStore } from '../store/store';

const GRAIN_SRC = require('../../assets/textures/grain.png');
const PHOTO_SRC = require('../../assets/textures/t1.jpg');
/* Web-only URLs for the two textures, resolved once at module scope by `expo-asset`, which is the
   accessor that works on react-native-web (`Image.resolveAssetSource` is native-only). Native never
   reads these and pays nothing for them. */
const GRAIN_WEB = Asset.fromModule(GRAIN_SRC).uri;
const PHOTO_WEB = Asset.fromModule(PHOTO_SRC).uri;

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
 * **Only the chosen texture is mounted once the cross-fade has settled.** Both layers exist for
 * `PAPER_MS` so the swap can cross-fade; holding the other one mounted forever costs every page in
 * the app a full-screen tiled bitmap it never shows — and with the default `texture: 'grain'`, a
 * full-screen photograph under a blend mode, on all six always-mounted pages at once. A texture
 * change is a settings action, so the two-window mount is paid rarely and the steady state is one
 * image.
 *
 * Deliberately NOT animated: the base `backgroundColor` and the theme-driven opacities. A theme switch
 * changes several hundred colour props at once; cross-fading it would mean animating all of them
 * simultaneously, which is the failure `qa/RESEARCH-PERF.md` §6 measured. The desk changes at once, and
 * that reads as deliberate.
 */
const PAPER_MS = 220;

/** A full-bleed, repeating CSS background — the web's equivalent of `resizeMode="repeat"`. The asset
 *  URLs are resolved through `Image.resolveAssetSource`, which is react-native-web's own accessor and
 *  returns the dev-server path it serves the texture from.
 *
 *  **Each texture is tiled at its OWN natural size.** `backgroundSize` used to be the literal
 *  `'256px 256px'` for both, which is exact for grain.png (256 square, so it tiled seamlessly and
 *  nothing was ever resampled) and wrong for t1.jpg (520 square): the photograph was rescaled to 49%
 *  and then repeated every 256 px, so its own detail re-appeared four times across a phone width and
 *  the seams fell wherever the 256 grid landed. That is the ragged, "not well aligned" paper. Tiling
 *  at the asset's own dimensions means the tile edge IS the image edge — no resampling, and a seam
 *  that can only be where the photograph actually ends.
 *
 *  Native does not come through here at all: it is `resizeMode="repeat"` on an `Image`, which tiles at
 *  the bitmap's own size already. */
const GRAIN_PX = 256, PHOTO_PX = 520;
const WEB = Platform.OS === 'web';
const tiled = (uri?: string, px = GRAIN_PX) => ({ backgroundImage: uri ? `url("${uri}")` : undefined, backgroundRepeat: 'repeat', backgroundSize: `${px}px ${px}px` } as never);

export function PaperBg({ card = false }: { card?: boolean }) {
  const { c, dark } = useTheme(), reduce = useReduceMotion(), paper = useStore((s) => s.settings.paper), tex = useStore((s) => s.settings.texture);
  const id = useId();
  /* Seeded from the settings themselves, so the very first painted frame is already correct — a
     background that fades in on arrival is a page transition wearing a second, slower one. */
  const rule = useSharedValue(1), grain = useSharedValue(tex === 'grain' ? 1 : 0), photo = useSharedValue(tex === 'photo' ? 1 : 0);
  /* One ref PER effect. A single shared flag would be written by whichever effect ran first, and the
     second one would then believe it was a change and animate a layer that had only just mounted. */
  const seenRule = useRef(false), seenTex = useRef(false);
  /* Both textures are mounted only while a change is cross-fading between them. */
  const [cross, setCross] = useState(false);
  useEffect(() => {
    const first = !seenRule.current;
    seenRule.current = true;
    if (first || reduce) { rule.set(1); return; }
    rule.set(withTiming(1, { duration: PAPER_MS, easing: EASE }));
  }, [paper, reduce, rule]);
  useEffect(() => {
    const first = !seenTex.current;
    seenTex.current = true;
    if (first) { grain.set(tex === 'grain' ? 1 : 0); photo.set(tex === 'photo' ? 1 : 0); return; }
    /* Hold both layers for the length of the cross-fade, then drop the one that is not showing. Under
       reduce-motion the opacities snap, but the mounting still runs the two-window dance, so the
       incoming texture never blinks out from under a one-frame swap. */
    setCross(true);
    const t = setTimeout(() => setCross(false), PAPER_MS);
    grain.set(reduce ? (tex === 'grain' ? 1 : 0) : withTiming(tex === 'grain' ? 1 : 0, { duration: PAPER_MS, easing: EASE }));
    photo.set(reduce ? (tex === 'photo' ? 1 : 0) : withTiming(tex === 'photo' ? 1 : 0, { duration: PAPER_MS, easing: EASE }));
    return () => clearTimeout(t);
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
      {/* `pointerEvents: none` on the outer view keeps both layers inert, and neither ever sits above
          content because the whole component is behind it. The cross-fade window holds both; the
          settled state mounts only the texture the setting names. */}
      {(tex === 'grain' || cross) && (WEB
        /* On the web, `Image resizeMode="repeat"` sizes its element to the *image* — a 256 px square —
           rather than to `absoluteFill`, so the grain arrives as one dense tile in the top-left corner
           and clean paper everywhere else. The texture looked like a rendering fault rather than like
           paper. A CSS background on a genuinely full-bleed layer is the only thing that actually
           repeats, so the web takes that path and native keeps the `Image` it has always used. */
        ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, grainStyle, tiled(GRAIN_WEB)]} />
        : <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, grainStyle]}><Image source={GRAIN_SRC} resizeMode="repeat" style={StyleSheet.absoluteFill} /></Animated.View>)}
      {(tex === 'photo' || cross) && (WEB
        ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, tiled(PHOTO_WEB, PHOTO_PX), { mixBlendMode: dark ? 'screen' : 'multiply' } as never, photoStyle]} />
        : <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { mixBlendMode: dark ? 'screen' : 'multiply' }, photoStyle]}><Image source={PHOTO_SRC} resizeMode="repeat" style={StyleSheet.absoluteFill} /></Animated.View>)}
    </View>
  );
}