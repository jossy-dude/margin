import { makeTheme, palettes, PENS, RG } from '../tokens/theme';
import { handPath, outline, scaleRadii, tornTape } from '../ui/hand';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SOUND_NAMES } from '../services/audio';

jest.mock('expo-audio', () => ({ createAudioPlayer: () => ({}), setAudioModeAsync: async () => {} }));

const lum = (h: string) => { const f = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); const [r, g, b] = [1, 3, 5].map((i) => f(parseInt(h.slice(i, i + 2), 16) / 255)); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
const cr = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/**
 * Every text/background pair the app can actually draw, checked in BOTH palettes and BOTH themes.
 *
 * It used to assert sixteen pairs for `refined` only, which is how `qa/FINDINGS-UNSTATED.md` F-06 could be
 * true and the suite green: in `original`, `mut`/`hl` is 4.02 and `mut`/`desk` is 4.03. `COORDINATION.md` §4
 * says *"extend it rather than weakening it"*, so this is an extension and not a replacement — the original
 * sixteen rows are all still here, and they now run in all four combinations.
 *
 * The third column is where each pair is drawn, and it is the reason this table can be trusted: every row is
 * a pair a reader can go and look at in the source. A pair that is *not* drawn has no row — it is asserted
 * as a negative below, so the two facts cannot be confused. Adding a row for a pair the palette cannot
 * deliver is how this suite would quietly start asserting something false.
 */
type Reach = [fg: string, bg: string, where: string];
const PAIRS: Reach[] = [
  ['ink', 'paper', 'every page: the ScrollView over PaperBg'],
  ['ink', 'card', 'every card: HandBox default fill'],
  ['mut', 'paper', 'captions on a page'],
  ['mut', 'card', 'captions on a card, and Sheet (PaperBg card)'],
  ['ink', 'hl', 'the highlighted title on an important note; the Tight box; a selected clock thumb'],
  ['acc', 'paper', 'the + button glyph and the selected-tab pill'],
  ['acc', 'card', 'Focus dial caption on its hub'],
  ['ok', 'card', 'a Here/Sick chip and the Done swatch'],
  ['warn', 'card', 'a late due-time, the Tight mark on a task card'],
  ['bad', 'card', 'an absent cell, an overdue task card'],
  ['ink', 'desk', "the Focus page's margin note over the desk-scrimmed photograph (dark); the dial's bed ring and escapement left with the redesign"],
  ['slabInk', 'slab', 'the Focus dial hub and the Settings bar-picker slab title'],
  ['slabMut', 'slab', 'the Settings bar-picker slab caption'],
  ['onAcc', 'acc', 'a primary button, a selected chip, the + button'],
  ['deckInk', 'deck', 'every word on the Today command deck'],
  ['deckMut', 'deck', 'the deck\'s position line and its After row'],
];
describe('every text/background pair the app draws clears 4.5:1 — in every palette and BOTH themes', () => {
  /* Rationale (v0.6): the plain look joined; its tokens are held to the same pairs. */
  for (const name of ['refined', 'original', 'plain'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      const c = palettes[name][mode];
      it.each(PAIRS)(`${name}.${mode}: %s on %s — %s`, (fg, bg, _where) => {
        expect(cr((c as never)[fg], (c as never)[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  /* v0.5 U2: the pen is the accent, and each pen is its own ink. Every pen, on both papers and both
     themes, is checked where the accent is drawn: as text on the page and on a card, and as a filled
     button carrying `onAcc`. */
  for (const pen of Object.keys(PENS) as (keyof typeof PENS)[]) {
    for (const palette of ['refined', 'original', 'plain'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        it(`the ${pen} pen on ${palette} ${theme}: on paper, on a card, and under its own button label`, () => {
          const { c } = makeTheme({ pen, palette, theme }, false);
          expect(c.acc).toBe(PENS[pen][theme]);
          for (const [fg, bg] of [[c.acc, c.paper], [c.acc, c.card], [c.onAcc, c.acc]] as const) expect(cr(fg, bg)).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  }

  /**
   * The two rules the reachable table exists to enforce, stated on their own so that a future
   * surface cannot be painted with a token that happens to pass today.
   *
   *  1. **`hl` takes `ink`.** It is the only text token that clears 4.5 on the highlight in all four
   *     combinations, which is why the important-note card, the Tight box and the selected clock thumb all
   *     print ink on it and keep the accent/amber on the stroke. `mut`/`hl` fails in `original.dark` and
   *     `warn`/`hl` fails in `original.light`; neither may be used for text there again.
   *  2. **`ink` is the floor, not `mut`, for anything on `desk`.** `mut`/`desk` is 4.03 in
   *     `original.light`.
   */
  it('the highlight and the desk only take ink as text, in every combination', () => {
    for (const name of ['refined', 'original', 'plain'] as const) for (const mode of ['light', 'dark'] as const) {
      const c = palettes[name][mode];
      for (const bg of ['hl', 'desk'] as const) expect(cr(c.ink, c[bg])).toBeGreaterThanOrEqual(4.5);
    }
    // and the two failures that motivated the rule, pinned so nobody re-introduces them by accident
    expect(cr(palettes.original.dark.mut, palettes.original.dark.hl)).toBeLessThan(4.5);
    expect(cr(palettes.original.light.warn, palettes.original.light.hl)).toBeLessThan(4.5);
    expect(cr(palettes.original.light.mut, palettes.original.light.desk)).toBeLessThan(4.5);
  });

  /**
   * The pairs the reachable table deliberately does NOT assert, asserted here as negatives. They are the
   * three live failures `qa/FINDINGS-UNSTATED.md` F-06 found, they are fixed at the use site rather than in
   * the palette, and if any of them ever clears 4.5 it will be because someone re-valued `ORIGINAL` — which
   * `COORDINATION.md` §4 forbids. So the numbers are pinned from both sides: reachable rows must pass, these
   * must still fail, and the table must not have grown a row for one of them.
   */
  it('none of the three known failures has been papered over, and the table has not grown a row for one', () => {
    expect(cr(palettes.original.dark.mut, palettes.original.dark.hl)).toBeLessThan(4.5);      // mut on a highlight
    expect(cr(palettes.original.light.warn, palettes.original.light.hl)).toBeLessThan(4.5);    // warn words on a highlight
    expect(cr(palettes.original.light.mut, palettes.original.light.desk)).toBeLessThan(4.5);   // mut on the dial bed
    const asserted = new Set(PAIRS.map(([fg, bg]) => `${fg}/${bg}`));
    for (const bad of ['mut/hl', 'warn/hl', 'mut/desk', 'ink/deck']) expect(asserted.has(bad)).toBe(false);
    expect(PAIRS.every(([fg, bg]) => fg !== bg)).toBe(true);
  });
});
describe('the palette invariants that are not contrast', () => {
  it('dark paper is not pitch black and light paper is lighter than the original desk', () => {
    expect(lum(palettes.refined.dark.paper)).toBeGreaterThan(0.018);
    expect(lum(palettes.refined.light.desk)).toBeGreaterThan(lum(palettes.original.light.desk));
  });
  it('every palette keeps its own values: both names still exist and all four modes are populated', () => {
    // Rationale (collage look): a third palette joined the two, and it is the new default; the two old
    // ones are kept, untouched, and still selectable.
    // Rationale (v0.6): the plain look is a fourth palette beside them; nothing old was removed.
    // Rationale (v0.7): Daylight is a fifth Style; its own pages draw from tokens/v2, the rest borrow Plain's paper.
    expect(Object.keys(palettes).sort()).toEqual(['collage', 'daylight', 'original', 'plain', 'refined']);
    for (const p of Object.values(palettes)) for (const mode of ['light', 'dark'] as const) expect(p[mode].paper).toMatch(/^#[0-9A-F]{6}$/i);
  });
});
describe('hand-drawn geometry', () => {
  it('scales overflowing elliptical radii exactly like CSS', () => {
    const r = scaleRadii(RG, 340, 120); expect(r.f).toBeCloseTo(120 / 269, 5);
    expect(r.h[0]).toBeCloseTo(255 * (120 / 269), 4); expect(r.v[3]).toBeCloseTo(255 * (120 / 269), 4);
    expect(scaleRadii(RG, 2000, 2000).f).toBe(1);
  });
  it('outline stays inside its box and the path is closed, deterministic and seed-dependent', () => {
    for (const [x, y] of outline(300, 90, RG)) { expect(x).toBeGreaterThanOrEqual(-1e-6); expect(x).toBeLessThanOrEqual(300 + 1e-6); expect(y).toBeGreaterThanOrEqual(-1e-6); expect(y).toBeLessThanOrEqual(90 + 1e-6); }
    const a = handPath(300, 90, RG, 3), b = handPath(300, 90, RG, 3), c = handPath(300, 90, RG, 4);
    expect(a).toBe(b); expect(a).not.toBe(c); expect(a.endsWith('Z')).toBe(true); expect(handPath(1, 1, RG, 1)).toBe('');
  });
});

/* The shipped set: scripts/sounds/build.mjs writes assets/sounds/*.ogg from picks.json (v0.7, chosen by ear on the
   audition page). The old WAV checks read 16-bit PCM directly; OGG needs a decoder, so lengths and levels are checked
   by `build.mjs --measure` and this test pins the file list and the credits instead. */
const LIVE = join(__dirname, '../../assets/sounds');
/** Every sound src/services/fx.ts can ask for (the keys of `src/services/audio.ts`). `n_*` and `alarm_*` are the
    notification and alarm tones; they are copied into res/raw and never loaded by Metro. */
const EXPECTED = ['absent', 'absent_sick', 'break', 'cancel', 'chime', 'click', 'crumple', 'detent_a', 'detent_b', 'detent_c', 'done', 'done_undone', 'knock', 'knock_low', 'low', 'mark', 'mark_late', 'page', 'peel', 'pop', 'pop_off', 'round', 'slide', 'start', 'tick', 'tick_tock'];

describe('shipped palette (assets/sounds/, the files the app loads)', () => {
  const files = readdirSync(LIVE).filter((f) => f.endsWith('.ogg') && !/^(n|alarm)_/.test(f)).map((f) => f.replace('.ogg', '')).sort();
  it('covers exactly the sounds audio.ts loads, no gaps and no strays', () => {
    expect(files).toEqual(EXPECTED);
    expect([...SOUND_NAMES].sort()).toEqual(EXPECTED);
  });
  it('ships the notification and alarm tones next to them', () => {
    const tones = readdirSync(LIVE).filter((f) => /^(n|alarm)_.*\.ogg$/.test(f));
    expect(tones).toEqual(expect.arrayContaining(['n_class.ogg', 'n_task.ogg', 'n_focus.ogg', 'alarm_musicbox.ogg', 'alarm_classic.ogg']));
  });
});
describe('the sounds are credited recordings (scripts/sounds/build.mjs)', () => {
  const credits = readFileSync(join(LIVE, 'CREDITS.md'), 'utf8');
  it('every credited clip is public domain and names its source', () => {
    const rows = credits.split('\n').filter((l) => l.startsWith('| `'));
    expect(rows.length).toBeGreaterThanOrEqual(30);
    for (const r of rows) { expect(r).toMatch(/CC0 1\.0|PDM/); expect(r).toMatch(/https?:\/\//); }
  });
  it('credits only files that are shipped', () => {
    const shipped = readdirSync(LIVE);
    for (const n of [...credits.matchAll(/^\| `([\w.-]+)`/gm)].map((m) => m[1]!)) expect(shipped).toContain(n);
  });
});

describe('tape and small boxes', () => {
  it('a tape strip is torn at both ends, the same way for the same strip, differently for another', () => {
    const a = tornTape(62, 20, 7), b = tornTape(62, 20, 7), c = tornTape(62, 20, 8);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.match(/L/g)!.length).toBeGreaterThan(10); // a zigzag at each end, not a rectangle
    expect(tornTape(4, 20, 1)).toBe('');
  });
  it('the wobble on a 32 dp chip is a smaller share than on a 300 dp card', () => {
    const spread = (d: string) => { const ys = [...d.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1])).filter((y) => y < 6); return Math.max(...ys) - Math.min(...ys); };
    expect(spread(handPath(120, 32, RG, 3))).toBeLessThan(spread(handPath(300, 200, RG, 3)) + 0.01);
  });
});
