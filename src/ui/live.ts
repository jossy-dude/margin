import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';

/** Is this page the one under your finger right now?
 *
 *  Every route stays mounted for the whole session. The navigator owns the focus and hands each page a
 *  small store (`LiveSource`), never a changing context value: v0.7.6 measured that a plain boolean in the
 *  context re-rendered the WHOLE page on every switch, both the one arriving and the one leaving (Stats:
 *  3 235 components, Grades and Today alike, about 100 ms of JS per tap in Node and several times that on
 *  the phone). Now a flip re-renders only the leaves that read `useScreenLive()` (a face, a chart's entrance)
 *  and a page clock (`useLiveNow`) that crossed into a new minute.
 *
 *  Default `false`, because tests and previews render a screen standalone: off-screen is the honest
 *  answer until a navigator says otherwise. A plain boolean is still accepted as the context value
 *  (tests, previews). */
export type LiveSource = { get: () => boolean; sub: (f: () => void) => () => void; set: (on: boolean) => void };
export function liveSource(on: boolean): LiveSource {
  let v = on; const ls = new Set<() => void>();
  return { get: () => v, sub: (f) => { ls.add(f); return () => { ls.delete(f); }; }, set: (n) => { if (n === v) return; v = n; for (const f of [...ls]) f(); } };
}
const fixed = (v: boolean): LiveSource => ({ get: () => v, sub: () => () => undefined, set: () => undefined });
const ON = fixed(true), OFF = fixed(false);
export const ScreenLive = createContext<LiveSource | boolean>(false);
const useSource = (): LiveSource => { const v = useContext(ScreenLive); return typeof v === 'boolean' ? (v ? ON : OFF) : v; };
/** The screen's own focus flag — never `useStore(s.route)`. Re-renders only the component that calls it. */
export const useScreenLive = () => { const s = useSource(); return useSyncExternalStore(s.sub, s.get, s.get); };

/** The page clock: the time, ticking every `liveMs` while the page is up and every `idleMs` while hidden
 *  (0 = frozen). Reading it does NOT re-render the page when focus flips; a flip only re-arms the timer,
 *  and the page re-renders only when the clock has moved into a new `liveMs` step since it last drew. */
export function useLiveNow(liveMs: number, idleMs = 0) {
  const src = useSource();
  const [n, setN] = useState(() => Date.now());
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      if (t) clearTimeout(t);
      const ms = src.get() ? liveMs : idleMs;
      if (ms <= 0) return;
      const tick = () => { const now = Date.now(); setN((p) => (Math.floor(p / ms) === Math.floor(now / ms) ? p : now)); t = setTimeout(tick, ms - (Date.now() % ms)); };
      t = setTimeout(tick, 0);
    };
    arm();
    const un = src.sub(arm);
    return () => { if (t) clearTimeout(t); un(); };
  }, [src, liveMs, idleMs]);
  return n;
}
