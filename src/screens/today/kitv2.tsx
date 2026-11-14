import React from 'react';
import { Pressable, Text, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { MOTION, RADIUS, SPACE, TINTS, TOUCH, TYPE, V2, type Scheme, type V2Colors } from '../../tokens/v2';
import { useReduceMotion, useTheme } from '../../ui/theme-context';
import { fx } from '../../services/fx';

/**
 * v0.7 Phase 5 staging kit: the Daylight-sheet pieces Today uses that `src/ui/` does not have yet (DESIGN.md §4:
 * text roles, Tap, buttons, Segmented, the glyphs, the tint mark, the chip). It moves to `src/ui/kit/` (PLAN U4)
 * once Week and Settings (R2, R8) need it too; they add their own pieces (Switch, Row, Field) then. Every colour
 * comes from `tokens/v2.ts`; every size from D-1/D-4; every press from D-5.
 */

/** The current scheme and its tokens. Follows the app's own theme switch (Light / Dark / Follow phone). */
export function useV2(): { t: V2Colors; scheme: Scheme } {
  const { dark } = useTheme();
  const scheme: Scheme = dark ? 'dark' : 'light';
  return { t: V2[scheme], scheme };
}

export type Role = keyof typeof TYPE;
type Ink = 'ink' | 'ink2' | 'ink3' | 'now' | 'onNow' | 'ok' | 'warn' | 'bad' | 'absent';
/** Inter is not bundled yet (PLAN U2); until it is, the platform sans carries the same sizes and weights. Literata
 *  italic is the app's voice; the platform serif italic stands in. One place to change when U2 lands. */
const FACE: { sans: string | undefined; voice: string } = { sans: undefined, voice: 'serif' };

/** Text in one of the nine D-1 roles. Numbers are tabular everywhere (D-1), so a ticking value never walks. */
export function T({ k = 'body', c = 'ink', style, children, ...p }: TextProps & { k?: Role; c?: Ink | (string & {}); style?: StyleProp<TextStyle> }) {
  const { t } = useV2();
  const r = TYPE[k];
  const color = (t as unknown as Record<string, string>)[c] ?? c;
  const s: TextStyle = {
    fontFamily: k === 'voice' ? FACE.voice : FACE.sans, fontSize: r.size, lineHeight: r.line, fontWeight: r.weight, letterSpacing: r.track, color,
    fontVariant: ['tabular-nums'], ...(k === 'caps' ? { textTransform: 'uppercase' } : null), ...(k === 'voice' ? { fontStyle: 'italic' } : null),
  };
  /* The countdown must never wrap (D-1): it is the one role capped at 1.3× font scale. */
  return <Text maxFontSizeMultiplier={k === 'display' ? 1.3 : undefined} {...p} style={[s, style]}>{children}</Text>;
}

/** Anything pressable: dips to 0.97 in 120 ms (D-5 `press`), instant under reduced motion. */
export function Tap({ onPress, onLongPress, delayLongPress, label, hint, role = 'button', selected, disabled, testID, style, hitSlop, children }: {
  onPress?: () => void; onLongPress?: () => void; delayLongPress?: number; label: string; hint?: string; role?: 'button' | 'tab' | 'radio' | 'switch' | 'link';
  selected?: boolean; disabled?: boolean; testID?: string; style?: StyleProp<ViewStyle>; hitSlop?: number; children: React.ReactNode;
}) {
  const reduce = useReduceMotion(), s = useSharedValue(1);
  const dip = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={delayLongPress} disabled={disabled} testID={testID} hitSlop={hitSlop}
      accessibilityRole={role} accessibilityLabel={label} accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled, ...(role === 'tab' || role === 'radio' ? { selected: !!selected } : null) }}
      onPressIn={() => { if (!reduce) s.set(withTiming(MOTION.press.scale, { duration: MOTION.press.ms })); }}
      onPressOut={() => { s.set(reduce ? 1 : withTiming(1, { duration: MOTION.press.ms })); }}>
      <Animated.View style={[style, dip, disabled ? { opacity: 0.45 } : null]}>{children}</Animated.View>
    </Pressable>
  );
}

/** D-9 buttons. `filled` is the one primary on a screen; `danger` is outlined in `bad` and never sits next to it. */
export type BtnKind = 'filled' | 'tonal' | 'outlined' | 'text' | 'danger';
export function Button({ label, kind = 'tonal', onPress, onLongPress, disabled, testID, a11y, small, style }: {
  label: string; kind?: BtnKind; onPress: () => void; onLongPress?: () => void; disabled?: boolean; testID?: string; a11y?: string; small?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { t } = useV2();
  const bg = kind === 'filled' ? t.ink : kind === 'tonal' ? t.fill : 'transparent';
  const fg = kind === 'filled' ? t.flat : kind === 'danger' ? t.bad : t.ink;
  const border = kind === 'outlined' ? t.ring : kind === 'danger' ? t.bad : 'transparent';
  return (
    <Tap onPress={onPress} onLongPress={onLongPress} disabled={disabled} testID={testID} label={a11y ?? label} hitSlop={small ? (TOUCH - 40) / 2 : 0}
      style={[{ minHeight: small ? 40 : TOUCH, paddingHorizontal: kind === 'text' ? SPACE.s2 : SPACE.s4, borderRadius: RADIUS.control, backgroundColor: bg, borderWidth: 1, borderColor: border, alignItems: 'center', justifyContent: 'center' }, style]}>
      <T k="label" c={fg} numberOfLines={1} style={{ fontWeight: '600' }}>{label}</T>
    </Tap>
  );
}

/** D-9 Segmented: a `fill` track (radius 10, 4 dp inside), the chosen option on a strong-glass thumb with a ring.
 *  A radiogroup for TalkBack. Replaces paired chips. */
export function Segmented<V extends string>({ label, value, options, onChange, testID }: { label: string; value: V; options: readonly (readonly [V, string])[]; onChange: (v: V) => void; testID?: string }) {
  const { t } = useV2();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} testID={testID} style={{ flexDirection: 'row', backgroundColor: t.fill, borderRadius: RADIUS.control, padding: SPACE.s1, gap: 2 }}>
      {options.map(([v, l]) => {
        const on = v === value;
        return (
          <Pressable key={v} accessibilityRole="radio" accessibilityState={{ selected: on, checked: on }} accessibilityLabel={l} testID={testID ? `${testID}-${v}` : undefined}
            onPress={() => { if (!on) { fx.select(); onChange(v); } }}
            style={{ flex: 1, minHeight: 40, borderRadius: RADIUS.control - 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.s2,
              backgroundColor: on ? t.glassStrong : 'transparent', borderWidth: 1, borderColor: on ? t.ring : 'transparent' }}>
            <T k="label" c={on ? 'ink' : 'ink2'} numberOfLines={1} style={on ? { fontWeight: '600' } : null}>{l}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The chevron and the magnifier, drawn in the island's 1.8 stroke so every glyph in v2 is one family. */
export function Glyph({ name, size = 20, color }: { name: 'chevron' | 'search' | 'back' | 'down' | 'close' | 'up'; size?: number; color: string }) {
  const d = { chevron: 'M9 5l7 7-7 7', back: 'M15 5l-7 7 7 7', down: 'M6 9l6 6 6-6', up: 'M6 15l6-6 6 6', close: 'M6 6l12 12M18 6L6 18', search: 'M10.5 4a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM15.5 15.5L20 20' }[name];
  return <Svg width={size} height={size} viewBox="0 0 24 24"><Path d={d} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" /></Svg>;
}

/* ── subject tints (D-2): a mark, never a filled card ── */

/** Hex → [h, s, l] and back, for the dark scheme's "+12 % lightness". Pure. */
function hsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function rgbOf([h, s, l]: [number, number, number]): string {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `rgb(${Math.round((r + m) * 255)},${Math.round((g + m) * 255)},${Math.round((b + m) * 255)})`;
}
/** A subject's tint: its place in the subject list picks one of the eight; dark adds 12 % lightness. */
export function tintOf(courseId: string | null | undefined, courses: readonly { id: string; sort?: number }[], scheme: Scheme): string {
  const order = [...courses].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const i = Math.max(0, order.findIndex((c) => c.id === courseId));
  const base = TINTS[i % TINTS.length]!;
  if (scheme === 'light') return base;
  const [h, s, l] = hsl(base);
  return rgbOf([h, s, Math.min(1, l + 0.12)]);
}
/** The tint mark beside a row: 3 dp wide, rounded, inset (D-2's "3-dp left bar", drawn as a mark, not a border). */
export const TintMark = ({ color, height = 18 }: { color: string; height?: number }) => (
  <View accessibilityElementsHidden importantForAccessibility="no" style={{ width: 3, height, borderRadius: 2, backgroundColor: color }} />
);
/** A small chip for a room or a code: `fill`, radius 6, Label, tabular. */
export const Chip = ({ text, tone }: { text: string; tone?: 'now' }) => {
  const { t } = useV2();
  return (
    <View style={{ paddingHorizontal: SPACE.s2, minHeight: 24, justifyContent: 'center', borderRadius: RADIUS.chip, backgroundColor: tone === 'now' ? t.now : t.fill }}>
      <T k="label" c={tone === 'now' ? 'onNow' : 'ink'} numberOfLines={1} style={{ fontWeight: '600' }}>{text}</T>
    </View>
  );
};
