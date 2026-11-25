import React, { createContext, useContext, useDeferredValue, useEffect, useState } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import { makeTheme, palettes, type Theme } from '../tokens/theme';
import { useStore } from '../store/store';
import { setLook } from '../services/native';

/* v0.8 §2.1: one Theme object per skin × mode × pen, made once and kept, so switching back to a skin hands every
   leaf the SAME object (a memoised row with unchanged props does not re-render) and costs no allocation. */
const made = new Map<string, Theme>();
export function themeFor(s: Parameters<typeof makeTheme>[0], sys: boolean): Theme {
  const k = `${s.palette}|${s.theme === 'auto' ? (sys ? 'dark' : 'light') : s.theme}|${s.pen}`;
  let t = made.get(k);
  if (!t) { t = makeTheme(s, sys); made.set(k, t); }
  return t;
}

const Ctx = createContext<Theme>(makeTheme({ theme: 'light', palette: 'refined', pen: 'warm' }, false));
export const useTheme = () => useContext(Ctx);
/** A hidden page keeps the skin it was last seen in and takes the new one when it is shown (v0.7.6): a skin change
 *  re-skinned all five mounted pages at once, about 9 000 component renders, for pages nobody could see. */
export function ThemeHold({ on, children }: { on: boolean; children: React.ReactNode }) {
  const t = useContext(Ctx), [held, setHeld] = useState(t);
  if (on && held !== t) setHeld(t);
  return <Ctx.Provider value={on ? t : held}>{children}</Ctx.Provider>;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const sys = useColorScheme() === 'dark', theme = useStore((s) => s.settings.theme), palette = useStore((s) => s.settings.palette), pen = useStore((s) => s.settings.pen);
  const now = themeFor({ theme, palette, pen }, sys);
  /* The switch is a transition: the tap that chose the skin commits at once and the re-skin of the tree follows,
     interruptible, so a second tap during it is never dropped (P2: a 650 ms frame and a lost tap). */
  const t = useDeferredValue(now);
  /* The splash, the widget and the alarm page wear the skin too: its papers and inks go to the native side, read
     at the next launch (MainActivity) and on every widget redraw. */
  useEffect(() => {
    const p = palettes[palette] ?? palettes.collage;
    setLook({ mode: theme, palette, paperLight: p.light.paper, paperDark: p.dark.paper, cardLight: p.light.card.slice(0, 7), cardDark: p.dark.card.slice(0, 7),
      inkLight: p.light.ink, inkDark: p.dark.ink, mutLight: p.light.mut, mutDark: p.dark.mut, accLight: now.dark ? p.light.acc : now.c.acc, accDark: now.dark ? now.c.acc : p.dark.acc,
      deckLight: p.light.deck, deckDark: p.dark.deck, deckInkLight: p.light.deckInk, deckInkDark: p.dark.deckInk, look: now.look });
  }, [theme, palette, now]);
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
