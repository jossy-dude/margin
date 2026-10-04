import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Image, Pressable, View, useWindowDimensions, type View as RNView } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Line, Path, Pattern } from 'react-native-svg';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { ClockFace } from '../ui/clock/ClockFace';
import { HandBox, Icon, Tape, Txt } from '../ui/kit';
import { useNow, useReduceMotion, useTheme } from '../ui/theme-context';
import { act, toast, useStore } from '../store/store';
import { canBreak, view, MIN_BREAK_AFTER_MS, FLOW_OVER_CAP_MS } from '../domain/timer';
import { fmtClock, fmtDur } from '../domain/time';
import { fx } from '../services/fx';
import { handPath } from '../ui/hand';
import { hexA } from '../tokens/theme';

const PAGE = require('../../assets/images/journal-page.jpg');
function Box({ children, style, seed, fill, sw = 2.5, shadow = true }: { children?: React.ReactNode; style?: object; seed: string; fill?: string; sw?: number; shadow?: boolean }) {
  const { c } = useTheme();
  return <HandBox seed={seed} fill={fill ?? c.card} sw={sw} amp={1.5} shadow={shadow} style={style}>{children}</HandBox>;
}
const D = 282, C0 = 141;
/** the readout is a hand-cut paper hub concentric with the dial (was a rectangle pasted over the face) */
const HUB = 52, HUB_S = HUB * 2, HUB_BOX = HUB_S + 4, HUB_RAD = { h: [HUB, HUB, HUB, HUB], v: [HUB, HUB, HUB, HUB] } as const;
const P = (r: number, deg: number): [number, number] => { const a = (deg * Math.PI) / 180; return [C0 + r * Math.sin(a), C0 - r * Math.cos(a)]; };
const sector = (r0: number, r1: number, deg: number) => {
  if (deg <= 0.2) return ''; if (deg >= 359.8) return `M${C0 + r1} ${C0}A${r1} ${r1} 0 1 1 ${C0 - r1} ${C0}A${r1} ${r1} 0 1 1 ${C0 + r1} ${C0}ZM${C0 + r0} ${C0}A${r0} ${r0} 0 1 0 ${C0 - r0} ${C0}A${r0} ${r0} 0 1 0 ${C0 + r0} ${C0}Z`;
  const [ax, ay] = P(r1, 0), [bx, by] = P(r1, deg), [cx, cy] = P(r0, deg), [dx, dy] = P(r0, 0), big = deg > 180 ? 1 : 0;
  return `M${ax} ${ay}A${r1} ${r1} 0 ${big} 1 ${bx} ${by}L${cx} ${cy}A${r0} ${r0} 0 ${big} 0 ${dx} ${dy}Z`;
};
/** the knurled bed never changes, so its path is built once instead of 4x/second */
const BED_RING = `M${C0 + 139} ${C0}A139 139 0 1 1 ${C0 - 139} ${C0}A139 139 0 1 1 ${C0 + 139} ${C0}ZM${C0 + 114} ${C0}A114 114 0 1 0 ${C0 - 114} ${C0}A114 114 0 1 0 ${C0 + 114} ${C0}Z`;
const RAD = { h: [48, 48, 48, 48], v: [48, 48, 48, 48] } as const;

function Dial({ min, phase, leftMs, running, editable, onChange, flowing, readout, tick, wash }: { min: number; phase: string; leftMs: number; running: boolean; editable: boolean; onChange: (m: number, vel: number) => void; flowing: boolean; readout: string; tick: SharedValue<number>; wash: SharedValue<number> }) {
  const { c, dark } = useTheme(), face = useStore((s) => s.settings.clock), route = useStore((s) => s.route), reduce = useReduceMotion();
  const ref = useRef<RNView>(null), cx = useSharedValue(0), cy = useSharedValue(0), raw = useSharedValue(min), last = useSharedValue(0), cur = useSharedValue(min), knob = useSharedValue(0), hand = useSharedValue(0), drag = useSharedValue(0), jolt = useSharedValue(0), warnSV = useSharedValue(0);
  const measure = useCallback(() => { ref.current?.measureInWindow((x, y, w, h) => { cx.value = x + w / 2; cy.value = y + h / 2; }); }, [cx, cy]);
  const live = phase !== 'set', mins = live ? leftMs / 60_000 : min, ang = (mins >= 60 ? mins % 60 || 60 : mins) * 6;
  useEffect(() => { raw.value = min; cur.value = min; }, [min, raw, cur]);
  useEffect(() => { if (drag.value) return; hand.value = reduce || live ? ang : withTiming(ang, { duration: 220, easing: Easing.out(Easing.cubic) }); }, [ang, live, reduce, hand, drag]);
  useEffect(() => { if (running && !flowing) jolt.value = withSequence(withTiming(1, { duration: 40 }), withTiming(0, { duration: 140 })); }, [Math.floor(leftMs / 1000)]); // eslint-disable-line react-hooks/exhaustive-deps
  const warnOn = running && leftMs > 0 && leftMs <= 10_000; // the last 10 seconds are announced by a red ring, not only by a blip
  useEffect(() => { if (warnOn && !reduce) warnSV.value = withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 300 })); }, [warnOn, reduce, warnSV]);
  const pan = Gesture.Pan().enabled(editable).minDistance(0)
    .onBegin((e) => { drag.value = 1; last.value = (Math.atan2(e.absoluteY - cy.value, e.absoluteX - cx.value) * 180) / Math.PI; })
    .onUpdate((e) => {
      const a = (Math.atan2(e.absoluteY - cy.value, e.absoluteX - cx.value) * 180) / Math.PI; let d = a - last.value; if (d > 180) d -= 360; if (d < -180) d += 360; last.value = a;
      const before = raw.value; raw.value = Math.max(5, Math.min(240, raw.value + d / 6)); knob.value += d; hand.value = (raw.value % 60 || 60) * 6;
      const snap = Math.round(raw.value / 5) * 5;
      if (snap !== cur.value) { cur.value = snap; runOnJS(onChange)(snap, Math.abs(e.velocityX) + Math.abs(e.velocityY)); } else if ((raw.value === 5 || raw.value === 240) && before !== raw.value) runOnJS(onChange)(snap, -1);
    })
    .onFinalize(() => { drag.value = 0; hand.value = withTiming(((cur.value % 60) || 60) * 6, { duration: 160 }); });
  const gripS = useAnimatedStyle(() => ({ transform: [{ rotate: `${knob.value}deg` }] })), handS = useAnimatedStyle(() => ({ transform: [{ rotate: `${hand.value + jolt.value * 1.6}deg` }] }));
  const tickS = useAnimatedStyle(() => ({ transformOrigin: '50% 50%', transform: [{ scale: 1 + tick.value * 0.045 }] })), washS = useAnimatedStyle(() => ({ opacity: wash.value * 0.42 })), warnS = useAnimatedStyle(() => ({ opacity: 0.62 + warnSV.value * 0.38 }));
  /** The bed is the tone the page surface takes one step off: deeper than the paper in light, raised above the
   *  desk in dark. Read from the theme so it follows the palette instead of staying warm-tinted under Original. */
  const bed = dark ? c.card : c.desk, ink = c.ink;
  const progDeg = !live ? 0 : (1 - leftMs / (min * 60_000 || 1)) * 360;
  const grip = useMemo(() => <Svg width={D} height={D}>
    <Path d={BED_RING} fill={bed} fillRule="evenodd" /><Path d={BED_RING} fill={hexA(ink, 0.13)} fillRule="evenodd" />
    {Array.from({ length: 60 }, (_, i) => { const a = (i * 6 * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a); return <Line key={i} x1={C0 + 131 * ca} y1={C0 + 131 * sa} x2={C0 + 138 * ca} y2={C0 + 138 * sa} stroke={ink} strokeWidth={1.7} strokeOpacity={0.5} />; })}
    <Circle cx={C0} cy={C0} r={139} fill="none" stroke={ink} strokeWidth={1.6} /><Circle cx={C0} cy={C0} r={113.5} fill="none" stroke={ink} strokeWidth={1.2} strokeOpacity={0.7} />
  </Svg>, [bed, ink]);
  const hatch = useMemo(() => <Defs><Pattern id="hatch" width={5.5} height={5.5} patternUnits="userSpaceOnUse" patternTransform="rotate(135)"><Line x1={0} y1={0} x2={0} y2={5.5} stroke={ink} strokeWidth={1.6} /></Pattern></Defs>, [ink]);
  const marks = useMemo(() => [['60', 141, 18], ['15', 264, 141], ['30', 141, 264], ['45', 18, 141]].map(([t, x, y]) => <Txt key={t as string} f="type" s={10} pointerEvents="none" style={{ position: 'absolute', left: (x as number) - 10, top: (y as number) - 6, width: 20, textAlign: 'center', textShadowColor: c.paper, textShadowRadius: 4 }}>{t}</Txt>), [c.paper]);
  const hub = useMemo(() => handPath(HUB_S, HUB_S, HUB_RAD, 7717, 1.6), []);
  const pointer = useMemo(() => <Svg width={D} height={D}><Path d={`M${C0} ${C0 + 14}L${C0} 54`} stroke={ink} strokeWidth={3} strokeLinecap="round" /><Path d={`M${C0} 34L${C0 + 6.5} 58L${C0 - 6.5} 58Z`} fill={ink} /><Circle cx={C0} cy={C0} r={6.5} fill={ink} /></Svg>, [ink]);
  return (
    <GestureDetector gesture={pan}>
      <View collapsable={false} onTouchStart={measure} style={{ position: 'absolute', left: 76, top: 350, width: D, height: D }} accessible accessibilityRole="adjustable" accessibilityLabel="Focus minutes. Swipe up or down to change." accessibilityValue={{ text: `${live ? Math.ceil(leftMs / 60_000) + ' minutes left' : min + ' minutes'}` }}
        accessibilityActions={editable ? [{ name: 'increment' }, { name: 'decrement' }] : []} onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'increment') onChange(Math.min(240, min + 5), 300); else onChange(Math.max(5, min - 5), 300); }}>
        <View ref={ref} onLayout={measure} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: D, height: D }} />
        <View style={{ position: 'absolute', left: (D - 185) / 2, top: (D - 185) / 2, borderRadius: 93, overflow: 'hidden', borderWidth: 1.5, borderColor: hexA(ink, 0.34) }}><ClockFace id={face} size={182} hands={false} live={route === 'Focus'} /></View>
        <Svg width={D} height={D} style={{ position: 'absolute' }} pointerEvents="none">{hatch}<Path d={sector(95, 112, progDeg)} fill="url(#hatch)" /></Svg>
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: D, height: D }, handS]}>{pointer}</Animated.View>
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: D, height: D }, gripS]}>{grip}</Animated.View>
        {marks}
        {/* the timer reads inside its own dial: a round paper hub on the dial's centre, so the face, the cliff photo and the pointer all stay readable */}
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: C0 - HUB, top: C0 - HUB, width: HUB_S, height: HUB_S, alignItems: 'center', justifyContent: 'center' }, tickS]}>
          <Svg width={HUB_BOX} height={HUB_BOX} style={{ position: 'absolute', left: -2, top: -2 }} viewBox={`-2 -2 ${HUB_BOX} ${HUB_BOX}`}>
            <Path d={hub} transform="translate(2.6 3)" fill={hexA(c.shadow, 0.2)} /><Path d={hub} fill={c.card} stroke={c.ink} strokeWidth={2.1} strokeLinejoin="round" />
          </Svg>
          {warnOn && <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -2, top: -2 }, warnS]}><Svg width={HUB_BOX} height={HUB_BOX} viewBox={`-2 -2 ${HUB_BOX} ${HUB_BOX}`}><Circle cx={HUB + 2} cy={HUB + 2} r={HUB + 4} fill="none" stroke={c.bad} strokeWidth={2.6} /></Svg></Animated.View>}
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 4, top: 4, right: 4, bottom: 4, borderRadius: HUB - 4, backgroundColor: c.acc }, washS]} />
          <Txt f="type" s={27} style={{ letterSpacing: -0.8 }} accessibilityLiveRegion="none">{readout}</Txt>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

function BreakSticker({ leftMs, totalMs, falling, onGone, onBack, nudge }: { leftMs: number; totalMs: number; falling: boolean; onGone: () => void; onBack: () => void; nudge: number }) {
  const { c } = useTheme(), reduce = useReduceMotion(), p = useSharedValue(0), sw = useSharedValue(0), wig = useSharedValue(0), size = 96;
  useEffect(() => { if (nudge && !falling && !reduce) wig.value = withSequence(withTiming(1, { duration: 70 }), withTiming(-1, { duration: 110 }), withTiming(0.7, { duration: 90 }), withTiming(-0.5, { duration: 90 }), withTiming(0, { duration: 90 })); }, [nudge, falling, reduce, wig]);
  useEffect(() => {
    if (!falling) return;
    if (reduce) { p.value = withTiming(1, { duration: 200 }, (d) => { if (d) runOnJS(onGone)(); }); return; }
    sw.value = withSequence(withTiming(-1, { duration: 200 }), withTiming(0.8, { duration: 240 }), withTiming(-0.55, { duration: 220 }), withTiming(0.3, { duration: 200 }), withTiming(0, { duration: 160 }));
    p.value = withSequence(withTiming(0, { duration: 1000 }), withTiming(1, { duration: 1050, easing: Easing.in(Easing.quad) }, (d) => { if (d) runOnJS(onGone)(); }));
  }, [falling]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useAnimatedStyle(() => {
    const swing = sw.value * 24 + wig.value * 9, k = p.value, flutter = Math.sin(k * Math.PI * 3.2) * 46 * k, rot = swing + interpolate(k, [0, 1], [0, 160]);
    return { transformOrigin: '14% 5%', transform: [{ translateX: flutter }, { translateY: k * 640 }, { rotate: `${rot}deg` }], opacity: interpolate(k, [0, 0.8, 1], [1, 1, 0]) };
  });
  const d = React.useMemo(() => handPath(size, size, RAD, 77, 1.6), []);
  const prog = totalMs ? 1 - leftMs / totalMs : 0, R = 38, circ = 2 * Math.PI * R;
  return (
    <Animated.View style={[{ position: 'absolute', left: 332, top: 540, width: size, height: size, zIndex: 20 }, st]}>
      <Pressable onPress={onBack} disabled={falling} accessibilityRole="button" accessibilityLabel={`Break, ${fmtClock(leftMs / 1000)} left. Tap to go back to work.`} style={{ width: size, height: size, transform: [{ rotate: '4deg' }] }}>
        <Svg width={size + 8} height={size + 8} style={{ position: 'absolute' }} viewBox={`-2 -2 ${size + 8} ${size + 8}`}>
          <Path d={d} transform="translate(3 4)" fill={hexA(c.shadow, 0.28)} /><Path d={d} fill={c.card} stroke={c.ink} strokeWidth={1.8} />
          <Circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={hexA(c.ink, 0.18)} strokeWidth={4} />
          <Circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={c.acc} strokeWidth={4} strokeLinecap="round" strokeDasharray={`${circ * prog} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        </Svg>
        <View style={{ position: 'absolute', left: 0, right: 0, top: 22, alignItems: 'center' }}><Icon name="coffee" size={18} color={c.ink} /><Txt f="type" s={19} style={{ marginTop: 2 }}>{fmtClock(leftMs / 1000)}</Txt><Txt f="serif" s={11.5} c="mut">tap = back to work</Txt></View>
        <Tape w={50} rot={-30} style={{ left: -14, top: 2 }} />
      </Pressable>
    </Animated.View>
  );
}

export function FocusScreen() {
  const route = useStore((s) => s.route), sheet = useStore((s) => s.sheet), timer = useStore((s) => s.timer), fev = useStore((s) => s.fev), settings = useStore((s) => s.settings), tasks = useStore((s) => s.tasks), courses = useStore((s) => s.courses);
  const st = { route, sheet, timer, fev, settings, tasks, courses };
  const { c, dark } = useTheme(), { width } = useWindowDimensions(), ins = useSafeAreaInsets(), reduce = useReduceMotion(), now = useNow(st.route === 'Focus' || st.timer.running ? 1000 : 30_000), s = width / 440, t = st.timer, v = view(t, now);
  const task = st.tasks.find((x) => x.id === t.taskId), course = st.courses.find((x) => x.id === t.courseId), topOff = ins.top / s;
  const stamp = useSharedValue(0), [stampN, setStampN] = useState(1), [ghost, setGhost] = useState<null | { total: number }>(null), prev = useRef(t.phase), lastSec = useRef(0), [nudge, setNudge] = useState(0), [live, setLive] = useState(''), tickSV = useSharedValue(0), wash = useSharedValue(0);
  const editable = t.phase === 'set';
  /** flow overtime is capped: past the cap the clock is frozen, so the page must stop pretending to count */
  const frozen = t.running && t.phase === 'focus' && v.leftMs === 0 && v.overMs >= FLOW_OVER_CAP_MS;
  useEffect(() => { act.timerPump(now); }, [now]);
  useEffect(() => { if (st.route !== 'Focus') return; if (t.running) void activateKeepAwakeAsync('focus'); else void deactivateKeepAwake('focus'); return () => { void deactivateKeepAwake('focus'); }; }, [t.running, st.route]);
  useEffect(() => { const h = BackHandler.addEventListener('hardwareBackPress', () => { if (st.route === 'Focus' && !st.sheet) { act.go('Today'); return true; } return false; }); return () => h.remove(); }, [st.route, st.sheet]);
  useEffect(() => { // old-clock tik / tok each second while a round is running (never while the clock is frozen)
    if (st.route !== 'Focus' || !t.running || t.phase !== 'focus' || !st.settings.tickOn || frozen) return; const sec = Math.floor(now / 1000); if (sec !== lastSec.current) { lastSec.current = sec; fx.tick(sec % 2 === 0); tickSV.value = withSequence(withTiming(1, { duration: 40 }), withTiming(0, { duration: 160 })); }
  }, [now, t.running, t.phase, st.settings.tickOn, st.route, tickSV, frozen]);
  /* eslint-disable react-hooks/set-state-in-effect -- timer events and phase transitions are discrete events, not derived state */
  useEffect(() => { // events from the timer drive the stamp, the nudge wiggle/wash, the sticker falling and the spoken announcements
    const e = st.fev; if (!e || Date.now() - e.at > 1500) return;
    if (e.k === 'roundDone') { setStampN(t.rounds); setLive(`Round ${t.rounds} done`); stamp.value = 0; stamp.value = reduce ? withSequence(withTiming(1, { duration: 120 }), withTiming(1, { duration: 1500 }), withTiming(0, { duration: 300 })) : withSequence(withTiming(1, { duration: 460, easing: Easing.bezier(0.2, 1.5, 0.3, 1) }), withTiming(1, { duration: 1500 }), withTiming(0, { duration: 400 })); }
    if (e.k === 'warn10') setLive('10 seconds left');
    if (e.k === 'nudge') { setNudge((n) => n + 1); wash.value = withSequence(withTiming(1, { duration: reduce ? 200 : 150 }), withTiming(0, { duration: reduce ? 520 : 640 })); }
  }, [st.fev]); // eslint-disable-line react-hooks/exhaustive-deps
  // the sticker outlives the break phase so it can swing and fall; this is an event (phase transition), not derived state
  useEffect(() => { if (prev.current === 'break' && t.phase !== 'break') setGhost({ total: t.breakMs }); prev.current = t.phase; }, [t.phase, t.breakMs]);
  const stampS = useAnimatedStyle(() => ({ opacity: stamp.value, transform: [{ rotate: '-11deg' }, { scale: interpolate(stamp.value, [0, 1], [1.7, 1]) }] }));
  /* eslint-enable react-hooks/set-state-in-effect */
  const phaseLabel = t.phase === 'set' ? 'ready' : t.phase === 'break' ? 'on a break' : v.flowing && v.overMs > 0 ? `flow +${Math.floor(v.overMs / 60_000)}m` : t.running ? 'focusing' : v.roundDone ? 'round done' : 'paused', rn = t.rounds + (t.phase === 'set' || v.roundDone ? (t.phase === 'set' ? 1 : 0) : 1) || 1;
  const bigText = t.phase === 'set' ? `${t.planMin} min` : t.phase === 'break' ? fmtClock(v.breakLeftMs / 1000) : v.roundDone && v.overMs > 0 ? `+${fmtClock(v.overMs / 1000)}` : fmtClock(v.leftMs / 1000);
  const subText = t.phase === 'set' ? 'ready when you are' : t.phase === 'break' ? 'break, main clock paused' : frozen ? `flow capped at ${Math.round(FLOW_OVER_CAP_MS / 60_000)} min` : v.roundDone && !t.running ? 'round complete' : t.running ? `${fmtDur(Math.max(1, Math.round(t.planMin - t.focusElapsedMs / 60_000)))} to go` : 'paused';
  const goLabel = t.phase === 'set' ? 'Start' : t.phase === 'break' ? 'On break' : t.running ? 'Pause' : v.roundDone ? 'Next round' : 'Resume';
  const onGo = () => { if (t.phase === 'break') { fx.denied(); return; } const wasRunning = t.running; const n = act.timerToggle(); if (!wasRunning && n.running) fx.start(); else fx.clack(); };
  const breakGate = canBreak(t) ? '' : t.phase === 'break' ? 'Already on a break.' : t.phase !== 'focus' || !t.running ? 'Start a round first.' : t.breaksUsed >= t.breaksAllowed ? 'No breaks left this round.' : `Breaks unlock after ${Math.round(MIN_BREAK_AFTER_MS / 60_000)} min of focus.`;
  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={{ width: 440 * s, height: 1001 * s, overflow: 'hidden', alignSelf: 'center' }}>
        <View style={{ width: 440, height: 1001, transformOrigin: '0% 0%', transform: [{ scale: s }] }}>
          <Image source={PAGE} style={{ position: 'absolute', width: 440, height: 1001 }} />
          {dark && <View pointerEvents="none" style={{ position: 'absolute', width: 440, height: 1001, backgroundColor: '#1B1712', opacity: 0.62 }} />}
          <Box seed="rnd" style={{ position: 'absolute', left: 32, top: 6 + topOff, paddingHorizontal: 12, paddingTop: 5, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 8, transform: [{ rotate: '-1.5deg' }] }}>
            <Txt f="bold" s={19} accessibilityLiveRegion="polite">Round {rn} · {phaseLabel}</Txt>
            <View style={{ flexDirection: 'row', gap: 3 }}>{[0, 1, 2, 3].map((i) => <View key={i} style={{ width: 9, height: 9, borderRadius: 5, borderWidth: 1.6, borderColor: c.ink, backgroundColor: i < t.rounds % 4 || (t.rounds > 0 && t.rounds % 4 === 0) ? c.ink : 'transparent' }} />)}</View>
          </Box>
          <Pressable onPress={() => act.go('Today')} accessibilityRole="button" accessibilityLabel="Back to Today" style={{ position: 'absolute', right: 66, top: 8 + topOff }}><Box seed="back" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="back" size={22} color={c.ink} /></Box></Pressable>
          <Pressable onPress={() => { act.setSettings({ soundOn: !st.settings.soundOn }); }} accessibilityRole="switch" accessibilityState={{ checked: st.settings.soundOn }} accessibilityLabel="Sounds" style={{ position: 'absolute', right: 14, top: 8 + topOff }}><Box seed="snd" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="sound" size={22} color={st.settings.soundOn ? c.ink : c.mut} /></Box></Pressable>
          <Box seed="task" style={{ position: 'absolute', left: 32, top: 259, width: 386, paddingHorizontal: 15, paddingTop: 11, paddingBottom: 10, transform: [{ rotate: '-1deg' }] }}>
            <Tape w={46} rot={-24} style={{ left: -11, top: -6 }} />
            <Txt f="serifB" s={17} style={{ alignSelf: 'flex-start', borderBottomWidth: 1.5, borderBottomColor: c.ink, paddingBottom: 1 }}>{course?.name ?? 'Personal'}</Txt>
            <Txt f="marker" s={21} style={{ marginTop: 5, marginRight: 84 }} numberOfLines={2}>{task?.title ?? (t.title || 'Free focus')}</Txt>
            <Pressable onPress={() => act.timerSwap()} disabled={!editable} accessibilityRole="button" accessibilityLabel={`Swap task, now ${task?.title ?? 'free focus'}`} style={{ position: 'absolute', right: 10, bottom: 9, minHeight: 32, paddingHorizontal: 4, justifyContent: 'center', opacity: editable ? 1 : 0.4 }}><Txt f="bold" s={15} c="mut" style={{ borderBottomWidth: 1.5, borderStyle: 'dashed', borderBottomColor: c.mut }}>swap task</Txt></Pressable>
          </Box>
          <Dial min={t.planMin} phase={t.phase} leftMs={t.phase === 'break' ? t.focusLeftMs : t.focusLeftMs} running={t.running && t.phase === 'focus'} editable={editable} flowing={v.flowing} readout={bigText} tick={tickSV} wash={wash}
            onChange={(m, vel) => { if (vel < 0) { fx.bump(); return; } if (m !== t.planMin) { act.timerSetMin(m); fx.detent(vel); } }} />
          <Txt f="serifB" s={12.5} c="mut" pointerEvents="none" style={{ position: 'absolute', left: 60, top: 640, width: 320, textAlign: 'center', textShadowColor: c.paper, textShadowRadius: 4 }}>{subText}</Txt>
          <Txt f="hand" s={15} pointerEvents="none" style={{ position: 'absolute', left: 360, top: 352, transform: [{ rotate: '6deg' }], textShadowColor: c.paper, textShadowRadius: 4, width: 90 }}>{'focus doesn\'t\nhappen by\naccident'}</Txt>
          <View style={{ position: 'absolute', left: 56, top: 672, width: 360, flexDirection: 'row', gap: 7, alignItems: 'stretch' }}>
            {[25, 45, 50, 90].map((m) => { const on = t.planMin === m; return (
              <Pressable key={m} disabled={!editable} onPress={() => { act.timerSetMin(m); fx.detent(500); act.setSettings({ focusPresetMin: m }); }} accessibilityRole="button" accessibilityState={{ selected: on, disabled: !editable }} accessibilityLabel={`${m} minutes`} style={{ flex: 1, minWidth: 44, opacity: editable ? 1 : 0.55 }}>
                <Box seed={`op${m}`} fill={on ? c.ink : c.card} shadow={on} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Txt f="bold" s={20} c={on ? 'card' : 'ink'}>{m}</Txt><Txt f="hand" s={11} c={on ? 'card' : 'mut'} style={{ marginTop: -2 }}>min</Txt></Box>
              </Pressable>); })}
            <Pressable onPress={() => { act.timerSetFlow(!t.flow); act.setSettings({ focusFlow: !t.flow }); fx.toggle(!t.flow); }} accessibilityRole="switch" accessibilityState={{ checked: t.flow }} accessibilityLabel="Flow mode: keep going after the round ends" style={{ flex: 1.5 }}>
              <Box seed="flow" fill={t.flow ? c.ink : c.card} shadow={t.flow} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: t.flow ? c.card : 'transparent', borderWidth: 1.6, borderColor: t.flow ? c.card : c.ink }} /><Txt f="bold" s={17} c={t.flow ? 'card' : 'ink'}>{t.flow ? 'Flow on' : 'Flow off'}</Txt></Box>
            </Pressable>
          </View>
          <Pressable onPress={onGo} accessibilityRole="button" accessibilityLabel={goLabel} style={{ position: 'absolute', left: 138, top: 736, width: 196, transform: [{ rotate: '-0.6deg' }] }}>
            <Box seed="go" fill={t.phase === 'break' ? c.card : c.ink} style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }}><Icon name={t.running && t.phase === 'focus' ? 'pause' : 'play'} size={24} color={t.phase === 'break' ? c.ink : c.card} sw={2.4} /><Txt f="bold" s={27} c={t.phase === 'break' ? 'ink' : 'card'}>{goLabel}</Txt></Box>
          </Pressable>
          <Pressable onPress={() => { if (t.phase === 'set') { act.go('Today'); return; } act.timerFinish(true); fx.clack(); }} accessibilityRole="button" accessibilityLabel={t.phase === 'set' ? 'Leave focus' : 'End session and save'} style={{ position: 'absolute', left: 181, top: 800, transform: [{ rotate: '1deg' }] }}>
            <Box seed="end" fill="transparent" shadow={false} style={{ minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' }}><Txt f="bold" s={19}>{t.phase === 'set' ? 'leave' : 'end session'}</Txt></Box>
          </Pressable>
          <Pressable onPress={() => { if (canBreak(t)) act.timerBreak(); else { fx.denied(); toast(breakGate); } }} accessibilityRole="button" accessibilityState={{ disabled: !canBreak(t) }} accessibilityLabel={`Take a break, ${Math.max(0, t.breaksAllowed - t.breaksUsed)} left. ${breakGate}`} style={{ position: 'absolute', left: 52, top: 806, transform: [{ rotate: '-1.5deg' }] }}>
            <Box seed="brk" fill={c.card} shadow={false} sw={2} style={{ minHeight: 38, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: canBreak(t) ? 1 : 0.55 }}><Icon name="coffee" size={17} color={c.ink} /><Txt f="bold" s={16}>break · {fmtDur(Math.round(t.breakMs / 60_000))}</Txt></Box>
          </Pressable>
          {(t.phase === 'break' || ghost) && <BreakSticker leftMs={ghost ? 0 : v.breakLeftMs} totalMs={ghost ? ghost.total : t.breakTotalMs} falling={!!ghost} nudge={nudge} onGone={() => setGhost(null)} onBack={() => act.timerBackNow()} />}
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 88, top: 404, width: 264, height: 170, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: c.bad, borderRadius: 14 }, stampS]}>
            <View style={{ position: 'absolute', left: 5, right: 5, top: 5, bottom: 5, borderWidth: 2.5, borderColor: c.bad, borderRadius: 9 }} />
            <Txt f="bold" s={29} style={{ color: c.bad, textTransform: 'uppercase', letterSpacing: 1.4, textAlign: 'center' }}>Round done</Txt><Txt f="type" s={16} style={{ color: c.bad, letterSpacing: 2.5 }}>{stampN}</Txt>
          </Animated.View>
          {/* the stamp is silent to a screen reader, so the round is spoken here (invisible, polite, never per-second) */}
          <Txt f="bold" s={13} accessibilityLiveRegion="polite" style={{ position: 'absolute', left: 6, bottom: 6, opacity: 0 }}>{live}</Txt>
        </View>
      </View>
      <View style={{ flex: 1 }} />
    </View>
  );
}
