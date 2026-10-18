import React, { useLayoutEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SText } from 'react-native-svg';
import Animated, { useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useReduceMotion, useTheme } from './theme-context';
import { EASE, Txt } from './kit';
import { FONT, hexA } from '../tokens/theme';
import { level } from '../domain/analytics';
import { useScreenLive } from './live';

const AR = Animated.createAnimatedComponent(Rect), AC = Animated.createAnimatedComponent(Circle), AP = Animated.createAnimatedComponent(Path);

/* ──────────────────────────────────────────────────────────────────────────────
 * The chart entrance, budgeted.
 *
 * A1 measured this screen (`qa/RESEARCH-PERF.md` §6): Stats mounts **69 animated SVG props** at once,
 * the last of them starting at 414 ms and running to 1014 ms, and [reanimated#2618] measured 30-40 fps
 * and 100 % CPU on Android from "a simple `animatedProps` on an SVG Path" — react-native-svg draws
 * through Canvas there with, in Software Mansion's words, "no caching involved".
 *
 * Three things were wrong, and only the third is the frame budget:
 *
 *  1. **It replayed from zero on every data change.** Each leaf's effect assigned `p = 0` and then
 *     animated, so ticking one task re-drew all four rings from empty over 900 ms. An animation that
 *     re-runs on data you did not cause is an animation you stop seeing.
 *  2. **It overlapped the page transition.** The 200 ms placement in `navigation/Book.tsx` and 69
 *     animated props competed for the same frames. `ENTER_AT` holds the first bar until the page is
 *     down; the placement's own curve is optically settled at 70 % of its progress, which is ~40 ms of
 *     200, so 130 ms is where "the paper has landed" is true rather than approximately true.
 *  3. **The window was ~1.95 s** of concurrent animated props. Durations and staggers are now set so the
 *     whole entrance is ~0.62 s. The *peak count* is still 69, and it cannot be reduced without changing
 *     how a histogram is drawn — see `qa/MOTION-INVENTORY.md` §6 for why that is a v2 and not this pass.
 *
 * `Easing.back` is gone from the columns: they were overshooting their own value and settling back, which
 * means a bar briefly drew 112 % of the number it stands for. `motion-art-direction` puts it plainly —
 * do not add overshoot to content carrying information — and here the overshoot is a lie, not a flourish.
 */
const ENTER_AT = 130;
const BAR_MS = 380;
const HIST_MS = 360;
const ARC_MS = 480;
const HIST_STEP = 10;
const BAR_STEP = 45;

/** Is the screen that owns these charts the one on top? The project rule is that hidden screens must
 *  not tick fast, restated in `COORDINATION.md` §5. Stats stays mounted behind whichever
 *  page you went to, so without this a task you finish on To-do re-animates 69 props for nobody.
 *  Read once per container and passed down — one subscription per `HBars`/`Hist24`, not per bar.
 *  The flag is the navigator's context (`ui/live.ts`), not `s.route`: every page stays mounted, and a
 *  store subscription here would re-render all four containers on every tap in the app. */
function useLive() { return useScreenLive(); }

/**
 * One animated number that enters once — on the page's FIRST FOCUS — and then *travels*.
 *
 * The structural fix is one line: `withTiming` retargets from wherever the value already is, so the
 * effect never assigns a fresh start. Because every route now mounts on the first render, mounting is
 * no longer "the page became visible": the entrance is armed from a LAYOUT effect that first turns
 * `live` true, so the reset-to-zero lands in the same pre-paint commit that focuses the page and the
 * growth plays under the placement exactly as the old cold mount did. While the page is hidden the
 * value is assigned the correct picture with no motion while hidden, and a later focus does not
 * replay what already played — `entered` is consumed once, ever, the way `first` used to be consumed
 * by the mount. Under reduce-motion the value is assigned everywhere: the correct picture, no motion.
 */
function useEnter(target: number, delay: number, ms: number, live: boolean, reduce: boolean) {
  const v = useSharedValue(reduce || !live ? target : 0), entered = useRef(false);
  useLayoutEffect(() => {
    if (!live) { v.set(target); return; } // hidden: the picture, no motion, no entrance
    if (entered.current || reduce) { entered.current = true; v.set(reduce ? target : withTiming(target, { duration: ms, easing: EASE })); return; }
    entered.current = true;
    v.set(0); // first focus: grow from zero, under the drop — what the cold mount used to do
    v.set(withDelay(delay, withTiming(target, { duration: ms, easing: EASE })));
  }, [target, delay, ms, live, reduce, v]);
  return v;
}

/** weeks × 7 grid (GitHub-style). `values` is oldest→newest and is padded at the front so the last column ends on the last cell. */
export function Heatmap({ values, w, accent, labels = ['M', '', 'W', '', 'F', '', ''], startWd, unit = '' }: { values: number[]; w: number; accent?: string; labels?: string[]; startWd: number; unit?: string }) {
  const { c } = useTheme(), col = accent ?? c.acc, pad = [...new Array(startWd).fill(-1), ...values], weeks = Math.ceil(pad.length / 7), cell = Math.min(24, (w - 18) / weeks - 3), max = Math.max(1, ...values), h = 7 * (cell + 3) + 4;
  return (
    <Svg width={w} height={h} accessibilityRole="image" accessibilityLabel={`Heatmap, ${values.reduce((a, b) => a + b, 0)}${unit} in total`}>
      {labels.map((l, i) => <SText key={i} x={0} y={i * (cell + 3) + cell * 0.8} fontSize={11} fontFamily={FONT.type} fill={c.mut}>{l}</SText>)}
      {pad.map((v, i) => { if (v < 0) return null; const wk = Math.floor(i / 7), d = i % 7, l = level(v, max); return <Rect key={i} x={18 + wk * (cell + 3)} y={d * (cell + 3)} width={cell} height={cell} rx={3} fill={l ? hexA(col, [0, 0.28, 0.5, 0.75, 1][l] ?? 1) : hexA(c.ink, 0.07)} stroke={hexA(c.ink, l ? 0.35 : 0.12)} strokeWidth={0.8} />; })}
    </Svg>
  );
}
/** Horizontal bars with a label gutter.
 *
 *  The label used to be SVG `<SText>` cut at a fixed **character** count (`slice(0, 15) + '…'`), so a
 *  long subject name lost its tail whether or not the gutter had room for it — "Database Systems" fit
 *  while "Intro to Economics" did not, at the same width. Now the label is a real `<Txt numberOfLines={1}>`,
 *  which ellipsises on **pixels**, and the bar keeps the exact width it had. The bar column's width is
 *  derived from `w` rather than measured so the animated fill keeps a numeric width to animate. */
export function HBars({ items, w, fmt = (v: number) => String(v), max }: { items: { label: string; value: number; note?: string }[]; w: number; fmt?: (v: number) => string; max?: number }) {
  const { c } = useTheme(), reduce = useReduceMotion(), live = useLive(), m = max ?? Math.max(1, ...items.map((i) => i.value)), rowH = 34, valW = 56, labelW = Math.min(118, Math.max(72, w * 0.36)), barW = Math.max(24, w - labelW - valW - 16);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={items.map((i) => `${i.label} ${fmt(i.value)}`).join(', ')}>
      {items.map((it, i) => (
        <View key={it.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: rowH }}>
          <Txt f="hand" s={15} numberOfLines={1} style={{ width: labelW }}>{it.label}</Txt>
          <Svg width={barW} height={16} accessibilityRole="none">
            <Rect x={0} y={0} width={barW} height={16} rx={8} fill="none" stroke={hexA(c.ink, 0.35)} strokeWidth={1} />
            <Bar x={2} y={2} w={Math.max(4, ((barW - 4) * it.value) / m)} h={12} color={c.acc} delay={ENTER_AT + i * BAR_STEP} reduce={reduce} live={live} />
          </Svg>
          <Txt f="type" s={15} numberOfLines={1} style={{ width: valW, textAlign: 'right' }}>{fmt(it.value)}</Txt>
        </View>
      ))}
    </View>
  );
}
function Bar({ x, y, w, h, color, delay, reduce, live }: { x: number; y: number; w: number; h: number; color: string; delay: number; reduce: boolean; live: boolean }) {
  const p = useEnter(w, delay, BAR_MS, live, reduce);
  const ap = useAnimatedProps(() => ({ width: Math.max(0, p.get()) })); return <AR x={x} y={y} height={h} rx={6} fill={color} animatedProps={ap} />;
}
/** 24 vertical bars: hour of day */
export function Hist24({ values, w, h = 90, accent }: { values: number[]; w: number; h?: number; accent?: string }) {
  const { c } = useTheme(), reduce = useReduceMotion(), live = useLive(), max = Math.max(1, ...values), bw = (w - 8) / 24;
  /* An all-zero series has no busiest hour, but `indexOf(0)` would still have announced "busiest hour
     0:00" — a claim about the student's day that nothing supports. The screen shows the honest sub-line;
     this is the same honesty for the screen reader. */
  const peak = values.some((v) => v > 0) ? `Activity by hour, busiest hour ${values.indexOf(Math.max(...values))}:00` : 'Activity by hour, no activity yet';
  return (
    <Svg width={w} height={h + 20} accessibilityRole="image" accessibilityLabel={peak}>
      <Line x1={0} x2={w} y1={h} y2={h} stroke={c.ink} strokeWidth={1.4} />
      {values.map((v, i) => <VBar key={i} x={4 + i * bw + 1} base={h} w={bw - 2} hh={(v / max) * (h - 8)} color={accent ?? c.acc} delay={ENTER_AT + i * HIST_STEP} reduce={reduce} live={live} />)}
      {[0, 6, 12, 18, 23].map((hr) => <SText key={hr} x={4 + hr * bw + bw / 2} y={h + 15} fontSize={12} fontFamily={FONT.type} fill={c.mut} textAnchor="middle">{hr}</SText>)}
    </Svg>
  );
}
function VBar({ x, base, w, hh, color, delay, reduce, live }: { x: number; base: number; w: number; hh: number; color: string; delay: number; reduce: boolean; live: boolean }) {
  const cur = useEnter(hh, delay, HIST_MS, live, reduce);
  const ap = useAnimatedProps(() => ({ y: base - Math.max(1.5, cur.get()), height: Math.max(1.5, cur.get()) })); return <AR x={x} width={w} rx={2} fill={color} animatedProps={ap} />;
}
/** A hand-inked line with dots; used for mark history and weekly focus */
export function Line2({ values, labels, w, h = 100, goal, max = 100 }: { values: number[]; labels?: string[]; w: number; h?: number; goal?: number | null; max?: number }) {
  const { c } = useTheme(), reduce = useReduceMotion(), live = useLive(), n = values.length, X = (i: number) => 12 + (n <= 1 ? (w - 24) / 2 : (i * (w - 24)) / (n - 1)), Y = (v: number) => h - 6 - (Math.max(0, Math.min(max, v)) / max) * (h - 16);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(''), len = w * 3, p = useEnter(1, ENTER_AT, ARC_MS, live, reduce);
  /** Half the gap between two points: the widest a centred x-axis label can be without colliding. */
  const slot = n > 1 ? (w - 24) / (n - 1) : w - 24;
  const ap = useAnimatedProps(() => ({ strokeDashoffset: len * (1 - p.get()) }));
  return (
    <View>
      <Svg width={w} height={h} accessibilityRole="image" accessibilityLabel={`Line chart: ${values.map((v, i) => `${labels?.[i] ?? i + 1} ${Math.round(v)}`).join(', ')}`}>
        <Line x1={6} x2={w - 4} y1={h - 6} y2={h - 6} stroke={c.ink} strokeWidth={1.2} />
        {goal != null && <><Line x1={6} x2={w - 4} y1={Y(goal)} y2={Y(goal)} stroke={c.warn} strokeWidth={1.3} strokeDasharray="5 4" /><SText x={w - 4} y={Y(goal) - 4} fontSize={12} fontFamily={FONT.type} fill={c.warn} textAnchor="end">goal {goal}</SText></>}
        {n > 1 && <AP d={d} fill="none" stroke={c.acc} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${len} ${len}`} animatedProps={ap} />}
        {values.map((v, i) => <Circle key={i} cx={X(i)} cy={Y(v)} r={4.2} fill={c.card} stroke={c.ink} strokeWidth={1.6} />)}
      </Svg>
      {/* The x-axis labels sit under the plot in a real <Txt numberOfLines={1}> rather than as SVG
          `<SText>` sliced at a fixed 5 characters: that cut "Assignment" to "Assig" and "Midterm" to
          "Mid" mid-word, and it ignored the real gap between points. Each label is centred on its own
          point and bounded by half the gap either side, so it ellipsises on pixels. */}
      {n <= 9 && labels ? (
        <View style={{ height: 16, marginTop: 2 }} pointerEvents="none">
          {values.map((_, i) => labels?.[i] ? (
            <Txt key={i} f="type" s={11.5} c="mut" numberOfLines={1}
              style={{ position: 'absolute', left: X(i) - slot / 2, width: slot, textAlign: 'center' }}>{labels[i]}</Txt>
          ) : null)}
        </View>
      ) : null}
    </View>
  );
}
/**
 * A ring that moves from the value it had to the value it has.
 *
 * This was the worst replay in the app: the effect was keyed on `v`, so ticking one task — which moves
 * "On time" from 0.71 to 0.73 — re-drew the arc from empty over 900 ms. Four of them, on the screen you
 * are looking at. So `from` holds the value the arc is travelling *from*, frozen at wherever the previous
 * tween had got to, and `p` is the progress of the journey. The FIRST FOCUS sweeps from zero — the one
 * entrance the design asks for ("charts animate once on first view") — armed from a layout effect so
 * the reset-to-zero lands pre-paint on the commit that focuses the page; later focuses and data changes
 * travel instead of replaying, and a hidden ring holds the correct picture with no motion.
 */
export function Ring({ value, size = 76, label, sub }: { value: number | null; size?: number; label: string; sub?: string }) {
  const { c } = useTheme(), reduce = useReduceMotion(), live = useLive(), r = size / 2 - 7, circ = 2 * Math.PI * r, v = value ?? 0;
  const from = useSharedValue(0), p = useSharedValue(reduce || !live ? 1 : 0), entered = useRef(false);
  useLayoutEffect(() => {
    if (!live) { p.set(1); from.set(v); return; } // hidden: the settled picture, where the data is
    if (entered.current || reduce) { // already seen (or reduce-motion): travel, never restart
      entered.current = true;
      from.set(from.get() + (v - from.get()) * p.get()); // freeze wherever the last tween had reached
      p.set(reduce ? 1 : withTiming(1, { duration: ARC_MS, easing: EASE }));
      return;
    }
    entered.current = true; // first focus: the sweep from zero
    from.set(0);
    p.set(reduce ? 1 : withDelay(ENTER_AT, withTiming(1, { duration: ARC_MS, easing: EASE })));
  }, [v, reduce, live, p, from]);
  const ap = useAnimatedProps(() => ({ strokeDashoffset: circ * (1 - (from.get() + (v - from.get()) * p.get())) }));
  return (
    /* `minWidth` rather than `width`: a fixed width bounded the label box to the ring's diameter plus a
        hair, so a two-word label ("Focus streak") overflowed it and Android clipped the last glyph
        ("Focus strea"). The row is a horizontal ScrollView, so the ring may take the width its own label
        needs — the label now wraps instead of being cut. */
    <View style={{ alignItems: 'center', minWidth: size + 8 }} accessible accessibilityLabel={`${label}: ${value === null ? 'no data' : Math.round(v * 100) + ' percent'}`}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={hexA(c.ink, 0.15)} strokeWidth={7} fill="none" />
        <AC cx={size / 2} cy={size / 2} r={r} stroke={c.acc} strokeWidth={7} fill="none" strokeLinecap="round" strokeDasharray={`${circ} ${circ}`} rotation={-90} originX={size / 2} originY={size / 2} animatedProps={ap} />
        <SText x={size / 2} y={size / 2 + 7} fontSize={20} fontFamily={FONT.marker} fill={c.ink} textAnchor="middle">{value === null ? '—' : Math.round(v * 100) + '%'}</SText>
      </Svg>
      <View style={{ maxWidth: 116 }}><SText2 t={label} />{sub ? <SText2 t={sub} dim /> : null}</View>
    </View>
  );
}
const SText2 = ({ t, dim }: { t: string; dim?: boolean }) => { const { c } = useTheme(); return <Text style={{ fontFamily: FONT.hand, fontSize: dim ? 13.5 : 16, color: dim ? c.mut : c.ink, textAlign: 'center' }}>{t}</Text>; };