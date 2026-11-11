import React, { useEffect, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, interpolate, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Line, Path, Rect } from 'react-native-svg';
import { useReduceMotion, useTheme } from '../theme-context';
import { MARGIN, PAPER, TINTS } from '../../tokens/theme';
import { MOODS, type Pose, type ScrapCue, type ScrapMood } from './scrap-rig';

/**
 * Jot, the Margin mascot: a paper marionette of a student, hung from a ruler by three strings, who
 * juggles index cards — the classes, tasks and exams this app keeps in the air. Every piece is drawn
 * here in code (no bitmaps) and cut from the same papers in light and dark, as real paper would be.
 *
 * The rig is in 240 × 280 units and scaled as one. The strings are part of it: their lower ends are
 * computed from the same values that turn the arms, so a hand never leaves its string.
 */
export const JOT_W = 240, JOT_H = 280;
const T = TINTS.light, INK = PAPER.scrapInk, WHITE = PAPER.core, RED = MARGIN.light;
const SHOULDER = { l: [98, 146], r: [142, 146] } as const, HIP = { l: [108, 198], r: [132, 198] } as const;
const ARM = 46, ARM_UP = 114, EYE_R = 10.5, LOOK = 4.2;
/* The cards fly an arc over the head, from one hand to the other and back. */
const ARC = { cx: 120, cy: 128, rx: 66, ry: 88 } as const, CARD_W = 30, CARD_H = 21, CARDS = [T.tomato, T.denim, T.moss] as const;
const TAU = Math.PI * 2, RAD = Math.PI / 180;

const ALine = Animated.createAnimatedComponent(Line);
const abs = (left: number, top: number, width: number, height: number) => ({ position: 'absolute' as const, left, top, width, height });
/** The cut-paper look: the same shape once more underneath, a little lower, as its shadow. */
const under = { fill: INK, fillOpacity: 0.16 } as const;

export interface JotProps {
  size: number;
  mood?: ScrapMood;
  cue?: ScrapCue | null;
  /** Gaze in −1…1, driven from outside (a finger, a text field). Without it he looks around by himself. */
  lookX?: SharedValue<number>;
  lookY?: SharedValue<number>;
  attentive?: boolean;
  /** False while the screen he is on is not showing: he holds still and runs no loops. */
  awake?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const MOUTHS: Record<Pose['mouth'], React.ReactNode> = {
  smile: <Path d="M8 8Q20 20 32 8" stroke={INK} strokeWidth={3} strokeLinecap="round" fill="none" />,
  grin: <Path d="M7 6Q20 27 33 6Z" fill={INK} stroke={INK} strokeWidth={2} strokeLinejoin="round" />,
  o: <Circle cx={20} cy={12} r={5.5} fill={INK} />,
  wow: <Ellipse cx={20} cy={13} rx={7} ry={9} fill={INK} />,
  flat: <Path d="M11 11H29" stroke={INK} strokeWidth={3} strokeLinecap="round" />,
  wobble: <Path d="M8 13Q14 6 20 13T32 13" stroke={INK} strokeWidth={3} strokeLinecap="round" fill="none" />,
};

function Limb({ leg, flip }: { leg?: boolean; flip?: boolean }) {
  if (leg) return (
    <Svg width={24} height={66} viewBox="0 0 24 66">
      <Rect x={6} y={6} width={13} height={48} rx={6} {...under} />
      <Rect x={5.5} y={4} width={13} height={48} rx={6} fill={T.moss} />
      <Path d="M9 10V46M15 10V46" stroke={T.sage} strokeOpacity={0.55} strokeWidth={1.6} />
      <Ellipse cx={flip ? 15 : 9} cy={57} rx={10} ry={6} fill={INK} />
      <Circle cx={12} cy={28} r={2.6} fill={T.mustard} /><Circle cx={12} cy={5} r={3} fill={T.mustard} />
    </Svg>
  );
  return (
    <Svg width={20} height={62} viewBox="0 0 20 62">
      <Rect x={4.5} y={6} width={12} height={40} rx={6} {...under} />
      <Rect x={4} y={4} width={12} height={40} rx={6} fill={T.denim} />
      <Rect x={4} y={36} width={12} height={7} fill={T.mustard} />
      <Circle cx={10} cy={51.5} r={8.5} {...under} /><Circle cx={10} cy={50} r={8.5} fill={T.cream} />
      <Circle cx={10} cy={4.5} r={3} fill={T.mustard} />
    </Svg>
  );
}

function Card({ i, t, high, still }: { i: number; t: SharedValue<number>; high: SharedValue<number>; still: boolean }) {
  const st = useAnimatedStyle(() => {
    const s = Math.sin(TAU * ((still ? 0.08 : t.get()) + i / 3)), phi = s * (Math.PI / 2);
    return { transform: [{ translateX: ARC.cx + ARC.rx * Math.sin(phi) - CARD_W / 2 }, { translateY: ARC.cy - ARC.ry * high.get() * Math.cos(phi) - CARD_H / 2 }, { rotate: `${s * 200}deg` }] };
  });
  return (
    <Animated.View style={[abs(0, 0, CARD_W, CARD_H), st]}>
      <Svg width={CARD_W} height={CARD_H} viewBox="0 0 30 21">
        <Rect x={1.5} y={2.5} width={27} height={17} rx={2.5} {...under} />
        <Rect x={1} y={1} width={27} height={17} rx={2.5} fill={WHITE} />
        <Path d="M1 6.5V3.5A2.5 2.5 0 0 1 3.5 1H25.5A2.5 2.5 0 0 1 28 3.5V6.5Z" fill={CARDS[i]} />
        <Path d="M5 10.5H24M5 14H18" stroke={INK} strokeOpacity={0.35} strokeWidth={1.3} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

export function Jot({ size, mood = 'idle', cue = null, lookX, lookY, attentive = false, awake = true, style, testID }: JotProps) {
  const { c } = useTheme(), reduceMotion = useReduceMotion(), reduce = reduceMotion || !awake, k = size / JOT_W, m = MOODS[mood];
  const ownX = useSharedValue(0), ownY = useSharedValue(0.15), gx = lookX ?? ownX, gy = lookY ?? ownY;
  const lidTop = useSharedValue(m.lidTop), lidLow = useSharedValue(m.lidLow), blink = useSharedValue(0), pupil = useSharedValue(m.pupil);
  const sway = useSharedValue(0), juggle = useSharedValue(0), high = useSharedValue(1), hop = useSharedValue(0), kick = useSharedValue(0);
  const tilt = useSharedValue(m.tilt), shake = useSharedValue(0), cheeks = useSharedValue(m.cheeks ? 1 : 0), dashes = useSharedValue(0), mouthPop = useSharedValue(1);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  /* Mood: lids, tilt, cheeks and how high the cards go settle with a spring; the mouth pops as it changes. */
  useEffect(() => {
    const t = (v: number) => (reduce ? v : withSpring(v, { duration: 380, dampingRatio: 0.7 }));
    lidTop.set(t(m.lidTop)); lidLow.set(t(m.lidLow)); tilt.set(t(m.tilt)); pupil.set(t(m.pupil));
    high.set(t(mood === 'happy' || mood === 'wow' || mood === 'proud' ? 1.1 : mood === 'sleepy' || mood === 'worried' ? 0.8 : 1));
    cheeks.set(reduce ? (m.cheeks ? 1 : 0) : withTiming(m.cheeks ? 1 : 0, { duration: 260 }));
    if (!reduce) mouthPop.set(withSequence(withTiming(0.72, { duration: 70 }), withSpring(1, { duration: 320, dampingRatio: 0.45 })));
  }, [mood]); // eslint-disable-line react-hooks/exhaustive-deps

  /* He hangs, so he swings: a slow pendulum from the ruler, and the cards go round on one steady loop. */
  useEffect(() => {
    if (reduce) { sway.set(0); return; }
    sway.set(withRepeat(withSequence(withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.sin) }), withTiming(-1, { duration: 1900, easing: Easing.inOut(Easing.sin) })), -1));
    juggle.set(0); juggle.set(withRepeat(withTiming(1, { duration: 2600, easing: Easing.linear }), -1, false));
    return () => { cancelAnimation(sway); cancelAnimation(juggle); };
  }, [reduce, sway, juggle]);

  /* Blinks and glances, at uneven intervals. */
  useEffect(() => {
    if (reduce) return;
    let tm: ReturnType<typeof setTimeout>;
    const blinkOnce = () => withSequence(withTiming(1, { duration: 70, easing: Easing.in(Easing.quad) }), withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) }));
    const loop = () => {
      if (!alive.current) return;
      blink.set(Math.random() < 0.22 ? withSequence(blinkOnce(), withDelay(90, blinkOnce())) : blinkOnce());
      if (!attentive && Math.random() < 0.7) {
        gx.set(withSpring((Math.random() * 2 - 1) * 0.8, { duration: 260, dampingRatio: 0.8 })); gy.set(withSpring((Math.random() * 2 - 1) * 0.5, { duration: 260, dampingRatio: 0.8 }));
      }
      tm = setTimeout(loop, 1800 + Math.random() * 3600);
    };
    tm = setTimeout(loop, 900 + Math.random() * 1200);
    return () => clearTimeout(tm);
  }, [reduce, attentive, blink, gx, gy]);

  /* One-shot gestures. A hop is the strings being pulled: he rises and his limbs fly out. */
  useEffect(() => {
    if (!cue) return;
    if (reduce) { if (cue.kind === 'celebrate' || cue.kind === 'wow') { dashes.set(1); dashes.set(withDelay(1200, withTiming(0, { duration: 1 }))); } return; }
    const jump = (h: number, d: number) => withSequence(withTiming(-h, { duration: d, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: d * 0.9, easing: Easing.in(Easing.quad) }));
    const fling = (d: number) => withSequence(withTiming(1, { duration: d }), withSpring(0, { duration: 520, dampingRatio: 0.4 }));
    const spark = (hold: number) => withSequence(withSpring(1, { duration: 300, dampingRatio: 0.5 }), withDelay(hold, withTiming(0, { duration: 260 })));
    if (cue.kind === 'hop') { hop.set(jump(20, 190)); kick.set(fling(190)); }
    if (cue.kind === 'celebrate') { hop.set(withSequence(jump(26, 200), jump(16, 160))); kick.set(withSequence(fling(200), fling(160))); dashes.set(spark(1100)); }
    if (cue.kind === 'wow') { dashes.set(spark(900)); kick.set(fling(140)); }
    if (cue.kind === 'nod') tilt.set(withSequence(withTiming(m.tilt + 7, { duration: 140 }), withTiming(m.tilt - 3, { duration: 140 }), withSpring(m.tilt, { duration: 260 })));
    if (cue.kind === 'shake') shake.set(withSequence(withTiming(1, { duration: 70 }), withTiming(-1, { duration: 110 }), withTiming(1, { duration: 110 }), withTiming(-0.6, { duration: 100 }), withSpring(0, { duration: 220 })));
  }, [cue?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Each hand pumps once per card; the two are half a beat apart. */
  const armL = (v: number, kk: number) => { 'worklet'; return ARM_UP + 8 * Math.sin(TAU * 3 * v) + kk * 22; };
  const armR = (v: number, kk: number) => { 'worklet'; return -(ARM_UP + 8 * Math.sin(TAU * 3 * v + Math.PI) + kk * 22); };
  const hang = useAnimatedStyle(() => ({ transform: [{ translateX: shake.get() * 7 }, { rotate: `${sway.get() * 1.6 + shake.get() * 3}deg` }] }));
  const lift = useAnimatedStyle(() => ({ transform: [{ translateY: hop.get() }] }));
  const armLS = useAnimatedStyle(() => ({ transform: [{ rotate: `${armL(juggle.get(), kick.get())}deg` }] }));
  const armRS = useAnimatedStyle(() => ({ transform: [{ rotate: `${armR(juggle.get(), kick.get())}deg` }] }));
  const legLS = useAnimatedStyle(() => ({ transform: [{ rotate: `${-sway.get() * 5 + kick.get() * 24}deg` }] }));
  const legRS = useAnimatedStyle(() => ({ transform: [{ rotate: `${-sway.get() * 5 - kick.get() * 24}deg` }] }));
  const headS = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt.get() - sway.get() * 1.2}deg` }] }));
  const tassel = useAnimatedStyle(() => ({ transform: [{ rotate: `${sway.get() * 14 - tilt.get() * 1.5 + kick.get() * 30}deg` }] }));
  const face = useAnimatedStyle(() => ({ transform: [{ translateX: gx.get() * 2.5 }, { translateY: gy.get() * 2 }] }));
  const pupils = useAnimatedStyle(() => ({ transform: [{ translateX: gx.get() * LOOK }, { translateY: gy.get() * LOOK * 0.85 }, { scale: pupil.get() }] }));
  const upper = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(Math.max(lidTop.get(), blink.get()), [0, 1], [-EYE_R * 2 - 1, 0]) }] }));
  const lower = useAnimatedStyle(() => ({ transform: [{ translateY: interpolate(lidLow.get(), [0, 1], [EYE_R * 2 + 1, EYE_R * 0.95]) }] }));
  const mouthS = useAnimatedStyle(() => ({ transform: [{ scale: mouthPop.get() }] }));
  const cheekS = useAnimatedStyle(() => ({ opacity: cheeks.get() * 0.5 }));
  const dashS = useAnimatedStyle(() => ({ opacity: Math.min(1, dashes.get() * 1.4), transform: [{ scale: 0.4 + dashes.get() * 0.6 }, { rotate: `${(1 - dashes.get()) * -18}deg` }] }));
  const shadowS = useAnimatedStyle(() => ({ opacity: 0.1 - Math.min(0.07, -hop.get() / 400), transform: [{ scaleX: 1 + hop.get() / 160 }] }));
  const strHead = useAnimatedProps(() => ({ y2: 50 + hop.get() }));
  const strL = useAnimatedProps(() => { const a = armL(juggle.get(), kick.get()) * RAD; return { x2: SHOULDER.l[0] - ARM * Math.sin(a), y2: SHOULDER.l[1] + ARM * Math.cos(a) + hop.get() }; });
  const strR = useAnimatedProps(() => { const a = armR(juggle.get(), kick.get()) * RAD; return { x2: SHOULDER.r[0] - ARM * Math.sin(a), y2: SHOULDER.r[1] + ARM * Math.cos(a) + hop.get() }; });
  const string = { stroke: INK, strokeOpacity: 0.5, strokeWidth: 1.3, strokeLinecap: 'round' } as const;

  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={`Jot, the Margin mascot, looking ${m.say}`} style={[{ width: size, height: JOT_H * k }, style]} pointerEvents="none">
      <View style={[abs(0, 0, JOT_W, JOT_H), { transform: [{ scale: k }], transformOrigin: '0% 0%' }]}>
        <Animated.View style={[abs(64, 266, 112, 11), { borderRadius: 56, backgroundColor: c.shadow }, shadowS]} />
        <Animated.View style={[abs(0, 0, JOT_W, JOT_H), { transformOrigin: '50% 5%' }, hang]}>
          {/* The ruler he hangs from, and the three strings. */}
          <Svg width={JOT_W} height={JOT_H} style={abs(0, 0, JOT_W, JOT_H)}>
            <ALine x1={120} y1={20} x2={120} animatedProps={strHead} {...string} />
            <ALine x1={58} y1={20} animatedProps={strL} {...string} />
            <ALine x1={182} y1={20} animatedProps={strR} {...string} />
            <Rect x={41} y={10} width={160} height={13} rx={2.5} {...under} />
            <Rect x={40} y={8} width={160} height={13} rx={2.5} fill={T.mustard} />
            <Path d={Array.from({ length: 15 }, (_, i) => `M${50 + i * 10} 8v${i % 5 === 0 ? 7 : 4}`).join('')} stroke={INK} strokeOpacity={0.6} strokeWidth={1.2} />
          </Svg>
          <Animated.View style={[abs(0, 0, JOT_W, JOT_H), lift]}>
            <Animated.View style={[abs(HIP.l[0] - 12, HIP.l[1] - 5, 24, 66), { transformOrigin: '50% 7.5%' }, legLS]}><Limb leg /></Animated.View>
            <Animated.View style={[abs(HIP.r[0] - 12, HIP.r[1] - 5, 24, 66), { transformOrigin: '50% 7.5%' }, legRS]}><Limb leg flip /></Animated.View>
            {/* The body is a page from a notebook: ruled, with the red margin line the app is named for. */}
            <Svg width={JOT_W} height={JOT_H} style={abs(0, 0, JOT_W, JOT_H)}>
              <Path d="M95 141Q120 134 145 141L152 201Q120 210 88 201Z" {...under} />
              <Path d="M95 138Q120 131 145 138L152 198Q120 207 88 198Z" fill={T.cream} />
              <Path d="M95 152H146M93 163H148M92 174H149M91 185H150" stroke={T.denim} strokeOpacity={0.45} strokeWidth={1.3} />
              <Path d="M105 137L101 202" stroke={RED} strokeOpacity={0.8} strokeWidth={1.5} />
              <Path d="M108 136H132L120 153Z" fill={T.tomato} />
            </Svg>
            <Animated.View style={[abs(SHOULDER.l[0] - 10, SHOULDER.l[1] - 4.5, 20, 62), { transformOrigin: '50% 7.3%' }, armLS]}><Limb /></Animated.View>
            <Animated.View style={[abs(SHOULDER.r[0] - 10, SHOULDER.r[1] - 4.5, 20, 62), { transformOrigin: '50% 7.3%' }, armRS]}><Limb /></Animated.View>
            <Animated.View style={[abs(60, 30, 120, 112), { transformOrigin: '50% 95%' }, headS]}>
              <Svg width={120} height={112} viewBox="0 0 120 112">
                <Ellipse cx={60} cy={69} rx={41} ry={38} {...under} />
                <Ellipse cx={60} cy={66} rx={41} ry={38} fill={T.cream} />
                <Path d="M20 60Q24 26 60 26Q96 26 100 60Q84 40 60 43Q36 40 20 60Z" fill={T.kraft} />
                <Path d="M36 36V46Q60 56 84 46V36Z" fill={INK} />
                <Path d="M10 30L60 14L110 30L60 46Z" fill={INK} />
                <Path d="M60 30L100 31" stroke={T.mustard} strokeWidth={1.6} /><Circle cx={60} cy={30} r={3.2} fill={T.mustard} />
              </Svg>
              <Animated.View style={[abs(96, 28, 8, 34), { transformOrigin: '50% 8%' }, tassel]}>
                <Svg width={8} height={34} viewBox="0 0 8 34"><Path d="M4 3V20" stroke={T.mustard} strokeWidth={1.6} /><Path d="M1 20H7L8 32H0Z" fill={T.tomato} /></Svg>
              </Animated.View>
              <Animated.View style={[abs(0, 0, 120, 112), face]}>
                {[44, 76].map((x) => (
                  <View key={x} style={[abs(x - EYE_R, 68 - EYE_R, EYE_R * 2, EYE_R * 2), { borderRadius: EYE_R, overflow: 'hidden', backgroundColor: WHITE }]}>
                    <Animated.View style={[abs(EYE_R - 5, EYE_R - 4, 10, 10), { borderRadius: 5, backgroundColor: INK }, pupils]} />
                    <Animated.View style={[abs(0, 0, EYE_R * 2, EYE_R * 2), { backgroundColor: T.sand }, upper]} />
                    <Animated.View style={[abs(0, 0, EYE_R * 2, EYE_R * 2), { backgroundColor: T.sand }, lower]} />
                  </View>
                ))}
                {[30, 90].map((x) => <Animated.View key={x} style={[abs(x - 7, 78, 14, 11), { borderRadius: 7, backgroundColor: T.tomato }, cheekS]} />)}
                <Animated.View style={[abs(40, 80, 40, 26), mouthS]}><Svg width={40} height={26} viewBox="0 0 40 26">{MOUTHS[m.mouth]}</Svg></Animated.View>
              </Animated.View>
            </Animated.View>
            {CARDS.map((_, i) => <Card key={i} i={i} t={juggle} high={high} still={reduce} />)}
          </Animated.View>
          <Animated.View style={[abs(190, 34, 56, 56), { transformOrigin: '0% 100%' }, dashS]}>
            <Svg width={56} height={56} viewBox="0 0 64 64"><Path d="M10 40L22 24M22 50L44 38M28 18L34 4" stroke={c.ink} strokeWidth={5} strokeLinecap="round" /></Svg>
          </Animated.View>
        </Animated.View>
      </View>
    </View>
  );
}
