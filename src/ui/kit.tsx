import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewProps, type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { Easing, interpolate, interpolateColor, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { RG, RS, FONT, TAPE, hexA, type Colors } from '../tokens/theme';
import { handPath, hashSeed, type Corners } from './hand';
import { FADE_START, STRIP_FADE, stripHasMore } from './fit';
import { useReduceMotion, useTheme } from './theme-context';
import { fx } from '../services/fx';

/* ──────────────────────────────────────────────────────────────────────────────
 * The motion vocabulary, in one place, because every control in this file is the
 * same kind of thing at a different size. Nothing here is a new language: `EASE`
 * IS the page placement's curve (`PLACE_EASE` in `navigation/window.ts`), so a chip
 * and a page decelerate with the same hand on the tween, and the app stops having
 * four slightly different settles.
 *
 * Three numbers, and only three:
 *   BEAT (90)  — press-in. The most repeated motion in the app; it has to be felt,
 *                not watched. `expo-animation` puts press feedback at 100-150 ms
 *                and this is the short end of it.
 *   STEP (160) — a state change with no finger on it: a toggle, a selection, a
 *                field taking focus, a button becoming available. `expo-animation`
 *                puts "toggle, chip, small state change" at 150-200 ms.
 *   The springs below are not a fourth number. A spring is used where the value is
 *   CONTINUOUS or can be interrupted — a knob, a chip settling, a sheet released
 *   from a drag — because a spring carries the velocity of whatever was happening
 *   and a timing curve restarts from wherever it is told to, which on a control a
 *   user hits ten times a minute reads as a hitch.
 *
 * Every one of these collapses under `useReduceMotion()` to an instant assignment.
 * That is a correctness requirement, not a nicety (`COORDINATION.md` §5, prompt.md
 * V14): the OS "remove animations" switch has to actually remove the animation,
 * and a switch that is checked must not be lying about where it is.
 */
export const EASE = Easing.bezier(0.2, 0.9, 0.25, 1);
export const BEAT = 90;
export const STEP = 160;
/** A settled detent: a small overshoot that reads as a mechanical part arriving. */
export const KNOB = { duration: 220, dampingRatio: 0.78 } as const;

/**
 * The focus ring, for the focus TalkBack does not draw for itself.
 *
 * Two different focusses exist on Android and only one of them has always had a picture. TalkBack's
 * *accessibility* focus paints its own rectangle over whatever it lands on; *input* focus — a hardware
 * keyboard's Tab, a switch-access scan, anything that arrives through `onFocus` on a focusable view —
 * paints nothing on a custom control, so a form of paper buttons was invisible to exactly the users
 * prompt.md V14 is about. `Pressable` is focusable by default on Android, so the event already arrives;
 * what was missing was the ring.
 *
 * The ring is the platform `outline`, not a child `View`: RN's Android renderer draws it as its own
 * path outside the box (`OutlineDrawable`), it follows the control when it dips under a finger, and it
 * costs no extra view, no animation and no Yoga. It is not gated on reduce-motion because it never
 * moves — it is a state, like the switch's position, and a state has to be shown either way.
 *
 * Touch does not set it: Android only takes input focus from a tap when the view is focusable *in
 * touch mode*, and these are not — the same rule that keeps a native button from ringing after a tap.
 */
function useFocusRing() {
  const { c } = useTheme();
  const [on, setOn] = useState(false);
  const ring: StyleProp<ViewStyle> = on ? { outlineColor: c.acc, outlineWidth: 2, outlineOffset: 2, outlineStyle: 'solid' } : null;
  return [{ onFocus: () => setOn(true), onBlur: () => setOn(false) }, ring] as const;
}

/** Dispatch a control's action on the finger-DOWN frame instead of on the lift.
 *
 *  `onPress` is dispatched by React Native on RELEASE, which puts the user's own hold time — typically
 *  60–150 ms — in front of every action in the app. That hold is what "after I press a button" actually
 *  was, and it is why `navigation/Book.tsx`'s tab bar had already moved to `onPressIn` on its own.
 *
 *  What makes this more than moving a call is that `onPress` CANNOT be deleted. Android's accessibility
 *  activation arrives as a NON-POINTER click, and `Pressability.onClick` routes those straight to
 *  `onPress` without ever running the responder sequence
 *  (react-native/Libraries/Pressability/Pressability.js) — so a press-in-only control is silent to
 *  TalkBack. `claimed` is therefore set when press-in acts and consumed by the release's `onPress`, so
 *  one gesture fires exactly once on either path and the accessibility path stays live behind it.
 *
 *  Pass `onLift` for a control that must not act on touch-down — a `danger` button, where a slide-off
 *  must never destroy. Such a control skips press-in entirely and keeps `onPress` as its only route.
 *
 *  Returns the two handlers to spread; each control composes its own dip on top of `down`. */
export function usePressIn(action: () => void, opts?: { onLift?: boolean }) {
  const claimed = useRef(false);
  const down = () => { if (opts?.onLift) return; claimed.current = true; action(); };
  const lift = () => { if (claimed.current) { claimed.current = false; return; } action(); };
  return [down, lift] as const;
}

type FontKey = 'hand' | 'bold' | 'serif' | 'serifB' | 'marker' | 'type';const FAM: Record<FontKey, string> = { hand: FONT.hand, bold: FONT.handBold, serif: FONT.serif, serifB: FONT.serifB, marker: FONT.marker, type: FONT.type };
/** `testID` fallback. On RN Android a `testID` surfaces as `resource-id` in a `uiautomator` dump, which is how the
 *  QA agents find an element without guessing at its bounds, so every interactive element gets one. It is derived
 *  from the same string that is already the accessibility label, so no call site has to change and the id always
 *  says what the control is. Pass `testID` explicitly only to disambiguate repeats (two "Save" buttons). */
const tid = (s?: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export interface TxtProps extends TextProps { f?: FontKey; s?: number; c?: keyof Colors | string; style?: StyleProp<TextStyle> }
export function Txt({ f = 'hand', s = 18, c = 'ink', style, ...p }: TxtProps) {
  const { c: col } = useTheme(), color = (col as unknown as Record<string, string>)[c] ?? c;
  return <Text {...p} allowFontScaling style={[{ fontFamily: FAM[f], fontSize: s, color, lineHeight: Math.round(s * (f === 'marker' ? 1.25 : 1.18)) }, style]} />;
}

export interface HandBoxProps { children?: React.ReactNode; style?: StyleProp<ViewStyle>; fill?: string; stroke?: string; seed?: string | number; corners?: Corners; sw?: number; shadow?: boolean; amp?: number; dashed?: boolean }
/** A card with a hand-cut outline (elliptical corners + wobble) and a hard offset shadow, drawn once per size. */
export function HandBox({ children, style, fill, stroke, seed = 1, corners = RG, sw = 1.6, shadow = true, amp = 1.1, dashed }: HandBoxProps) {
  const { c } = useTheme(), [sz, setSz] = useState({ w: 0, h: 0 }), sd = useMemo(() => (typeof seed === 'number' ? seed : hashSeed(seed)), [seed]);
  const d = useMemo(() => handPath(sz.w, sz.h, corners, sd, amp), [sz.w, sz.h, corners, sd, amp]);
  return (
    <View style={[{ position: 'relative', zIndex: 0 }, style]} onLayout={(e) => { const { width, height } = e.nativeEvent.layout; if (Math.abs(width - sz.w) > 0.5 || Math.abs(height - sz.h) > 0.5) setSz({ w: width, h: height }); }}>
      {d !== '' && (
        <Svg width={sz.w + 4} height={sz.h + 4} style={[StyleSheet.absoluteFill, { zIndex: -1 }]} pointerEvents="none" viewBox={`-1 -1 ${sz.w + 4} ${sz.h + 4}`}>
          {shadow && <Path d={d} transform="translate(2.4 2.8)" fill={hexA(c.shadow, 0.16)} />}
          <Path d={d} fill={fill ?? c.card} stroke={stroke ?? c.ink} strokeWidth={sw} strokeLinejoin="round" strokeDasharray={dashed ? '5 4' : undefined} />
        </Svg>
      )}
      {children}
    </View>
  );
}

const ICONS: Record<string, string> = {
  today: 'M5 4h14v16H5zM5 9h14M9 2v4M15 2v4M9 13h2M13 13h2M9 16.5h2',
  week: 'M3 5h18v15H3zM3 10h18M8 5v15M13 5v15M18 5v15',
  tasks: 'M5 4h14v16H5zM8.5 9.5l1.7 1.7 3.2-3.4M8.5 15h7',
  grades: 'M4 20V9M10 20V4M16 20v-8M22 20H2',
  stats: 'M3 18l5-6 4 3 6-9M3 21h18',
  plus: 'M12 5v14M5 12h14', check: 'M5 12.5l4.5 4.5L19 7', x: 'M6 6l12 12M18 6L6 18', trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 017 0v3', unlock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 016.8-1.2', bell: 'M6 17V11a6 6 0 0112 0v6l2 2H4zM10 21h4',
  timer: 'M12 8v5l3 2M9 2h6M12 4a8.5 8.5 0 100 17 8.5 8.5 0 000-17z', gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM12 4.7a7.3 7.3 0 100 14.6 7.3 7.3 0 000-14.6zM12 4.7V1.9M17.1 6.9L19.1 4.9M19.3 12h2.8M17.1 17.1l2 2M12 19.3v2.8M6.9 17.1l-2 2M4.7 12H1.9M6.9 6.9L4.9 4.9',
  back: 'M15 5l-7 7 7 7', pencil: 'M4 20l1-4L16 5l3 3L8 19zM14 7l3 3', play: 'M7 4l13 8-13 8z', pause: 'M7 4h3.5v16H7zM13.5 4H17v16h-3.5z', coffee: 'M4 9h12v6a4 4 0 01-4 4H8a4 4 0 01-4-4zM16 10h2a2 2 0 010 4h-2M7 3c0 2 2 2 2 4M11 3c0 2 2 2 2 4',
  flag: 'M6 21V4M6 4h11l-2 4 2 4H6', book: 'M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1zM12 6v14', note: 'M5 4h14v12l-5 5H5zM14 21v-5h5M8 9h8M8 13h5', chevron: 'M9 5l7 7-7 7',
  focus: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8z', export: 'M12 15V3M7 8l5-5 5 5M4 15v5h16v-5', palette: 'M12 3a9 9 0 100 18c1.5 0 2-1 1.5-2.2-.6-1.4.3-2.8 1.8-2.8H17a4 4 0 004-4c0-4.4-4-9-9-9zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01', sound: 'M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 010 7',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3.5 2', exam: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5', lab: 'M9 3h6M10 3v6L5 19a1.5 1.5 0 001.4 2h11.2A1.5 1.5 0 0019 19l-5-10V3M8 15h8', grad: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5',
};
export function Icon({ name, size = 22, color, sw = 1.8 }: { name: keyof typeof ICONS | string; size?: number; color?: string; sw?: number }) {
  const { c } = useTheme();
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? c.ink} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><Path d={ICONS[name] ?? ICONS.plus} /></Svg>;
}

export interface BtnProps { label?: string; icon?: string; onPress?: () => void; kind?: 'primary' | 'ink' | 'ghost' | 'danger'; small?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; a11y?: string; flex?: boolean; quiet?: boolean; selected?: boolean; testID?: string }
/**
 * A button is a cut piece of paper. Pressing it dips that paper by 3 %, and letting go springs it
 * back — `expo-animation`'s rule, "scale 0.97 in 100-150 ms on any button-like pressable", at the short
 * end of the range because this is the control the app repeats most.
 *
 * The ACTION and the dip both start on press-IN, so nothing waits for the finger to lift;
 * `instant-actions.test.ts` drives a real render to hold that. `kind="danger"` is the one exception
 * and the reason is in the comment on `down`.
 *
 * Two things are deliberately NOT here:
 *  · **No opacity in the press.** Opacity on a wrapper makes the renderer keep the subtree in an
 *    offscreen target and re-composite every frame — the cost `navigation/Book.tsx` documents removing
 *    from the page placement. `scale` is free and carries the label and the icon with it, which is what
 *    makes it read as a physical thing rather than a colour change.
 *  · **No animated `fill` when `kind` changes.** That is SVG geometry work; see `qa/MOTION-INVENTORY.md`
 *    §6.1 for the measurement behind that decision and the one-line change that reverses it.
 *
 * The disabled fade is the exception, and it is animated on purpose: it is the *only* validation signal
 * any form in this app has (every Save button is `disabled={!title.trim()}`), and a button that blinks
 * into existence when you type the first character is a button you learn to distrust.
 */
export function Btn({ label, icon, onPress, kind = 'primary', small, disabled, style, a11y, flex, quiet, selected, testID }: BtnProps) {
  const { c } = useTheme(), reduce = useReduceMotion(), press = useSharedValue(1), dim = useSharedValue(disabled ? 1 : 0);
  const [focusProps, ring] = useFocusRing();
  const bg = kind === 'primary' ? c.acc : kind === 'ink' ? c.ink : kind === 'danger' ? c.bad : 'transparent', fg = kind === 'primary' ? c.onAcc : kind === 'ink' ? c.paper : kind === 'danger' ? c.card : c.ink;
  const h = small ? 40 : 52;
  useEffect(() => { dim.set(reduce || disabled ? 1 : withTiming(0, { duration: STEP, easing: EASE })); }, [disabled, reduce, dim]);
  /* A button answers on the FINGER-DOWN frame, not on the lift.
     `onPress` is dispatched on RELEASE, which puts the user's own hold time — typically 60–150 ms —
     in front of every action in the app. That hold is what "after I press a button" actually was, and
     it is why `navigation/Book.tsx`'s tab bar already moved to `onPressIn` and documented it there.
     `onPressIn` is the frame the touch event arrives, which is where the dip already starts, so the
     action and its feedback now begin together.
     `danger` is the one deliberate exception: `onPressIn` commits on touch-down even if the finger
     slides off before release, and a button whose slide-off destroys data is not one anyone can
     safely correct. It keeps `onPress`, and pays the hold time for it.
     `claimed` exists for TalkBack, and deleting `onPress` instead is not an option: Android's
     accessibility activation arrives as a NON-POINTER click, and `Pressability.onClick` routes those
     straight to `onPress` without ever running the responder sequence
     (react-native/Libraries/Pressability/Pressability.js). A press-in-only button is therefore silent
     to a screen reader. The flag is set when press-in acts and consumed by the release's `onPress`, so
     one gesture fires once on either path, and the accessibility path stays live behind it. */
  /* Press-in and press-out are two writes to one value, never a reset, so a button tapped again
     before the spring finishes continues from where it is (V18: no stuck, half-animated state).
     `usePressIn` carries the dispatch and the TalkBack guard; `danger` is the one kind that opts out,
     because `onPressIn` commits on touch-down even if the finger slides off, and a button whose
     slide-off destroys data is not one anyone can safely correct. It pays the hold time for that. */
  const [actIn, actLift] = usePressIn(() => { if (!quiet) fx.tap(); onPress?.(); }, { onLift: kind === 'danger' });
  const down = () => { if (disabled) return; actIn(); press.set(reduce ? 1 : withTiming(0.97, { duration: BEAT, easing: EASE })); };
  const up = () => { press.set(reduce ? 1 : withSpring(1, { duration: 200, dampingRatio: 0.72 })); };
  const face = useAnimatedStyle(() => ({ opacity: interpolate(dim.get(), [0, 1], [1, 0.45]), transform: [{ scale: press.get() }] }));
  return (
    <Pressable testID={testID ?? tid(a11y ?? label)} accessibilityRole="button" accessibilityLabel={a11y ?? label} accessibilityState={{ disabled: !!disabled, selected: !!selected }} disabled={disabled}
      onPress={actLift} onPressIn={down} onPressOut={up} android_ripple={{ color: hexA(c.ink, 0.18), borderless: false }} hitSlop={4} {...focusProps}
      style={[{ minHeight: h, flex: flex ? 1 : undefined }, ring, style]}>
      {/* stroke is always the ink: a ghost button has a transparent fill so it needs its own border,
          and the three filled kinds all draw on the accent/ink/bad the label is drawn against. */}
      <Animated.View style={[{ minHeight: h }, face]}>
        <HandBox seed={`${label}${icon}`} fill={bg} stroke={c.ink} corners={RS} shadow={kind !== 'ghost'} style={{ minHeight: h, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: small ? 14 : 20 }}>
          {icon ? <Icon name={icon} size={small ? 18 : 22} color={fg} /> : null}
          {label ? <Txt f="bold" s={small ? 19 : 23} c={fg}>{label}</Txt> : null}
        </HandBox>
      </Animated.View>
    </Pressable>
  );
}
/**
 * A chip is a small cut-out being pushed into a slot.
 *
 * Press and selection share ONE value, deliberately. A chip is 96 % of the time both pressed and
 * selected, and two values would have to be reconciled on every tap; one value means the second write
 * simply retargets the first, continuously. The selection leg is a `withSequence` on that value and
 * never an assignment of a fresh start, so ten taps in a second read as one continuous swell rather
 * than a strobe through zero ten times.
 */
export function Chip({ label, on, onPress, icon, tone, small }: { label: string; on?: boolean; onPress?: () => void; icon?: string; tone?: string; small?: boolean }) {
  const { c } = useTheme(), reduce = useReduceMotion(), s = useSharedValue(1), was = useRef(!!on);
  const [focusProps, ring] = useFocusRing();
  const fg = on ? c.onAcc : c.ink, bg = on ? tone ?? c.acc : c.card;
  useEffect(() => {
    if (was.current === !!on) return;
    was.current = !!on;
    if (reduce) { s.set(1); return; }
    s.set(withSequence(withTiming(1.06, { duration: 110, easing: EASE }), withSpring(1, { duration: 220, dampingRatio: 0.6 })));
  }, [on, reduce, s]);
  const face = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  const [actIn, actLift] = usePressIn(() => { fx.select(); onPress?.(); });
  return (
    /* top/bottom slop is 5 and not 4 because a small chip is 34 dp tall: 34 + 10 is the 44 dp touch
       target, and HStrip now pads its strips 6 so the slop lands inside the strip's own bounds rather
       than being clipped away by the ScrollView it sits in. */
    <Pressable testID={tid(label)} accessibilityRole="button" accessibilityState={{ selected: !!on }} accessibilityLabel={label} hitSlop={{ top: 5, bottom: 5, left: 2, right: 2 }} {...focusProps} style={ring}
      onPress={actLift} onPressIn={() => { actIn(); s.set(reduce ? 1 : withTiming(0.96, { duration: BEAT, easing: EASE })); }} onPressOut={() => s.set(reduce ? 1 : withSpring(1, { duration: 190, dampingRatio: 0.7 }))}>
      <Animated.View style={[{ minHeight: small ? 34 : 42 }, face]}>
        <HandBox seed={label} fill={bg} corners={RS} shadow={false} sw={on ? 1.8 : 1.3} style={{ minHeight: small ? 34 : 42, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {icon ? <Icon name={icon} size={16} color={fg} /> : null}
          <Txt f="bold" s={small ? 17 : 19} c={fg}>{label}</Txt>
        </HandBox>
      </Animated.View>
    </Pressable>
  );
}
/**
 * The switch, as a thing with a part that moves.
 *
 * Today the knob was `left: value ? 26 : 3` and the track was `backgroundColor: value ? c.acc : c.card`
 * — both recomputed on the React thread and applied in a single commit, so a switch snapped. It is the
 * most-repeated snapped state change in the app: nine of them sit on the first three Settings pages.
 *
 * One shared value `k` in 0..1 drives the knob's position, the track's colour and the knob's own
 * colour, so they physically cannot disagree — and the position can overshoot its detent while the
 * *colour* is clamped to 0..1, which is what is wanted: a knob that bounces into place, paint that
 * does not. `interpolateColor` on a plain `View` is one native setter per frame; the equivalent on an
 * SVG node is not (see `qa/MOTION-INVENTORY.md` §6.1).
 *
 * Under reduce-motion the value is assigned, not animated: the knob still moves, because where the knob
 * IS the state — dropping the movement would leave the switch lying about its own position.
 */
export function Toggle({ value, onChange, label, hint, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  const { c } = useTheme(), reduce = useReduceMotion(), k = useSharedValue(value ? 1 : 0), press = useSharedValue(1);
  const [focusProps, ring] = useFocusRing();
  useEffect(() => { if (reduce) { k.set(value ? 1 : 0); return; } k.set(withSpring(value ? 1 : 0, KNOB)); }, [value, reduce, k]);
  /* The switch dips under the finger the way every other control in the kit does, on the same value
     the knob and the paint already ride past — it is a part, and a part that ignores a press is a part
     that reads as a picture. The row is 56 dp and the switch is 54×30, so the dip is the switch's and
     not the label's: type that jumps under a finger is noise, and the whole row is the hit area. */
  const [actIn, actLift] = usePressIn(() => { fx.toggle(!value); onChange(!value); });
  const down = () => { if (disabled) return; actIn(); press.set(reduce ? 1 : withTiming(0.96, { duration: BEAT, easing: EASE })); };
  const up = () => { press.set(reduce ? 1 : withSpring(1, { duration: 190, dampingRatio: 0.7 })); };
  const track = useAnimatedStyle(() => { const t = k.get(), p = t < 0 ? 0 : t > 1 ? 1 : t; return { backgroundColor: interpolateColor(p, [0, 1], [c.card, c.acc]), transform: [{ scale: press.get() }] }; });
  const knob = useAnimatedStyle(() => { const t = k.get(), p = t < 0 ? 0 : t > 1 ? 1 : t; return { transform: [{ translateX: interpolate(t, [0, 1], [3, 26]) }], backgroundColor: interpolateColor(p, [0, 1], [c.ink, c.onAcc]) }; });
  return (
    <Pressable testID={tid(label)} accessibilityRole="switch" accessibilityState={{ checked: value, disabled: !!disabled }} accessibilityLabel={label} disabled={disabled} onPress={actLift} onPressIn={down} onPressOut={up} {...focusProps}
      android_ripple={{ color: hexA(c.ink, 0.12) }} style={[{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, opacity: disabled ? 0.5 : 1 }, ring]}>
      <View style={{ flex: 1 }}><Txt f="bold" s={21}>{label}</Txt>{hint ? <Txt f="serif" s={14.5} c="mut" style={{ marginTop: 1 }}>{hint}</Txt> : null}</View>
      <Animated.View style={[{ width: 54, height: 30, borderRadius: 15, borderWidth: 1.6, borderColor: c.ink, justifyContent: 'center' }, track]}>
        <Animated.View style={[{ position: 'absolute', left: 0, width: 22, height: 22, borderRadius: 11 }, knob]} />
      </Animated.View>
    </Pressable>
  );
}
/** 0.95 and not 0.96: this is a 26 dp glyph, not a card, and a hair more travel is what makes it
 *  legible at all. Still inside `make-interfaces-feel-better`'s "never below 0.95". */
function StepBtn({ t, onPress, dis, a }: { t: string; onPress: () => void; dis: boolean; a: string }) {
  const { c } = useTheme(), reduce = useReduceMotion(), s = useSharedValue(1);
  const [focusProps, ring] = useFocusRing();
  /* The first step lands on press-in like everything else. `onLongPress` stays the repeat path and is
     deliberately NOT routed through `usePressIn`: a long press is a separate signal, and React Native
     already suppresses the release's `onPress` once one has fired (`isPressCanceledByLongPress`), so
     holding gives exactly one press-in step followed by the repeats and never a stray extra. */
  const [actIn, actLift] = usePressIn(() => { fx.select(); onPress(); });
  const face = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  return (
    <Pressable testID={tid(a)} accessibilityRole="button" accessibilityLabel={a} accessibilityState={{ disabled: dis }} disabled={dis} onPress={actLift} onLongPress={() => { fx.select(); onPress(); }} delayLongPress={350} {...focusProps}
      onPressIn={() => { actIn(); s.set(reduce || dis ? 1 : withTiming(0.95, { duration: BEAT, easing: EASE })); }} onPressOut={() => s.set(reduce ? 1 : withSpring(1, { duration: 190, dampingRatio: 0.7 }))}
      android_ripple={{ color: hexA(c.ink, 0.2), borderless: true }} style={[{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center', opacity: dis ? 0.35 : 1 }, ring]}>
      <Animated.View style={[{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center' }, face]}><Txt f="marker" s={26}>{t}</Txt></Animated.View>
    </Pressable>
  );
}
/**
 * A stepper's value changing IS a state change, so it moves.
 *
 * The hard part is the fast repeat: `onLongPress` at 350 ms, and V18's "toggle done 10x", mean the
 * value can change several times inside one animation. The fix is structural rather than a longer
 * duration: `k` is only ever *retargeted*, never assigned a fresh start, so ten increments leave the
 * digits travelling continuously out of and back into place instead of strobing through zero ten
 * times. `dir` is a shared value rather than a ref because the UI thread has to read it.
 */
export function Stepper({ value, onChange, min, max, step = 1, fmt, label }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; fmt?: (v: number) => string; label?: string }) {
  const reduce = useReduceMotion(), k = useSharedValue(0), dir = useSharedValue(-1), last = useRef(value);
  const dec = () => onChange(Math.max(min, value - step)), inc = () => onChange(Math.min(max, value + step));
  useEffect(() => {
    if (last.current === value) return;
    dir.set(value > last.current ? -1 : 1); // the digits travel up when the number rises
    last.current = value;
    if (reduce) { k.set(0); return; }
    k.set(withSequence(withTiming(1, { duration: 60, easing: EASE }), withSpring(0, { duration: 180, dampingRatio: 0.7 })));
  }, [value, reduce, k, dir]);
  const nudge = useAnimatedStyle(() => ({ transform: [{ translateY: dir.get() * -3.5 * k.get() }, { scale: interpolate(k.get(), [0, 1], [1, 0.93]) }] }));
  return (
    <HandBox seed={`st${label}`} shadow={false} corners={RS} style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' }}>
      <StepBtn t="−" onPress={dec} dis={value <= min} a={`Decrease ${label ?? ''}`} />
      <Animated.View style={[{ minWidth: 74, alignItems: 'center' }, nudge]} accessibilityLiveRegion="polite"><Txt f="bold" s={22}>{fmt ? fmt(value) : String(value)}</Txt></Animated.View>
      <StepBtn t="+" onPress={inc} dis={value >= max} a={`Increase ${label ?? ''}`} />
    </HandBox>
  );
}
/**
 * A field's focus rule wipes in from the left instead of its border getting thicker.
 *
 * `borderBottomWidth` is a layout property: animating it re-runs Yoga for the input *and its siblings*
 * on every frame, in a text field, while the user is typing. So the input keeps a static ink hairline
 * and the accent rule is a separate `Animated.View` scaled on the x axis from `transformOrigin: 'left'`
 * (RN 0.76+, and this app is 0.86 on the New Architecture, which `transformOrigin` requires).
 */
export function Field({ label, style, multiline, ...p }: TextInputProps & { label?: string }) {
  const { c } = useTheme(), reduce = useReduceMotion(), [focus, setFocus] = useState(false), k = useSharedValue(0);
  useEffect(() => { k.set(reduce || focus ? 1 : 0); if (!reduce) k.set(withTiming(focus ? 1 : 0, { duration: STEP, easing: EASE })); }, [focus, reduce, k]);
  const rule = useAnimatedStyle(() => ({ transform: [{ scaleX: k.get() }] }));
  return (
    <View style={style as StyleProp<ViewStyle>}>
      {label ? <Txt f="serif" s={14.5} c="mut" style={{ marginBottom: 2 }}>{label}</Txt> : null}
      <TextInput {...p} testID={tid(label ?? p.placeholder)} multiline={multiline} accessibilityLabel={label ?? p.placeholder} placeholderTextColor={c.mut} selectionColor={c.acc} onFocus={(e) => { setFocus(true); p.onFocus?.(e); }} onBlur={(e) => { setFocus(false); p.onBlur?.(e); }}
        style={{ fontFamily: FONT.handBold, fontSize: 24, color: c.ink, paddingVertical: 6, paddingHorizontal: 2, minHeight: multiline ? 78 : 46, textAlignVertical: multiline ? 'top' : 'center', borderBottomWidth: 1.4, borderBottomColor: c.ink }} />
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 2, right: 2, bottom: 0, height: 2.2, borderRadius: 2, backgroundColor: c.acc, transformOrigin: 'left center' }, rule]} />
    </View>
  );
}
export const Row = ({ children, style, gap }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) => <View style={[{ flexDirection: 'row', alignItems: 'center', gap: gap ?? 8, flexWrap: 'wrap' }, style]}>{children}</View>;

/**
 * A section of a form that opens and closes, as paper sliding out from under another sheet of paper.
 *
 * Five call sites: the Task sheet's Start date and at-a-time sections, and the day/time pickers behind
 * both. Every one of them used to appear in a single commit — a label, a stepper and a whole date strip,
 * with nothing moving.
 *
 * The exit is the part that has to be built rather than declared: unmounting on `open === false` would
 * remove the section in the same commit that *starts* the tween, so `shown` holds it mounted until the
 * tween reports that it is finished. Transform and opacity only, never height — animating a height
 * re-runs Yoga for the whole form on every frame, in the one sheet where the keyboard is usually up.
 */
export function Reveal({ open, children }: { open: boolean; children: React.ReactNode }) {
  const reduce = useReduceMotion(), k = useSharedValue(open ? 1 : 0);
  /* `held` means "keep rendering, the exit is still running". It is cleared by the tween's own callback
   * and by nothing else, so the section is on screen for exactly as long as its exit takes — returning
   * null the moment `open` flips would remove it in the same commit that *starts* the tween. Re-opening
   * sets it back during render, which is React's own "adjust state when a prop changes" pattern; doing
   * it in an effect would cost an extra commit before the section could begin to appear.
   *
   * Under reduce-motion the tween is 1 ms rather than absent, so the same callback clears `held` on the
   * same path. A separate branch that assigned `held` from an effect would be a second, differently
   * tested code path for the one case that must never be wrong. */
  const [held, setHeld] = useState(open);
  if (open && !held) setHeld(true);
  useEffect(() => {
    k.set(open ? withTiming(1, { duration: reduce ? 1 : 220, easing: EASE }) : withTiming(0, { duration: reduce ? 1 : 160, easing: EASE }, (done) => { if (done) runOnJS(setHeld)(false); }));
  }, [open, reduce, k]);
  const st = useAnimatedStyle(() => ({ opacity: k.get(), transform: [{ translateY: interpolate(k.get(), [0, 1], [-8, 0]) }] }));
  if (!open && !held) return null;
  return <Animated.View style={[{ gap: 8 }, st]}>{children}</Animated.View>;
}

/** A horizontal strip that scrolls when it overflows **and says so**.
 *
 *  Ten call sites were a bare `<ScrollView horizontal showsHorizontalScrollIndicator={false}>`. That
 *  suppresses the only affordance the platform gives away for free, so a row of chips was sliced
 *  mid-glyph at the viewport edge with nothing to indicate there was more (BUG-026) — on the To-do
 *  subject filter and on the Task sheet's kind and subject rows, which are the only way to pick either.
 *
 *  The platform's own scrollbar stays off: it is a grey bar on a hand-drawn paper page. In its place is
 *  a fade at the trailing edge, in whatever paper colour sits behind the strip (`bg`). It is *measured*,
 *  not assumed — it appears only when the content really is wider than the strip, and it disappears once
 *  you reach the end — so it never suggests more than there is. Trailing padding grows while it is shown
 *  so the last chip can be scrolled fully clear of the fade rather than sitting under it.
 *
 *  The vertical padding is 6 rather than 4 for one reason: a small chip is 34 dp tall, its hit area is
 *  34 + 10 (see `Chip`), and a ScrollView only hit-tests inside its own bounds — slop that pokes past
 *  the strip is slop a finger can never reach. 6 + 34 + 6 = 46, so the 44 dp target actually exists. */
export function HStrip({ children, gap = 8, bg, style, contentStyle, onContentSizeChange, ref, ...rest }: ScrollViewProps & { gap?: number; bg?: string; contentStyle?: StyleProp<ViewStyle>; ref?: React.Ref<ScrollView> }) {
  const { c } = useTheme(), id = useId(), [vw, setVw] = useState(0), [cw, setCw] = useState(0), [x, setX] = useState(0);
  const more = stripHasMore(cw, vw, x), paper = bg ?? c.paper;
  return (
    <View style={style}>
      <ScrollView {...rest} ref={ref} horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" scrollEventThrottle={32}
        onLayout={(e) => setVw(e.nativeEvent.layout.width)}
        onScroll={(e) => setX(e.nativeEvent.contentOffset.x)}
        onContentSizeChange={(w, h) => { setCw(w); onContentSizeChange?.(w, h); }}
        contentContainerStyle={[{ gap, paddingVertical: 6, paddingRight: more ? STRIP_FADE : 4 }, contentStyle]}>{children}</ScrollView>
      {more ? (
        <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width="100%" height="100%" accessibilityRole="none">
          <Defs><LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset={FADE_START} stopColor={paper} stopOpacity="0" />
            <Stop offset="1" stopColor={paper} stopOpacity="1" />
          </LinearGradient></Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
      ) : null}
    </View>
  );
}
export function Tape({ w = 62, rot = -4, style, testID }: { w?: number; rot?: number; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { dark } = useTheme();
  return <View testID={testID} pointerEvents="none" style={[{ position: 'absolute', width: w, height: 20, backgroundColor: dark ? TAPE.dark.fill : TAPE.light.fill, borderColor: dark ? TAPE.dark.edge : TAPE.light.edge, borderWidth: 0.8, transform: [{ rotate: `${rot}deg` }], zIndex: 3 }, style]} />;
}
export const Hair = () => { const { c } = useTheme(); return <View style={{ height: 1.4, backgroundColor: c.rule, marginVertical: 8 }} />; };
