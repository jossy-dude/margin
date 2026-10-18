/** 45° hatch, clipped exactly, as geometry. */
export interface Seg { x1: number; y1: number; x2: number; y2: number }

/** Liang–Barsky: trim a segment to an axis-aligned box, or report that it misses. */
export function clipSeg(x1: number, y1: number, x2: number, y2: number, bx: number, by: number, bw: number, bh: number): Seg | null {
  const dx = x2 - x1, dy = y2 - y1;
  let t0 = 0, t1 = 1;
  const edges: [number, number][] = [[-dx, x1 - bx], [dx, bx + bw - x1], [-dy, y1 - by], [dy, by + bh - y1]];
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return null; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return { x1: x1 + t0 * dx, y1: y1 + t0 * dy, x2: x1 + t1 * dx, y2: y1 + t1 * dy };
}

/**
 * Diagonals at 45° inside a rect, one every `step` px.
 *
 * WHY GEOMETRY AND NOT `<Pattern>`: the cancelled-class hatch used to be `fill="url(#hat)"` with a
 * hardcoded id. Settings renders every bar kind LIVE in one sheet, so two copies of Bookshelf in one
 * tree means two elements named `hat` and whichever loses, loses — that is the documented
 * `SvgXml` id collision. A clip or a pattern is the only thing that needed the id,
 * and clipping the segments by hand removes the id, the collision and the dependence on
 * `patternTransform`, which `qa/EXPO_GO_AUDIT.md` B2 records as never reached on a real device.
 */
export function hatch(x: number, y: number, w: number, h: number, step = 5): Seg[] {
  const out: Seg[] = [];
  const s = step > 0 ? step : 5;
  for (let d = -h; d <= w; d += s) {
    const seg = clipSeg(x + d, y + h, x + d + h, y, x, y, w, h);
    if (seg && Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) > 1) out.push(seg);
  }
  return out;
}