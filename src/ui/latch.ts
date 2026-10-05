/** One-shot latch, so a submit pressed twice inside the sheet's 210 ms close animation runs its
 *  handler once. `Sheet.close()` guards the close animation the same way; this guards the write, and
 *  it covers every route into the handler — tap, `returnKeyType="done"`, a TalkBack double-activate —
 *  rather than only the button. The handler is taken at call time, so it never saves a stale draft. */
export const latch = () => {
  let fired = false;
  return (run: () => void): boolean => {
    if (fired) return false;
    fired = true;
    run();
    return true;
  };
};