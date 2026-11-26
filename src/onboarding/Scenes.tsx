import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../ui/theme-context';
import { hexA } from '../tokens/theme';
import { V2 } from '../tokens/v2';

/**
 * v0.7.8.17 (owner's ask 7): every Style gets its own scene behind the onboarding, not only Collage (which keeps its
 * cut-paper art). Each one is drawn in its own world's language and set in the top of the page, clear of the words:
 *  - Notebook: pencil on the ruled page: a sketched horizon, a sun in outline with its rays, a doodled paper plane.
 *  - Plain: flat, soft shapes: a sun disc, two rolling bands, a planner card floating with its lines.
 *  - Daylight: the sky's own light: a sun that climbs across the five pages, its glow, glassy clouds.
 * `i` is the page (0–4): the composition moves a little from page to page, so a swipe feels like walking on.
 * Pure drawing, no animation of its own: the pager's parallax (Drift) moves it.
 */
export function SkinScene({ i, W, H, bottom = 0 }: { i: number; W: number; H: number; bottom?: number }) {
  const { skin } = useTheme();
  const edge = skin.surface.edge;
  /* the two hero pages draw it above their sheet; the three inner pages, whose words fill the top, in the free band
     above the pager (`bottom` = the footer's height) */
  const inner = bottom > 0, h = Math.round(H * (inner ? 0.2 : 0.42));
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, width: W, height: h, ...(inner ? { bottom } : { top: 0 }) }} testID={`scene-${edge}`}>
      {edge === 'glass' ? <DaylightScene i={i} W={W} h={h} /> : edge === 'hairline' ? <PlainScene i={i} W={W} h={h} /> : <NotebookScene i={i} W={W} h={h} />}
    </View>
  );
}

/** A soft wave across the width at height `y`, with `n` crests. */
const wave = (W: number, y: number, amp: number, n: number, phase = 0) => {
  let d = `M-10 ${y}`;
  const step = (W + 20) / n;
  for (let k = 0; k < n; k++) d += ` q${step / 2} ${(k + phase) % 2 ? amp : -amp} ${step} 0`;
  return d;
};

function NotebookScene({ i, W, h }: { i: number; W: number; h: number }) {
  const { c } = useTheme();
  /* the sun keeps to the top-right corner, clear of the face in the middle */
  const ink = hexA(c.ink, 0.55), pencil = c.acc, sx = W * 0.84, sy = h * (0.32 + (i % 2) * 0.04), r = Math.min(W, h) * 0.08;
  const rays = Array.from({ length: 8 }, (_, k) => {
    const a = (k / 8) * Math.PI * 2 + i * 0.2, r1 = r * 1.35, r2 = r * 1.75;
    return <Line key={k} x1={sx + Math.cos(a) * r1} y1={sy + Math.sin(a) * r1} x2={sx + Math.cos(a) * r2} y2={sy + Math.sin(a) * r2} stroke={pencil} strokeWidth={2} strokeLinecap="round" />;
  });
  const px = W * (0.12 + i * 0.05), py = h * (0.3 - (i % 2) * 0.06);
  return (
    <Svg width={W} height={h}>
      <Circle cx={sx} cy={sy} r={r} fill={hexA(pencil, 0.1)} stroke={pencil} strokeWidth={2} />
      {rays}
      <Path d={wave(W, h * 0.56, 9, 3, i)} stroke={ink} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <Path d={wave(W, h * 0.64, 6, 5, i + 1)} stroke={ink} strokeWidth={1.2} fill="none" strokeLinecap="round" strokeDasharray="6 5" />
      {/* a paper plane, doodled, with its loop of flight */}
      <G transform={`translate(${px} ${py}) rotate(${-12 + i * 4})`}>
        <Path d="M0 10 L26 0 L14 20 L11 13 Z M11 13 L26 0" stroke={ink} strokeWidth={1.6} fill={hexA(c.card, 0.6)} strokeLinejoin="round" />
        <Path d="M-6 14 q-16 6 -22 -4 q-4 -10 8 -8" stroke={ink} strokeWidth={1.2} fill="none" strokeDasharray="3 4" strokeLinecap="round" />
      </G>
    </Svg>
  );
}

function PlainScene({ i, W, h }: { i: number; W: number; h: number }) {
  const { c, tints } = useTheme();
  const sx = W * 0.84, sy = h * (0.3 + (i % 2) * 0.04), r = Math.min(W, h) * 0.1, cx = W * (0.05 + (i % 3) * 0.03), cy = h * 0.16;
  return (
    <Svg width={W} height={h}>
      <Circle cx={sx} cy={sy} r={r} fill={tints.sand} />
      <Path d={`${wave(W, h * 0.56, 16, 2, i)} L${W + 10} ${h} L-10 ${h} Z`} fill={hexA(tints.sky, 0.9)} />
      <Path d={`${wave(W, h * 0.66, 12, 3, i + 1)} L${W + 10} ${h} L-10 ${h} Z`} fill={hexA(tints.sage, 0.95)} />
      {/* a planner card, floating, with three lines and a tick */}
      <G transform={`translate(${cx} ${cy}) rotate(${-4 + i * 2})`}>
        <Rect x={0} y={0} width={86} height={58} rx={12} fill={c.card} stroke={hexA(c.ink, 0.12)} strokeWidth={1} />
        <Rect x={12} y={12} width={30} height={6} rx={3} fill={c.acc} />
        <Rect x={12} y={26} width={58} height={4} rx={2} fill={hexA(c.ink, 0.22)} />
        <Rect x={12} y={37} width={40} height={4} rx={2} fill={hexA(c.ink, 0.22)} />
        <Path d="M64 38 l5 5 l9 -11" stroke={c.acc} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </G>
    </Svg>
  );
}

function DaylightScene({ i, W, h }: { i: number; W: number; h: number }) {
  const { dark } = useTheme(), v = V2[dark ? 'dark' : 'light'];
  /* the sun climbs from the left low (dawn) to high right across the five pages; at night it is the moon */
  const t = i / 4, sx = W * (0.18 + t * 0.64), sy = h * (0.62 - Math.sin(t * Math.PI) * 0.36), r = Math.min(W, h) * 0.075;
  /* the sun is Daylight's own amber (the moon its ink at night); the clouds are its glass */
  const sun = dark ? hexA(v.ink, 0.9) : hexA(v.now, 0.75), glow = dark ? hexA(v.ink, 0.16) : hexA(v.now, 0.35), cloud = v.glassStrong;
  const cloudAt = (x: number, y: number, s: number, k: number) => (
    <G key={k} transform={`translate(${x} ${y}) scale(${s})`}>
      <Ellipse cx={0} cy={0} rx={46} ry={14} fill={cloud} />
      <Ellipse cx={-14} cy={-9} rx={20} ry={14} fill={cloud} />
      <Ellipse cx={12} cy={-12} rx={24} ry={17} fill={cloud} />
    </G>
  );
  return (
    <Svg width={W} height={h}>
      <Defs>
        <RadialGradient id="sunglow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={glow} />
          <Stop offset="1" stopColor={glow} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={sx} cy={sy} r={r * 4} fill="url(#sunglow)" />
      <Circle cx={sx} cy={sy} r={r} fill={sun} />
      {cloudAt(W * (0.75 - t * 0.3), h * 0.3, 0.9, 1)}
      {cloudAt(W * (0.2 + t * 0.2), h * 0.52, 0.7, 2)}
      {cloudAt(W * (0.55 + t * 0.15), h * 0.72, 1.1, 3)}
    </Svg>
  );
}
