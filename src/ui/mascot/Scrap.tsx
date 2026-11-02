import React, { useEffect, useRef } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, interpolate, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useReduceMotion, useTheme } from '../theme-context';
import { MOODS, type ScrapCue, type ScrapMood } from './scrap-rig';

/* ──────────────────────────────────────────────────────────────────────────────────────────────────────
 * Scrap: Margin's mascot, a torn scrap of denim paper with its corner dog-eared.
 *
 * Every piece is a real bitmap of torn paper (scripts/paper-art.mjs): the body in three tears, the eyes,
 * pupils, lids, cheeks, feet and six mouths. Here they are only laid out and moved, the way a cut-paper
 * puppet is: pieces slide, flap and swap; nothing is redrawn. All motion runs on the UI thread.
 *
 * The rig is drawn in a 240 × 270 design frame (the body's own frame in the generator) and every number
 * below is in those units, multiplied by `k` at layout. Laying out at the real size, instead of scaling a
 * fixed-size view, keeps each bitmap decoded at the resolution it is shown at.
 * ────────────────────────────────────────────────────────────────────────────────────────────────────── */

const SRC = {
  body: [require('../../../assets/paper/scrap-body-1.webp'), require('../../../assets/paper/scrap-body-2.webp'), require('../../../assets/paper/scrap-body-3.webp')],
  eye: require('../../../assets/paper/scrap-eye.webp'), pupil: require('../../../assets/paper/scrap-pupil.webp'), lid: require('../../../assets/paper/scrap-lid.webp'),
  cheek: require('../../../assets/paper/scrap-cheek.webp'), foot: require('../../../assets/paper/scrap-foot.webp'),
  mouth: {
    smile: require('../../../assets/paper/scrap-mouth-smile.webp'), grin: require('../../../assets/paper/scrap-mouth-grin.webp'), o: require('../../../assets/paper/scrap-mouth-o.webp'),
    wow: require('../../../assets/paper/scrap-mouth-wow.webp'), flat: require('../../../assets/paper/scrap-mouth-flat.webp'), wobble: require('../../../assets/paper/scrap-mouth-wobble.webp'),
  },
} as const;
type Mouth = keyof typeof SRC.mouth;

/* Piece boxes in design units, INCLUDING the generator's padding (the shadow and white core live there):
   [width, height, padding]. A piece's drawn shape starts `pad` units inside its bitmap. */
const BOX = {
  body: [292, 322, 26], eye: [82, 82, 10], pupil: [44, 44, 8], lid: [82, 82, 10], cheek: [42, 36, 8], foot: [68, 42, 10],
  mouth: { smile: [80, 54, 10], grin: [92, 62, 10], o: [42, 46, 9], wow: [60, 68, 10], flat: [50, 24, 8], wobble: [64, 36, 8] },
} as const;
/* Where things sit on the body. The face is slightly off-centre on purpose: the dog-ear takes the top right. */
const EYES = [[88, 102], [156, 98]] as const, EYE_R = 29.5, LOOK = 11.5;
const MOUTH = [122, 150] as const, CHEEKS = [[66, 140], [178, 136]] as const, FEET = [[82, 262], [166, 262]] as const;
export const SCRAP_W = 240, SCRAP_H = 280;

export interface ScrapProps {
  /** Width in dp; the height follows (280/240). */
  size: number;
  mood?: ScrapMood;
  /** One-shot reactions; a new `n` plays the cue again. */
  cue?: ScrapCue | null;
  /** Where the eyes go, −1…1 each axis. Pass shared values to steer them (a finger, a caret) without
   *  re-rendering; he still glances around by himself whenever `attentive` is off. */
  lookX?: SharedValue<number>;
  lookY?: SharedValue<number>;
  /** The screen is steering the eyes right now (a finger down, typing): no idle glances until it stops. */
  attentive?: boolean;
  /** Off (`false`) on a page that is mounted but not on screen: no breathing, blinking or glances run there. */
  awake?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const img = (w: number, h: number, k: number, x = 0, y = 0) => ({ position: 'absolute' as const, left: x * k, top: y * k, width: w * k, height: h * k });

export function Scrap({ size, mood = 'idle', cue = null, lookX, lookY, attentive = false, awake = true, style, testID }: ScrapProps) {
  const { c } = useTheme(), reduceMotion = useReduceMotion(), reduce = reduceMotion || !awake, k = size / SCRAP_W, m = MOODS[mood];
  /* Gaze. External shared values win; otherwise an internal pair that the idle loop moves. */
  const ownX = useSharedValue(0), ownY = useSharedValue(0.15), gx = lookX ?? ownX, gy = lookY ?? ownY;
  const lidTop = useSharedValue(m.lidTop), lidLow = useSharedValue(m.lidLow), blink = useSharedValue(0);
  const breath = useSharedValue(0), hop = useSharedValue(0), squash = useSharedValue(0), tilt = useSharedValue(m.tilt), shake = useSharedValue(0);
  const cheeks = useSharedValue(m.cheeks ? 1 : 0), dashes = useSharedValue(0), mouthPop = useSharedValue(1), pupil = useSharedValue(m.pupil);
  const mouth: Mouth = m.mouth, tear = useSharedValue(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  /* Mood → pose. Lids and tilt ease; the mouth SWAPS (a cut-out has no in-between) with a small pop. */
  useEffect(() => {
    const t = (v: number) => (reduce ? v : withSpring(v, { duration: 380, dampingRatio: 0.7 }));
    lidTop.set(t(m.lidTop)); lidLow.set(t(m.lidLow)); tilt.set(t(m.tilt)); pupil.set(t(m.pupil));
    cheeks.set(reduce ? (m.cheeks ? 1 : 0) : withTiming(m.cheeks ? 1 : 0, { duration: 260 }));
    if (!reduce) mouthPop.set(withSequence(withTiming(0.72, { duration: 70 }), withSpring(1, { duration: 320, dampingRatio: 0.45 })));
  }, [mood]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Breathing: a paper puppet's idle is a slow rise, the bottom staying on the page. */
  useEffect(() => {
    if (reduce) { breath.set(0); return; }
    breath.set(withRepeat(withSequence(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 1900, easing: Easing.inOut(Easing.sin) })), -1));
    return () => cancelAnimation(breath);
  }, [reduce, breath]);

  /* Blinks at uneven intervals, sometimes twice, and idle glances when nothing is steering the eyes. */
  useEffect(() => {
    if (reduce) return;
    let tm: ReturnType<typeof setTimeout>;
    const blinkOnce = () => withSequence(withTiming(1, { duration: 70, easing: Easing.in(Easing.quad) }), withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) }));
    const loop = () => {
      if (!alive.current) return;
      blink.set(Math.random() < 0.22 ? withSequence(blinkOnce(), withDelay(90, blinkOnce())) : blinkOnce());
      /* Idle glances go into whichever gaze is in use: a screen that passes its own values still gets a
         living character between the moments it steers him (`attentive`). */
      if (!attentive && Math.random() < 0.7) {
        const x = (Math.random() * 2 - 1) * 0.8, y = (Math.random() * 2 - 1) * 0.5;
        gx.set(withSpring(x, { duration: 260, dampingRatio: 0.8 })); gy.set(withSpring(y, { duration: 260, dampingRatio: 0.8 }));
      }
      tm = setTimeout(loop, 1800 + Math.random() * 3600);
    };
    tm = setTimeout(loop, 900 + Math.random() * 1200);
    return () => clearTimeout(tm);
  }, [reduce, attentive, blink, gx, gy]);

  /* Cues. `boil` is the stop-motion trick: while excited the body flicks between its three tears at
     ~8 fps, the way a re-shot paper cut-out never lands in quite the same place twice. */
  useEffect(() => {
    if (!cue) return;
    if (reduce) { if (cue.kind === 'celebrate' || cue.kind === 'wow') { dashes.set(1); dashes.set(withDelay(1200, withTiming(0, { duration: 1 }))); } return; }
    const jump = (h: number, d: number) => withSequence(withTiming(-h, { duration: d, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: d * 0.9, easing: Easing.in(Easing.quad) }));
    const land = (d: number) => withSequence(withTiming(-0.1, { duration: d }), withTiming(0.12, { duration: 90 }), withSpring(0, { duration: 320, dampingRatio: 0.5 }));
    if (cue.kind === 'hop') { hop.set(jump(22, 190)); squash.set(land(190)); }
    if (cue.kind === 'celebrate') {
      hop.set(withSequence(jump(30, 200), jump(18, 160))); squash.set(withSequence(land(200), withDelay(60, land(150))));
      dashes.set(withSequence(withSpring(1, { duration: 300, dampingRatio: 0.5 }), withDelay(1100, withTiming(0, { duration: 260 }))));
      /* The boil, on the UI thread: the body flicks between its three tears at 8 fps for ~1.4 s. */
      tear.set(withSequence(...Array.from({ length: 11 }, (_, j) => withDelay(125, withTiming((j + 1) % 3, { duration: 0 }))), withDelay(125, withTiming(0, { duration: 0 }))));
    }
    if (cue.kind === 'wow') { dashes.set(withSequence(withSpring(1, { duration: 280, dampingRatio: 0.5 }), withDelay(900, withTiming(0, { duration: 240 })))); squash.set(withSequence(withTiming(-0.08, { duration: 120 }), withSpring(0, { duration: 360, dampingRatio: 0.45 }))); }
    if (cue.kind === 'nod') tilt.set(withSequence(withTiming(m.tilt + 6, { duration: 140 }), withTiming(m.tilt - 3, { duration: 140 }), withSpring(m.tilt, { duration: 260 })));
    if (cue.kind === 'shake') shake.set(withSequence(withTiming(1, { duration: 70 }), withTiming(-1, { duration: 110 }), withTiming(1, { duration: 110 }), withTiming(-0.6, { duration: 100 }), withSpring(0, { duration: 220 })));
  }, [cue?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Three stacked bodies, one shown: 8 fps is the cut-out rate. */
  const body0 = useAnimatedStyle(() => ({ opacity: Math.round(tear.get()) === 0 ? 1 : 0 }));
  const body1 = useAnimatedStyle(() => ({ opacity: Math.round(tear.get()) === 1 ? 1 : 0 }));
  const body2 = useAnimatedStyle(() => ({ opacity: Math.round(tear.get()) === 2 ? 1 : 0 }));
  const bodies = [body0, body1, body2];

  /* ── animated styles ── */
  const whole = useAnimatedStyle(() => {
    const b = breath.get(), s = squash.get();
    return { transform: [{ translateY: hop.get() * k }, { translateX: shake.get() * 7 * k }, { rotate: `${tilt.get() + shake.get() * 4}deg` }, { scaleY: 1 + b * 0.018 - s * 0.9 }, { scaleX: 1 - b * 0.008 + s * 0.7 }] };
  });
  /* The face rides a few units toward where Scrap is looking: the cheapest way to make a flat puppet turn. */
  const face = useAnimatedStyle(() => ({ transform: [{ translateX: gx.get() * 4 * k }, { translateY: gy.get() * 3 * k }] }));
  const pupils = useAnimatedStyle(() => ({ transform: [{ translateX: gx.get() * LOOK * k }, { translateY: gy.get() * LOOK * 0.85 * k }, { scale: pupil.get() }] }));
  const upper = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(Math.max(lidTop.get(), blink.get()), [0, 1], [-(EYE_R * 2 + 6), -6]) * k }] }));
  const lower = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(lidLow.get(), [0, 1], [EYE_R * 2 + 6, EYE_R * 0.9]) * k }] }));
  const mouthS = useAnimatedStyle(() => ({ transform: [{ scale: mouthPop.get() }] }));
  const cheekS = useAnimatedStyle(() => ({ opacity: cheeks.get() * 0.85, transform: [{ scale: 0.6 + cheeks.get() * 0.4 }] }));
  const dashS = useAnimatedStyle(() => ({ opacity: Math.min(1, dashes.get() * 1.4), transform: [{ scale: 0.4 + dashes.get() * 0.6 }, { rotate: `${(1 - dashes.get()) * -18}deg` }] }));
  const shadowS = useAnimatedStyle(() => ({ opacity: 0.1 - Math.min(0.07, -hop.get() / 400), transform: [{ scaleX: 1 + hop.get() / 160 }] }));

  const [bw, bh, bp] = BOX.body, [ew, , ep] = BOX.eye, [pw] = BOX.pupil, [mw, mh, mp] = BOX.mouth[mouth];
  const wide = mouth === 'o' || mouth === 'wow'; // round mouths hang from their centre, the cut ones from their flat top
  const mouthX = MOUTH[0] - mw / 2, mouthY = wide ? MOUTH[1] + 6 - mh / 2 : MOUTH[1] - mp;
  const H = SCRAP_H * k;
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={`Scrap, the Margin mascot, looking ${MOODS[mood].say}`} style={[{ width: size, height: H }, style]} pointerEvents="none">
      {/* The shadow on the page, which shrinks as he leaves it. */}
      <Animated.View style={[{ position: 'absolute', left: 64 * k, top: 262 * k, width: 112 * k, height: 12 * k, borderRadius: 56 * k, backgroundColor: c.shadow }, shadowS]} />
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: H, transformOrigin: `50% ${(262 / SCRAP_H) * 100}%` }, whole]}>
        {FEET.map(([x, y], i) => <Image key={i} source={SRC.foot} style={img(BOX.foot[0], BOX.foot[1], k, x - BOX.foot[0] / 2, y - BOX.foot[1] / 2)} />)}
        {SRC.body.map((src, i) => <Animated.View key={i} style={[{ position: 'absolute', left: 0, top: 0 }, bodies[i]]}><Image source={src} style={img(bw, bh, k, -bp, -bp)} /></Animated.View>)}
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: H }, face]}>
          {EYES.map(([x, y], i) => (
            <View key={i} style={{ position: 'absolute', left: (x - ew / 2) * k, top: (y - ew / 2) * k, width: ew * k, height: ew * k }}>
              <Image source={SRC.eye} style={img(ew, ew, k)} />
              {/* The pupil and both lids live inside a disc a hair smaller than the eye, so a lid never
                  shows outside the eye it closes. */}
              <View style={{ position: 'absolute', left: (ep + 1) * k, top: (ep + 1) * k, width: EYE_R * 2 * k, height: EYE_R * 2 * k, borderRadius: EYE_R * k, overflow: 'hidden' }}>
                <Animated.View style={[{ position: 'absolute', left: (EYE_R - pw / 2) * k, top: (EYE_R + 3 - pw / 2) * k, width: pw * k, height: pw * k }, pupils]}><Image source={SRC.pupil} style={img(pw, pw, k)} /></Animated.View>
                <Animated.View style={[{ position: 'absolute', left: -ep * k, top: -ep * k }, upper]}><Image source={SRC.lid} style={img(BOX.lid[0], BOX.lid[1], k)} /></Animated.View>
                <Animated.View style={[{ position: 'absolute', left: -ep * k, top: -ep * k }, lower]}><Image source={SRC.lid} style={img(BOX.lid[0], BOX.lid[1], k)} /></Animated.View>
              </View>
            </View>
          ))}
          {CHEEKS.map(([x, y], i) => <Animated.View key={i} style={[{ position: 'absolute', left: (x - BOX.cheek[0] / 2) * k, top: (y - BOX.cheek[1] / 2) * k }, cheekS]}><Image source={SRC.cheek} style={img(BOX.cheek[0], BOX.cheek[1], k)} /></Animated.View>)}
          <Animated.View style={[{ position: 'absolute', left: mouthX * k, top: mouthY * k, width: mw * k, height: mh * k, transformOrigin: wide ? '50% 50%' : `50% ${(mp / mh) * 100}%` }, mouthS]}>
            <Image source={SRC.mouth[mouth]} style={img(mw, mh, k)} />
          </Animated.View>
        </Animated.View>
        {/* Ink, not paper: the three strokes a cartoonist adds when something lands. */}
        <Animated.View style={[{ position: 'absolute', left: 196 * k, top: -6 * k, width: 64 * k, height: 64 * k, transformOrigin: '0% 100%' }, dashS]}>
          <Svg width={64 * k} height={64 * k} viewBox="0 0 64 64">
            <Path d="M10 40 L22 24 M22 50 L44 38 M28 18 L34 4" stroke={c.ink} strokeWidth={5} strokeLinecap="round" />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}
