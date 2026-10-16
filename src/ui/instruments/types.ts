/**
 * The instrument vocabulary. A bar is not markup and not a component: it is a flat list of
 * primitives, so the same drawing can be (a) rendered by react-native-svg on the phone and (b)
 * turned into an SVG string here, written to /tmp and rasterised, so the instruments can be LOOKED
 * at without a device. A test that asserts a path string has not seen the drawing.
 *
 * Everything is in REAL PIXELS inside `0 0 w 44`, drawn against the measured width `c.w`. There is
 * no viewBox scaling anywhere in this system, so a disc cannot become an oval at any width — that
 * was the previous pass's failure, and it is structurally impossible here.
 */

export type Ink = 'rest' | 'live' | 'signal';

export type P2 = [number, number];

/** The instrument band. The app's `h` is a layout box; 44 is the drawing. */
export const HBAND = 44;

export type Shape =
  /** A stroked or filled path. */
  | { t: 'p'; d: string; ink: Ink; sw?: number; f?: boolean; op?: number; cap?: 'round'; dash?: string }
  /**
   * One path drawn twice: the resting draw in full, then the live run revealed by dash offset.
   * `len` is the polyline length in px, measured as the points were generated, so the dash reveals
   * exactly the measured fraction of the run and not a guess at it.
   */
  | { t: 'run'; d: string; len: number; ink: Ink; sw: number; op?: number; cap?: 'round' }
  | { t: 'r'; x: number; y: number; w: number; h: number; rx?: number; ink: Ink; f?: boolean; sw?: number; op?: number }
  | { t: 'c'; cx: number; cy: number; r: number; ink: Ink; f?: boolean; sw?: number; op?: number }
  | { t: 'l'; x1: number; y1: number; x2: number; y2: number; ink: Ink; sw?: number; op?: number; cap?: 'round'; dash?: string }
  /** `y` is the text's vertical CENTRE. No `dominant-baseline`: it is unevenly supported on Android. */
  | { t: 'x'; x: number; y: number; s: string; ink: Ink; size?: number; anchor?: 'start' | 'middle' | 'end'; op?: number }
  /** `tf` is a plain `transform` string. Only used to scale a small mark about its own centre
   *  (the Venn lenses, the chain glyphs) — never to place anything, because placement is what
   *  stretches when a viewBox is stretched. */
  | { t: 'g'; tf?: string; ch: Shape[] };

export interface Ctx {
  /** 0..1 — the fraction of the active period STILL TO RUN. 1 has not started, 0 is over. */
  p: number;
  /** the measured width in real pixels. Nothing is scaled against it. */
  w: number;
  /** the active period's length, ms — so a printed m:ss is the real one, not an assumed 50:00. */
  total: number;
  /** ms still to run. */
  left: number;
  /** the last five minutes: the one state change worth a different tone, spent on the mover only. */
  late: boolean;
}

export type Build = (c: Ctx) => Shape[];

/** The 16 keys, written out. A saved setting stores one of these as a string forever, so the union
 *  is the contract; `bars.test.ts` asserts the catalogue and this list are the same set, so adding
 *  an instrument without adding it here is a failing test rather than a silent hole. */
export type InstrumentId =
  | 'cassette' | 'graduated' | 'spiral'
  | 'tape' | 'surplus' | 'compound'
  | 'sieve' | 'sets'
  | 'scope' | 'spectrum'
  | 'stack' | 'commits' | 'heap'
  | 'btree' | 'join' | 'log';

export type GroupId = 'any' | 'econ' | 'discrete' | 'tech' | 'prog' | 'db';

export interface InstrumentDef {
  /** Stable key. A saved setting stores this, so it never changes once shipped. */
  id: InstrumentId;
  n: string;
  /** One line on what the bar measures. Shown under the name in the picker. */
  d: string;
  g: GroupId;
  build: Build;
}

export interface GroupDef { id: GroupId; n: string; hint: string }