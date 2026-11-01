import { getState, set } from './core';

let toastTimer: ReturnType<typeof setTimeout> | null = null;
/** One line at the bottom of the screen: 2.6 s, or 6 s when it carries an undo. A newer toast replaces
 *  the older one and runs its own clock. */
export function toast(text: string, undo?: () => void) {
  if (toastTimer) clearTimeout(toastTimer);
  const id = Date.now(); set({ toast: { id, text, ...(undo ? { undo } : {}) } });
  toastTimer = setTimeout(() => { if (getState().toast?.id === id) set({ toast: null }); }, undo ? 6000 : 2600);
}
export const dismissToast = () => set({ toast: null });
