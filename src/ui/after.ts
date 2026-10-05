/**
 * The follow-up a sheet owes you once it has finished closing.
 *
 * Every dismissal — hardware Back, the drag, the dim area, the ✕ — and every button that asks for
 * something afterwards go through the same `close()`, so this is the one place that can tell
 * "close, then do X" from "the user dismissed it". `ask()` with no argument *is* a dismissal, and it
 * cancels whatever a button queued a moment earlier.
 *
 * Why it exists: the focus buttons used to defer their navigation with an untracked `setTimeout`, so
 * dismissing the sheet inside that window still navigated to Focus and re-initialised the timer.
 */
export const afterClose = () => {
  let pending: (() => void) | null = null;
  return {
    /** Queue a follow-up for the close in progress. Anything that is not a function — a Pressable's
     *  gesture event, say — is a dismissal, not a callback. */
    ask(next?: unknown): void { pending = typeof next === 'function' ? (next as () => void) : null; },
    /** Run and clear whatever was queued. Returns whether anything ran. */
    run(): boolean {
      const a = pending;
      pending = null;
      if (!a) return false;
      a();
      return true;
    },
    get queued(): boolean { return pending !== null; },
  };
};