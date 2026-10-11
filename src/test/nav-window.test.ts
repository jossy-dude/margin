import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The mount policy, as the files state it. `Book.tsx` used to render at most two pages — the current
 *  one and the one behind it, tracked with render-phase visit stamps — and that window is GONE: every
 *  route mounts on the first render and stays for the session. The window bought memory and lost the
 *  finger: a tab tap evicted the outgoing page, cold-mounted the incoming one (running the whole
 *  subtree's effects between the press and the first moving frame), and the pages that stayed mounted
 *  re-rendered anyway because they watched `s.route`. What bounds the off-screen cost now is GATING,
 *  not eviction — hidden pages answer `live=false` from the navigator context (`ui/live.ts`), tick at
 *  the slow cadence, and leave the DRAW tree in the same commit that unfocuses them (`display: 'none'`
 *  → `View.INVISIBLE`), because there is no placement left for the hide to wait behind. */
const book = readFileSync(join(__dirname, '..', 'navigation', 'Book.tsx'), 'utf8');
const win = readFileSync(join(__dirname, '..', 'navigation', 'window.ts'), 'utf8');
const today = readFileSync(join(__dirname, '..', 'screens', 'Today.tsx'), 'utf8');
const focus = readFileSync(join(__dirname, '..', 'screens', 'Focus.tsx'), 'utf8');
const charts = readFileSync(join(__dirname, '..', 'ui', 'charts.tsx'), 'utf8');
const tasks = readFileSync(join(__dirname, '..', 'screens', 'Tasks.tsx'), 'utf8');
const week = readFileSync(join(__dirname, '..', 'screens', 'Week.tsx'), 'utf8');

describe('book navigator mount policy', () => {
  it('every route mounts on the first render, and nothing ever evicts one', () => {
    expect(book).toContain('state.routes.map((r, i) => (<Placed key={r.key}');
    expect(book).not.toContain('inMountWindow'); // the window predicate is deleted, not bypassed
    expect(book).not.toContain('setVisited');
    expect(book).not.toContain('landed');
    expect(win).not.toContain('inMountWindow');
    expect(win).not.toContain('stamps'); // no visit bookkeeping left in the budget file either
  });
  it('exactly one page is focused, and focus travels as a plain boolean', () => {
    expect(book).toContain('on={i === state.index}');
    // no `instant` prop: with no drop there is nothing for a second prop to park
    expect(book).not.toContain('instant');
    expect(book).toContain('<ScreenLive.Provider value={on}>'); // focus travels as a plain boolean
  });
  it('a hidden page is inert to touch and to screen readers, and sits under the focused one', () => {
    expect(book).toContain("pointerEvents={i === state.index ? 'auto' : 'none'}");
    expect(book).toContain("importantForAccessibility={i === state.index ? 'yes' : 'no-hide-descendants'}");
    expect(book).toContain('zIndex: on ? 2 : 1');
  });
  it('a hidden page leaves the DRAW tree in the SAME commit that unfocuses it', () => {
    // "Mounted" is not "composited". Six always-mounted full-screen pages — each a base colour, a
    // pattern, a grain bitmap and a blended photograph — stacked under a moving one is ~20
    // full-screen fills per frame, which is the overdraw the cut exists to remove. `display:
    // 'none'` is `View.INVISIBLE` on Android: the renderer skips the subtree entirely, while the
    // mounted views and their measured layout all stay. The hide is NOT deferred: there is no
    // placement left to wait for, so `shown` and `setShown` are gone from the file entirely rather
    // than merely unused.
    expect(book).toContain("display: on ? 'flex' : 'none'");
    expect(book).not.toContain('setShown');
    expect(book).not.toContain('PLACE_MS');
    expect(book).not.toContain('setTimeout'); // no schedule: the cut has nothing to wait on
  });
  it('a hidden page ticks at the slow cadence, not the live one', () => {
    // To-do re-filters and re-groups its whole list off `now`; the week grid moves twice a minute.
    // Both pay that every 30 s while hidden today — for a page nobody can see.
    expect(tasks).toContain('const live = useScreenLive();');
    expect(tasks).toContain('useNow(live ? 30_000 : 60_000)');
    expect(week).toContain('live = useScreenLive()');
    expect(week).toContain('useNow(live ? 30_000 : 60_000)');
  });
  it('no screen re-renders on a tap: focus is the context, never a store-route subscription', () => {
    // The latency this replaced was threefold — cold mount, plus every mounted page re-rendering on
    // `s.route` before the first moving frame. With all six mounted, the subscription would be at its
    // worst, so the three screens that act on `live` read the navigator's context instead.
    for (const src of [today, focus, charts]) expect(src).not.toContain('useStore((s) => s.route)');
    expect(today).toContain('const focused = useScreenLive();');
    expect(focus).toContain('const focused = useScreenLive();');
    expect(charts).toContain('function useLive() { return useScreenLive(); }');
  });
});
