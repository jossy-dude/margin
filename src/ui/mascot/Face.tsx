/**
 * Face — Margin's mascot (DESIGN.md D-21): twelve hand-drawn kaomoji faces in five strokes, alive on the UI thread.
 * It keeps the old mascot's name: TalkBack calls it "Jot".
 *
 * Public API (stable; screens use nothing else from this folder but `faces.ts` names and `moments.ts`):
 *
 *   <Face name="smirk" size={28} />          `size` dp tall, 120/64 as wide. Sizes in use: 20 snackbar · 28 top bar ·
 *                                            64 empty state · 72 Focus · 96 alarm · 160 onboarding
 *   name        FaceName. Change it and the face morphs there in 220 ms (a cut under reduced motion or while hidden)
 *   look        {x, y} in −1…1 (`gazeAt`, `gazeAlong`): dot eyes turn up to 2.5 units that way, back 1.2 s later
 *   react       {motion: 'bounce' | 'droop', n}: bump `n` to play the motion once (`useFaceMoment` does this)
 *   slowBlink   Focus: unhurried blinks every 6–10 s; shut eyes (`content`) peek open and close again
 *   breathe     idle breathing (default on): three breaths after it arrives, changes or reacts; only ≥ 64 dp
 *   awake       false while the page it sits on is hidden: no blink timer, no breath (pass `useScreenLive()`)
 *   scheme      the ink to draw in; pass the opposite scheme on an inverse surface (a Material snackbar)
 *   reduce      force reduced motion on or off (the Diagnostics tester); default follows the setting
 *   decorative  hide it from TalkBack where words beside it say the same (snackbar, empty state, inside a button)
 *   ref         FaceHandle: bounce(), droop(), blink(), look(x, y), for a parent that would rather call than count
 *
 * Motion (all off under reduced motion, where a face change is a cut): blink 1 → 0.08 → 1 in 140 ms every 3.5–7 s,
 * double one time in five · look on a spring {20, 180} · morph 220 ms, mouth point by point, eye kinds cross-fade
 * 80 ms out / 120 ms in at 0.9 → 1 · bounce −6 units then a spring {10, 300} home · droop 2 units over 400 ms ·
 * breathing 1 → 1.02 → 1 over 4 s, three times.
 *
 * Budget: every animation runs on the UI thread (`useAnimatedProps` rebuilds the path data there). Between motions
 * nothing runs at all: the wait before a blink and the 1.2 s before the eyes come back from a look are JS timers,
 * one per blink, never a per-frame `withDelay` (see `nextBlink`). Every animation and timer is cancelled on unmount
 * (finding F13: animations kept writing to unmounted SVG views).
 */
import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, runOnUI, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useReduceMotion, useTheme } from '../theme-context';
import { MOTION, TINTS, V2, type Scheme } from '../../tokens/v2';
import {
  BLINK, BLUSH_D, BOUNCE, BOUNCE_SPRING, BREATHS, BREATH_MIN_SIZE, BREATH_MS, BREATH_SCALE, DROOP, FACES, LOOK_HOLD_MS, LOOK_SPRING, LOOK_UNITS,
  MORPH_MS, SLOW_BLINK, SWEAT_D, VIEW_H, VIEW_W, extraAt, eyeProps, mouthAt, nextBlink, poseAt, poseOf, strokeFor,
  type FaceMotion, type FaceName, type Pose,
} from './faces';

export interface FaceHandle { bounce(): void; droop(): void; blink(): void; look(x: number, y: number): void }
export interface FaceProps {
  name: FaceName;
  size?: number;
  look?: { x: number; y: number } | null;
  react?: { motion: FaceMotion; n: number } | null;
  slowBlink?: boolean;
  breathe?: boolean;
  awake?: boolean;
  scheme?: Scheme;
  reduce?: boolean;
  label?: string;
  decorative?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  ref?: React.Ref<FaceHandle>;
}

const APath = Animated.createAnimatedComponent(Path);
/** Blush is the rose subject tint at half strength (D-21). */
const ROSE = TINTS[3];
const STATE = Easing.bezier(...MOTION.state.bezier), SOFT = Easing.inOut(Easing.sin), OUT = Easing.out(Easing.quad), IN_OUT = Easing.inOut(Easing.quad);
const clamp1 = (v: number) => (v < -1 ? -1 : v > 1 ? 1 : v);
type Timer = ReturnType<typeof setTimeout> | undefined;

/** One blink as a UI-thread animation of `blink` 0 → 1 → 0: 140 ms (twice, 90 ms apart, for a double), or the
 *  slow Focus blink: 420 ms in, held 700 ms, 520 ms out. */
function blinkMotion(slow: boolean, double: boolean) {
  if (slow) return withSequence(withTiming(1, { duration: SLOW_BLINK.inMs, easing: SOFT }), withDelay(SLOW_BLINK.holdMs, withTiming(0, { duration: SLOW_BLINK.outMs, easing: SOFT })));
  const once = [withTiming(1, { duration: BLINK.closeMs, easing: STATE }), withTiming(0, { duration: BLINK.openMs, easing: STATE })];
  return double ? withSequence(...once, withDelay(BLINK.doubleGapMs, withTiming(1, { duration: BLINK.closeMs, easing: STATE })), withTiming(0, { duration: BLINK.openMs, easing: STATE })) : withSequence(...once);
}

export function Face({ name, size = 28, look, react, slowBlink = false, breathe = true, awake = true, scheme, reduce, label, decorative = false, testID, style, ref }: FaceProps) {
  const theme = useTheme(), setting = useReduceMotion();
  const moving = !(reduce ?? setting) && awake;
  const ink = V2[scheme ?? (theme.dark ? 'dark' : 'light')].ink;
  const unit = size / VIEW_H, sw = strokeFor(size);

  /* The face as the UI thread holds it: a morph runs `t` 0 → 1 from `from` to `to`. */
  const [first] = useState(() => poseOf(name));
  const from = useSharedValue<Pose>(first), to = useSharedValue<Pose>(first), t = useSharedValue(1);
  const blink = useSharedValue(0), peek = useSharedValue(slowBlink);
  const lx = useSharedValue(0), ly = useSharedValue(0), lift = useSharedValue(0), breath = useSharedValue(1);

  /* The one-shots read `moving` through a ref, so they (and the ref handle) keep one identity when reduced motion
     or visibility flips, and a `look` prop is not replayed by that flip. */
  const live = useRef(moving);
  useEffect(() => { live.current = moving; }, [moving]);

  /* Morph. A new face starts from wherever the last morph had got to, so a quick change of mind never jumps. */
  const shown = useRef(name);
  useEffect(() => {
    if (shown.current === name) return;
    shown.current = name;
    const next = poseOf(name);
    if (!moving) { cancelAnimation(t); from.set(next); to.set(next); t.set(1); return; }
    runOnUI((p: Pose) => {
      'worklet';
      from.set(poseAt(from.get(), to.get(), t.get()));
      to.set(p);
      t.set(0);
      t.set(withTiming(1, { duration: MORPH_MS, easing: Easing.linear }));
    })(next);
  }, [name, moving, from, to, t]);

  /* Blinks: one timer per blink, the blink itself on the UI thread. */
  useEffect(() => {
    peek.set(slowBlink);
    if (!moving) { cancelAnimation(blink); blink.set(0); return; }
    let timer: Timer;
    const queue = () => {
      const { gap, double } = nextBlink(Math.random, slowBlink);
      timer = setTimeout(() => { blink.set(blinkMotion(slowBlink, double)); queue(); }, gap);
    };
    queue();
    return () => { clearTimeout(timer); cancelAnimation(blink); blink.set(0); };
  }, [moving, slowBlink, blink, peek]);

  /* Breathing: only where it can be seen and is big enough to read as breath rather than jitter; re-armed when
     the face changes or reacts, so it is alive when something happens and still on a page left open. */
  const breathes = moving && breathe && size >= BREATH_MIN_SIZE, beat = react?.n ?? 0;
  useEffect(() => {
    if (!breathes) { cancelAnimation(breath); breath.set(1); return; }
    breath.set(withRepeat(withSequence(withTiming(BREATH_SCALE, { duration: BREATH_MS / 2, easing: SOFT }), withTiming(1, { duration: BREATH_MS / 2, easing: SOFT })), BREATHS, false));
    return () => cancelAnimation(breath);
  }, [breathes, breath, name, beat]);

  /* Look: spring there now, spring back after 1.2 s (a timer, so the hold costs no frames). */
  const lookBack = useRef<Timer>(undefined);
  const lookTo = useCallback((x: number, y: number) => {
    if (!live.current) return;
    clearTimeout(lookBack.current);
    const ax = clamp1(x) * LOOK_UNITS, ay = clamp1(y) * LOOK_UNITS;
    lx.set(withSpring(ax, LOOK_SPRING));
    ly.set(withSpring(ay, LOOK_SPRING));
    lookBack.current = setTimeout(() => { lx.set(withSpring(0, LOOK_SPRING)); ly.set(withSpring(0, LOOK_SPRING)); }, LOOK_HOLD_MS);
  }, [lx, ly]);
  const play = useCallback((motion: FaceMotion) => {
    if (!live.current) return;
    lift.set(motion === 'bounce'
      ? withSequence(withTiming(BOUNCE.units, { duration: BOUNCE.riseMs, easing: OUT }), withSpring(0, BOUNCE_SPRING))
      : withSequence(withTiming(DROOP.units, { duration: DROOP.downMs, easing: OUT }), withTiming(0, { duration: DROOP.upMs, easing: IN_OUT })));
  }, [lift]);
  const blinkOnce = useCallback(() => { if (live.current) blink.set(blinkMotion(false, false)); }, [blink]);
  useImperativeHandle(ref, () => ({ bounce: () => play('bounce'), droop: () => play('droop'), blink: blinkOnce, look: lookTo }), [play, blinkOnce, lookTo]);

  const gx = look?.x, gy = look?.y;
  useEffect(() => { if (gx !== undefined && gy !== undefined) lookTo(gx, gy); }, [gx, gy, lookTo]);
  /* `react` plays when its count changes, never on mount. */
  const seen = useRef(beat), motion = react?.motion;
  useEffect(() => {
    if (beat === seen.current) return;
    seen.current = beat;
    if (motion) play(motion);
  }, [beat, motion, play]);

  /* Cancel everything on unmount (F13). */
  useEffect(() => () => {
    clearTimeout(lookBack.current);
    for (const v of [t, blink, lx, ly, lift, breath]) cancelAnimation(v);
  }, [t, blink, lx, ly, lift, breath]);

  const eyeL = useAnimatedProps(() => eyeProps(from.get(), to.get(), t.get(), 0, blink.get(), peek.get(), lx.get(), ly.get()));
  const eyeR = useAnimatedProps(() => eyeProps(from.get(), to.get(), t.get(), 1, blink.get(), peek.get(), lx.get(), ly.get()));
  const mouth = useAnimatedProps(() => ({ d: mouthAt(from.get(), to.get(), t.get()) }));
  const blush = useAnimatedProps(() => ({ opacity: extraAt(from.get().blush, to.get().blush, t.get()) }));
  const sweat = useAnimatedProps(() => ({ opacity: extraAt(from.get().sweat, to.get().sweat, t.get()) }));
  const body = useAnimatedStyle(() => ({ transform: [{ translateY: lift.get() * unit }, { scale: breath.get() }] }));

  const pen = { stroke: ink, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;
  const a11y = decorative
    ? ({ accessible: false, importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const)
    : ({ accessible: true, accessibilityRole: 'image', accessibilityLabel: label ?? `Jot, ${FACES[name].label}` } as const);
  return (
    <View testID={testID} {...a11y} style={[{ width: (size * VIEW_W) / VIEW_H, height: size }, style]}>
      <Animated.View style={[{ flex: 1 }, body]} pointerEvents="none">
        <Svg width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
          <APath animatedProps={blush} d={BLUSH_D} stroke={ROSE} strokeOpacity={0.5} strokeWidth={sw} strokeLinecap="round" fill="none" />
          <APath animatedProps={sweat} d={SWEAT_D} {...pen} />
          <APath animatedProps={eyeL} {...pen} />
          <APath animatedProps={eyeR} {...pen} />
          <APath animatedProps={mouth} {...pen} />
        </Svg>
      </Animated.View>
    </View>
  );
}
