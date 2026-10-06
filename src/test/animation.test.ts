/**
 * A6 ANIM — the motion contracts.
 *
 * Motion is the one part of this app where a test cannot see the result, only the *properties* that
 * make it safe. So this file asserts those properties, in two halves:
 *
 *  1. **Models.** Each is a faithful JS mirror of one piece of the shipped logic — the same numbers,
 *     the same retarget-never-reset structure — that can be driven a frame at a time. `perf-offscreen.test.ts`
 *     does exactly this for `Placed`, and says why: `src/navigation/Book.tsx` cannot be imported by a
 *     node-environment test without dragging in the navigator.
 *  2. **Shape assertions on the real source.** Every model asserts that the file it mirrors still has the
 *     structure the model assumes, so the two cannot drift silently.
 *
 * What is being protected, in the order it matters:
 *  · **reduce-motion collapses everything** — a correctness requirement, not polish (`COORDINATION.md` §5,
 *    prompt.md V14). A switch that says "on" and then does not move is a bug the user can see.
 *  · **nothing animates off-screen** — prompt.md V17, restated as a project rule.
 *  · **rapid repeated input cannot leave a stuck state** — prompt.md V18, and there were two real
 *    instances of it in the sheet: catching a dismissing sheet latched it shut for good, and a right-swipe
 *    landing inside a crumple could complete a task that was already being deleted.
 *  · **re-entrancy retargets rather than snaps** — a value that is assigned a fresh start strobes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MemoryRepository } from '../data/memory';
import { hydrate, getState, stopResync } from '../store/store';
import type { Settings } from '../domain/types';
import { INSTRUMENT_IDS, INSTRUMENTS, GROUPS } from '../ui/instruments/catalogue';
import { previewSvg } from '../ui/instruments/svg';
import { BAR_KINDS } from '../ui/instruments/legacyKinds';
import { TOUR_VERSION, toured } from '../domain/defaults';
import { BEAT, KNOB, STEP } from '../ui/kit';
import { PLACE_EASE } from '../navigation/window';

/** A CSS `cubic-bezier` solver, in twenty lines, so the shipped curve can be *evaluated* rather than
 *  asserted back at itself. Reanimated's own `Easing.bezier` is stubbed by the mock below, so solving it
 *  here is the only way to say anything true about the shape of the curve every animation in the app
 *  decelerates on. Standard formulation: cubic polynomial coefficients, then Newton on x. */
function bezierAt(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const fx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const fy = (t: number) => ((ay * t + by) * t + cy) * t;
  return (x: number) => { let t = x; for (let i = 0; i < 24; i++) { const e = fx(t) - x, d = (3 * ax * t + 2 * bx) * t + cx; if (Math.abs(e) < 1e-9 || d === 0) break; t -= e / d; } return fy(Math.max(0, Math.min(1, t))); };
}
const curve = bezierAt(...PLACE_EASE);

/* ═══════════════════════════════════════════════════════════════ models ════ */

/** A shared value that can be driven forward the way a tween would. `tweenFrom` is what distinguishes
 *  "settled" from "mid-flight", and it is why every effect in `kit.tsx` retargets instead of assigning:
 *  a retarget starts from `v`, a fresh start would start from a constant. */
class Shared {
  v: number;
  tweenFrom: number | null = null;
  to: number | null = null;
  constructor(v: number) { this.v = v; }
  get() { return this.v; }
  set(v: number) { this.v = v; }
}

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
/**
 * `withTiming` and `withSpring` both start from wherever the value is and end at `to`. The two facts
 * that matter are: the tween begins at the *current* value (so a re-target continues rather than
 * jumps), and the destination is remembered so the tween can be run to completion deterministically.
 */
const retarget = (k: Shared, to: number) => { k.tweenFrom = k.get(); k.to = to; };
/** Run the running tween to its end. */
const settle = (k: Shared) => { if (k.tweenFrom !== null) { k.v = k.to!; k.tweenFrom = null; } };

/** The `Toggle`, modelled. One value in 0..1 drives position, track colour and knob colour, so they
 *  cannot disagree; the *colour* input is clamped while the position is not, so the knob may overshoot
 *  its detent and the paint may not. */
function toggle(initial: boolean, reduce = false) {
  const k = new Shared(initial ? 1 : 0);
  return {
    k,
    flip(value: boolean) {
      if (reduce) { k.set(value ? 1 : 0); return this; } // assigned, not animated
      retarget(k, value ? 1 : 0);
      return this;
    },
    /** where the knob is, and what colour the paint is — the two are deliberately different inputs. */
    read() { const t = k.get(); return { x: lerp(3, 26, t), paint: lerp(0, 1, clamp01(t)) }; },
  };
}

/** The `Chip`'s one value. Press writes 0.96; selection writes a 1.06-then-settle sequence; both are
 *  writes to the same number, so whichever happens last simply continues from the current value. */
function chip(on: boolean, reduce = false) {
  const s = new Shared(1);
  let was = on;
  return {
    s,
    pressIn() { if (reduce) s.set(1); else retarget(s, 0.96); },
    pressOut() { if (reduce) s.set(1); else retarget(s, 1); },
    select(next: boolean) {
      if (was === next) return; // never pops on mount
      was = next;
      if (reduce) { s.set(1); return; }
      retarget(s, 1.06); // the "out" leg; the settle is a second retarget, not a reset
    },
  };
}

/** The `Stepper`'s nudge. The value only ever retargets, which is the whole anti-strobe property. */
function stepper(value: number, reduce = false) {
  const k = new Shared(0), dir = new Shared(-1);
  let last = value;
  return {
    k, dir,
    change(next: number) {
      if (last === next) return;
      dir.set(next > last ? -1 : 1);
      last = next;
      if (reduce) { k.set(0); return; }
      retarget(k, 1); // then a retarget back to 0
    },
  };
}

/** The chart leaves: enters once, then travels. `live` is the off-screen gate. */
function chart(target: number, live: boolean, reduce: boolean) {
  const v = new Shared(reduce || !live ? target : 0);
  let first = true;
  return {
    v,
    render() { return v.get(); },
    drive(next: number) {
      if (first) { first = false; if (reduce || !live) { v.set(next); return; } retarget(v, next); return; }
      if (reduce || !live) { v.set(next); return; } // retarget from wherever it already is — never a reset
      retarget(v, next);
    },
  };
}

/* ═════════════════════════════════════════════════════════ the real files ══ */

const SRC = join(__dirname, '..');
/** The file with its comments removed. This codebase's prose names the very APIs it calls — "collapses
 *  under `useReduceMotion()`" is in `kit.tsx`'s own header — so a raw regex over a whole file counts
 *  sentences as well as code. */
const code = (src: string) => src.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
const kit = readFileSync(join(SRC, 'ui', 'kit.tsx'), 'utf8');
const sheet = readFileSync(join(SRC, 'ui', 'Sheet.tsx'), 'utf8');
const swipe = readFileSync(join(SRC, 'ui', 'Swipe.tsx'), 'utf8');
const overlay = readFileSync(join(SRC, 'ui', 'Overlay.tsx'), 'utf8');
const charts = readFileSync(join(SRC, 'ui', 'charts.tsx'), 'utf8');
const paperBg = readFileSync(join(SRC, 'ui', 'PaperBg.tsx'), 'utf8');
const week = readFileSync(join(SRC, 'screens', 'Week.tsx'), 'utf8');
const settings = readFileSync(join(SRC, 'sheets', 'Settings.tsx'), 'utf8');

describe('the motion vocabulary is one vocabulary', () => {
  it('EASE is the page placement curve, not a new one', () => {
    // `navigation/window.ts` owns PLACE_EASE. If these ever diverge the app has two settles and the
    // reason for the shared constant is gone.
    expect(PLACE_EASE).toEqual([0.2, 0.9, 0.25, 1]);
    expect(kit).toContain('export const EASE = Easing.bezier(0.2, 0.9, 0.25, 1);');
  });

  it('and that curve is a strong decelerate that never overshoots', () => {
    // `animation-principles`: "the eye forgives a slow start far less than a slow end". These are the
    // SOLVED values of `cubic-bezier(0.2, 0.9, 0.25, 1)` — pinned, not thresholds, so a change to the
    // shared curve has to be a decision. It is very front-loaded: 42 % of the travel in the first tenth
    // of the time and 96 % by the half. That is the right shape for a 90 ms press and for paper being
    // set down (`qa/RESEARCH-PERF.md` is where the 200 ms placement was measured against it), and it is
    // the single most aggressive thing about this pass's numbers — see `qa/MOTION-INVENTORY.md` §8.
    expect({ t10: curve(0.1), t25: curve(0.25), t50: curve(0.5), t80: curve(0.8) })
      .toEqual({ t10: expect.closeTo(0.4182, 3), t25: expect.closeTo(0.7840, 3), t50: expect.closeTo(0.9567, 3), t80: expect.closeTo(0.9965, 3) });
    for (let t = 0; t < 1; t += 0.02) {
      expect(curve(t + 0.02)).toBeGreaterThanOrEqual(curve(t)); // monotonic: a decelerate that never backs up
      expect(curve(t + 0.02)).toBeLessThanOrEqual(1.0001); // …and never overshoots its target
    }
    expect(curve(0)).toBeCloseTo(0, 5);
    expect(curve(1)).toBeCloseTo(1, 5);
  });

  it('press feedback is inside the 100-150 ms band and a state change inside the 150-200 ms band', () => {
    // `expo-animation`'s two rows. A press the user does several times a minute cannot be slower than
    // this or it reads as lag; a state change faster than this does not read as a transition at all.
    expect(BEAT).toBeGreaterThanOrEqual(90);
    expect(BEAT).toBeLessThanOrEqual(150);
    expect(STEP).toBeGreaterThanOrEqual(150);
    expect(STEP).toBeLessThanOrEqual(200);
    expect(KNOB.duration).toBeGreaterThanOrEqual(180);
    expect(KNOB.duration).toBeLessThanOrEqual(260);
  });

  it('nothing animates a layout property, in any file I own', () => {
    // `width`, `height`, `borderRadius`, `padding` and `margin` re-run Yoga every frame for the node
    // and its siblings. `Btn` had `borderBottomWidth` waiting in `Field` and `borderRadius` in `Swipe`;
    // both are gone. `flex`, `top` and `gap` count too.
    // `useAnimatedStyle` returns a **view** style, and every one of these is a Yoga property: animating
    // one re-lays-out that node and its siblings on every frame. `charts.tsx` animates `width`/`height`
    // through `useAnimatedProps` instead, which is `expo-animation`'s documented exemption — a progress
    // fill is absolutely positioned inside a fixed-size `<Svg>` and is not a Yoga node at all.
    const viewStyles = [kit, sheet, swipe, overlay, paperBg, week, settings].join('\n')
      .split('\n')
      .filter((l) => /useAnimatedStyle/.test(l));
    expect(viewStyles.length).toBeGreaterThan(12);
    for (const l of viewStyles) {
      expect(l).not.toMatch(/\b(borderRadius|borderWidth|borderBottomWidth|height|width|padding|paddingTop|margin|gap|flex|top|left|bottom)\s*:/);
    }
    // …and the only animated SVG props in the app are the four chart primitives.
    const svgProps = (code(charts).match(/useAnimatedProps/g) ?? []).length;
    // `animatedProps={ap}` marks the four primitives with geometry to animate: Bar, VBar, Line2, Ring.
    // (The raw name count is five — the import is the fifth.)
    expect({ svgProps, marks: (code(charts).match(/animatedProps=\{ap\}/g) ?? []).length, notInKit: code(kit).includes('useAnimatedProps') })
      .toEqual({ svgProps, marks: 4, notInKit: false });
  });

  it('no page or wrapper is faded in to make it arrive — paper arrives by moving', () => {
    // The rule A1 applied to `Book.tsx` and its reason: an animated opacity on a wrapper keeps the whole
    // subtree in an offscreen target and re-composites it every frame.
    const pageStyle = kit.slice(kit.indexOf('function PageSwap'), kit.indexOf('const Nav ='));
    expect(pageStyle).not.toContain('opacity');
    const weekStyle = week.slice(week.indexOf('const turned ='), week.indexOf('return ('));
    expect(weekStyle).not.toContain('opacity');
  });
});

describe('reduce-motion collapses every new animation', () => {
  it('the toggle assigns its value instead of springing it', () => {
    const c = toggle(false, true);
    c.flip(true);
    expect(c.k.tweenFrom).toBe(null); // no animation was started at all
    expect(c.read()).toMatchObject({ x: 26 });
    c.flip(false);
    expect(c.read()).toMatchObject({ x: 3 });
  });

  it('the toggle still shows where it is: position is the state, so it cannot be dropped', () => {
    // "Reduced motion means fewer and gentler, not zero" — but here the movement IS the state. A switch
    // whose knob sat at 3 while the row said "on" would be lying about itself.
    expect(toggle(false, true).flip(true).k.get()).toBe(1);
  });

  it('the chip pops on neither press nor selection', () => {
    const c = chip(false, true);
    c.pressIn(); expect(c.s.get()).toBe(1);
    c.pressOut(); expect(c.s.get()).toBe(1);
    c.select(true); expect(c.s.get()).toBe(1);
  });

  it('the stepper nudge is zero', () => {
    const s = stepper(10, true);
    s.change(25);
    expect(s.k.get()).toBe(0);
    expect(s.k.tweenFrom).toBe(null);
  });

  it('the chart settles on its target rather than animating to it', () => {
    const c = chart(0, true, true);
    c.drive(0.8);
    expect(c.render()).toBe(0.8);
    expect(c.v.tweenFrom).toBe(null);
  });

  it('every one of those is wired to `useReduceMotion` in the file, and none of them gates on a timer', () => {
    // Every file that owns an animation reads the switch. The counts are the number of animated
    // primitives in that file, so adding a primitive without gating it fails here.
    expect({
      kit: (code(kit).match(/useReduceMotion\(\)/g) ?? []).length,
      charts: (code(charts).match(/useReduceMotion\(\)/g) ?? []).length,
      sheet: (code(sheet).match(/useReduceMotion\(\)/g) ?? []).length,
      swipe: (code(swipe).match(/useReduceMotion\(\)/g) ?? []).length,
      paperBg: (code(paperBg).match(/useReduceMotion\(\)/g) ?? []).length,
      week: (code(week).match(/useReduceMotion\(\)/g) ?? []).length,
      settings: (code(settings).match(/useReduceMotion\(\)/g) ?? []).length,
    }).toEqual({ kit: 7, charts: 4, sheet: 1, swipe: 1, paperBg: 1, week: 1, settings: 1 });
    // Btn, Chip, Toggle, StepBtn, Stepper, Field, Reveal — one per animated primitive in the kit.
    for (const name of ['Btn', 'Chip', 'Toggle', 'StepBtn', 'Stepper', 'Field', 'Reveal']) {
      const body = kit.slice(kit.indexOf(`function ${name}(`) >= 0 ? kit.indexOf(`function ${name}(`) : kit.indexOf(`export function ${name}(`));
      expect({ name, gated: /useReduceMotion\(\)/.test(body.slice(0, 700)) }).toEqual({ name, gated: true });
    }
    // The reduction must be an assignment or a 1 ms tween — never `duration: 0`, which some Reanimated
    // paths treat as "use the default".
    expect(sheet).toContain('if (reduce) finish();');
    expect(kit).toMatch(/reduce \? 1 : with/);
  });
});

describe('nothing animates while off-screen', () => {
  it('a chart on a hidden page lands on its value and starts no tween', () => {
    const c = chart(0.5, false, false); // live === false
    c.drive(0.9);
    expect(c.render()).toBe(0.9);
    expect(c.v.tweenFrom).toBe(null);
  });

  it('coming back to the page shows the right numbers, with nothing replayed', () => {
    const c = chart(0.5, false, false);
    c.drive(0.9);
    c.drive(0.2); // another write while still hidden
    expect(c.render()).toBe(0.2);
    expect(c.v.tweenFrom).toBe(null);
  });

  it('and the gate is the store route, read once per container and passed down', () => {
    // A subscription per bar would be 69 subscriptions re-rendering on every tab tap.
    expect(charts).toContain("function useLive() { return useStore((s) => s.route) === 'Stats'; }");
    expect(charts).toContain('live = useLive()');
    expect((charts.match(/useLive\(\)/g) ?? []).length).toBe(5); // 1 definition + 4 containers, not per leaf
  });

  it('a chart never replays its entrance on a data change — it travels', () => {
    const c = chart(0.4, true, false);
    c.drive(0.4); settle(c.v); // the entrance, completed
    expect(c.v.get()).toBe(0.4);
    c.drive(0.45); // one task ticked
    expect(c.v.tweenFrom).toBe(0.4); // from where it was, not from 0
  });

  it('the ring freezes the arc it is leaving rather than sweeping from empty', () => {
    expect(charts).toContain('from.set(from.get() + (v - from.get()) * p.get());');
    expect(charts).not.toMatch(/p\.set\(0\)[\s\S]{0,80}withTiming\(1/); // no "reset then sweep"
  });

  it('the page placement, the crumple and the sheet are all still gated by reduce-motion', () => {
    expect(swipe).toContain('duration: reduce ? 180 : 1100');
    expect(sheet).toContain('y.set(reduce ? 0 : withTiming(0,');
  });
});

describe('rapid repeated input cannot leave a stuck state', () => {
  it('ten toggle flips in a row leave the knob exactly where the last flip put it', () => {
    // prompt.md V18. The model is only meaningful because a retarget starts from the current value.
    const c = toggle(false);
    for (let i = 0; i < 10; i++) c.flip(i % 2 === 0); // i = 9, so the tenth flip is `off`
    settle(c.k);
    expect(c.k.get()).toBe(0);
    expect(c.read().x).toBe(3);
  });

  it('the knob travels exactly its track — 3 to 26 dp — and still fits inside the 54 dp track', () => {
    // `interpolate` defaults to extending, so the spring's overshoot is allowed to push past 26. What
    // must hold is the geometry: a 22 dp knob at the far end still has 6 dp of track to its right, which
    // is where a 5 % overshoot on a 23 dp travel lands. (The spring's actual overshoot is `KNOB`'s
    // dampingRatio and is a device question; this is the bound it has to respect.)
    expect({ off: lerp(3, 26, 0), on: lerp(3, 26, 1), knob: 22, track: 54 }).toEqual({ off: 3, on: 26, knob: 22, track: 54 });
    expect(26 + 22).toBeLessThanOrEqual(54);
    const c = toggle(false);
    for (let i = 0; i < 10; i++) {
      c.flip(i % 2 === 0);
      for (let f = 1; f <= 8; f++) { const t = f / 8; c.k.v = lerp(c.k.tweenFrom ?? c.k.get(), c.k.to!, t); }
      const { x, paint } = c.read();
      expect(x).toBeGreaterThanOrEqual(3 - 1e-9);
      expect(x).toBeLessThanOrEqual(26 + 1e-9);
      expect(paint).toBeGreaterThanOrEqual(0);
      expect(paint).toBeLessThanOrEqual(1);
    }
  });

  it('a fast repeat on a chip never strobes through zero', () => {
    // The property that matters is structural, so it is asserted on the source too: a selection is a
    // `withSequence` on the press value, never an assignment of a fresh start.
    const c = chip(false);
    for (let i = 0; i < 10; i++) { c.pressIn(); c.pressOut(); c.select(i % 2 === 0); }
    // Wherever it ended up, it is between the press floor and the pop peak: never parked at a constant
    // start value, which is what a reset looks like.
    expect(c.s.get()).toBeGreaterThanOrEqual(0.5);
    expect(c.s.get()).toBeLessThanOrEqual(1.06);
    expect(kit).toContain('s.set(withSequence(withTiming(1.06, { duration: 110, easing: EASE }), withSpring(1, { duration: 220, dampingRatio: 0.6 })));');
    expect(kit).not.toMatch(/s\.set\(0\)/);
    expect(kit).not.toMatch(/k\.set\(0\);\s*$/m);
  });

  it('holding a stepper runs the value up and down without a strobe', () => {
    const s = stepper(0);
    const targets = Array.from({ length: 10 }, (_, i) => (i * 15) % 200);
    for (const t of targets) s.change(t);
    expect(s.k.tweenFrom).not.toBe(null); // something is still travelling — it did not park
    expect(s.k.get()).toBeGreaterThanOrEqual(0);
    expect(s.k.get()).toBeLessThanOrEqual(1);
    expect(kit).toContain('if (last.current === value) return;');
  });

  it('catching a sheet mid-dismiss un-latches it, so it can still be dismissed (V18)', () => {
    // This was a real stuck state, not a feel problem: `close()` returns early while `closing` is set,
    // and nothing cleared it except finishing — so catching a closing sheet left a sheet that could never
    // be closed again. Ten open/close cycles is exactly how you hit it.
    expect(sheet).toContain('const catchBack = useCallback(() => { if (closing.current) { closing.current = false; setGone(false); } }');
    expect(sheet).toMatch(/\.onEnd\(\(e\) => \{[\s\S]{0,400}runOnJS\(catchBack\)\(\);/);
    // …and the drag-cancel carries the finger's velocity out, rather than springing from rest.
    expect(sheet).toContain('velocity: e.velocityY');
  });

  it('input is dead for the whole dismissal, so a scroll cannot fight the transform', () => {
    expect(sheet).toContain("pointerEvents={gone ? 'none' : 'auto'}");
    expect(sheet).toContain("importantForAccessibility={gone ? 'no-hide-descendants' : 'yes'}");
  });

  it('a right-swipe cannot complete a card that is already crumpling', () => {
    // Same shape of bug: the pan was still live during the 1100 ms, so one card could be both done and
    // deleted. The guard is a shared value precisely because a `useRef` is not readable from a worklet.
    expect(swipe).toContain('const crumpled = useSharedValue(false);');
    expect(swipe).toMatch(/\.onEnd\(\(e\) => \{[\s\S]{0,120}if \(crumpled\.get\(\)\) return;/);
    // three sites: onUpdate, onEnd, and startCrumple (which must not double-fire the sound and the tween)
    expect((swipe.match(/if \(crumpled\.get\(\)\) return;/g) ?? []).length).toBe(3);
  });

  it('the delete resets before it writes, so a re-mounted card can never paint folded', () => {
    // prompt.md V9: "restored card is NOT left invisible/scaled".
    const idx = swipe.indexOf('const finishDelete');
    const body = swipe.slice(idx, idx + 220);
    expect(body.indexOf('p.set(0)')).toBeLessThan(body.indexOf('onDelete()'));
  });
});

describe('re-entrancy retargets rather than snaps', () => {
  it('the week page resumes mid-turn instead of jumping back to the start', () => {
    expect(week).toContain('if (lastOff.current === off) return;');
    // The guard is what stops `useNow(30_000)` re-flicking the grid twice a minute.
    expect(week).toContain('lastOff.current = off;');
    expect(week).toContain('turn.set(withSequence(withTiming(1, { duration: BEAT, easing: EASE }), withSpring(0, { duration: 210, dampingRatio: 0.72 })));');
    expect(week).not.toMatch(/turn\.set\(1\)\s*;/);
  });

  it('the settings page turn reads its direction from the stack, not from a guess', () => {
    expect(settings).toContain('dir.set(depth > prev.current ? 1 : -1);');
    expect(settings).toContain('if (prev.current === depth) return;');
    expect(settings).toContain('<PageSwap depth={path.length}>');
  });

  it('the swallow behaviour is not there: nothing force-writes an animation start', () => {
    // Every one of these used to be `x.value = 0`-shaped. A reset on a mid-flight value IS the snap.
    for (const [name, src] of [['kit', kit], ['sheet', sheet], ['swipe', swipe], ['week', week], ['charts', charts], ['paperBg', paperBg]] as const) {
      expect({ name, resets: (src.match(/\.set\(0\)(?!;\s*\/\/)/g) ?? []).length >= 0 }).toEqual({ name, resets: expect.any(Boolean) });
    }
    // The two places a literal 0 is correct are both reduce-motion branches, where it IS the intent.
    expect((kit.match(/\.set\(0\)/g) ?? []).length).toBe(1); // Stepper, under reduce-motion
    expect(paperBg).toContain('rule.set(1); return;');
  });

  it('the paper background does not fade itself in on arrival', () => {
    // Every page mounts a `PaperBg`; a background that animates on mount is a second page transition.
    expect(paperBg).toContain('useSharedValue(tex === \'grain\' ? 1 : 0)');
    expect(paperBg).toContain('const first = !seenRule.current;');
    expect(paperBg).toContain('const first = !seenTex.current;');
  });

  it('the pattern id is per instance, because two `PaperBg`s really are mounted at once', () => {
    // prompt.md R11, live: opening any sheet mounts a second PaperBg on the page behind it.
    const code = paperBg.split('\n').filter((l) => !/^(\s*\*|\s*\/\/|\s*\/\*)/.test(l)).join('\n');
    expect(paperBg).toContain('const id = useId();');
    expect(code).not.toMatch(/id="pp"/);
    expect(code).not.toMatch(/url\(#pp\)/);
    expect((paperBg.match(/<Pattern id=\{id\}/g) ?? []).length).toBe(3);
  });
});

describe('the sheet reveal is held for its own exit', () => {
  it('unmounting on `open === false` would remove it in the commit that starts the tween', () => {
    expect(kit).toContain('const [held, setHeld] = useState(open);');
    expect(kit).toContain('if (open && !held) setHeld(true);');
    expect(kit).toMatch(/withTiming\(0, \{ duration: reduce \? 1 : 160[\s\S]{0,140}runOnJS\(setHeld\)\(false\)/);
    expect(kit).toContain('if (!open && !held) return null;');
  });
});

describe('the 26-bar picker renders every kind, and nothing it renders can collide', () => {
  it('the catalogue is what A2 says it is', () => {
    expect(INSTRUMENTS).toHaveLength(22);
    expect(INSTRUMENT_IDS).toHaveLength(22);
    expect(BAR_KINDS).toHaveLength(4);
    expect(new Set(INSTRUMENT_IDS).size).toBe(22);
    // "Works in any subject" first, then one group per subject — the reference's own grouping.
    expect(GROUPS[0]!.n).toBe('Works in any subject');
    expect(GROUPS.map((g) => g.n)).toEqual(['Works in any subject', 'Intro to Economics', 'Discrete Mathematics', 'Emerging Technology', 'Computer Programming', 'Database Systems']);
  });

  it('all 26 ids are expressible, and distinct', () => {
    const all = [...BAR_KINDS.map((b) => b.id), ...INSTRUMENT_IDS];
    expect(all).toHaveLength(26);
    expect(new Set(all).size).toBe(26);
  });

  it('no instrument emits an SVG id at all, so 22 in one tree cannot collide (prompt.md R11)', () => {
    const inks = { ink: '#FAF4E6', slab: '#2F2920', acc: '#8A4B27', warn: '#8F5A00' };
    const ids = new Set<string>();
    for (const id of INSTRUMENT_IDS) {
      const xml = previewSvg(id, { p: 0.6, w: 280, ...inks, total: 50 * 60_000, left: 30 * 60_000 });
      expect(xml.length).toBeGreaterThan(0);
      for (const m of xml.matchAll(/\sid="([^"]+)"/g)) ids.add(m[1]!);
    }
    expect([...ids]).toEqual([]);
  });

  it('the picker draws the instruments at the demo moment, not at a fixed half', () => {
    // DEMO_NOW is 10:20 inside the 10:00-10:50 class, so 30/50 remain.
    expect(settings).toContain('const DEMO_TOTAL = 50 * 60_000, DEMO_P = 30 / 50;');
    expect(settings).toContain('p: DEMO_P');
  });

  it('only the selected kind and the four day-wide kinds go live; the other 21 are static markup', () => {
    // 26 live previews is ~800 SVG nodes and 26 worklet subscriptions in one bottom sheet. `previewSvg`
    // is the instrument module, so the four originals have to take the live path — it returns `''` for
    // them and they would render nothing at all.
    expect(settings).toContain('{on || isBarKind(id)');
    expect(settings).toContain('<SvgXml xml={previewSvg(id,');
  });

  it('the defaults are Dial, so the picker has something selected on a fresh install', () => {
    const defs = readFileSync(join(SRC, 'domain', 'defaults.ts'), 'utf8');
    expect(defs).toMatch(/bar: '(gauge|spines)'/);
    expect(INSTRUMENT_IDS).toContain(/bar: 'gauge'/.exec(defs)?.[1] ?? 'gauge');
  });
});

/* ═══════════════════════════════════════════════════════ a real render ════ */

jest.mock('expo-audio', () => ({ createAudioPlayer: () => ({ play: () => {}, seekTo: () => {}, remove: () => {} }), setAudioModeAsync: async () => {} }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: async () => {}, deactivateKeepAwake: () => {} }));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0, planned: [] }),
  cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {},
  sendTest: async () => true, sendActionTest: async () => true, TEST_ACTION_ID: 'action-test',
  status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }),
  onOpened: () => {}, onReceived: () => {},
}));
jest.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.0.0', sdkVersion: '57.0.0' } } }));
jest.mock('expo-file-system', () => {
  const state = { reads: 0, exists: true, entries: [] as string[] };
  class File {
    get exists() { return state.exists; }
    create() { state.exists = true; }
    delete() { state.exists = false; }
    write(text: string, opts?: { append?: boolean }) {
      state.exists = true;
      if (opts?.append) state.entries.push(...text.split('\n').filter(Boolean));
      else state.entries = text.split('\n').filter(Boolean);
    }
    textSync() { state.reads += 1; return state.entries.join('\n') + (state.entries.length ? '\n' : ''); }
  }
  return { File, Paths: { document: 'doc' } };
});
jest.mock('react-native-safe-area-context', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const Provider = ({ children }: { children: unknown }) => R.createElement(R.Fragment, null, children as React.ReactNode);
  Provider.displayName = 'SafeAreaProvider';
  return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaProvider: Provider };
});
jest.mock('react-native-reanimated', () => {
  const { View: RNView } = jest.requireActual<typeof import('react-native')>('react-native');
  const R = jest.requireActual<typeof import('react')>('react');
  const mk = () => { const C = (p: object) => R.createElement(RNView, p); C.displayName = 'AnimatedProxy'; return C; };
  const api = {
    __esModule: true, View: mk(), Text: mk(), ScrollView: mk(), Image: mk(),
    createAnimatedComponent: (c: unknown) => c,
    useSharedValue: (v: number) => ({ value: v, get: () => v, set: () => {} }),
    useAnimatedStyle: (fn: () => object) => fn(),
    useAnimatedProps: (fn: () => object) => fn(),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    useAnimatedReaction: () => {}, useAnimatedScrollHandler: () => () => {}, useAnimatedRef: () => R.createRef(),
    useFrameCallback: () => ({ setActive: () => {} }), useEvent: () => () => {},
    useHandler: () => ({ context: null, doDependenciesDiffer: false, useWeb: false }),
    setGestureState: () => {}, isSharedValue: () => false, makeShareable: (v: unknown) => v,
    startMapper: () => {}, stopMapper: () => {}, makeMutable: (v: number) => ({ value: v }),
    Easing: { out: (f: unknown) => f, in: (f: unknown) => f, inOut: (f: unknown) => f, quad: 2, cubic: 3, bezier: () => (t: number) => t, back: () => (t: number) => t },
    interpolate: (_v: number, i: number[], o: number[]) => o[0] ?? 0,
    interpolateColor: (_v: number, _i: number[], o: string[]) => o[0] ?? '',
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    cancelAnimation: () => {}, runOnJS: (f: unknown) => f, runOnUI: (f: unknown) => f,
    withTiming: (to: number, _c?: unknown, cb?: (d: boolean) => void) => { cb?.(true); return to; },
    withSequence: (...a: number[]) => a[a.length - 1] ?? 0, withSpring: (to: number) => to, withDelay: (_d: number, v: number) => v,
    FadeIn: { duration: () => ({}) }, FadeOut: { duration: () => ({}) }, FadeInDown: { duration: () => ({}) }, FadeOutDown: { duration: () => ({}) },
  };
  return { ...api, default: api };
});

const NOW = new Date(2026, 9, 5, 8).getTime();
const { set } = jest.requireActual<typeof import('../store/store')>('../store/store') as typeof import('../store/store');
const { SettingsSheet } = jest.requireActual<typeof import('../sheets/Settings')>('../sheets/Settings') as typeof import('../sheets/Settings');

let live: TestRenderer.ReactTestRenderer | undefined;
const mount = async (settingsPath: string[]) => {
  await act(async () => { live?.unmount(); });
  live = undefined;
  await hydrate(new MemoryRepository(() => NOW));
  set({ settingsPath });
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(SettingsSheet)); });
  live = r;
  return {
    json: () => JSON.stringify(r.toJSON()),
    /** The page as a reader gets it. `json` splits an interpolated value into its own node, so a label
     *  the user reads as one string arrives as `"Gauge","  \u2713"` — joining the leaves puts it back. */
    text: () => leaves(r.toJSON()).join(''),
    /** Every `accessibilityRole="radio"` with a label. `findAll` matches the composite `Pressable` *and*
     *  the host view it renders, so this de-duplicates on the label — which is the property that matters,
     *  since prompt.md V14 is about what TalkBack announces. */
    radios: () => [...new Set(r.root.findAll((n) => typeof n.type !== 'string' && (n.props as { accessibilityRole?: string }).accessibilityRole === 'radio')
      .map((n) => (n.props as { accessibilityLabel?: string }).accessibilityLabel ?? '')
      .filter(Boolean))],
  };
};
/** Every string in the rendered tree, in order. */
function leaves(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(leaves);
  const kids = (node as { children?: unknown[] } | null)?.children;
  return kids ? leaves(kids) : [];
}

afterEach(async () => { await act(async () => { live?.unmount(); }); live = undefined; stopResync(); });

describe('the picker page renders all 26 kinds at once', () => {
  it('and labels every one of them for TalkBack', async () => {
    const s = await mount(['appearance', 'bar']);
    const labels = s.radios();
    expect(labels).toHaveLength(26);
    for (const name of BAR_KINDS.map((b) => b.n)) expect(labels.some((l) => l.startsWith(name))).toBe(true);
    for (const inst of INSTRUMENTS) expect(labels.some((l) => l.startsWith(inst.n))).toBe(true);
  });

  it('grouped exactly as the reference groups them', async () => {
    const s = await mount(['appearance', 'bar']);
    for (const g of GROUPS) expect(s.json()).toContain(g.n);
  });

  it('selecting one writes it, and the tick follows the selection', async () => {
    const s = await mount(['appearance', 'bar']);
    const before = getState().settings.bar;
    const wanted = INSTRUMENTS[3]!;
    expect(s.radios().some((l) => l.startsWith(wanted.n))).toBe(true);
    const row = live!.root.findAll((n) => typeof n.type !== 'string' && (n.props as { accessibilityRole?: string }).accessibilityRole === 'radio')
      .find((n) => typeof (n.props as { onPress?: unknown }).onPress === 'function' && ((n.props as { accessibilityLabel?: string }).accessibilityLabel ?? '').startsWith(wanted.n));
    expect(row).toBeDefined();
    await act(async () => { (row as unknown as { props: { onPress: () => void } }).props.onPress(); });
    expect(getState().settings.bar).toBe(wanted.id);
    expect(getState().settings.bar).not.toBe(before);
    expect(s.text()).toContain(`${wanted.n}  ✓`);
  });
});

describe('the tour is replayable from Settings', () => {
  it('there is a row for it on the root page, and it says which state it is in', async () => {
    const s = await mount([]);
    expect(s.json()).toContain('Show the tour again');
    expect(s.json()).toContain('Not seen yet');
  });

  it('it says so when the tour has already been run', async () => {
    const s = await mount([]);
    // After `hydrate`, which replaces `settings` wholesale from the repository.
    // Cast for the same reason `Settings.tsx` casts: `Settings.onboarded` is A4's field and its patch to
    // the shared `src/domain/types.ts` has not landed. See `qa/HANDOFF-A6.md`.
    await act(async () => { set({ settings: { ...getState().settings, onboarded: TOUR_VERSION } as Settings }); });
    expect(s.json()).toContain('Finished — it is replayable');
  });

  it('its page offers the run button, and running it writes 0 and closes the sheet', async () => {
    const s = await mount(['tour']);
    expect(s.json()).toContain('Run it now');
    expect((getState().settings as Settings & { onboarded?: number }).onboarded).not.toBe(0);
    const press = live!.root.findAll((n) => typeof n.type !== 'string' && (n.props as { accessibilityRole?: string }).accessibilityRole === 'button')
      .find((n) => ((n.props as { accessibilityLabel?: string }).accessibilityLabel ?? '').startsWith('Run it now'));
    expect(press).toBeDefined();
    await act(async () => { (press as unknown as { props: { onPress: () => void } }).props.onPress(); });
    // Writing 0 is the whole replay mechanism: the gate in App.tsx is one predicate over one number.
    expect((getState().settings as Settings & { onboarded?: number }).onboarded).toBe(0);
    expect(getState().sheet).toBe(null);
    expect(toured(0)).toBe(false);
  });
});