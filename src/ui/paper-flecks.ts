/* The paper's texture is drawn, not photographed: one seeded tile of flecks and short fibres, repeated
   as an SVG pattern. No bitmap is decoded, so there is nothing to fade in and nothing to tile by hand. */
export const TILE = 132;
export interface Fleck { x: number; y: number; r: number; o: number; lit: boolean }
export interface Fibre { d: string; o: number; lit: boolean }
export function paperFlecks(seed = 0x9e3779b9): { dots: Fleck[]; fibres: Fibre[] } {
  let a = seed;
  const r = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const n1 = (v: number) => +v.toFixed(1);
  const dots = Array.from({ length: 58 }, () => ({ x: n1(r() * TILE), y: n1(r() * TILE), r: n1(0.3 + r() * 0.5), o: +(0.3 + r() * 0.7).toFixed(2), lit: r() < 0.3 }));
  /* Fibres stay inside the tile so none is cut at a seam. */
  const fibres = Array.from({ length: 11 }, () => {
    const x = 10 + r() * (TILE - 20), y = 10 + r() * (TILE - 20), len = 4 + r() * 6, ang = r() * Math.PI, dx = Math.cos(ang) * len, dy = Math.sin(ang) * len, bend = (r() - 0.5) * 3;
    return { d: `M${n1(x)} ${n1(y)}q${n1(dx / 2 + bend)} ${n1(dy / 2 - bend)} ${n1(dx)} ${n1(dy)}`, o: +(0.3 + r() * 0.5).toFixed(2), lit: r() < 0.3 };
  });
  return { dots, fibres };
}
export const FLECKS = paperFlecks();

/** A stored texture from before the drawn one ('crumple', 'photo') reads as grain. */
export const grainOn = (tex: string) => (tex === 'none' ? 0 : 1);
