import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { STRIP_FADE, stripHasMore } from '../ui/fit';

const root = join(__dirname, '..');
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });
}
const srcFiles = walk(root);
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

/* The defect (BUG-026) was a *missing affordance*, not a broken layout: ten call sites were a bare
   `<ScrollView horizontal showsHorizontalScrollIndicator={false}>`. Turning the indicator off removes the
   only signal the platform gives away for free, so a chip row read as a hard clip — a chip sliced
   mid-glyph at the viewport edge with nothing to say there was more. On the Task sheet the kind and
   subject rows are the only way to pick either, so "there is more" had to be visible. */

describe('horizontal strips announce that they scroll (BUG-026)', () => {
  it('the predicate only claims there is more when there demonstrably is', () => {
    // The real To-do strip on the SM-A516N: ~379 dp of viewport, well over 500 dp of chips.
    expect(stripHasMore(600, 379, 0)).toBe(true);
    expect(stripHasMore(379, 379, 0)).toBe(false); // content exactly fills it — nothing hidden
    expect(stripHasMore(340, 379, 0)).toBe(false); // content fits — no fade, no phantom affordance
  });

  it('the fade disappears once the end is reached, so it cannot over-promise', () => {
    // End of scroll for a 600 dp content in a 379 dp strip is offset 221 (600 - 379). The predicate
    // stops one dp early, at 220, which is the slack: it treats "within a dp of the end" as arrived.
    expect(stripHasMore(600, 379, 219)).toBe(true); // 2 dp of content still hidden
    expect(stripHasMore(600, 379, 220)).toBe(false); // at the end: nothing more to see
    expect(stripHasMore(600, 379, 221)).toBe(false);
    expect(stripHasMore(600, 379, 240)).toBe(false); // and it stays off if it overscrolls
  });

  it('needs a real overflow before it claims there is more', () => {
    // The slack is deliberate: content and viewport widths arrive as floats, and a naive `>` makes the
    // fade blink on and off as a row reflows, which is what makes an affordance feel broken.
    expect(stripHasMore(379, 379, 0)).toBe(false); // exact fit
    expect(stripHasMore(379.4, 379, 0)).toBe(false); // 0.4 dp over: sub-pixel noise
    expect(stripHasMore(379, 379.4, 0)).toBe(false); // viewport measured 0.4 dp wider
    expect(stripHasMore(380, 379, 0)).toBe(false); // 1 dp over: still noise
    expect(stripHasMore(381, 379, 0)).toBe(true); // 2 dp over: a genuine second chip showing
  });

  it('no call site suppresses the scroll indicator on its own any more', () => {
    // The class-wide invariant: the offending prop may only appear inside HStrip itself.
    const offenders = srcFiles.filter((f) => f.endsWith('.tsx') && /showsHorizontalScrollIndicator=\{false\}/.test(readFileSync(f, 'utf8')) && !f.endsWith(join('ui', 'kit.tsx')));
    expect(offenders).toEqual([]);
  });

  it('every former site now goes through the one primitive', () => {
    const sites: [string, number][] = [
      ['screens/Stats.tsx', 2], ['screens/Today.tsx', 1], ['screens/Tasks.tsx', 1],
      ['screens/Grades.tsx', 1], ['sheets/forms.tsx', 2], ['sheets/WhenPicker.tsx', 2],
    ];
    for (const [file, n] of sites) expect([...read(file).matchAll(/<HStrip\b/g)]).toHaveLength(n);
    // The sixth reported clip was Today → Notes, whose row is the note cards rather than chips; it is
    // the Today.tsx site above, so every one of the six named places is covered by these nine strips.
    expect(sites.reduce((a, [, n]) => a + n, 0)).toBe(9);
  });

  it('each strip passes the paper colour behind it, so the fade blends instead of banding', () => {
    // The chips sit on c.paper on a page and inside a Card/Sheet on c.card. Fading to the wrong one
    // paints a visible rectangle over the row.
    for (const f of ['screens/Grades.tsx', 'sheets/forms.tsx', 'sheets/WhenPicker.tsx']) expect(read(f)).toContain('bg={c.card}');
    for (const f of ['screens/Stats.tsx']) expect(read(f)).toContain('bg={c.card}'); // rings + course chips are inside a Card
    expect(read('screens/Tasks.tsx')).toContain('<HStrip gap={8}>'); // on the page: the c.paper default
    expect(read('screens/Today.tsx')).toContain('<HStrip gap={12}'); // ditto
  });

  it('keeps keyboardShouldPersistTaps, which the sheet chip rows depend on', () => {
    // Without it a tap on a chip while the keyboard is up is swallowed by the dismiss, so the kind and
    // subject pickers would need two taps.
    expect(read('ui/kit.tsx')).toMatch(/keyboardShouldPersistTaps="handled"/);
  });

  it('Grades still scrolls its attendance grid to the newest cell', () => {
    // HStrip wraps the ScrollView, so the ref and the content-size callback have to survive the wrap:
    // the grid auto-scrolls to the end because the newest class is the one you mark.
    const g = read('screens/Grades.tsx');
    expect(g).toMatch(/<HStrip ref=\{gridRef\}/);
    expect(g).toMatch(/onContentSizeChange=\{toEnd\}/);
    expect(read('ui/kit.tsx')).toMatch(/onContentSizeChange\?\.\(w, h\)/); // …and is chained, not dropped
  });

  it('gives the trailing padding room to clear the fade', () => {
    expect(STRIP_FADE).toBeGreaterThan(0);
    expect(read('ui/kit.tsx')).toMatch(/paddingRight: more \? STRIP_FADE : 4/);
  });
});