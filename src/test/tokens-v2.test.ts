/** v0.7 U1 acceptance: every text token is >= 4.5:1 on the glass over the brightest and the darkest sky of its theme. */
import { MOTION, RADIUS, SKY, SPACE, TINTS, TOUCH, TYPE, V2, skyAt, nextSkyChange, type Scheme } from '../tokens/v2';

const rgb = (s: string): [number, number, number, number] => {
  if (s.startsWith('#')) return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16), 1];
  const p = /rgba?\(([^)]+)\)/.exec(s)![1]!.split(',').map(Number);
  return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
};
const lin = (c: number) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const L = (c: number[]) => 0.2126 * lin(c[0]!) + 0.7152 * lin(c[1]!) + 0.0722 * lin(c[2]!);
const over = (top: number[], bg: number[]) => [0, 1, 2].map((i) => top[i]! * top[3]! + bg[i]! * (1 - top[3]!));
const ratio = (a: number[], b: number[]) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

describe.each(['light', 'dark'] as Scheme[])('%s tokens on glass over the sky', (scheme) => {
  const t = V2[scheme];
  const skies = Object.values(SKY[scheme]).flat().map(rgb);
  const grounds = skies.flatMap((sky) => [over(rgb(t.glass), sky), over(rgb(t.glassStrong), sky)]);
  it.each(['ink', 'ink2', 'ink3', 'ok', 'warn', 'bad', 'absent'] as const)('%s >= 4.5:1 everywhere', (k) => {
    const worst = Math.min(...grounds.map((g) => ratio(rgb(t[k]), g)));
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });
  it('text on the reserved "now" amber is readable', () => {
    expect(ratio(rgb(t.onNow), rgb(t.now))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the sky follows the clock', () => {
  it('maps the hours to the six keyframes', () => {
    expect([0, 299, 300, 419, 420, 660, 840, 1050, 1259, 1260].map(skyAt)).toEqual(['night', 'night', 'dawn', 'dawn', 'morning', 'noon', 'afternoon', 'dusk', 'dusk', 'night']);
  });
  it('knows when the next change is (one timer, no ticking sky)', () => {
    expect(nextSkyChange(0)).toBe(300);
    expect(nextSkyChange(1300)).toBe(1740 - 1300);
    expect(nextSkyChange(700)).toBe(140);
  });
});

describe('the rest of the scale (DESIGN.md D-1, D-4, D-5)', () => {
  it('spaces sit on the 4 dp grid, touch targets are 48 dp, radii grow card → sheet → island', () => {
    expect(Object.values(SPACE).every((v) => v % 4 === 0)).toBe(true);
    expect(TOUCH).toBe(48);
    expect(RADIUS.card < RADIUS.sheet && RADIUS.sheet < RADIUS.island).toBe(true);
  });
  it('eight subject tints; display type is the largest; the page transition is 240 ms', () => {
    expect(TINTS).toHaveLength(8);
    expect(Math.max(...Object.values(TYPE).map((t) => t.size))).toBe(TYPE.display.size);
    expect(MOTION.page.ms).toBe(240);
  });
});
