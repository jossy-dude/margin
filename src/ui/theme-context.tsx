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
/** Re-render every `ms` (default 1 s), aligned to the wall clock: the first fire lands on the next
 * multiple of `ms` since the epoch, so minute-granular text flips the moment the clock does instead
 * of drifting up to `ms` behind an interval that started at mount time. */
export function useNow(ms = 1000) {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => {
    let i: ReturnType<typeof setTimeout>;
    const tick = () => { setN(Date.now()); i = setTimeout(tick, ms - (Date.now() % ms)); };
    i = setTimeout(tick, ms - (Date.now() % ms));
    return () => clearTimeout(i);
  }, [ms]);
  return n;
}
