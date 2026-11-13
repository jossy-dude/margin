/**
 * v0.7 "Daylight sheet" tokens (docs/v07/DESIGN.md §3, D-1…D-5). The sky is the ground; every surface is glass
 * over it; one reserved amber means *now*. Additive: nothing reads these until the v2 screens land (Phase 5),
 * and `src/test/tokens-v2.test.ts` holds every text token to 4.5:1 on the glass over the brightest and darkest
 * sky of its theme.
 */
export type Scheme = 'light' | 'dark';

export interface V2Colors {
  glass: string; glassStrong: string; ring: string; highlight: string; fill: string;
  ink: string; ink2: string; ink3: string;
  now: string; onNow: string;
  present: string; absent: string;
  ok: string; warn: string; bad: string;
  flat: string;
}
export const V2: Record<Scheme, V2Colors> = {
  light: {
    glass: 'rgba(255,255,255,0.74)', glassStrong: 'rgba(255,255,255,0.90)', ring: 'rgba(17,24,33,0.10)', highlight: 'rgba(255,255,255,0.65)', fill: 'rgba(17,24,33,0.06)',
    ink: '#1A1E24', ink2: '#48505B', ink3: '#5F6773',
    now: '#E8961E', onNow: '#1F1405', present: '#2B3038', absent: '#C4344C',
    ok: '#287A4E', warn: '#946115', bad: '#C4344C', flat: '#F4F5F7',
  },
  dark: {
    glass: 'rgba(16,20,27,0.68)', glassStrong: 'rgba(20,24,31,0.92)', ring: 'rgba(255,255,255,0.10)', highlight: 'rgba(255,255,255,0.06)', fill: 'rgba(255,255,255,0.07)',
    ink: '#ECEEF1', ink2: '#B5BBC4', ink3: '#9A9CA6',
    now: '#F4B04A', onNow: '#1F1405', present: '#E3E6EA', absent: '#F2768A',
    ok: '#5CC48A', warn: '#E0A64A', bad: '#F2768A', flat: '#0E1116',
  },
};
/** Subject tints: a 4-dp dot or a 3-dp left bar only, never a filled card. Dark = +12 % lightness. */
export const TINTS = ['#5B9BD5', '#6FAF83', '#D2A54F', '#D97B86', '#9C86D6', '#45A9A3', '#C98557', '#7F8C9E'] as const;

/* ── D-3 the sky: six keyframes, top → bottom of the screen ── */
export type SkyKey = 'night' | 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk';
export const SKY: Record<Scheme, Record<SkyKey, [string, string]>> = {
  light: { night: ['#BFD0E6', '#E9EEF5'], dawn: ['#F6C8A8', '#FBE9DA'], morning: ['#BFD9F2', '#EEF5FB'], noon: ['#A9CFF0', '#F2F7FC'], afternoon: ['#C4D6EA', '#F6EFE4'], dusk: ['#E9B9A3', '#F3E1D6'] },
  dark: { night: ['#0B1020', '#1B2340'], dawn: ['#1E2240', '#4A3A55'], morning: ['#16243A', '#2B3E5A'], noon: ['#14233A', '#273C58'], afternoon: ['#1A2235', '#3A3550'], dusk: ['#1C1A33', '#4B3249'] },
};
/** Which keyframe a moment belongs to (minutes since midnight). */
export function skyAt(minutes: number): SkyKey {
  const m = ((minutes % 1440) + 1440) % 1440;
  if (m < 300 || m >= 1260) return 'night';
  if (m < 420) return 'dawn';
  if (m < 660) return 'morning';
  if (m < 840) return 'noon';
  if (m < 1050) return 'afternoon';
  return 'dusk';
}
/** The next keyframe change after `minutes` (for one cross-fade timer instead of a ticking sky). */
export function nextSkyChange(minutes: number): number {
  const edges = [300, 420, 660, 840, 1050, 1260, 1740];
  const m = ((minutes % 1440) + 1440) % 1440;
  return (edges.find((e) => e > m) ?? 1740) - m;
}

/* ── D-1 type (Inter + Literata italic; tabular numbers everywhere) ── */
export const TYPE = {
  display: { size: 44, line: 48, weight: '600', track: -0.44 },
  titleL: { size: 28, line: 34, weight: '600', track: -0.14 },
  title: { size: 20, line: 26, weight: '600', track: 0 },
  subtitle: { size: 17, line: 22, weight: '600', track: 0 },
  body: { size: 16, line: 22, weight: '400', track: 0 },
  bodyS: { size: 14, line: 20, weight: '400', track: 0 },
  label: { size: 13, line: 16, weight: '500', track: 0.065 },
  caps: { size: 11, line: 14, weight: '600', track: 0.88 },
  voice: { size: 16, line: 22, weight: '400', track: 0 },
} as const;

/* ── D-4 space, radius, elevation ── */
export const SPACE = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 24, s6: 32, gutter: 16, card: 16, dense: 12 } as const;
export const RADIUS = { chip: 6, control: 10, card: 16, sheet: 22, island: 28 } as const;
export const TOUCH = 48;

/* ── D-5 motion (Reanimated 4); reduced motion makes every one instant ── */
export const MOTION = {
  press: { ms: 120, scale: 0.97 },
  state: { ms: 200, bezier: [0.4, 0, 0.2, 1] as const },
  expand: { damping: 22, stiffness: 260, mass: 1 },
  sheet: { damping: 24, stiffness: 300 },
  page: { ms: 240, outMs: 90, inMs: 150, bezier: [0.22, 1, 0.36, 1] as const },
  enter: { ms: 220, stagger: 40, maxItems: 6 },
  drag: { damping: 18, stiffness: 220, liftMs: 150 },
} as const;
