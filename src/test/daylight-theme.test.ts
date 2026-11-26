/** Daylight across the whole app (v0.7): the palette, the glass cards, the sky behind every page. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTheme, palettes } from '../tokens/theme';
import { SKY } from '../tokens/v2';

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const alpha = (h: string) => (h.length === 9 ? parseInt(h.slice(7, 9), 16) / 255 : 1);
/** A glass colour laid over a sky colour, as the eye sees it. */
const over = (top: string, under: string) => {
  const a = alpha(top), t = rgb(top), u = rgb(under);
  return `#${t.map((v, i) => Math.round(v * a + u[i]! * (1 - a)).toString(16).padStart(2, '0')).join('')}`;
};
const lum = (h: string) => { const f = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); const [r, g, b] = rgb(h).map((v) => f(v / 255)); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
const cr = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

describe('the Daylight palette', () => {
  it('is its own palette, not Plain borrowed', () => {
    expect(palettes.daylight).not.toBe(palettes.plain);
    const t = makeTheme({ theme: 'light', palette: 'daylight', pen: 'denim' }, false);
    expect(t.sky).toBe(true);
    expect(t.look).toBe('plain');
    expect(makeTheme({ theme: 'light', palette: 'plain', pen: 'denim' }, false).sky).toBe(false);
  });

  /* Every sky stop of the theme, top and bottom, is a ground the glass can sit on. */
  for (const mode of ['light', 'dark'] as const) {
    const c = palettes.daylight[mode], grounds = Object.values(SKY[mode]).flat();
    it(`${mode}: ink, mut and the status inks clear 4.5:1 on a glass card over every sky`, () => {
      for (const g of grounds) {
        const card = over(c.card, g);
        for (const fg of [c.ink, c.mut, c.ok, c.warn, c.bad]) expect(cr(fg, card)).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${mode}: the deck, the slab and a filled button keep their pairs`, () => {
      for (const [fg, bg] of [[c.deckInk, c.deck], [c.deckMut, c.deck], [c.slabInk, c.slab], [c.slabMut, c.slab]] as const) expect(cr(fg, bg)).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('Daylight reaches every screen', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', ...p.split('/')), 'utf8');
  it('PaperBg draws the sky for pages and strong glass for sheets', () => {
    const s = src('ui/PaperBg.tsx');
    expect(s).toContain("if (skin.ground.kind === 'sky') return <DayGround"); // v0.7.7.6: the skin's ground says so
    expect(s).toContain('<Sky mode={mode} scheme={scheme} />');
    expect(s).toContain('backgroundColor: skin.surface.fillStrong'); // v0.7.7.6: the skin's strong glass (0.94)
  });
  it('HandBox draws a lit glass card: a brighter top rim, a lift only where the caller asks (v0.7.6.3, v0.7.7.3)', () => {
    const k = src('ui/kit.tsx');
    /* v0.7.7.3 (SPEC §2 E2): no measuring to decide the lift — a glass card renders once, edge on the first frame */
    expect(k).toContain('const lift = !!lifted && shadow && !bare && !mark');
    const glass = k.slice(k.indexOf('if (sky) {'), k.indexOf('return (', k.indexOf('if (sky) {') + 400));
    expect(glass).not.toContain('onLayout');
    expect(k).toContain('borderTopColor: mark || bare ? ring :');
  });
  it('the navigator is transparent, so the sky behind it shows (v0.7.6.3)', () => {
    expect(src('navigation/Book.tsx')).not.toContain('backgroundColor: c.paper');
  });
  it('the nav becomes the glass island', () => {
    expect(src('navigation/Book.tsx')).toContain("glass ? { borderRadius: 28");
  });
});
