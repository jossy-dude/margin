import React, { useEffect, useRef, useState } from 'react';
import { TextInput, View, type AccessibilityActionEvent, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withDecay, withTiming } from 'react-native-reanimated';
import Svg, { Line, Path } from 'react-native-svg';
import { FONT, RS } from '../tokens/theme';
import { clamp, fmtDur, fmtTime, parseClock, parseDuration, parseNumber } from '../domain/time';
import { fx } from '../services/fx';
import { Chip, HandBox, HStrip, Txt } from './kit';
import { useReduceMotion, useTheme } from './theme-context';
import { FS } from './fit';

/*
 * The app's typed inputs (v0.5 U1). They replace the +/− Stepper everywhere: a number is typed, a time is
 * typed or dragged on a ruler, a duration is typed in words ("1h30", "2d") or picked from a few presets,
 * and a level is a slider. Each keeps the Stepper's hand-cut box (`RS` corners, ink edge, no shadow) so the
 * forms look like they always did; what changed is how fast a value gets in.
 *
 * Shared rules:
 *  - what is typed is a draft; it is read on submit or blur, CLAMPED into range, and a draft that does not
 *    read puts the last good value back (a typo never bricks a field and never writes junk);
 *  - the keyboard matches the value (number pad, decimal pad);
 *  - every field has an accessibility label naming what it sets, and the value it holds.
 */

/** A box is as wide as its longest value, not as wide as the row: a typed field that fills the sheet reads as a text box. */
const MIN_W = 96;

/** The hand-cut box every field sits in. Its edge takes the accent while the field has focus. */
function Box({ seed, focus, width, children }: { seed: string; focus: boolean; width?: number; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <HandBox seed={`fld-${seed}`} shadow={false} corners={RS} stroke={focus ? c.acc : undefined} sw={focus ? 2 : 1.6}
      style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', width: width ?? MIN_W, minHeight: 50, paddingHorizontal: 10, gap: 6 }}>
      {children}
    </HandBox>
  );
}

/** A typed draft that commits on submit/blur and otherwise mirrors the stored value. */
function useDraft(shown: string) {
  const [draft, setDraft] = useState<string | null>(null);
  return { text: draft ?? shown, editing: draft !== null, edit: (t: string) => setDraft(t), done: () => setDraft(null) };
}

export interface NumberFieldProps {
  value: number | null;
  onChange: (v: number | null) => void;
  min: number; max: number;
  /** Digits after the point that are kept (0 = whole numbers). */
  decimals?: number;
  /** Printed after the number: `%`, `min`. */
  unit?: string;
  /** When set, an empty field is allowed and means `null`, printed as this word ("none"). */
  emptyLabel?: string;
  /** What the field sets, for the screen reader and the testID. */
  label: string;
  width?: number;
}
/** A real numeric input: the number pad, a unit beside it, the value clamped into range on commit. */
export function NumberField({ value, onChange, min, max, decimals = 0, unit, emptyLabel, label, width }: NumberFieldProps) {
  const { c } = useTheme(), [focus, setFocus] = useState(false);
  const shown = value === null ? '' : String(Number(value.toFixed(decimals)));
  const d = useDraft(shown);
  const commit = () => {
    const t = d.text.trim();
    d.done();
    if (!t) { if (emptyLabel !== undefined && value !== null) onChange(null); return; }
    const n = parseNumber(t);
    if (n === null) return; // not a number: the stored value shows again
    const v = Number(clamp(n, min, max).toFixed(decimals));
    if (v !== value) { onChange(v); fx.select(); }
  };
  return (
    <Box seed={label} focus={focus} width={width ?? (unit ? 112 : MIN_W)}>
      <TextInput
        value={d.text} onChangeText={d.edit} onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); commit(); }} onSubmitEditing={commit}
        keyboardType={decimals > 0 || min < 0 ? 'numbers-and-punctuation' : 'number-pad'} returnKeyType="done" selectTextOnFocus
        placeholder={emptyLabel} placeholderTextColor={c.mut} selectionColor={c.acc} maxLength={8}
        accessibilityLabel={`${label}${value === null ? (emptyLabel ? `, ${emptyLabel}` : '') : `, ${shown}${unit ? ` ${unit}` : ''}`}`} testID={`num-${tid(label)}`}
        maxFontSizeMultiplier={FS} style={{ flex: 1, minWidth: 0, fontFamily: FONT.handBold, fontSize: 24, color: c.ink, paddingVertical: 4, textAlign: 'right' }}
      />
      {unit ? <Txt f="serif" s={16} c="mut">{unit}</Txt> : null}
    </Box>
  );
}

export interface DurationFieldProps {
  value: number | null;
  onChange: (v: number | null) => void;
  /** Minutes the chips offer, smallest first. */
  presets: number[];
  min: number; max: number;
  /** When set, `null`/0 is allowed and printed (and offered as a chip) with this word ("unknown"). */
  noneLabel?: string;
  label: string;
}
/** A length of time: a few chips for the usual answers, and a box that reads "90", "1h30", "2d". */
export function DurationField({ value, onChange, presets, min, max, noneLabel, label }: DurationFieldProps) {
  const { c } = useTheme(), [focus, setFocus] = useState(false);
  const none = value === null || (noneLabel !== undefined && value === 0);
  const shown = none ? '' : fmtDur(value as number);
  const d = useDraft(shown);
  const commit = () => {
    const t = d.text.trim();
    d.done();
    if (!t) { if (noneLabel !== undefined && !none) onChange(null); return; }
    const n = parseDuration(t);
    if (n === null) return;
    const v = clamp(n, min, max);
    if (v !== value) { onChange(v); fx.select(); }
  };
  return (
    <View style={{ gap: 6 }}>
      {presets.length || noneLabel !== undefined ? <HStrip gap={6}>
        {noneLabel !== undefined ? <Chip small label={noneLabel} on={none} onPress={() => onChange(null)} /> : null}
        {presets.map((p) => <Chip key={p} small label={fmtDur(p)} on={!none && value === p} onPress={() => onChange(p)} />)}
      </HStrip> : null}
      <Box seed={label} focus={focus} width={128}>
        <TextInput
          value={d.text} onChangeText={d.edit} onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); commit(); }} onSubmitEditing={commit}
          returnKeyType="done" autoCapitalize="none" autoCorrect={false} selectTextOnFocus maxLength={16}
          placeholder={noneLabel ?? 'e.g. 1h30'} placeholderTextColor={c.mut} selectionColor={c.acc}
          accessibilityLabel={`${label}, ${none ? noneLabel ?? 'not set' : shown}. Type minutes, or like 1h30 or 2d`} testID={`dur-${tid(label)}`}
          maxFontSizeMultiplier={FS} style={{ flex: 1, minWidth: 0, fontFamily: FONT.handBold, fontSize: 24, color: c.ink, paddingVertical: 4 }}
        />
      </Box>
    </View>
  );
}

/* ── time ───────────────────────────────────────────────────────────────────────────────────────── */

/** Pixels per minute on the ruler: 5 minutes are 8 px apart, an hour is 96 px. */
const PX = 1.6;
const STEP_MIN = 5;
const RULER_H = 46;

export interface TimeFieldProps {
  /** Minutes after midnight. */
  value: number;
  onChange: (v: number) => void;
  min?: number; max?: number;
  hour12?: boolean;
  label: string;
  /** The drag ruler under the box. On by default. */
  ruler?: boolean;
}
/**
 * A time of day, two ways at once: type it (`930` → 09:30, `9p`, `21:05`) or drag the ruler under it,
 * a tape measure of the day sliding beneath a fixed needle, with a detent click every five minutes. A
 * flick travels and settles on the nearest five; reduce-motion snaps without the glide.
 */
export function TimeField({ value, onChange, min = 0, max = 1435, hour12 = false, label, ruler = true }: TimeFieldProps) {
  const { c } = useTheme(), [focus, setFocus] = useState(false), [live, setLive] = useState<number | null>(null);
  const at = live ?? value;
  const shown = fmtTime(new Date(2000, 0, 1, Math.floor(at / 60), at % 60).getTime(), hour12);
  const d = useDraft(shown);
  const commit = () => {
    const t = d.text.trim();
    d.done();
    const n = t ? parseClock(t, hour12, value) : null;
    if (n === null) return;
    const v = clamp(n, min, max);
    if (v !== value) { onChange(v); fx.select(); }
  };
  return (
    <View style={{ gap: 6, alignSelf: 'stretch' }}>
      <Box seed={label} focus={focus} width={hour12 ? 136 : 104}>
        <TextInput
          value={d.text} onChangeText={d.edit} onFocus={() => setFocus(true)} onBlur={() => { setFocus(false); commit(); }} onSubmitEditing={commit}
          keyboardType="numbers-and-punctuation" returnKeyType="done" autoCapitalize="none" autoCorrect={false} selectTextOnFocus maxLength={8}
          selectionColor={c.acc} accessibilityLabel={`${label}, ${shown}. Type a time like 930`} testID={`time-${tid(label)}`}
          maxFontSizeMultiplier={FS} style={{ flex: 1, minWidth: 0, fontFamily: FONT.handBold, fontSize: 24, color: c.ink, paddingVertical: 4, textAlign: 'center' }}
        />
      </Box>
      {ruler ? <TimeRuler value={value} min={min} max={max} hour12={hour12} label={label} onLive={setLive} onCommit={(v) => { setLive(null); if (v !== value) onChange(v); }} /> : null}
    </View>
  );
}

/** The ruler: hour numerals and a tick every five minutes, drawn once as one SVG strip and slid by a transform. */
function TimeRuler({ value, min, max, hour12, label, onLive, onCommit }: { value: number; min: number; max: number; hour12: boolean; label: string; onLive: (v: number) => void; onCommit: (v: number) => void }) {
  const { c } = useTheme(), reduce = useReduceMotion();
  const [w, setW] = useState(0);
  const x = useSharedValue(-value * PX), start = useSharedValue(0), lastStep = useSharedValue(Math.round(value / STEP_MIN)), dragging = useSharedValue(false);
  /** True from touch-down until the ruler settles: only the finger (and the glide it threw) clicks and shows a live time. */
  const byHand = useSharedValue(false);
  const lo = -max * PX, hi = -min * PX;
  /* A value set from outside (typed, or another field moved it) slides the ruler there. */
  const shownFor = useRef(value);
  useEffect(() => {
    if (shownFor.current === value || dragging.get()) return;
    shownFor.current = value;
    lastStep.set(Math.round(value / STEP_MIN));
    x.set(reduce ? -value * PX : withTiming(-value * PX, { duration: 220 }));
  }, [value, reduce, x, lastStep, dragging]);
  const step = (m: number, v: number) => { onLive(m); fx.detent(Math.abs(v)); };
  const settle = (m: number) => { shownFor.current = m; onCommit(m); };
  const release = () => { 'worklet'; byHand.set(false); };
  /* Every five minutes crossed — by the finger or by the glide after a flick — clicks once and shows the time. */
  useAnimatedReaction(() => Math.round(-x.get() / PX / STEP_MIN), (s, prev) => {
    if (prev === null || !byHand.get() || s === lastStep.get()) return;
    lastStep.set(s);
    runOnJS(step)(Math.min(max, Math.max(min, s * STEP_MIN)), 300);
  });
  const snapTo = (vx: number) => {
    'worklet';
    const m = Math.min(max, Math.max(min, Math.round(-vx / PX / STEP_MIN) * STEP_MIN));
    x.set(withTiming(-m * PX, { duration: 140 }, (f) => { release(); if (f) runOnJS(settle)(m); }));
  };
  const pan = Gesture.Pan().activeOffsetX([-6, 6]).failOffsetY([-14, 14])
    .onStart(() => { cancelAnimation(x); byHand.set(true); dragging.set(true); start.set(x.get()); })
    .onUpdate((e) => { x.set(Math.min(hi, Math.max(lo, start.get() + e.translationX))); })
    .onEnd((e) => {
      dragging.set(false);
      if (reduce || Math.abs(e.velocityX) < 200) { snapTo(x.get()); return; }
      x.set(withDecay({ velocity: e.velocityX, clamp: [lo, hi], deceleration: 0.994 }, (f) => { if (f) snapTo(x.get()); }));
    });
  const strip = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() + w / 2 }] }));
  const onA11y = (e: AccessibilityActionEvent) => {
    const m = clamp(value + (e.nativeEvent.actionName === 'increment' ? STEP_MIN : -STEP_MIN), min, max);
    if (m !== value) { onCommit(m); fx.select(); }
  };
  const hours = Array.from({ length: 25 }, (_, h) => h);
  const total = 24 * 60 * PX;
  return (
    <GestureDetector gesture={pan}>
      <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} accessible accessibilityRole="adjustable" accessibilityLabel={`${label} ruler`}
        accessibilityValue={{ text: fmtTime(new Date(2000, 0, 1, Math.floor(value / 60), value % 60).getTime(), hour12) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={onA11y} testID={`ruler-${tid(label)}`}
        style={{ height: RULER_H, overflow: 'hidden', borderTopWidth: 1.4, borderBottomWidth: 1.4, borderColor: c.rule }}>
        <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: total + 2, height: RULER_H }, strip]}>
          <Svg width={total + 2} height={RULER_H}>
            <Path d={Array.from({ length: 24 * 12 + 1 }, (_, i) => { const xx = i * STEP_MIN * PX + 1, long = i % 12 === 0, mid = i % 6 === 0; return `M${xx} 0V${long ? 16 : mid ? 11 : 6}`; }).join('')} stroke={c.mut} strokeWidth={1.2} />
          </Svg>
          {hours.map((h) => (
            <Txt key={h} f="type" s={12} c="mut" style={{ position: 'absolute', top: 20, left: h * 60 * PX + 1 - 20, width: 40, textAlign: 'center' }}>
              {hour12 ? `${h % 12 || 12}${h < 12 || h === 24 ? 'a' : 'p'}` : String(h % 24).padStart(2, '0')}
            </Txt>
          ))}
        </Animated.View>
        {/* The needle: fixed at the centre, the ink the value is written in. */}
        <Svg pointerEvents="none" width={w} height={RULER_H} style={{ position: 'absolute', left: 0, top: 0 }}>
          <Line x1={w / 2} y1={0} x2={w / 2} y2={RULER_H} stroke={c.acc} strokeWidth={2.2} strokeLinecap="round" />
        </Svg>
      </View>
    </GestureDetector>
  );
}

/* ── level ─────────────────────────────────────────────────────────────────────────────────────── */

export interface SliderProps {
  value: number;
  onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
  label: string;
  /** How the value is read aloud and printed beside the line: `60%`. */
  fmt?: (v: number) => string;
}
/**
 * A level, as a pencil line with an ink blot you push along it. Tap anywhere on the line to jump there;
 * each step crossed ticks once. The value is committed when the finger lifts, so a sound or a setting is
 * written once per gesture, not once per pixel.
 */
export function Slider({ value, onChange, min = 0, max = 100, step = 10, label, fmt = (v) => `${v}%` }: SliderProps) {
  const { c } = useTheme();
  const [w, setW] = useState(0), [live, setLive] = useState<number | null>(null);
  const shown = live ?? value;
  const pos = useSharedValue(0), lastStep = useSharedValue(value);
  const KNOB = 26, PAD = KNOB / 2;
  useEffect(() => { if (live === null) pos.set(max === min ? 0 : (value - min) / (max - min)); }, [value, live, pos, min, max]);
  const fromX = (px: number) => { 'worklet'; const f = Math.min(1, Math.max(0, (px - PAD) / Math.max(1, w - KNOB))); return Math.round((min + f * (max - min)) / step) * step; };
  const tick = (v: number) => { setLive(v); fx.select(); };
  const done = (v: number) => { setLive(null); if (v !== value) onChange(v); };
  const move = (px: number) => {
    'worklet';
    const v = fromX(px);
    pos.set((v - min) / Math.max(1, max - min));
    if (v !== lastStep.get()) { lastStep.set(v); runOnJS(tick)(v); }
    return v;
  };
  const pan = Gesture.Pan().activeOffsetX([-4, 4]).failOffsetY([-14, 14])
    .onStart((e) => { move(e.x); })
    .onUpdate((e) => { move(e.x); })
    .onEnd((e) => { runOnJS(done)(move(e.x)); });
  const tap = Gesture.Tap().onEnd((e) => { runOnJS(done)(move(e.x)); });
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: pos.get() * Math.max(0, w - KNOB) }] }));
  const fill = useAnimatedStyle(() => ({ width: PAD + pos.get() * Math.max(0, w - KNOB) }));
  const onA11y = (e: AccessibilityActionEvent) => {
    const v = clamp(value + (e.nativeEvent.actionName === 'increment' ? step : -step), min, max);
    if (v !== value) { onChange(v); fx.select(); }
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
      <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
        <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flex: 1, height: 44, justifyContent: 'center' }}
          accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min, max, now: value, text: fmt(value) }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={onA11y} testID={`slider-${tid(label)}`}>
          <View style={{ height: 2, marginHorizontal: PAD, backgroundColor: c.rule, borderRadius: 1 }} />
          <Animated.View style={[{ position: 'absolute', left: 0, height: 3, borderRadius: 2, backgroundColor: c.ink }, fill]} />
          <Animated.View style={[{ position: 'absolute', left: 0, width: KNOB, height: KNOB }, knob]}>
            <Svg width={KNOB} height={KNOB}><Path d="M13 2.5c5.6-.3 10.6 4.1 10.4 10.3-.2 6-4.6 10.6-10.6 10.6C6.7 23.4 2.4 18.9 2.6 13 2.8 7 7.2 2.8 13 2.5z" fill={c.ink} /></Svg>
          </Animated.View>
        </View>
      </GestureDetector>
      <Txt f="type" s={14} c="mut" style={{ minWidth: 44, textAlign: 'right' }}>{fmt(shown)}</Txt>
    </View>
  );
}

/** A testID-safe slug, the same rule `kit.tsx` uses. */
const tid = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
