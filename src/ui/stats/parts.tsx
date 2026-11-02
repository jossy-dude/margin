import React, { useLayoutEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Rect, Text as SText } from 'react-native-svg';
import { EASE, HandBox, Txt } from '../kit';
import { useReduceMotion, useTheme } from '../theme-context';
import { useScreenLive } from '../live';
import { FS } from '../fit';
import { hexA } from '../../tokens/theme';
import { level, monthTicks, shortDate } from '../../domain/analytics';

/* ──────────────────────────────────────────────────────────────────────────────────────────────────────
 * The Stats page's paper: a report, not a dashboard. Each section is a sheet that answers one question in a
 * sentence and then shows the evidence. Charts carry their own labels and units; elapsed / less is dimmed,
 * never a mystery colour; a subject is drawn in its own paper colour (`subjectTint`), with accent ink where a
 * mark has to read at 3:1 on card.
 *
 * Motion: a sheet is dealt onto the page the first time the page is on screen (a few dp and a slight turn,
 * settling flat); bars grow from their baseline once. Hidden pages draw the settled picture and run nothing.
 * ────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** First-focus entrance: 0 → 1 once, when the page is first on screen (immediately 1 when hidden / reduced). */
function useEntrance(delay: number, ms = 420) {
  const live = useScreenLive(), reduce = useReduceMotion(), v = useSharedValue(live && !reduce ? 0 : 1), done = useRef(!live || reduce);
  useLayoutEffect(() => {
    if (done.current) { v.set(1); return; }
    if (!live) { v.set(1); return; }
    done.current = true; v.set(0); v.set(withDelay(delay, withTiming(1, { duration: ms, easing: EASE })));
  }, [live, reduce, delay, ms, v]);
  return v;
}

/** One question, answered: the heading, the sentence that answers it, then the evidence. */
export function Sheet({ i, seed, kicker, title, line, children }: { i: number; seed: string; kicker: string; title: string; line: string | null; children?: React.ReactNode }) {
  const { c } = useTheme(), deal = useEntrance(60 + i * 70, 460);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - deal.get()) * 22 }, { rotate: `${(1 - deal.get()) * (i % 2 ? 1.6 : -1.6)}deg` }] }));
  return (
    <Animated.View style={st}>
      <HandBox seed={seed} fill={c.card} style={{ padding: 16, gap: 12 }}>
        <View style={{ gap: 3 }}>
          <Txt f="type" s={12} c="acc" maxFontSizeMultiplier={FS} style={{ letterSpacing: 2 }}>{kicker.toUpperCase()}</Txt>
          <Txt f="marker" s={25} accessibilityRole="header">{title}</Txt>
          {line ? <Txt f="serif" s={16} c="mut" style={{ lineHeight: 22 }}>{line}</Txt> : null}
        </View>
        {children}
      </HandBox>
    </Animated.View>
  );
}

/** The figures at the top: the three numbers that matter this week, on the denim deck paper. */
export function Headline({ figures, line }: { figures: { k: string; v: string; sub?: string }[]; line: string | null }) {
  const { c } = useTheme(), deal = useEntrance(0, 480);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - deal.get()) * 16 }, { rotate: `${(1 - deal.get()) * -1.2}deg` }] }));
  return (
    <Animated.View style={st}>
      <HandBox seed="stats-head" fill={c.deck} cut="torn" style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {figures.map((f) => (
            <View key={f.k} style={{ flex: 1, minWidth: 0 }} accessible accessibilityLabel={`${f.k}: ${f.v}${f.sub ? `, ${f.sub}` : ''}`}>
              <Txt f="type" s={30} c="deckInk" numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2}>{f.v}</Txt>
              <Txt f="bold" s={14.5} c="deckInk" numberOfLines={2} maxFontSizeMultiplier={FS}>{f.k}</Txt>
              {f.sub ? <Txt f="serif" s={13} c="deckMut" numberOfLines={2} maxFontSizeMultiplier={FS}>{f.sub}</Txt> : null}
            </View>
          ))}
        </View>
        {line ? <View style={{ borderTopWidth: 2, borderStyle: 'dashed', borderTopColor: c.deckMut, paddingTop: 10 }}><Txt f="hand" s={18} c="deckInk" accessibilityLiveRegion="polite">{line}</Txt></View> : null}
      </HandBox>
    </Animated.View>
  );
}

/** Small numbers in a row: "8 of 10 on time · 2 late · 3-day streak". */
export function Figures({ items }: { items: { k: string; v: string; tone?: 'ok' | 'warn' | 'bad' }[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}>
      {items.map((x) => (
        <View key={x.k} accessible accessibilityLabel={`${x.k}: ${x.v}`}>
          <Txt f="type" s={22} c={x.tone ?? 'ink'}>{x.v}</Txt>
          <Txt f="serif" s={13.5} c="mut" maxFontSizeMultiplier={FS}>{x.k}</Txt>
        </View>
      ))}
    </View>
  );
}

/** A note where a chart would be, when there is nothing honest to draw yet. */
export const Quiet = ({ text }: { text: string }) => <Txt f="serif" s={15} c="mut" style={{ fontStyle: 'italic' }}>{text}</Txt>;

/**
 * A calendar heatmap, Monday first: weekday initials down the side, the month each week starts over its
 * column, and a less → more legend. Empty days are faint paper; a day with anything is at least the first
 * step, so a single 5-minute session is never invisible.
 */
export function CalHeat({ days, values, w, tone, unit }: { days: string[]; values: number[]; w: number; tone: string; unit: string }) {
  const th = useTheme(), { c } = th, startWd = (new Date(`${days[0]}T12:00:00`).getDay() + 6) % 7;
  const pad = [...new Array<number>(startWd).fill(-1), ...values], weeks = Math.ceil(pad.length / 7), LEFT = 16, TOP = 16, gap = 3;
  const cell = Math.max(6, Math.min(22, (w - LEFT) / weeks - gap)), max = Math.max(1, ...values), h = TOP + 7 * (cell + gap);
  const total = values.reduce((a, b) => a + b, 0), active = values.filter((v) => v > 0).length;
  const ticks = monthTicks(days, startWd);
  const shade = (l: number) => (l ? hexA(tone, [0, 0.3, 0.52, 0.76, 1][l] ?? 1) : hexA(c.ink, 0.06));
  return (
    <View style={{ gap: 6 }}>
      <Svg width={w} height={h} accessibilityRole="image" accessibilityLabel={`${total}${unit} over ${active} active ${active === 1 ? 'day' : 'days'} since ${shortDate(days[0] ?? '')}`}>
        {ticks.map((t) => <SText key={`${t.col}${t.label}`} x={LEFT + t.col * (cell + gap)} y={11} fontSize={11} fontFamily={th.type.type.fam} fill={c.mut}>{t.label}</SText>)}
        {['M', 'W', 'F'].map((d, i) => <SText key={d} x={0} y={TOP + (i * 2) * (cell + gap) + cell * 0.78} fontSize={10.5} fontFamily={th.type.type.fam} fill={c.mut}>{d}</SText>)}
        {pad.map((v, i) => (v < 0 ? null : <Rect key={i} x={LEFT + Math.floor(i / 7) * (cell + gap)} y={TOP + (i % 7) * (cell + gap)} width={cell} height={cell} rx={2.5} fill={shade(level(v, max))} />))}
      </Svg>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Txt f="serif" s={12.5} c="mut">less</Txt>
        {[0, 1, 2, 3, 4].map((l) => <View key={l} style={{ width: 11, height: 11, borderRadius: 2.5, backgroundColor: shade(l) }} />)}
        <Txt f="serif" s={12.5} c="mut">more</Txt>
      </View>
    </View>
  );
}

const AR = Animated.createAnimatedComponent(Rect);
/** A bar that grows once from its baseline (width or height), then travels to new values. */
function GrowRect({ x, y, w, h, fill, vertical, delay, rx = 3 }: { x: number; y: number; w: number; h: number; fill: string; vertical?: boolean; delay: number; rx?: number }) {
  const grow = useEntrance(delay, 380);
  /* Both axes are always set, so the props object has one shape; only the growing one moves. */
  const ap = useAnimatedProps(() => (vertical
    ? { y: y + h * (1 - grow.get()), height: Math.max(0.5, h * grow.get()), width: w }
    : { y, height: h, width: Math.max(0.5, w * grow.get()) }));
  return <AR x={x} rx={rx} fill={fill} animatedProps={ap} />;
}

/**
 * One row per subject: a swatch of its paper, the name, the value, and a bar in accent ink (full for the
 * leader). `goal` draws a small notch on the bar where the subject's goal sits.
 */
export function SubjectBars({ rows, w, fmt, max: maxIn }: { rows: { id: string; name: string; value: number; tint: string; goal?: number | null; note?: string }[]; w: number; fmt: (v: number) => string; max?: number }) {
  const { c } = useTheme(), max = maxIn ?? Math.max(1, ...rows.map((r) => r.value)), barW = w;
  return (
    <View style={{ gap: 12 }}>
      {rows.map((r, i) => {
        const fw = Math.max(3, (barW * Math.min(max, r.value)) / max), gx = r.goal != null ? (barW * Math.min(max, r.goal)) / max : null;
        return (
          <View key={r.id} style={{ gap: 4 }} accessible accessibilityLabel={`${r.name}: ${fmt(r.value)}${r.goal != null ? `, goal ${r.goal}` : ''}${r.note ? `, ${r.note}` : ''}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: r.tint, borderWidth: 1, borderColor: hexA(c.ink, 0.3) }} />
              <Txt f="hand" s={17} numberOfLines={1} style={{ flex: 1 }}>{r.name}</Txt>
              {r.note ? <Txt f="serif" s={13} c="mut">{r.note}</Txt> : null}
              <Txt f="type" s={16}>{fmt(r.value)}</Txt>
            </View>
            <Svg width={barW} height={14}>
              <Rect x={0} y={2} width={barW} height={10} rx={3} fill={hexA(c.ink, 0.07)} />
              <GrowRect x={0} y={2} w={fw} h={10} fill={i === 0 ? c.acc : hexA(c.acc, 0.62)} delay={160 + i * 50} />
              {gx !== null ? <Path d={`M${gx.toFixed(1)} 0 V14`} stroke={c.ink} strokeWidth={2} strokeLinecap="round" /> : null}
            </Svg>
          </View>
        );
      })}
    </View>
  );
}

/** Twenty-four bars, one an hour, on a real clock axis; the peak hour is drawn full strength, the rest dimmed. */
export function HourBars({ values, w, tone, ticks }: { values: number[]; w: number; tone: string; ticks: { h: number; label: string }[] }) {
  const th = useTheme(), { c } = th, H = 70, max = Math.max(1, ...values), bw = w / 24, peak = values.indexOf(Math.max(...values));
  return (
    <Svg width={w} height={H + 18} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Line x1={0} x2={w} y1={H} y2={H} stroke={hexA(c.ink, 0.5)} strokeWidth={1} />
      {values.map((v, i) => (v > 0 ? <GrowRect key={i} vertical x={i * bw + 1} y={H - (v / max) * (H - 4)} w={Math.max(2, bw - 2)} h={(v / max) * (H - 4)} fill={i === peak ? tone : hexA(tone, 0.45)} delay={150 + i * 12} rx={1.5} /> : null))}
      {ticks.map((t) => <SText key={t.h} x={Math.min(w - 2, Math.max(2, t.h * bw + bw / 2))} y={H + 14} fontSize={11} fontFamily={th.type.type.fam} fill={c.mut} textAnchor={t.h === 0 ? 'start' : t.h >= 23 ? 'end' : 'middle'}>{t.label}</SText>)}
    </Svg>
  );
}

/** A subject's marks over time on a FITTED axis (`markScale`), with gridlines, the goal as a dashed line and
 *  every point labelled with its score. */
export function MarkLine({ values, labels, w, scale, goal }: { values: number[]; labels: string[]; w: number; scale: { lo: number; hi: number; ticks: number[] }; goal: number | null }) {
  const th = useTheme(), { c } = th, H = 130, L = 30, R = 10, T = 12, B = 22, n = values.length;
  const X = (i: number) => L + (n <= 1 ? (w - L - R) / 2 : (i * (w - L - R)) / (n - 1)), Y = (v: number) => T + (1 - (v - scale.lo) / Math.max(1, scale.hi - scale.lo)) * (H - T - B);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('');
  /* The x labels are text under the plot, each bounded by the gap to its neighbours in PIXELS and ellipsised
     there — never cut to a character count (BUG-030). */
  const slot = n > 1 ? (w - L - R) / (n - 1) : w - L - R;
  return (
    <View>
    <Svg width={w} height={H - B + 6} accessibilityRole="image" accessibilityLabel={`Marks in order: ${values.map((v, i) => `${labels[i] ?? i + 1} ${Math.round(v)}`).join(', ')}${goal != null ? `. Goal ${goal}` : ''}`}>
      {scale.ticks.map((t) => <React.Fragment key={t}><Line x1={L} x2={w - R} y1={Y(t)} y2={Y(t)} stroke={hexA(c.ink, 0.1)} strokeWidth={1} /><SText x={L - 6} y={Y(t) + 4} fontSize={11} fontFamily={th.type.type.fam} fill={c.mut} textAnchor="end">{t}</SText></React.Fragment>)}
      {goal != null ? <><Line x1={L} x2={w - R} y1={Y(goal)} y2={Y(goal)} stroke={c.warn} strokeWidth={1.6} strokeDasharray="5 4" /><SText x={w - R} y={Y(goal) - 5} fontSize={11.5} fontFamily={th.type.type.fam} fill={c.warn} textAnchor="end">{`goal ${goal}`}</SText></> : null}
      {n > 1 ? <Path d={d} fill="none" stroke={c.acc} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" /> : null}
      {values.map((v, i) => <React.Fragment key={i}><Circle cx={X(i)} cy={Y(v)} r={4.5} fill={c.card} stroke={c.acc} strokeWidth={2} /><SText x={X(i)} y={Y(v) - 9} fontSize={11.5} fontFamily={th.type.type.fam} fill={c.ink} textAnchor="middle">{Math.round(v)}</SText></React.Fragment>)}
    </Svg>
    {n <= 9 ? (
      <View style={{ height: 16 }} pointerEvents="none">
        {values.map((_, i) => (labels[i] ? <Txt key={i} f="type" s={11} c="mut" numberOfLines={1} style={{ position: 'absolute', left: X(i) - slot / 2, width: slot, textAlign: 'center' }}>{labels[i]}</Txt> : null))}
      </View>
    ) : null}
    </View>
  );
}
