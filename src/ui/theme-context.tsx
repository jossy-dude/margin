import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import { makeTheme, type Theme } from '../tokens/theme';
import { useStore } from '../store/store';

const Ctx = createContext<Theme>(makeTheme({ theme: 'light', palette: 'refined', pen: 'warm' }, false));
export const useTheme = () => useContext(Ctx);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const sys = useColorScheme() === 'dark', theme = useStore((s) => s.settings.theme), palette = useStore((s) => s.settings.palette), pen = useStore((s) => s.settings.pen);
  const t = useMemo(() => makeTheme({ theme, palette, pen }, sys), [theme, palette, pen, sys]);
  return <Ctx.Provider value={t}>{children}</Ctx.Provider>;
}
/** The OS "remove animations" switch combined with the in-app override. */
export function useReduceMotion(): boolean {
  const pref = useStore((s) => s.settings.reduceMotion);
  const [os, setOs] = useState(false);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setOs).catch(() => undefined); const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOs); return () => sub.remove(); }, []);
  return pref === 'on' ? true : pref === 'off' ? false : os;
}
/** Re-render every `ms` (default 1 s), aligned to the wall clock. The first fire is immediate on mount
 * and whenever `ms` changes — so a Focus screen coming back to the foreground with a round running
 * shows true time at once instead of up to `ms` of stale time — and every fire after that lands on the
 * next multiple of `ms` since the epoch, so minute-granular text flips the moment the clock does.
 *
 * `ms = 0` means FROZEN: no timer is armed at all, and the hook returns the time it mounted with. A
 * page nobody can see has no reason to re-render every minute (audit M5: the five hidden pages were
 * re-rendering ~600 text nodes, 119 grid cells and 37 task cards per minute between them), and a
 * frozen clock is exact where a slower cadence is only a smaller lie. The effect re-runs on an `ms`
 * change and its first fire is `setTimeout(tick, 0)`, so a page becoming live gets true time in that
 * same effect — it is never left showing the moment it was hidden. */
export function useNow(ms = 1000) {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => {
    if (ms <= 0) return; // frozen: nothing is scheduled, so a hidden page costs no timer and no re-render
    let i: ReturnType<typeof setTimeout>;
    const tick = () => { setN(Date.now()); i = setTimeout(tick, ms - (Date.now() % ms)); };
    i = setTimeout(tick, 0); // async, so the re-align is not a setState *in* the effect (lint) nor a cascade
    return () => clearTimeout(i);
  }, [ms]);
  return n;
}
