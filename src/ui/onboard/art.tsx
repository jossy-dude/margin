/**
 * The tour's artwork. Every mark here is either an import from the app or a `react-native-svg` built
 * out of the app's own geometry — the bottom nav from `navigation/Book.tsx`, the dial from
 * `screens/Focus.tsx`, the crumple from `ui/Swipe.tsx`, the attendance cells from `screens/common.tsx`.
 * Nothing is imported from the HTML design references and nothing is invented: a spiral binding appears
 * in those files and **not** in the app, so it is not drawn here. The tour has to look like the
 * product, not like the pitch.
 *
 * No image assets, no icon font, no emoji. `HandBox` measures itself through `onLayout`, so nothing
 * hard-codes a width; the one fixed-size thing is the dial, and that is derived from the window exactly
 * as `Focus.tsx` derives its 440-wide canvas.
 *
 * ## Every animation here collapses to its end state
 *
 * Not to a fade. The crumple screen's entire lesson is movement, so under `useReduceMotion()` it is
 * drawn *already* crumpled with the Undo toast *already* up; the attendance screen's sheet is *already*
 * open; the dial still drags, because that is input rather than animation. The toast and the sheet are
 * driven by the same shared values as the motion they follow, so there is no JS state that can arrive
 * before the thing it is explaining or survive the motion it belongs to.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path, Text as SText } from 'react-native-svg';
import { Btn, Chip, HandBox, Icon, Row, Tape, Txt } from '../kit';
import { ClockFace } from '../clock/ClockFace';
import { FONT, hexA, type Colors } from '../../tokens/theme';
import { handPath } from '../hand';
import { useStore } from '../../store/store';
import { fx } from '../../services/fx';
import { FS } from '../fit';

export interface ArtProps { c: Colors; reduce: boolean }

/* ── shared bits ─────────────────────────────────────────────────────────── */

/** A hand-drawn arrow with an open head. `dir` is the way the thing actually moves. */
function Arrow({ dir, w = 46, h = 14, color, sw = 2.2 }: { dir: 'right' | 'left' | 'down'; w?: number; h?: number; color: string; sw?: number }) {
  const d = dir === 'right'
    ? `M2 ${h / 2}C${w * 0.4} ${h / 2 - 3} ${w * 0.7} ${h / 2 + 3} ${w - 8} ${h / 2}M${w - 15} ${h / 2 - 6}L${w - 7} ${h / 2}L${w - 15} ${h / 2 + 6}`
    : dir === 'left'
      ? `M${w - 2} ${h / 2}C${w * 0.6} ${h / 2 - 3} ${w * 0.3} ${h / 2 + 3} 8 ${h / 2}M15 ${h / 2 - 6}L7 ${h / 2}L15 ${h / 2 + 6}`
      : `M${w / 2} 2C${w / 2 - 3} ${h * 0.4} ${w / 2 + 3} ${h * 0.7} ${w / 2} ${h - 7}M${w / 2 - 6} ${h - 15}L${w / 2} ${h - 7}L${w / 2 + 6} ${h - 15}`;
  return <Svg width={w} height={h} pointerEvents="none"><Path d={d} stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

/** Prose caption. `Txt` already sets `allowFontScaling`, so dynamic type reaches these. */
const Say = ({ children, size = 14.5, style }: { children: React.ReactNode; size?: number; style?: object }) => (
  <Txt f="serif" s={size} c="mut" style={[{ lineHeight: Math.round(size * 1.24) }, style]}>{children}</Txt>
);
/** The app's own `Row`, so a caption wraps instead of being cut. */
const Inline = ({ children, style }: { children: React.ReactNode; style?: object }) => <Row style={[{ alignItems: 'center' }, style]}>{children}</Row>;
/** Decorative: a screen reader reads the sentence once, not the drawing. */
const Deco = ({ children }: { children: React.ReactNode }) => <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{children}</View>;

/* ── 1 · the promise: a taped wordmark sheet, and the map under it ───────── */

/** One sheet in the stack, fanned. `corners` defaults to `RG`, the app's own card shape. */
function SheetUnder({ c, w, h, x, y, deg, seed }: { c: Colors; w: number; h: number; x: number; y: number; deg: number; seed: string }) {
  return (
    <View style={{ position: 'absolute', left: x, top: y, width: w, height: h, transform: [{ rotate: `${deg}deg` }] }}>
      <HandBox seed={seed} fill={c.card} sw={1.6} style={{ flex: 1 }} />
    </View>
  );
}

/** The real bottom nav, at `Book.tsx`'s own metrics: `corners={RS} sw={2} amp={1.6}`, five 56 dp
 *  targets, a 52×30 accent pill on the selected tab, and the 62 dp `+` floating clear above it.
 *
 *  A mock of the product that differs from the product is worse than no mock, so this copy is held to the
 *  original attribute by attribute — including the things that look like oversights. The tab labels were
 *  capped at `FS` here and are NOT capped in `Book.tsx:88`, so at a 1.4× system font this drawing shrank
 *  its own nav while the real one grew. `src/test/onboarding.test.ts` now diffs the two. */
function MapArt({ c, reduce }: ArtProps) {
  const TABS: [string, string][] = [['today', 'Today'], ['week', 'Week'], ['tasks', 'To-do'], ['grades', 'Grades'], ['stats', 'Stats']];
  const [sel, setSel] = useState(0);
  /** One hop to `To-do` and back: the pill moving is the whole point of this screen. Under
   *  reduce-motion the timeouts are simply never armed, so it stays put — an end state, not an
   *  animation that was skipped halfway. */
  useEffect(() => {
    if (reduce) return;
    const t1 = setTimeout(() => setSel(2), 700), t2 = setTimeout(() => setSel(0), 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [reduce]);
  return (
    <View style={{ marginTop: 86, alignItems: 'flex-end' }}>
      <Pressable
        testID="onb-fab" accessibilityRole="button" accessibilityLabel="Adds anything"
        onPress={() => fx.tap()} style={{ marginBottom: 14, marginRight: 8 }}
      >
        <View style={{ width: 62, height: 62, alignItems: 'center', justifyContent: 'center' }}>
          <HandBox seed="fab" fill={c.acc} stroke={c.ink} sw={2.2} amp={1.8} corners={{ h: [34, 30, 34, 30], v: [30, 34, 30, 34] }} style={{ width: 62, height: 62, alignItems: 'center', justifyContent: 'center' }} />
          <View pointerEvents="none" style={{ position: 'absolute', width: 62, height: 62, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={32} color={c.onAcc} sw={2.6} />
          </View>
        </View>
      </Pressable>
      <HandBox seed="nav" fill={c.card} sw={2} amp={1.6} style={{ alignSelf: 'stretch', flexDirection: 'row', minHeight: 64, paddingVertical: 4, paddingHorizontal: 4 }}>
        {TABS.map(([i, l], k) => {
          const on = sel === k;
          return (
            <View key={i} style={{ flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 1 }}>
              <View style={{ width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? hexA(c.acc, 0.2) : 'transparent', borderWidth: on ? 1.5 : 0, borderColor: c.acc }}>
                <Icon name={i} size={23} color={on ? c.acc : c.ink} sw={on ? 2.2 : 1.8} />
              </View>
              <Txt f="bold" s={14.5} c={on ? 'acc' : 'mut'}>{l}</Txt>
            </View>
          );
        })}
      </HandBox>
      <Say size={14} style={{ marginTop: 7, alignSelf: 'flex-end' }}>five tabs along the bottom</Say>
    </View>
  );
}

export function PromiseArt({ c, reduce }: ArtProps) {
  const { width } = useWindowDimensions();
  /** The fan has to fit the content width, not a guessed one: the backing sheets sit ±26 dp off the
   *  top sheet, so a sheet sized from a constant walks off the right edge on a 320 dp screen. */
  const avail = width - 32, SW = Math.min(236, avail - 56), SH = 168, X0 = (avail - SW) / 2;
  /** The app's own placement (`navigation/window.ts`): from above and to the right, tilted, settling
   *  flat. The first thing on a tour being the app's own arrival is deliberate. */
  const drop = useSharedValue(reduce ? 1 : 0);
  useEffect(() => { drop.set(reduce ? 1 : withTiming(1, { duration: 200, easing: Easing.bezier(0.2, 0.9, 0.25, 1) })); }, [drop, reduce]);
  const dropStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(drop.get(), [0, 1], [-48, 0]) },
      { translateX: interpolate(drop.get(), [0, 1], [30, 0]) },
      { rotate: `${interpolate(drop.get(), [0, 0.7, 1], [3.8, -0.4, -1.2])}deg` },
      { scale: interpolate(drop.get(), [0, 0.8, 1], [1.028, 1, 1]) },
    ],
  }));
  return (
    <View style={{ gap: 4 }}>
      <Deco>
        <View style={{ height: 206 }}>
          <SheetUnder c={c} w={SW} h={SH} x={X0 + 30} y={32} deg={2.6} seed="onb-s1-b" />
          <SheetUnder c={c} w={SW} h={SH} x={X0 - 26} y={18} deg={-3.1} seed="onb-s1-m" />
          <Animated.View style={[{ position: 'absolute', left: X0, top: 8, width: SW, height: SH }, dropStyle]}>
            <HandBox seed="onb-s1-t" fill={c.card} sw={1.8} style={{ flex: 1, paddingHorizontal: 18, paddingTop: 34 }}>
              <Tape w={58} rot={-5} style={{ left: 14, top: -9 }} />
              <Txt f="marker" s={26} numberOfLines={1} maxFontSizeMultiplier={FS}>MARGIN</Txt>
              <Svg width="100%" height={11} pointerEvents="none" viewBox="0 0 200 11" preserveAspectRatio="none">
                <Path d="M2 8C40 3 96 11 198 5" stroke={c.ink} strokeWidth={2} fill="none" strokeLinecap="round" />
              </Svg>
              <Say size={15}>my school sketchbook</Say>
            </HandBox>
          </Animated.View>
        </View>
        <MapArt c={c} reduce={reduce} />
      </Deco>
    </View>
  );
}

/* ── 2 · right finishes, left crumples, and the Undo ─────────────────────── */

const TASK_W = 28, TASK_GAP = 3;

function TaskCardDemo({ c, done, deg = 0 }: { c: Colors; done: boolean; deg?: number }) {
  return (
    <HandBox seed="seed-task-2" fill={done ? c.paper : c.card} style={{ paddingLeft: 52, paddingRight: 12, paddingVertical: 11, minHeight: 78, transform: [{ rotate: `${deg}deg` }] }}>
      <View style={{ position: 'absolute', left: 4, top: 0, bottom: 0, width: 46, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: TASK_W, height: TASK_W, borderRadius: 7, borderWidth: 2, borderColor: c.ink, backgroundColor: done ? c.ink : 'transparent', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-3deg' }] }}>
          {done ? <Icon name="check" size={20} color={c.card} sw={2.6} /> : null}
        </View>
      </View>
      <Txt f="bold" s={22} numberOfLines={1} style={done ? { textDecorationLine: 'line-through', color: c.mut } : undefined}>Reading response — Ch. 7</Txt>
      <Inline style={{ marginTop: 3 }}>
        <Icon name="tasks" size={15} color={c.mut} />
        <Say size={15}>Intro to Economics</Say>
        <Txt f="bold" s={17} c="mut">done 2 h ago</Txt>
      </Inline>
    </HandBox>
  );
}

/** The toast, as `Overlay.tsx` draws it: an ink slab, the message, an accent `Undo`. */
function ToastDemo({ c }: { c: Colors }) {
  return (
    <HandBox seed="toast" fill={c.ink} stroke={c.ink} sw={2} amp={1.4} style={{ alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 6, paddingVertical: 6, gap: 8, minHeight: 52, maxWidth: 331 }}>
      <Txt f="bold" s={19} c="paper" style={{ flex: 1 }}>Task deleted</Txt>
      <Btn small kind="primary" label="Undo" a11y="Undo, put the task back" onPress={() => fx.undone()} />
    </HandBox>
  );
}

export function UndoArt({ c, reduce }: ArtProps) {
  /** The app's own crumple, copied out of `Swipe.tsx` rather than re-invented: squash and rotate across
   *  the first half of a linear 1100 ms, then fall 330 px and fade. Nothing runs until the card has
   *  shown what swiping *right* does, because the sequence is the lesson.
   *
   *  The Undo toast is driven by the *same* value: it appears across the last 4% of the crumple, so
   *  it cannot arrive before the paper has gone, and under reduce-motion `p` goes straight to 1 and
   *  the toast is simply already there. */
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) { p.set(1); return; }
    p.set(0);
    const t = setTimeout(() => p.set(withTiming(1, { duration: 1100, easing: Easing.linear })), 2100);
    return () => { clearTimeout(t); p.set(0); };
  }, [p, reduce]);
  const cardStyle = useAnimatedStyle(() => {
    const k = p.get();
    const sq = interpolate(k, [0, 0.12, 0.3, 0.5], [1, 0.86, 0.55, 0.3], 'clamp');
    const sy = interpolate(k, [0, 0.12, 0.3, 0.5], [1, 0.72, 0.42, 0.3], 'clamp');
    const rot = interpolate(k, [0, 0.12, 0.25, 0.4, 0.5, 1], [0, -4, 7, -12, 16, 150], 'clamp');
    const fall = interpolate(k, [0.5, 0.78, 0.86, 1], [0, 230, 205, 330], 'clamp');
    return {
      transform: [
        { translateX: interpolate(k, [0, 0.5], [0, -92], 'clamp') },
        { translateY: fall },
        { rotate: `${rot}deg` },
        { scaleX: sq },
        { scaleY: sy },
      ],
      opacity: interpolate(k, [0.9, 1], [1, 0], 'clamp'),
      borderRadius: interpolate(k, [0.2, 0.5], [0, 60], 'clamp'),
    };
  });
  const creases = useAnimatedStyle(() => ({ opacity: interpolate(p.get(), [0.06, 0.3], [0, 0.9], 'clamp') }));
  const toastStyle = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0.95, 1], [0, 1], 'clamp'),
    transform: [{ translateY: interpolate(p.get(), [0.95, 1], [26, 0], 'clamp') }],
  }));
  return (
    <View style={{ gap: 16 }}>
      <Deco>
        <Inline style={{ marginBottom: 4 }}>
          <Txt f="bold" s={19}>swipe right</Txt>
          <Say style={{ flex: 1 }}>it is done</Say>
          <Arrow dir="right" color={c.acc} />
        </Inline>
        <Inline style={{ marginBottom: 3 }}>
          <Icon name="check" size={22} color={c.ok} sw={2} />
          <Txt f="bold" s={19} c="ok">Done</Txt>
        </Inline>
        <TaskCardDemo c={c} done />

        <View style={{ height: 16 }} />

        <Inline style={{ marginBottom: 4 }}>
          <Txt f="bold" s={19}>swipe left</Txt>
          <Say style={{ flex: 1 }}>it is gone</Say>
          <Arrow dir="left" color={c.bad} />
        </Inline>
        <Inline style={{ marginBottom: 6, justifyContent: 'flex-end' }}>
          <Txt f="bold" s={19} c="bad">Crumple</Txt>
          <Icon name="trash" size={21} color={c.bad} sw={2} />
        </Inline>
        {/* A plain view, not a `HandBox`: the crumple animates `borderRadius`, and `HandBox` draws
            its outline from a measured size, so a rounding card would fight its own outline. */}
        <Animated.View style={[{ height: 88, justifyContent: 'center' }, cardStyle]}>
          <View style={{ backgroundColor: c.card, borderWidth: 1.6, borderColor: c.ink, overflow: 'hidden', flex: 1 }}>
            <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, creases]}>
              <Svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none">
                <Path d="M0 8L22 14L40 6L58 18L80 9L100 16M10 40L28 24L50 30L66 20L86 34M30 0L36 20L24 40M70 0L62 18L74 40" stroke={c.ink} strokeOpacity={0.5} strokeWidth={0.8} fill="none" />
              </Svg>
            </Animated.View>
          </View>
        </Animated.View>
      </Deco>
      <Say style={{ marginTop: -4 }}>The paper balls up, spins, and drops off the page.</Say>
      <View>
        <Animated.View style={toastStyle}><ToastDemo c={c} /></Animated.View>
        <Say size={14} style={{ textAlign: 'center', marginTop: 4 }}>…and it stays there for six seconds.</Say>
      </View>
    </View>
  );
}

/* ── 3 · tap once, then hold ─────────────────────────────────────────────── */

/** `AttCell`, at its real 28 dp and its real 3 dp gutters. */
function Cell({ c, status, style }: { c: Colors; status: 'p' | 'l' | 'a' | 's' | null; style?: object }) {
  const col = status === 'a' ? c.bad : status === 'l' ? c.warn : status === 's' ? c.ok : c.ink;
  const glyph = status === 'p' ? '✓' : status === 'l' ? 'L' : status === 'a' ? '✕' : status === 's' ? 'S' : null;
  const dashed = !status;
  return (
    <View style={[{ width: TASK_W, height: TASK_W, borderRadius: 7, borderWidth: dashed ? 1.4 : 2, borderStyle: dashed ? 'dashed' : 'solid', borderColor: status ? col : hexA(c.ink, 0.4), backgroundColor: status ? hexA(col, 0.12) : 'transparent', alignItems: 'center', justifyContent: 'center' }, style]}>
      {glyph ? <Txt f="marker" s={status === 'p' ? 17 : 16} maxFontSizeMultiplier={FS} style={{ color: col, lineHeight: 20 }}>{glyph}</Txt> : null}
    </View>
  );
}

const N_CELLS = 9;

function AttendanceCard({ title, locked, hint, children }: { title: string; locked: boolean; hint: string; children: React.ReactNode }) {
  return (
    <HandBox seed={`onb-att-${locked ? 'l' : 'u'}`} style={{ padding: 12, gap: 4 }}>
      <Inline>
        <Txt f="bold" s={19} style={{ flex: 1 }}>{title}</Txt>
        <Btn small kind={locked ? 'ink' : 'ghost'} icon={locked ? 'lock' : 'unlock'} label={locked ? 'Locked' : 'Lock'} a11y={locked ? 'Unlock attendance' : 'Lock attendance'} onPress={() => fx.toggle(locked)} quiet />
      </Inline>
      <Say size={14}>{hint}</Say>
      <View style={{ marginTop: 8 }}>{children}</View>
    </HandBox>
  );
}

export function AttendanceArt({ c, reduce }: ArtProps) {
  /** The lesson is a *duration*, so it is demonstrated twice: the tap lands first, then the hold. */
  const tap = useSharedValue(reduce ? 1 : 0), ring = useSharedValue(reduce ? 1 : 0), rise = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (reduce) { tap.set(1); ring.set(1); rise.set(1); return; }
    tap.set(withDelay(350, withSequence(withTiming(1.25, { duration: 90 }), withTiming(1, { duration: 160 }))));
    ring.set(withDelay(1150, withTiming(1, { duration: 300 })));
    rise.set(withDelay(1500, withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) })));
    return () => { tap.set(1); ring.set(1); rise.set(1); };
  }, [tap, ring, rise, reduce]);
  const tapStyle = useAnimatedStyle(() => ({ transform: [{ scale: tap.get() }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.get(), transform: [{ scale: interpolate(ring.get(), [0, 1], [1.35, 1]) }] }));
  const sheetStyle = useAnimatedStyle(() => ({ opacity: rise.get(), transform: [{ translateY: interpolate(rise.get(), [0, 1], [90, 0]) }] }));
  /** `Animated.View`, not `View`. A `useAnimatedStyle` handle is only meaningful to Reanimated: hand it to a
   *  plain host view and nothing strips it, so the native side receives the handle's own three bookkeeping
   *  keys (`viewDescriptors`, `initial`, `styleUpdaterContainer`) as if they were style props and the pulse
   *  never happens at all. It is worse than dead, too — React Fabric deep-freezes every style prop in `__DEV__`
   *  (`deepFreezeAndThrowOnMutationInDev`), which arms a throwing setter on the handle's
   *  `styleUpdaterContainer.current`, and the very next line of `useAnimatedStyle`'s mount effect assigns
   *  through it. The red box then reads "set the key `current` … has been frozen" and the whole attendance
   *  screen is unreachable. `src/test/animated-style-host.test.ts` keeps the two apart everywhere. */
  const halo = (style: object) => <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -6, top: -6, width: 40, height: 40, borderRadius: 12, borderWidth: 2.5, borderColor: c.acc, transform: [{ rotate: '-5deg' }] }, style as never]} />;
  const row = (marked: boolean, ringIt: boolean) => (
    <View style={{ flexDirection: 'row', gap: TASK_GAP }}>
      {Array.from({ length: N_CELLS }, (_, i) => {
        const on = i === 1 && marked;
        return (
          <View key={i} style={{ position: 'relative' }}>
            {ringIt && i === 5 ? halo(ringStyle) : on ? halo(tapStyle) : null}
            <Animated.View style={on ? tapStyle : undefined}><Cell c={c} status={on ? 'p' : null} /></Animated.View>
          </View>
        );
      })}
    </View>
  );
  return (
    <View style={{ gap: 18 }}>
      <Deco>
        <AttendanceCard title="Attendance · 92%" locked={false} hint="Tap an empty cell once to mark it. After that, long-press to change it.">
          {row(true, false)}
          <Say size={14.5} style={{ marginTop: 8 }}>One tap marks it Here. That is all it does.</Say>
        </AttendanceCard>

        <AttendanceCard title="Attendance · 92%" locked hint="Locked: nothing can change by accident.">
          {row(true, true)}
          {/* mounted with its animation rather than gated on a timer: under reduce-motion `rise` is 1
              from the start, so the sheet is simply open. No state to disagree with the motion. */}
          <Animated.View style={[{ marginTop: 12, paddingTop: 10, borderTopWidth: 1.4, borderStyle: 'dashed', borderTopColor: hexA(c.ink, 0.24), gap: 9 }, sheetStyle]}>
            <Inline><Icon name="chevron" size={13} color={c.acc} sw={2.4} /><Say size={14}>so holding it opens this</Say></Inline>
            <View style={{ flexDirection: 'row', gap: 9 }}>
              <Chip label="Here" on={false} onPress={() => fx.select()} />
              <Chip label="Late" on tone={c.acc} onPress={() => fx.select()} />
            </View>
            <View style={{ flexDirection: 'row', gap: 9 }}>
              <Chip label="Absent" on={false} onPress={() => fx.select()} />
              <Chip label="Sick" on={false} onPress={() => fx.select()} />
            </View>
            <Inline style={{ marginTop: 3 }}>
              <Arrow dir="right" w={40} h={12} color={c.warn} />
              <Say size={14}>so one cell can end up{' '}<Txt f="marker" s={16} style={{ color: c.warn }}>L</Txt>{' '}<Txt f="marker" s={16} style={{ color: c.bad }}>✕</Txt>{' '}<Txt f="marker" s={16} style={{ color: c.ok }}>S</Txt></Say>
            </Inline>
          </Animated.View>
        </AttendanceCard>
      </Deco>
    </View>
  );
}

/* ── 4 · the dial, live ──────────────────────────────────────────────────── */

/** `Focus.tsx`'s own dial geometry, copied rather than re-invented: the same 282 canvas, the same bed
 *  ring, the same 60 knurl lines, the same pointer path, the same 104 dp hand-cut hub, the same
 *  5-minute detents and the same 5–240 limits. */
const DIAL = 282, DC = 141;
const BED_RING = `M${DC + 139} ${DC}A139 139 0 1 1 ${DC - 139} ${DC}A139 139 0 1 1 ${DC + 139} ${DC}ZM${DC + 114} ${DC}A114 114 0 1 0 ${DC - 114} ${DC}A114 114 0 1 0 ${DC + 114} ${DC}Z`;
/** The readout's hub is a CAPSULE and not a disc, and that is `Focus.tsx`'s own decision copied deliberately.
 *  Its comment records why the disc was thrown out: "A disc has to be as wide as the numeral *and* as tall
 *  again, so the old 104-unit disc claimed 57 units of dial radius and hid the entire centre of the selected
 *  clock face — which is where the guilloché and the two rosette lattices live, and the thing the dial
 *  is there to show." This file had a 104-unit disc anyway, and the guilloché underneath is invisible because of it.
 *  `CAP_W x CAP_H = 108 x 44` is Focus's pair exactly; the disc claimed 104 units of *diameter* and this
 *  claims 22 units of radius. Both are visible side by side in `/tmp/render/a8/DIALBUG.png`. */
const CAP_W = 108, CAP_H = 44, CAP_R = CAP_H / 2, HUB_R = { h: [CAP_R, CAP_R, CAP_R, CAP_R], v: [CAP_R, CAP_R, CAP_R, CAP_R] } as const;
const DIAL_MIN = 5, DIAL_MAX = 240, DIAL_STEP = 5;
/** The app's own figure: one full turn of the dial is 60 minutes. */
const DEG_PER_MIN = 6;

export function DialArt({ c, reduce }: ArtProps) {
  const { width } = useWindowDimensions();
  const k = Math.min(1, (width - 32) / DIAL), S = DIAL * k;
  const clock = useStore((s) => s.settings.clock);
  const [min, setMin] = useState(25);
  const raw = useSharedValue(25), cur = useSharedValue(25), knob = useSharedValue(0), hand = useSharedValue(25 * DEG_PER_MIN);

  /** One write per *detent*, never per frame: `setMin` re-renders this screen, and a re-render per
   *  frame is the single largest source of jank in React Native. */
  const commit = useCallback((m: number, vel: number) => { setMin(m); if (vel >= 0) fx.detent(vel); else fx.bump(); }, []);
  useEffect(() => {
    const target = (min % 60 || 60) * DEG_PER_MIN;
    hand.set(reduce ? target : withTiming(target, { duration: 220, easing: Easing.out(Easing.cubic) }));
  }, [min, hand, reduce]);

  /** Drag up or down the ring, through the app's own 6°-per-minute figure, so one full turn of the
   *  finger is an hour. Vertical travel is used rather than an angle about a measured centre because
   *  the tour's dial is scaled by the window width, and a centre measured at one width is wrong at another. */
  const drag = Gesture.Pan().minDistance(0)
    .onBegin(() => { cur.set(Math.round(min / DIAL_STEP) * DIAL_STEP); })
    .onUpdate((e) => {
      const deg = (e.translationY * 360) / (DIAL * 2.6), before = raw.get();
      const next = Math.max(DIAL_MIN, Math.min(DIAL_MAX, before - deg / DEG_PER_MIN));
      raw.set(next);
      knob.set(knob.get() - deg);
      hand.set(((next % 60) || 60) * DEG_PER_MIN);
      const snap = Math.round(next / DIAL_STEP) * DIAL_STEP;
      if (snap !== cur.get()) { cur.set(snap); runOnJS(commit)(snap, Math.abs(e.velocityY) + Math.abs(e.velocityX)); }
      else if ((snap === DIAL_MIN || snap === DIAL_MAX) && Math.round(before) !== Math.round(next)) runOnJS(commit)(snap, -1);
    })
    .onFinalize(() => hand.set(withTiming(((cur.get() % 60) || 60) * DEG_PER_MIN, { duration: 160 })));

  const gripStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${knob.get()}deg` }] }));
  const handStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${hand.get()}deg` }] }));
  const knurl = useMemo(() => Array.from({ length: 60 }, (_, i) => {
    const a = (i * 6 * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    return <Line key={i} x1={DC + 131 * ca} y1={DC + 131 * sa} x2={DC + 138 * ca} y2={DC + 138 * sa} stroke={c.ink} strokeWidth={1.7} strokeOpacity={0.5} />;
  }), [c.ink]);
  const pointer = useMemo(() => (
    <G>
      <Path d={`M${DC} ${DC + 14}L${DC} 54`} stroke={c.ink} strokeWidth={3} strokeLinecap="round" />
      <Path d={`M${DC} 34L${DC + 6.5} 58L${DC - 6.5} 58Z`} fill={c.ink} />
      <Circle cx={DC} cy={DC} r={6.5} fill={c.ink} />
    </G>
  ), [c.ink]);
  const hubPath = useMemo(() => handPath(CAP_W, CAP_H, HUB_R, 7717, 1.6), []);
  const atLimit = min <= DIAL_MIN || min >= DIAL_MAX;
  /** `Focus.tsx` resolves the bed as one step off the page surface — deeper than paper in light,
   *  raised above the desk in dark. Copying that is why the dial belongs on both themes. */
  const bed = c.desk;

  return (
    <View style={{ gap: 12 }}>
      <GestureDetector gesture={drag}>
        <View
          accessible accessibilityRole="adjustable"
          accessibilityLabel="Focus minutes. Swipe up or down to change, or use the accessibility actions."
          accessibilityValue={{ text: `${min} minutes${atLimit ? ', at the limit' : ''}` }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => {
            const m = e.nativeEvent.actionName === 'increment' ? Math.min(DIAL_MAX, min + DIAL_STEP) : Math.max(DIAL_MIN, min - DIAL_STEP);
            commit(m, 300);
          }}
          style={{ width: S, height: S, alignSelf: 'center' }}
        >
          {/* `live={false}` is load-bearing: a tour can be mounted while nothing else is, and a hidden
              clock must not tick. This draws its composite once and starts no frame loop. */}
          <View style={{ position: 'absolute', left: (S - S * 0.66) / 2, top: (S - S * 0.66) / 2, width: S * 0.66, height: S * 0.66, borderRadius: S * 0.33, overflow: 'hidden', borderWidth: 1.5, borderColor: hexA(c.ink, 0.34) }}>
            <ClockFace id={clock} size={S * 0.66} live={false} hands={false} />
          </View>
          <Svg width={S} height={S} viewBox={`0 0 ${DIAL} ${DIAL}`} pointerEvents="none">
            <Path d={BED_RING} fill={bed} fillRule="evenodd" />
            <Path d={BED_RING} fill={hexA(c.ink, 0.13)} fillRule="evenodd" />
            <Circle cx={DC} cy={DC} r={139} fill="none" stroke={c.ink} strokeWidth={1.6} />
            <Circle cx={DC} cy={DC} r={113.5} fill="none" stroke={c.ink} strokeWidth={1.2} strokeOpacity={0.7} />
            <Circle cx={DC} cy={DC} r={92.5} fill="none" stroke={hexA(c.ink, 0.34)} strokeWidth={1.5} />
            {[['60', 141, 16], ['15', 266, 141], ['30', 141, 266], ['45', 16, 141]].map(([t, x, y]) => (
              /* `c.ink`, not `c.mut`: the numerals sit on the dial bed, which is `c.desk`, and `mut`/`desk` is
                 4.03:1 in `original.light` — below the 4.5 this project sets. `ink`/`desk` clears it everywhere and
                 the numerals are the dial's only text, so nothing is lost. See `src/test/ui.test.ts`. */
              <SText key={t as string} x={x as number} y={(y as number) + 4} fontSize={10} fontFamily={FONT.type} fill={c.ink} textAnchor="middle">{t as string}</SText>
            ))}
          </Svg>
          {/* the knurl turns under the finger and the hand sweeps with it — both on the UI thread */}
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: S, height: S }, gripStyle]}>
            <Svg width={S} height={S} viewBox={`0 0 ${DIAL} ${DIAL}`}>{knurl}</Svg>
          </Animated.View>
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: S, height: S }, handStyle]}>
            <Svg width={S} height={S} viewBox={`0 0 ${DIAL} ${DIAL}`}>{pointer}</Svg>
          </Animated.View>
          {/* the readout on its own hand-cut paper hub, concentric with the dial */}
          <View pointerEvents="none" style={{ position: 'absolute', left: DC * k - (CAP_W / 2) * k, top: DC * k - (CAP_H / 2) * k, width: CAP_W * k, height: CAP_H * k, alignItems: 'center', justifyContent: 'center' }}>
            {/* `viewBox="-2 -2 108 108"`, NOT a frame centred on the dial. `handPath` always walks a box
                from (0,0) — that is its whole contract and `ui/hand.ts` says so — so the hub path occupies
                0…104 and a frame of `-54 -54 108 108` shows only its top-left quadrant: the number sat on the
                bare clock face with a stray arc of outline up and to the left of it. This is `Focus.tsx:154`
                exactly (`-2 -2 CAP_BOX CAP_BOX` over a 0-based path), and it was only findable by looking:
                the arithmetic is off by 52 px in each axis and every assertion about it passes. */}
            <Svg width={(CAP_W + 4) * k} height={(CAP_H + 4) * k} style={{ position: 'absolute', left: -2 * k, top: -2 * k }} viewBox="-2 -2 112 112">
              <Path d={hubPath} transform={`translate(${2.6} ${3})`} fill={hexA(c.shadow, 0.2)} />
              <Path d={hubPath} fill={c.card} stroke={c.ink} strokeWidth={2.1} strokeLinejoin="round" />
            </Svg>
            <Txt f="type" s={27 * k} style={{ letterSpacing: -0.8 }} maxFontSizeMultiplier={FS}>{min}</Txt>
          </View>
        </View>
      </GestureDetector>
      <Deco>
        <View style={{ flexDirection: 'row', gap: 7 }}>
          {[25, 45, 50, 90].map((m) => (
            <Pressable key={m} onPress={() => { commit(m, 500); raw.set(m); }} accessibilityRole="button" accessibilityState={{ selected: min === m }} accessibilityLabel={`${m} minutes`} style={{ flex: 1, minWidth: 44 }}>
              <HandBox seed={`op${m}`} fill={min === m ? c.ink : c.card} sw={1.8} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
                <Txt f="bold" s={20} c={min === m ? 'card' : 'ink'}>{m}</Txt>
                <Txt f="hand" s={11} c={min === m ? 'card' : 'mut'} style={{ marginTop: -2 }}>min</Txt>
              </HandBox>
            </Pressable>
          ))}
        </View>
        <Inline style={{ marginTop: 12 }}>
          <HandBox seed="brk" sw={2} style={{ minHeight: 38, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: atLimit ? 0.5 : 1 }}>
            <Icon name="coffee" size={17} color={c.ink} />
            <Txt f="bold" s={16}>break · 5 min</Txt>
          </HandBox>
          <Say size={14.5} style={{ flex: 1 }}>unlocks after 5 min of work</Say>
        </Inline>
        <HandBox seed="focus-note" style={{ marginTop: 18, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 12, transform: [{ rotate: '-1.6deg' }] }}>
          <Tape w={52} rot={-22} style={{ left: 14, top: -9 }} />
          <Txt f="hand" s={19} style={{ lineHeight: 22 }}>focus doesn’t{'\n'}happen by accident</Txt>
        </HandBox>
      </Deco>
      <View style={{ alignSelf: 'center', marginTop: 14, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, borderWidth: 1.6, borderStyle: 'dashed', borderColor: hexA(c.acc, 0.7), flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <Txt f="bold" s={18} c="acc">Try it</Txt>
        <Say size={15}>drag the ring with your finger</Say>
      </View>
    </View>
  );
}

/* ── 5 · the recap ───────────────────────────────────────────────────────── */

const RECAP: [string, string, string][] = [
  ['today', 'Today', 'what’s on, what’s next'], ['week', 'Week', 'the timetable'], ['tasks', 'To-do', 'everything you owe'],
  ['grades', 'Grades', 'marks and attendance'], ['stats', 'Stats', 'fills in over a week'],
];

export function RecapArt({ c }: ArtProps) {
  return (
    <HandBox seed="onb-recap" style={{ padding: 14, gap: 2 }}>
      {RECAP.map(([i, t, h]) => (
        <Inline key={i} style={{ minHeight: 46 }}>
          <Icon name={i} size={22} color={c.acc} sw={1.9} />
          <Txt f="bold" s={21} style={{ flex: 1 }}>{t}</Txt>
          <Say size={15}>{h}</Say>
        </Inline>
      ))}
      <View style={{ height: 1.4, backgroundColor: hexA(c.ink, 0.18), marginVertical: 8 }} />
      <Say size={15.5} style={{ lineHeight: 20 }}>Margin 1.0 · local-first, no account, no network needed.{'\n'}Everything else lives behind the gear — and it changes the page behind it as you watch.</Say>
    </HandBox>
  );
}
