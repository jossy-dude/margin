/**
 * v0.7.7.5 (SPEC §1 A): Daylight's contrast is tested on PIXELS. Each pane is composited over the darkest and the
 * lightest pixel of its baked sky (`assets/sky/stats.json`, written by `tools/sky.mjs` from the images themselves,
 * stars left out), and ink, ink2, ink3 and the accent must reach 4.5:1 on every one. The accent keeps 30° of hue
 * from the `now` amber, which means only "this is happening now".
 */
import stats from '../../assets/sky/stats.json';
import { DAY_ACCENT, DAY_INK, NOW, PANE_ALPHA, daylightSkin, type Scheme, type SkyKey } from '../tokens/skins/daylight';
import { makeTheme } from '../tokens/theme';

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = ([r, g, b]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!); };
const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (fg: number[], alpha: number, bg: number[]) => fg.map((v, i) => v * alpha + bg[i]! * (1 - alpha));
const hue = (h: string) => { const [r, g, b] = rgb(h).map((v) => v / 255) as [number, number, number]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0; const x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return (x * 60 + 360) % 360; };
const SKIES: SkyKey[] = ['dawn', 'morning', 'noon', 'afternoon', 'dusk', 'night'];
const S = stats as Record<Scheme, Record<SkyKey, { darkest: string; lightest: string; top: string }>>;

describe.each(['light', 'dark'] as const)('Daylight %s', (scheme) => {
  it.each(SKIES)('%s: ink, ink2, ink3 and the accent read at 4.5:1 on the pane over the sky\'s darkest and lightest pixel', (k) => {
    const pane = scheme === 'dark' ? [16, 20, 27] : [255, 255, 255], a = PANE_ALPHA[scheme][k];
    for (const px of [S[scheme][k].darkest, S[scheme][k].lightest]) {
      const bg = over(pane, a, rgb(px));
      for (const t of [DAY_INK[scheme].ink, DAY_INK[scheme].ink2, DAY_INK[scheme].ink3, DAY_ACCENT[scheme][k]]) {
        expect({ sky: k, px, t, ok: ratio(rgb(t), bg) >= 4.5 }).toEqual({ sky: k, px, t, ok: true });
      }
    }
  });
  it.each(SKIES)('%s: the accent is never amber — at least 30° of hue from now', (k) => {
    const d = Math.abs(hue(DAY_ACCENT[scheme][k]) - hue(NOW[scheme]));
    expect(Math.min(d, 360 - d)).toBeGreaterThanOrEqual(30);
  });
  it('the pane is see-through: never more than 0.84, and in dark mode under 0.6', () => {
    for (const k of SKIES) expect(PANE_ALPHA[scheme][k]).toBeLessThanOrEqual(scheme === 'dark' ? 0.6 : 0.84);
  });
  it('the deck is glass, never the inverted pale slab, and its ink reads on it', () => {
    const skin = daylightSkin(scheme, 'noon');
    expect(skin.ink.deck).toMatch(/^#[0-9A-F]{8}$/);
    if (scheme === 'dark') expect(skin.ink.deck).toBe('#FFFFFF1A');
    expect(lum(rgb(skin.ink.deckInk))).toBeGreaterThan(0.8);
  });
});

describe('Daylight on the theme', () => {
  it('uses the sky\'s accent, never the pen, and the sky\'s pane', () => {
    const t = makeTheme({ theme: 'light', palette: 'daylight', pen: 'warm' } as never, false, 'dusk');
    expect(t.c.acc).toBe(DAY_ACCENT.light.dusk);
    expect(t.c.card).toBe(daylightSkin('light', 'dusk').surface.fill);
    expect(t.skin?.instruments).toEqual({ clock: 'ring', bar: 'capsule', check: 'round', tag: 'capsule', field: 'box', addTile: 'pane', mascot: false });
  });
  it('sets every role in Hanken Grotesk, with no italic face', () => {
    const t = makeTheme({ theme: 'light', palette: 'daylight', pen: 'denim' } as never, false);
    for (const f of Object.values(t.type)) { expect(f.fam).toMatch(/^HankenGrotesk_/); expect(f.fam).not.toMatch(/Italic/); }
  });
  it('the sheet glass is 0.94 and the scrim is tinted, so the page behind a sheet cannot be read', () => {
    const s = daylightSkin('light', 'noon');
    expect(s.surface.fillStrong).toBe('#FFFFFFF0');
    expect(s.surface.scrim).toBe('#0A101C61');
  });
});
