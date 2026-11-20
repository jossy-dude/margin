/**
 * Work that must not compete with the first frame or a tap (v0.8 §2.3). React Native 0.88 has no
 * InteractionManager; `requestIdleCallback` runs when the JS thread has a gap, with a deadline so it is never
 * starved. Off a runtime that has neither, a plain timeout. Returns a cancel function.
 */
type Idle = (cb: () => void, o?: { timeout: number }) => number;
export function whenIdle(fn: () => void, timeoutMs = 1500): () => void {
  const g = globalThis as unknown as { requestIdleCallback?: Idle; cancelIdleCallback?: (h: number) => void };
  if (typeof g.requestIdleCallback === 'function') { const h = g.requestIdleCallback(fn, { timeout: timeoutMs }); return () => g.cancelIdleCallback?.(h); }
  const t = setTimeout(fn, Math.min(timeoutMs, 300)); return () => clearTimeout(t);
}
