import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { RG, RS, FONT, hexA, type Colors } from '../tokens/theme';
import { handPath, hashSeed, type Corners } from './hand';
import { useTheme } from './theme-context';
import { fx } from '../services/fx';

type FontKey = 'hand' | 'bold' | 'serif' | 'serifB' | 'marker' | 'type';
const FAM: Record<FontKey, string> = { hand: FONT.hand, bold: FONT.handBold, serif: FONT.serif, serifB: FONT.serifB, marker: FONT.marker, type: FONT.type };
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
    <View style={style} onLayout={(e) => { const { width, height } = e.nativeEvent.layout; if (Math.abs(width - sz.w) > 0.5 || Math.abs(height - sz.h) > 0.5) setSz({ w: width, h: height }); }}>
      {d !== '' && (
        <Svg width={sz.w + 4} height={sz.h + 4} style={StyleSheet.absoluteFill} pointerEvents="none" viewBox={`-1 -1 ${sz.w + 4} ${sz.h + 4}`}>
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
  timer: 'M12 8v5l3 2M9 2h6M12 4a8.5 8.5 0 100 17 8.5 8.5 0 000-17z', gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1',
  back: 'M15 5l-7 7 7 7', pencil: 'M4 20l1-4L16 5l3 3L8 19zM14 7l3 3', play: 'M7 4l13 8-13 8z', pause: 'M7 4h3.5v16H7zM13.5 4H17v16h-3.5z', coffee: 'M4 9h12v6a4 4 0 01-4 4H8a4 4 0 01-4-4zM16 10h2a2 2 0 010 4h-2M7 3c0 2 2 2 2 4M11 3c0 2 2 2 2 4',
  flag: 'M6 21V4M6 4h11l-2 4 2 4H6', book: 'M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1zM12 6v14', note: 'M5 4h14v12l-5 5H5zM14 21v-5h5M8 9h8M8 13h5', chevron: 'M9 5l7 7-7 7',
  focus: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8z', export: 'M12 15V3M7 8l5-5 5 5M4 15v5h16v-5', palette: 'M12 3a9 9 0 100 18c1.5 0 2-1 1.5-2.2-.6-1.4.3-2.8 1.8-2.8H17a4 4 0 004-4c0-4.4-4-9-9-9zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01', sound: 'M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 010 7',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3.5 2', exam: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5', lab: 'M9 3h6M10 3v6L5 19a1.5 1.5 0 001.4 2h11.2A1.5 1.5 0 0019 19l-5-10V3M8 15h8', grad: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2.5 9 2.5 12 0v-5',
};
export function Icon({ name, size = 22, color, sw = 1.8 }: { name: keyof typeof ICONS | string; size?: number; color?: string; sw?: number }) {
  const { c } = useTheme();
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color ?? c.ink} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><Path d={ICONS[name] ?? ICONS.plus} /></Svg>;
}

export interface BtnProps { label?: string; icon?: string; onPress?: () => void; kind?: 'primary' | 'ink' | 'ghost' | 'danger'; small?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; a11y?: string; flex?: boolean; quiet?: boolean; selected?: boolean }
export function Btn({ label, icon, onPress, kind = 'primary', small, disabled, style, a11y, flex, quiet, selected }: BtnProps) {
  const { c } = useTheme();
  const bg = kind === 'primary' ? c.acc : kind === 'ink' ? c.ink : kind === 'danger' ? c.bad : 'transparent', fg = kind === 'primary' ? c.onAcc : kind === 'ink' ? c.paper : kind === 'danger' ? c.card : c.ink;
  const h = small ? 40 : 52;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? label} accessibilityState={{ disabled: !!disabled, selected: !!selected }} disabled={disabled}
      onPress={() => { if (!quiet) fx.tap(); onPress?.(); }} android_ripple={{ color: hexA(c.ink, 0.18), borderless: false }} hitSlop={4}
      style={[{ minHeight: h, opacity: disabled ? 0.45 : 1, flex: flex ? 1 : undefined }, style]}>
      <HandBox seed={`${label}${icon}`} fill={bg} stroke={kind === 'ghost' ? c.ink : bg === 'transparent' ? c.ink : c.ink} corners={RS} shadow={kind !== 'ghost'} style={{ minHeight: h, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: small ? 14 : 20 }}>
        {icon ? <Icon name={icon} size={small ? 18 : 22} color={fg} /> : null}
        {label ? <Txt f="bold" s={small ? 19 : 23} c={fg}>{label}</Txt> : null}
      </HandBox>
    </Pressable>
  );
}
export function Chip({ label, on, onPress, icon, tone, small }: { label: string; on?: boolean; onPress?: () => void; icon?: string; tone?: string; small?: boolean }) {
  const { c } = useTheme(), fg = on ? c.onAcc : c.ink, bg = on ? tone ?? c.acc : c.card;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} accessibilityLabel={label} onPress={() => { fx.select(); onPress?.(); }} hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}>
      <HandBox seed={label} fill={bg} corners={RS} shadow={false} sw={on ? 1.8 : 1.3} style={{ minHeight: small ? 34 : 42, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {icon ? <Icon name={icon} size={16} color={fg} /> : null}
        <Txt f="bold" s={small ? 17 : 19} c={fg}>{label}</Txt>
      </HandBox>
    </Pressable>
  );
}
export function Toggle({ value, onChange, label, hint, disabled }: { value: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value, disabled: !!disabled }} accessibilityLabel={label} disabled={disabled} onPress={() => { fx.toggle(!value); onChange(!value); }}
      android_ripple={{ color: hexA(c.ink, 0.12) }} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1 }}><Txt f="bold" s={21}>{label}</Txt>{hint ? <Txt f="serif" s={14.5} c="mut" style={{ marginTop: 1 }}>{hint}</Txt> : null}</View>
      <View style={{ width: 54, height: 30, borderRadius: 15, borderWidth: 1.6, borderColor: c.ink, backgroundColor: value ? c.acc : c.card, justifyContent: 'center' }}>
        <View style={{ position: 'absolute', left: value ? 26 : 3, width: 22, height: 22, borderRadius: 11, backgroundColor: value ? c.onAcc : c.ink }} />
      </View>
    </Pressable>
  );
}
function StepBtn({ t, onPress, dis, a }: { t: string; onPress: () => void; dis: boolean; a: string }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a} accessibilityState={{ disabled: dis }} disabled={dis} onPress={() => { fx.select(); onPress(); }} onLongPress={() => { fx.select(); onPress(); }} delayLongPress={350} android_ripple={{ color: hexA(c.ink, 0.2), borderless: true }} style={{ width: 46, height: 46, alignItems: 'center', justifyContent: 'center', opacity: dis ? 0.35 : 1 }}>
      <Txt f="marker" s={26}>{t}</Txt>
    </Pressable>
  );
}
export function Stepper({ value, onChange, min, max, step = 1, fmt, label }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; fmt?: (v: number) => string; label?: string }) {
  const dec = () => onChange(Math.max(min, value - step)), inc = () => onChange(Math.min(max, value + step));
  return (
    <HandBox seed={`st${label}`} shadow={false} corners={RS} style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' }}>
      <StepBtn t="−" onPress={dec} dis={value <= min} a={`Decrease ${label ?? ''}`} />
      <View style={{ minWidth: 74, alignItems: 'center' }} accessibilityLiveRegion="polite"><Txt f="bold" s={22}>{fmt ? fmt(value) : String(value)}</Txt></View>
      <StepBtn t="+" onPress={inc} dis={value >= max} a={`Increase ${label ?? ''}`} />
    </HandBox>
  );
}
export function Field({ label, style, multiline, ...p }: TextInputProps & { label?: string }) {
  const { c } = useTheme(), [focus, setFocus] = useState(false);
  return (
    <View style={style as StyleProp<ViewStyle>}>
      {label ? <Txt f="serif" s={14.5} c="mut" style={{ marginBottom: 2 }}>{label}</Txt> : null}
      <TextInput {...p} multiline={multiline} accessibilityLabel={label ?? p.placeholder} placeholderTextColor={c.mut} selectionColor={c.acc} onFocus={(e) => { setFocus(true); p.onFocus?.(e); }} onBlur={(e) => { setFocus(false); p.onBlur?.(e); }}
        style={{ fontFamily: FONT.handBold, fontSize: 24, color: c.ink, paddingVertical: 6, paddingHorizontal: 2, minHeight: multiline ? 78 : 46, textAlignVertical: multiline ? 'top' : 'center', borderBottomWidth: focus ? 2.2 : 1.4, borderBottomColor: focus ? c.acc : c.ink }} />
    </View>
  );
}
export const Row = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }, style]}>{children}</View>;
export function Tape({ w = 62, rot = -4, style }: { w?: number; rot?: number; style?: StyleProp<ViewStyle> }) {
  const { dark } = useTheme();
  return <View pointerEvents="none" style={[{ position: 'absolute', width: w, height: 20, backgroundColor: dark ? '#C9B98F55' : '#E7D9AE99', borderColor: dark ? '#C9B98F66' : '#B8A56E55', borderWidth: 0.8, transform: [{ rotate: `${rot}deg` }], zIndex: 3 }, style]} />;
}
export const Hair = () => { const { c } = useTheme(); return <View style={{ height: 1.4, backgroundColor: c.rule, marginVertical: 8 }} />; };
