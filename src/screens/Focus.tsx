import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { BackHandler, Image, Platform, Pressable, View, useWindowDimensions, type View as RNView } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { ClockFace } from '../ui/clock/ClockFace';
import { HandBox, Icon, Tape, Txt } from '../ui/kit';
import { useNow, useReduceMotion, useTheme } from '../ui/theme-context';
import { useScreenLive } from '../ui/live';
import { act, getState, toast, useStore } from '../store/store';
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
/** The readout is a hand-cut slip of paper taped below the dial. It used to ride a capsule concentric with
 *  the face (before that, a disc pasted over it), and any shape at the centre hides the one thing the face is
 *  for: the guilloché and the two rosette lattices the owner asked to see. Off the face and onto the page, the
 *  number costs the artwork nothing. Nothing about the number itself changed: same face, same size. */
const SLIP_W = 152, SLIP_H = 38, SLIP_SEED = 6421;
/** The slot the slip takes is measured, not eyeballed. The face is 236 wide and centred in the 282-unit dial
 *  box at (left 76, top 350), so its drawn edge is canvas y ≈ 609 and its **feather** — the visible torn rim —
 *  is the halo veil out to r ≈ 122 from the dial centre (217, 491). A first pass put the slip's top at 612,
 *  which left the tape's rotated corner at y ≈ 610.4, x ≈ 192.4: 121.9 from the dial centre, i.e. *inside* the
 *  fade the owner reads as the rim (vision review W3, "adjacent to the rim"). The corner now sits at ≈ 617.0,
 *  **134.3** from the centre — 12.3 clear of the feather radius, against the 3 the review asked for (both
 *  numbers measured in the browser by `tools/w3-assert.mjs`, assertion 4).
 *
 *  The room for that comes from two places, in this order: `SLIP_H` drops 42 → 38 (the readout's own line box
 *  is 32, so it keeps 3 units either side), and `CLUSTER_DROP` takes the cluster 22 — inside the 26 the review
 *  allowed. `subText` is therefore at 662 and the slip's bottom at 656, so the slip→status gap is the same 6 it
 *  was: the review's one "do not tighten this" instruction, held exactly. Everything below `subText` moves 2,
 *  and the lowest control still ends at canvas y 867 with 134 units of page under it (measured on the device
 *  checklist's build path). */
const SLIP_TOP = 618, SLIP_LEFT = 217 - SLIP_W / 2, CLUSTER_DROP = 22;
/** Four different corner radii, like every other cut sheet on the page — a slip cut by hand is not a rectangle. */
const SLIP_RAD = { h: [9, 6, 11, 7], v: [7, 11, 6, 9] } as const;
/** The tape moved out of the readout's way rather than the readout out of the tape's: at 46 wide from `left: 8`
 *  its rotated box reached slip-local x ≈ 55.6, while the countdown ("25 min", measured 83.2 wide) is centred
 *  on the paper and so starts at 34.4 — the two overlapped, and the first glyph sat on the tape's right end
 *  (vision review W3). Narrower, and overhanging the paper's left edge the way every other tape on the page
 *  does (`BreakSticker` −14, the task card −11), it now ends at ≈ 29.6 while `SLIP_PAD_LEFT` moves the number's
 *  centre to 76 → 46.2: a **16.6**-unit gap where the standard asked for 8 (measured, assertion 5), with the
 *  number's right edge still 22 units inside the torn edge. */
const TAPE_W = 40, TAPE_LEFT = -12, SLIP_PAD_LEFT = 24;
/** The face is see-through now: the page's own paper and grain read through the artwork, which is the whole
 *  reason the readout left it. Only the face — the feather veil, the progress rim and the pointer stay at full
 *  opacity, because they are what dissolve the face's circular clip edge into the page in both themes. */
const FACE_OP = 0.86;
/** the clock face IS the dial: it fills the pan, so nothing decorative sits between the artwork and the
 *  dial's edge. What used to be a knurled bed ring + four outer numerals + a hatch sector is gone (the
 *  owner read the escapement's teeth as red dots and the ring as clutter); the edge is now a feather — a
 *  halo-coloured radial veil over the last few units of artwork — and progress rides the rim as a slim
 *  accent ring, which is legible where the sector inside the face never was. */
const FACE = 236, FACE_BOX = FACE + 3, FACE_R = FACE / 2;
/** the veil reaches 4 units past the clip (FACE_R + 2 ≈ 119.5) so full halo covers the seam itself */
const FEATHER_R = 122;
const PROG_R = 135, PROG_W = 6, PROG_C = 2 * Math.PI * PROG_R;
const RAD = { h: [48, 48, 48, 48], v: [48, 48, 48, 48] } as const;

/* ── what carries the countdown now ────────────────────────────────────────────────────────────────────────
   The escapement (rotating toothed wheel, its index bar, the per-second release kick) and the knurled bed
   with its 60 ticks and four outer numerals were dropped with the dial redesign: the owner read the teeth
   as red dots and the ring as clutter, and asked for the face itself to be the dial — integrated, feathered
   at its edge, not a photograph pasted inside a mechanism. Motion stays where it still says something: the
   pointer's per-second jolt, the slip's tick wash, the last-ten-seconds red pen border round that slip, and
   the rim ring that shows elapsed time where a sector inside the face never could be read. Nothing on the face
   scales — the numeral is the thing being read. */

function Dial({ min, phase, leftMs, running, editable, onChange, flowing }: { min: number; phase: string; leftMs: number; running: boolean; editable: boolean; onChange: (m: number, vel: number) => void; flowing: boolean }) {
  const { c, dark } = useTheme(), face = useStore((s) => s.settings.clock), focused = useScreenLive(), reduce = useReduceMotion();
  const ref = useRef<RNView>(null), cx = useSharedValue(0), cy = useSharedValue(0), raw = useSharedValue(min), last = useSharedValue(0), cur = useSharedValue(min), hand = useSharedValue(0), drag = useSharedValue(0), jolt = useSharedValue(0);
  const measure = useCallback(() => { ref.current?.measureInWindow((x, y, w, h) => { cx.value = x + w / 2; cy.value = y + h / 2; }); }, [cx, cy]);
  const live = phase !== 'set', mins = live ? leftMs / 60_000 : min, ang = (mins >= 60 ? mins % 60 || 60 : mins) * 6;
  const wholeSec = Math.floor(leftMs / 1000);
  /* The dial has always been `accessibilityRole="adjustable"` with an `accessibilityValue` and
     increment/decrement actions, and TalkBack has always read it. The web build did not: React Native Web
     0.21 maps the four `aria-*` value props (and the flat `accessibilityValueNow`-style ones) and reads
     nothing at all out of the RN-shaped `accessibilityValue` *object*, so the audit's probe found
     `role=slider` with no value in the DOM and arrows that did nothing (audit UX-5).
     These two objects are web-only on purpose. On native the RN-shaped `accessibilityValue` below is
     untouched, so Android announces exactly what it announced before: the same role, the same label and
     the same value text. Adding `aria-valuemin`/`max` there instead would have been the *alias* path —
     `View.js` folds them back into `accessibilityValue` — and would have handed Android a RangeInfo the
     dial has never had. The fix the audit asked for is a web one and stays one. */
  const dialMin = 5, dialMax = 240, dialNow = live ? Math.ceil(leftMs / 60_000) : min;
  const dialValue = `${live ? dialNow + ' minutes left' : min + ' minutes'}`;
  const webValue: { 'aria-valuemin'?: number; 'aria-valuemax'?: number; 'aria-valuenow'?: number; 'aria-valuetext'?: string } =
    Platform.OS === 'web' ? { 'aria-valuemin': dialMin, 'aria-valuemax': dialMax, 'aria-valuenow': dialNow, 'aria-valuetext': dialValue } : {};
  /** Web only, and only while the dial is editable: RNW forwards `onKeyDown` on a `View` and honours
     `tabIndex`, so the slider answers the arrow keys every other slider on the platform answers. The step
     is the ±5 the accessibility actions already move by. `tabIndex` is deliberately not set on native,
     where it would add an input-focus stop this control has never had. */
  const webKeys: { tabIndex?: 0; onKeyDown?: (e: { key?: string; preventDefault?: () => void }) => void } =
    Platform.OS === 'web' && editable
      ? { tabIndex: 0, onKeyDown: (e) => { const d = e.key === 'ArrowUp' ? 5 : e.key === 'ArrowDown' ? -5 : 0; if (!d) return; e.preventDefault?.(); onChange(Math.max(dialMin, Math.min(dialMax, min + d)), 300); } }
      : {};
  useEffect(() => { raw.value = min; cur.value = min; }, [min, raw, cur]);
  useEffect(() => { if (drag.value) return; hand.value = reduce || live ? ang : withTiming(ang, { duration: 220, easing: Easing.out(Easing.cubic) }); }, [ang, live, reduce, hand, drag]);
  useEffect(() => { if (running && !flowing) jolt.value = withSequence(withTiming(1, { duration: 40 }), withTiming(0, { duration: 140 })); }, [wholeSec, running, flowing, jolt]);
  const pan = Gesture.Pan().enabled(editable).minDistance(0)
    .onBegin((e) => { drag.value = 1; last.value = (Math.atan2(e.absoluteY - cy.value, e.absoluteX - cx.value) * 180) / Math.PI; })
    .onUpdate((e) => {
      const a = (Math.atan2(e.absoluteY - cy.value, e.absoluteX - cx.value) * 180) / Math.PI; let d = a - last.value; if (d > 180) d -= 360; if (d < -180) d += 360; last.value = a;
      const before = raw.value; raw.value = Math.max(5, Math.min(240, raw.value + d / 6)); hand.value = (raw.value % 60 || 60) * 6;
      const snap = Math.round(raw.value / 5) * 5;
      if (snap !== cur.value) { cur.value = snap; runOnJS(onChange)(snap, Math.abs(e.velocityX) + Math.abs(e.velocityY)); } else if ((raw.value === 5 || raw.value === 240) && before !== raw.value) runOnJS(onChange)(snap, -1);
    })
    .onFinalize(() => { drag.value = 0; hand.value = withTiming(((cur.value % 60) || 60) * 6, { duration: 160 }); });
  const handS = useAnimatedStyle(() => ({ transform: [{ rotate: `${hand.value + jolt.value * 1.6}deg` }] }));
  /** labels sit on the torn photograph, so their halo has to be the colour of what is actually behind them — the
   *  page in light, the darkened page in dark. `c.paper` in dark is near-black, so the halo was doing nothing.
   *  The feather veil is painted in the same halo for the same reason: it is what lets the face's circular clip
   *  edge dissolve into the page in both themes instead of reading as a pasted photograph. */
  const halo = dark ? c.desk : c.paper, ink = c.ink;
  const progDeg = !live ? 0 : (1 - leftMs / (min * 60_000 || 1)) * 360, prog = progDeg / 360;
  /** Per-instance, and sanitised. `useId()` is the right source of uniqueness — it is what `PaperBg` and
   *  `HStrip` already use — but React's ids can contain characters that are not legal in an XML name, and this
   *  markup is parsed as XML. `prompt.md` R11 names a bare element id resolving another element's `url(#…)` as
   *  exactly this failure; this veil's gradient is the last one left in a screen. */
  const hid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const feather = useMemo(() => <Defs><RadialGradient id={hid}>
    <Stop offset="0.934" stopColor={halo} stopOpacity="0" />
    <Stop offset="0.967" stopColor={halo} stopOpacity="1" />
    <Stop offset="1" stopColor={halo} stopOpacity="1" />
  </RadialGradient></Defs>, [halo, hid]);
  const pointer = useMemo(() => <Svg width={D} height={D}><Path d={`M${C0} ${C0 + 14}L${C0} 54`} stroke={ink} strokeWidth={3} strokeLinecap="round" /><Path d={`M${C0} 34L${C0 + 6.5} 58L${C0 - 6.5} 58Z`} fill={ink} /><Circle cx={C0} cy={C0} r={6.5} fill={ink} /></Svg>, [ink]);
  return (
    <GestureDetector gesture={pan}>
      <View testID="focus-dial" collapsable={false} onTouchStart={measure} style={{ position: 'absolute', left: 76, top: 350, width: D, height: D }} accessible accessibilityRole="adjustable" accessibilityLabel="Focus minutes. Swipe up or down to change." accessibilityValue={{ text: dialValue }}
        {...webValue} {...webKeys}
        accessibilityActions={editable ? [{ name: 'increment' }, { name: 'decrement' }] : []} onAccessibilityAction={(e) => { if (e.nativeEvent.actionName === 'increment') onChange(Math.min(240, min + 5), 300); else onChange(Math.max(5, min - 5), 300); }}>
        <View ref={ref} onLayout={measure} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: D, height: D }} />
        {/* the one lift off full opacity on the dial: the artwork is what the owner asked to see, and the paper
            and grain of the page read through it. The veil, the rim ring and the pointer below are NOT faded —
            they are what feathers the face's clip edge into the page in both themes. */}
        <View testID="focus-dial-face" style={{ position: 'absolute', left: C0 - FACE_R, top: C0 - FACE_R, width: FACE_BOX, height: FACE_BOX, borderRadius: FACE_R + 2, overflow: 'hidden', opacity: FACE_OP }}><ClockFace id={face} size={FACE} hands={false} live={focused} /></View>
        {/* the veil feathers the face's clip edge into the page; the rim ring shows elapsed time where the old
            hatch sector inside the face could never be read. Both sit under the pointer and the slip below. */}
        <Svg width={D} height={D} style={{ position: 'absolute' }} pointerEvents="none">
          {feather}
          <Circle cx={C0} cy={C0} r={FEATHER_R} fill={`url(#${hid})`} />
          <Circle cx={C0} cy={C0} r={PROG_R} fill="none" stroke={hexA(ink, 0.16)} strokeWidth={PROG_W} />
          {prog > 0 && <Circle cx={C0} cy={C0} r={PROG_R} fill="none" stroke={c.acc} strokeWidth={PROG_W} strokeLinecap="round" strokeDasharray={`${PROG_C * prog} ${PROG_C}`} transform={`rotate(-90 ${C0} ${C0})`} />}
        </Svg>
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: D, height: D }, handS]}>{pointer}</Animated.View>
      </View>
    </GestureDetector>
  );
}

/** The time, on a slip of paper taped below the dial — the readout now, so it inherits every motion the old
 *  capsule on the face carried, one home each, and each collapsed under reduce-motion exactly as its old form
 *  was:
 *
 *   · the per-tick wash (`tick`): the slip's paper flashes `hl` with the audible tick, the same 13 % lift it
 *     had on the face, dead at 0 under reduce-motion;
 *   · the last ten seconds (`warnOn`): a red pen border drawn round the slip, mounted only while the warning
 *     holds, so the last 10 s are announced by a border as they were by the red ring;
 *   · the flow-overtime flood (`wash`): the accent fills the slip and drains, once, when a round runs past its
 *     cap — the same 42 % flood the capsule carried.
 *
 *  The paper is a hand-cut outline from the same `handPath` primitive `HandBox` and `BreakSticker` are drawn
 *  with, because the three overlays must share the paper's exact edge — a rounded View laid over a wobbled
 *  outline shows its own corners the moment the paper flashes. */
function TimeLabel({ readout, warnOn, tick, wash }: { readout: string; warnOn: boolean; tick: SharedValue<number>; wash: SharedValue<number> }) {
  const { c } = useTheme(), reduce = useReduceMotion(), warnSV = useSharedValue(0);
  useEffect(() => { if (warnOn && !reduce) warnSV.value = withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 300 })); }, [warnOn, reduce, warnSV]);
  const d = useMemo(() => handPath(SLIP_W, SLIP_H, SLIP_RAD, SLIP_SEED, 1.5), []);
  /* one shape, four inks: the paper, the tick flash, the overtime flood and the warn border must be the same
     outline or the hand-cut edge shows through the overlays. `sheet` is the 2-unit bleed the stroke needs. */
  const sheet = { position: 'absolute', left: -2, top: -2, width: SLIP_W + 4, height: SLIP_H + 4 } as const;
  const inked = (p: React.ComponentProps<typeof Path>) => <Svg width={SLIP_W + 4} height={SLIP_H + 4} viewBox={`-2 -2 ${SLIP_W + 4} ${SLIP_H + 4}`}><Path d={d} {...p} /></Svg>;
  const tickS = useAnimatedStyle(() => ({ opacity: reduce ? 0 : tick.value * 0.13 }));
  const washS = useAnimatedStyle(() => ({ opacity: wash.value * 0.42 }));
  const warnS = useAnimatedStyle(() => ({ opacity: 0.62 + warnSV.value * 0.38 }));
  return (
    <View testID="focus-time" pointerEvents="none" style={{ position: 'absolute', left: SLIP_LEFT, top: SLIP_TOP, width: SLIP_W, height: SLIP_H, paddingLeft: SLIP_PAD_LEFT, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={SLIP_W + 4} height={SLIP_H + 4} style={sheet} viewBox={`-2 -2 ${SLIP_W + 4} ${SLIP_H + 4}`}>
        <Path d={d} transform="translate(2.2 2.8)" fill={hexA(c.shadow, 0.2)} />
        <Path d={d} fill={c.card} stroke={c.ink} strokeWidth={2.1} strokeLinejoin="round" />
      </Svg>
      <Animated.View style={[sheet, tickS]}>{inked({ fill: c.hl })}</Animated.View>
      <Animated.View style={[sheet, washS]}>{inked({ fill: c.acc })}</Animated.View>
      {warnOn && <Animated.View style={[sheet, warnS]}>{inked({ fill: 'none', stroke: c.bad, strokeWidth: 2.6 })}</Animated.View>}
      {/* one strip of tape, over the slip's top-left corner and out past its edge, rotated the way a hand tears
          it — sat low enough that its rotated corner clears the face's feathered rim by a measured margin */}
      <Tape testID="focus-tape" w={TAPE_W} rot={-12} style={{ left: TAPE_LEFT, top: 3 }} />
      <Txt f="type" s={27} testID="focus-time-text" style={{ letterSpacing: -0.8 }} accessibilityLiveRegion="none">{readout}</Txt>
    </View>
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

export function FocusScreen({ fit }: { fit?: number } = {}) {
  /* Focus is the one screen whose "am I live" does double duty: the tick cadence, keep-awake, the
     BACK handler and the tik/tok gate all keyed off `route === 'Focus'` — a store subscription that,
     with every page kept mounted, would re-render the whole focus screen on every tap anywhere. The
     navigator context carries the same truth for a tap's cost of a boolean flip. */
  /* Settings are read field by field, and `sheet` is not subscribed at all: the one place it is read is the
     back-handler below, which takes it from `getState()` at press time. A whole-`settings` selector here
     cost this screen a re-render per sheet open/close and per write anywhere in Settings
     (lag-diagnosis-2026-10-14, RC-1); the dial keeps its own `settings.clock` leaf. */
  const timer = useStore((s) => s.timer), fev = useStore((s) => s.fev), tickOn = useStore((s) => s.settings.tickOn), soundOn = useStore((s) => s.settings.soundOn), tasks = useStore((s) => s.tasks), courses = useStore((s) => s.courses);
  const st = { timer, fev, tasks, courses };
  const focused = useScreenLive();
  /* `focused` is the only cadence gate: a hidden Focus owns no 1 Hz commit even while a round runs —
     the timer's own state lives in the store and keeps counting, and coming back re-aligns `now`
     immediately (see `useNow`), so nothing on screen can be stale. */
  const { c, dark } = useTheme(), { width, height } = useWindowDimensions(), ins = useSafeAreaInsets(), reduce = useReduceMotion(), now = useNow(focused ? 1000 : 30_000), s = fit ?? Math.min(width / 440, height / 1001), t = st.timer, v = view(t, now), g = v.state;
  const task = st.tasks.find((x) => x.id === t.taskId), course = st.courses.find((x) => x.id === t.courseId), topOff = ins.top / s;
  const stamp = useSharedValue(0), [stampN, setStampN] = useState(1), [ghost, setGhost] = useState<null | { total: number }>(null), prev = useRef(t.phase), lastSec = useRef(0), [nudge, setNudge] = useState(0), [live, setLive] = useState(''), tickSV = useSharedValue(0), wash = useSharedValue(0);
  const editable = t.phase === 'set';
  /** flow overtime is capped: past the cap the clock is frozen, so the page must stop pretending to count */
  const frozen = t.running && t.phase === 'focus' && v.leftMs === 0 && v.overMs >= FLOW_OVER_CAP_MS;
  /** the last ten seconds are announced by a red pen border round the time, not only by a blip — read off the
   *  advanced state (`g`), not the store, or the warning would never fire while the round runs */
  const warnOn = t.running && t.phase === 'focus' && g.focusLeftMs > 0 && g.focusLeftMs <= 10_000;
  useEffect(() => { act.timerPump(now); }, [now]);
  /* `expo-keep-awake` rejects on the web — the Screen Wake Lock API is permission-gated and the browser
     answers "not activated yet" — and an unhandled rejection there takes the whole screen down with it.
     `.catch(() => undefined)` because a browser that will not hold the screen awake is not a failure
     this screen should report; the timer keeps its own state either way. */
  useEffect(() => {
    if (!focused) return;
    if (t.running) void activateKeepAwakeAsync('focus').catch(() => undefined);
    else void Promise.resolve(deactivateKeepAwake('focus')).catch(() => undefined);
    return () => { void Promise.resolve(deactivateKeepAwake('focus')).catch(() => undefined); };
  }, [t.running, focused]);
  useEffect(() => { const h = BackHandler.addEventListener('hardwareBackPress', () => { if (focused && !getState().sheet) { act.go('Today'); return true; } return false; }); return () => h.remove(); }, [focused]);
  useEffect(() => { // old-clock tik / tok each second while a round is running (never while the clock is frozen)
    if (!focused || !t.running || t.phase !== 'focus' || !tickOn || frozen) return; const sec = Math.floor(now / 1000); if (sec !== lastSec.current) { lastSec.current = sec; fx.tick(sec % 2 === 0); tickSV.value = withSequence(withTiming(1, { duration: 40 }), withTiming(0, { duration: 160 })); }
  }, [now, t.running, t.phase, tickOn, focused, tickSV, frozen]);
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
  const subText = t.phase === 'set' ? 'ready when you are' : t.phase === 'break' ? 'break, main clock paused' : frozen ? `flow capped at ${Math.round(FLOW_OVER_CAP_MS / 60_000)} min` : v.roundDone && !t.running ? 'round complete' : t.running ? `${fmtDur(Math.max(1, Math.round(t.planMin - g.focusElapsedMs / 60_000)))} to go` : 'paused';
  const goLabel = t.phase === 'set' ? 'Start' : t.phase === 'break' ? 'On break' : t.running ? 'Pause' : v.roundDone ? 'Next round' : 'Resume';
  const onGo = () => { if (t.phase === 'break') { fx.denied(); return; } const wasRunning = t.running; const n = act.timerToggle(); if (!wasRunning && n.running) fx.start(); else fx.clack(); };
  const breakGate = canBreak(g) ? '' : g.phase === 'break' ? 'Already on a break.' : g.phase !== 'focus' ? 'Start a round first.' : !g.running ? 'Paused — resume the round to take a break.' : g.breaksUsed >= g.breaksAllowed ? 'No breaks left this round.' : `Breaks unlock after ${Math.round(MIN_BREAK_AFTER_MS / 60_000)} min of focus.`;
  return (
    <View style={{ flex: 1, backgroundColor: c.paper }}>
      <View style={{ width: 440 * s, height: 1001 * s, overflow: 'hidden', alignSelf: 'center' }}>
        <View style={{ width: 440, height: 1001, transformOrigin: '0% 0%', transform: [{ scale: s }] }}>
          <Image source={PAGE} style={{ position: 'absolute', width: 440, height: 1001 }} />
          {/* Dark is a material, not a filter. A single mid-alpha scrim left the photograph at roughly half its own
              luminance, and cream `c.ink` on that fails 4.5:1 — so the label halos and the dial's feather veil
              (both painted in `desk` in dark) had nothing to match and the page read as the light one with the
              brightness pulled down. Two layers
              off the theme's own desk do the work instead: a deep scrim that takes the page to a ground ink can be
              read on, then a thin lift of the theme's paper so the photograph's own relief survives as a plate
              rather than disappearing into a brown. */}
          {dark && <><View pointerEvents="none" style={{ position: 'absolute', width: 440, height: 1001, backgroundColor: c.desk, opacity: 0.82 }} /><View pointerEvents="none" style={{ position: 'absolute', width: 440, height: 1001, backgroundColor: c.paper, opacity: 0.07 }} /></>}
          <Box seed="rnd" style={{ position: 'absolute', left: 32, top: 6 + topOff, paddingHorizontal: 12, paddingTop: 5, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 8, transform: [{ rotate: '-1.5deg' }] }}>
            <Txt f="bold" s={19} accessibilityLiveRegion="polite">Round {rn} · {phaseLabel}</Txt>
            <View style={{ flexDirection: 'row', gap: 3 }}>{[0, 1, 2, 3].map((i) => <View key={i} style={{ width: 9, height: 9, borderRadius: 5, borderWidth: 1.6, borderColor: c.ink, backgroundColor: i < t.rounds % 4 || (t.rounds > 0 && t.rounds % 4 === 0) ? c.ink : 'transparent' }} />)}</View>
          </Box>
          <Pressable onPress={() => act.open({ t: 'settings' })} accessibilityRole="button" accessibilityLabel="Settings" style={{ position: 'absolute', right: 118, top: 8 + topOff }}><Box seed="set" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="gear" size={22} color={c.ink} /></Box></Pressable>
          <Pressable onPress={() => act.go('Today')} accessibilityRole="button" accessibilityLabel="Back to Today" style={{ position: 'absolute', right: 66, top: 8 + topOff }}><Box seed="back" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="back" size={22} color={c.ink} /></Box></Pressable>
          <Pressable onPress={() => { act.setSettings({ soundOn: !soundOn }); }} accessibilityRole="switch" accessibilityState={{ checked: soundOn }} accessibilityLabel="Sounds" style={{ position: 'absolute', right: 14, top: 8 + topOff }}><Box seed="snd" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="sound" size={22} color={soundOn ? c.ink : c.mut} /></Box></Pressable>
          <Box seed="task" style={{ position: 'absolute', left: 32, top: 259, width: 386, paddingHorizontal: 15, paddingTop: 11, paddingBottom: 10, transform: [{ rotate: '-1deg' }] }}>
            <Tape w={46} rot={-24} style={{ left: -11, top: -6 }} />
            <Txt f="serifB" s={17} style={{ alignSelf: 'flex-start', borderBottomWidth: 1.5, borderBottomColor: c.ink, paddingBottom: 1 }}>{course?.name ?? 'Personal'}</Txt>
            <Txt f="marker" s={21} style={{ marginTop: 5, marginRight: 84 }} numberOfLines={2}>{task?.title ?? (t.title || 'Free focus')}</Txt>
            <Pressable onPress={() => act.timerSwap()} disabled={!editable} accessibilityRole="button" accessibilityLabel={`Swap task, now ${task?.title ?? 'free focus'}`} style={{ position: 'absolute', right: 10, bottom: 9, minHeight: 32, paddingHorizontal: 4, justifyContent: 'center', opacity: editable ? 1 : 0.4 }}><Txt f="bold" s={15} c="mut" style={{ borderBottomWidth: 1.5, borderStyle: 'dashed', borderBottomColor: c.mut }}>swap task</Txt></Pressable>
          </Box>
          {/* the dial always counts the focus clock: on a break the main clock is paused, so `focusLeftMs`
              is the right number in both phases and the dial never restarts behind the break sticker.
              It comes from the advanced state, not the store: the store only commits on events, so the
              ring, the pointer hand and the last-10-seconds ring all froze if they read `t`. */}
          <Dial min={t.planMin} phase={t.phase} leftMs={g.focusLeftMs} running={t.running && t.phase === 'focus'} editable={editable} flowing={v.flowing}
            onChange={(m, vel) => { if (vel < 0) { fx.bump(); return; } if (m !== t.planMin) { act.timerSetMin(m); fx.detent(vel); } }} />
          {/* the readout, off the face and onto the page: a slip below the dial's edge, clear of the face circle */}
          <TimeLabel readout={bigText} warnOn={warnOn} tick={tickSV} wash={wash} />
          <Txt f="serifB" s={12.5} c="mut" pointerEvents="none" style={{ position: 'absolute', left: 60, top: 640 + CLUSTER_DROP, width: 320, textAlign: 'center', textShadowColor: c.paper, textShadowRadius: 4 }}>{subText}</Txt>
          <Txt f="hand" s={15} pointerEvents="none" style={{ position: 'absolute', left: 360, top: 352, transform: [{ rotate: '6deg' }], textShadowColor: c.paper, textShadowRadius: 4, width: 90 }}>{'focus doesn\'t\nhappen by\naccident'}</Txt>
          <View style={{ position: 'absolute', left: 56, top: 672 + CLUSTER_DROP, width: 360, flexDirection: 'row', gap: 7, alignItems: 'stretch' }}>
            {[25, 45, 50, 90].map((m) => { const on = t.planMin === m; return (
              <Pressable key={m} disabled={!editable} onPress={() => { act.timerSetMin(m); fx.detent(500); act.setSettings({ focusPresetMin: m }); }} accessibilityRole="button" accessibilityState={{ selected: on, disabled: !editable }} accessibilityLabel={`${m} minutes`} style={{ flex: 1, minWidth: 44, opacity: editable ? 1 : 0.55 }}>
                <Box seed={`op${m}`} fill={on ? c.ink : c.card} shadow={on} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Txt f="bold" s={20} c={on ? 'card' : 'ink'}>{m}</Txt><Txt f="hand" s={11} c={on ? 'card' : 'mut'} style={{ marginTop: -2 }}>min</Txt></Box>
              </Pressable>); })}
            <Pressable onPress={() => { act.timerSetFlow(!t.flow); act.setSettings({ focusFlow: !t.flow }); fx.toggle(!t.flow); }} accessibilityRole="switch" accessibilityState={{ checked: t.flow }} accessibilityLabel="Flow mode: keep going after the round ends" style={{ flex: 1.5 }}>
              <Box seed="flow" fill={t.flow ? c.ink : c.card} shadow={t.flow} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: t.flow ? c.card : 'transparent', borderWidth: 1.6, borderColor: t.flow ? c.card : c.ink }} /><Txt f="bold" s={17} c={t.flow ? 'card' : 'ink'}>{t.flow ? 'Flow on' : 'Flow off'}</Txt></Box>
            </Pressable>
          </View>
          <Pressable onPress={onGo} accessibilityRole="button" accessibilityLabel={goLabel} style={{ position: 'absolute', left: 138, top: 736 + CLUSTER_DROP, width: 196, transform: [{ rotate: '-0.6deg' }] }}>
            <Box seed="go" fill={t.phase === 'break' ? c.card : c.ink} style={{ minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }}><Icon name={t.running && t.phase === 'focus' ? 'pause' : 'play'} size={24} color={t.phase === 'break' ? c.ink : c.card} sw={2.4} /><Txt f="bold" s={27} c={t.phase === 'break' ? 'ink' : 'card'}>{goLabel}</Txt></Box>
          </Pressable>
          <Pressable onPress={() => { if (t.phase === 'set') { act.go('Today'); return; } act.timerFinish(true); fx.clack(); }} accessibilityRole="button" accessibilityLabel={t.phase === 'set' ? 'Leave focus' : 'End session and save'} style={{ position: 'absolute', left: 181, top: 800 + CLUSTER_DROP, transform: [{ rotate: '1deg' }] }}>
            <Box seed="end" fill="transparent" shadow={false} style={{ minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' }}><Txt f="bold" s={19}>{t.phase === 'set' ? 'leave' : 'end session'}</Txt></Box>
          </Pressable>
          <Pressable onPress={() => { if (canBreak(g)) act.timerBreak(); else { fx.denied(); toast(breakGate); } }} accessibilityRole="button" accessibilityState={{ disabled: !canBreak(g) }} accessibilityLabel={`Take a break, ${Math.max(0, t.breaksAllowed - g.breaksUsed)} left. ${breakGate}`} style={{ position: 'absolute', left: 52, top: 806 + CLUSTER_DROP, transform: [{ rotate: '-1.5deg' }] }}>
            <Box seed="brk" fill={c.card} shadow={false} sw={2} style={{ minHeight: 38, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: canBreak(g) ? 1 : 0.55 }}><Icon name="coffee" size={17} color={c.ink} /><Txt f="bold" s={16}>break · {fmtDur(Math.round(t.breakMs / 60_000))}</Txt></Box>
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
