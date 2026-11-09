import React, { useEffect, useId, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, useWindowDimensions, View, type ImageStyle } from 'react-native';
import { Asset } from 'expo-asset';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, Pattern, Rect } from 'react-native-svg';
import { EASE } from './kit';
import { useReduceMotion, useTheme } from './theme-context';
import { useStore } from '../store/store';
import { MARGIN } from '../tokens/theme';

const GRAIN_SRC = require('../../assets/textures/grain.png');
const PHOTO_SRC = require('../../assets/textures/t1.jpg');
/* The collage's crumpled sheet (scripts/paper-art.mjs): crease facets as black and white on transparency,
   so it lays over any paper colour with plain alpha and looks the same on every platform. */
const CRUMPLE_SRC = require('../../assets/paper/crumple.webp');
/* Web-only URLs for the two textures, resolved once at module scope by `expo-asset`, which is the
   accessor that works on react-native-web (`Image.resolveAssetSource` is native-only). Native never
   reads these and pays nothing for them. */
const GRAIN_WEB = Asset.fromModule(GRAIN_SRC).uri;
const PHOTO_WEB = Asset.fromModule(PHOTO_SRC).uri;
const CRUMPLE_WEB = Asset.fromModule(CRUMPLE_SRC).uri;

/**
 * The paper itself: base colour + ruling pattern + texture. Pages, sheets and Settings all use it, so a texture change shows everywhere at once.
 *
 * Three things in here are about not flashing, which is what a paper background must never do — it is
 * behind every single pixel of the app.
 *
 * **The pattern id is now per instance.** It was the literal `id="pp"`, and that is exactly
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
/** Ruled paper's line pitch, dp. */
const RULED = 28;

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
 *  Native does not come through here at all: it tiles with the explicit grid in `Tiles`, at the same
 *  `px` these constants give the web — see the note above `Tiles` for why it is not a `resizeMode`. */
const GRAIN_PX = 256, PHOTO_PX = 520, CRUMPLE_W = 512, CRUMPLE_H = 900;
const WEB = Platform.OS === 'web';
const tiled = (uri?: string, px = GRAIN_PX, ph = px) => ({ backgroundImage: uri ? `url("${uri}")` : undefined, backgroundRepeat: 'repeat', backgroundSize: `${px}px ${ph}px` } as never);

/** The texture layer is window-sized whatever container it sits in, so it clips itself to its paper —
 *  without this a `PaperBg` inside a smaller sheet would paint its tiles over the paper around it. */
const CLIP = { overflow: 'hidden' } as const;

const tileStyle = (col: number, row: number, px: number, ph = px): ImageStyle => ({ position: 'absolute', left: col * px, top: row * ph, width: px, height: ph });

/**
 * The native texture: an explicit grid of `Image`s, one per tile.
 *
 * The comment this replaced claimed native already tiled "at the bitmap's own size" through
 * `resizeMode="repeat"`, and that only the web needed a CSS background. On a real device
 * it was neither: the grain arrived as one dense block in the top-left corner with bare paper
 * everywhere else.
 *
 * `resizeMode="repeat"` is not a layout on Android. `ImageResizeMode` maps it to `Shader.TileMode.REPEAT`
 * plus `ScaleTypeStartInside` (`ReactAndroid/.../views/image/ImageResizeMode.kt:46,71`), and the tiling
 * itself is done by a Fresco postprocessor, `ReactImageView.TilePostprocessor`, which bakes ONE bitmap
 * `Rect(0, 0, width, height)` — the View's own size — and draws the shader into it
 * (`ReactImageView.kt:609-630`). That baked bitmap is then drawn through the same `ScaleTypeStartInside`,
 * which never scales up and is anchored top-left (`ScaleTypeStartInside.kt:27-31`). The bake is driven by
 * `onSizeChanged` / `onAfterUpdateTransaction` (`ReactImageView.kt:544-550`, `ReactImageManager.kt:245-248`)
 * and the only guard before it is "not yet laid out", i.e. `width <= 0 || height <= 0`
 * (`ReactImageView.kt:407-410`) — so the postprocessor may run at whatever `width`/`height` the View holds
 * when the image *arrives*, which is asynchronous. Whenever that is not the View's final size, the output
 * is a bitmap from that earlier moment, drawn at scale 1 in the corner: one dense block, bare paper
 * everywhere else, which is the reported shape. None of that is reachable from JavaScript, so the tiling
 * moves to the one thing that is: layout. iOS's `repeat` is a tiled `UIImage`
 * (`resizableImageWithCapInsets:resizingMode:UIImageResizingModeTile`), the same "the platform decides the
 * size" family, and this grid is right on both.
 *
 * Tiles are laid out by Yoga, edge to edge, the way the web's `background-repeat` does it — and a tile is
 * `px` dp wide, exactly the number the web hands to `backgroundSize`, so all three platforms tile at one
 * size. On a portrait phone that is at most a 2×4 grid for grain (2×`GRAIN_PX` is wider than the screen,
 * 4 rows cover it) and a single column of the photograph (`PHOTO_PX` outruns the screen width), so every
 * interior tile edge sits at a computed `n × px`, which is the same device pixel on both sides of it —
 * the tiles abut instead of leaving a hairline.
 *
 * The grid is sized from `useWindowDimensions()`, and on Android that is exactly the area the app draws
 * in — the whole window under edge-to-edge, the window minus the system bars otherwise
 * (`modules/deviceinfo/DeviceInfoModule.kt:41-67` branches on the same edge-to-edge flag). Every
 * `PaperBg` lives in a container that is that size or smaller, so the grid always covers its paper, and
 * anything past the paper's own edge is cut by `CLIP`.
 */
function Tiles({ src, px, ph = px, tint }: { src: number; px: number; ph?: number; tint?: string }) {
  const { width, height } = useWindowDimensions();
  const cols = Math.ceil(width / px), rows = Math.ceil(height / ph);
  return (
    <>
      {Array.from({ length: cols * rows }, (_, i) => {
        const col = i % cols;
        return <Image key={i} source={src} resizeMode="stretch" tintColor={tint} style={tileStyle(col, (i - col) / cols, px, ph)} />;
      })}
    </>
  );
}

/** How much of the fibre grain a texture setting carries: all of it for `grain`, a little under the
 *  collage's crumple (crumpled paper still has fibre), none otherwise. */
const grainOn = (tex: string) => (tex === 'grain' ? 1 : tex === 'crumple' ? 0.45 : 0);

export function PaperBg({ card = false }: { card?: boolean }) {
  const { c, dark, look } = useTheme(), reduce = useReduceMotion(), paper = useStore((s) => s.settings.paper), setTex = useStore((s) => s.settings.texture);
  /* The plain look is smooth stock: whatever texture the paper looks have chosen, it draws none. */
  const tex = look === 'plain' ? 'none' : setTex;
  const id = useId();
  /* Seeded from the settings themselves, so the very first painted frame is already correct — a
     background that fades in on arrival is a page transition wearing a second, slower one. */
  const rule = useSharedValue(1), grain = useSharedValue(grainOn(tex)), photo = useSharedValue(tex === 'photo' ? 1 : 0), crum = useSharedValue(tex === 'crumple' ? 1 : 0);
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
    if (first) { grain.set(grainOn(tex)); photo.set(tex === 'photo' ? 1 : 0); crum.set(tex === 'crumple' ? 1 : 0); return; }
    /* Hold both layers for the length of the cross-fade, then drop the one that is not showing. Under
       reduce-motion the opacities snap, but the mounting still runs the two-window dance, so the
       incoming texture never blinks out from under a one-frame swap. */
    setCross(true);
    const t = setTimeout(() => setCross(false), PAPER_MS);
    const g = grainOn(tex);
    grain.set(reduce ? g : withTiming(g, { duration: PAPER_MS, easing: EASE }));
    crum.set(reduce ? (tex === 'crumple' ? 1 : 0) : withTiming(tex === 'crumple' ? 1 : 0, { duration: PAPER_MS, easing: EASE }));
    photo.set(reduce ? (tex === 'photo' ? 1 : 0) : withTiming(tex === 'photo' ? 1 : 0, { duration: PAPER_MS, easing: EASE }));
    return () => clearTimeout(t);
  }, [tex, reduce, grain, photo, crum]);
  const ruleStyle = useAnimatedStyle(() => ({ opacity: rule.get() }));
  /* Grain per theme (v0.5 U2). The bitmap is black flecks on transparency: on cream they are the
     paper's pulp, but on dark card stock black flecks vanish into the sheet and the page read as flat
     plastic. Dark paper's fibres catch the light instead, so in dark the same flecks are drawn in the
     theme's ink (pale) — `tintColor` on native, an invert on the web's CSS layer — and a little stronger,
     because pale fibres on a dark ground read fainter than dark ones on a light ground. */
  const grainStyle = useAnimatedStyle(() => ({ opacity: interpolate(grain.get(), [0, 1], [0, c.grain * (dark ? 0.7 : 0.8)]) }));
  const photoStyle = useAnimatedStyle(() => ({ opacity: photo.get() * c.photo }));
  /* The crumple tile already carries its own strength (facet alpha ≤ 0.34); dark paper shows ridges more
     than creases, so it is drawn a little lighter there. A card (`card`) is flatter paper than the page. */
  const crumStyle = useAnimatedStyle(() => ({ opacity: crum.get() * (card ? 0.35 : dark ? 0.62 : 0.5) }));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: card ? c.card : c.paper }]}>
      {paper !== 'plain' && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, ruleStyle]}>
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              {paper === 'dots' && <Pattern id={id} width={18} height={18} patternUnits="userSpaceOnUse"><Circle cx={9} cy={9} r={0.95} fill={c.dot} /></Pattern>}
              {paper === 'grid' && <Pattern id={id} width={20} height={20} patternUnits="userSpaceOnUse"><Line x1={0} y1={0.5} x2={20} y2={0.5} stroke={c.dot} strokeWidth={1} /><Line x1={0.5} y1={0} x2={0.5} y2={20} stroke={c.dot} strokeWidth={1} /></Pattern>}
              {/* v0.5 U2: 28 dp between lines, the line height of the app's handwriting (Caveat at 20-22),
                  so a ruled page has the rhythm of an exercise book written in that hand. It was 32. */}
              {paper === 'ruled' && <Pattern id={id} width={RULED} height={RULED} patternUnits="userSpaceOnUse"><Line x1={0} y1={RULED - 0.5} x2={RULED} y2={RULED - 0.5} stroke={c.dot} strokeWidth={1} /></Pattern>}
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${id})`} />
            {/* The margin rule is printed on the paper, so it is the book's red in every palette and with
                every pen (it used to follow the pen, which drew a grey margin with graphite). */}
            {paper === 'ruled' && <Line x1={46} y1={0} x2={46} y2="100%" stroke={dark ? MARGIN.dark : MARGIN.light} strokeOpacity={dark ? 0.45 : 0.5} strokeWidth={1.2} />}
          </Svg>
        </Animated.View>
      )}
      {/* `pointerEvents: none` on the outer view keeps both layers inert, and neither ever sits above
          content because the whole component is behind it. The cross-fade window holds both; the
          settled state mounts only the texture the setting names. */}
      {(tex === 'crumple' || cross) && (WEB
        ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, crumStyle, tiled(CRUMPLE_WEB, CRUMPLE_W, CRUMPLE_H)]} />
        : <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, CLIP, crumStyle]}><Tiles src={CRUMPLE_SRC} px={CRUMPLE_W} ph={CRUMPLE_H} /></Animated.View>)}
      {(grainOn(tex) > 0 || cross) && (WEB
        /* On the web, `Image resizeMode="repeat"` sizes its element to the *image* — a 256 px square —
           rather than to `absoluteFill`, so the grain arrives as one dense tile in the top-left corner
           and clean paper everywhere else. The texture looked like a rendering fault rather than like
           paper. A CSS background on a genuinely full-bleed layer is the only thing that actually
           repeats, so the web takes that path and native takes the explicit grid of `Image` tiles in
           `Tiles`. */
        ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, grainStyle, tiled(GRAIN_WEB), dark ? ({ filter: 'invert(0.92) sepia(0.25)' } as never) : null]} />
        : <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, CLIP, grainStyle]}><Tiles src={GRAIN_SRC} px={GRAIN_PX} tint={dark ? c.ink : undefined} /></Animated.View>)}
      {(tex === 'photo' || cross) && (WEB
        ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, tiled(PHOTO_WEB, PHOTO_PX), { mixBlendMode: dark ? 'screen' : 'multiply' } as never, photoStyle]} />
        : <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, CLIP, { mixBlendMode: dark ? 'screen' : 'multiply' }, photoStyle]}><Tiles src={PHOTO_SRC} px={PHOTO_PX} /></Animated.View>)}
    </View>
  );
}