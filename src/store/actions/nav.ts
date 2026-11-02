import { fx } from '../../services/fx';
import { getState, set, type RouteName, type SheetSpec } from '../core';

export function go(route: RouteName) { const st = getState(); if (route === st.route) return; set({ prevRoute: st.route, route }); fx.page(); }

export const navActions = {
  go,
  open(sheet: SheetSpec) { fx.tap(); set({ sheet }); },
  /** Open the Settings sheet and land on a page inside it in ONE write, with ONE haptic.
   *
   *  The Settings tree is a stack, so a deep entry has always been expressible as two calls —
   *  `open({ t: 'settings' })` then `settingsPush('clock')` — but each is its own `set()`, and a
   *  `set()` is a synchronous broadcast to every `useStore` subscriber in the app plus its own sound.
   *  Two chained calls therefore cost two full broadcasts and two haptics on one tap: the clock face
   *  on Today does exactly this to reach Clock face, which is the press users report as "very
   *  slow and low response" between the finger-down and the sheet appearing.
   *
   *  React batches the *renders* these two writes cause, so the visible symptom was never a wrong
   *  screen — it was the delay before any frame: the store work in the same tick the press has to
   *  answer. One write does the same job with half the work, and the page it lands on is already the
   *  one the user tapped for, so there is no second hop to watch. */
  openSettingsAt(page: string) { fx.tap(); set({ sheet: { t: 'settings' }, settingsPath: ['appearance', page] }); },
  close() { set({ sheet: null }); },
  /** Open Settings straight onto a page, with the real path behind it so Back walks out of it. */
  openSettingsPath(path: string[]) { fx.tap(); set({ sheet: { t: 'settings' }, settingsPath: path }); },
  settingsPush(p: string) { fx.select(); set((s) => ({ settingsPath: [...s.settingsPath, p] })); },
  settingsPop() { set((s) => ({ settingsPath: s.settingsPath.slice(0, -1) })); },
};
