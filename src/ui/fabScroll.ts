/**
 * v0.8 U6: the + button never sits on what you are reading. While a page scrolls it slides down out of the way,
 * and 900 ms after the page comes to rest it comes back. At the bottom of a page the scroll padding
 * (`pageBottomPad`) already clears it. Plain listeners (no store write, so no page re-renders); the button
 * animates its own shared value.
 */
type Fn = (away: boolean) => void;
const subs = new Set<Fn>();
let back: ReturnType<typeof setTimeout> | null = null;
export const onFab = (f: Fn) => { subs.add(f); return () => { subs.delete(f); }; };
export function fabHide() { if (back) { clearTimeout(back); back = null; } subs.forEach((f) => f(true)); }
export function fabShowSoon() { if (back) clearTimeout(back); back = setTimeout(() => { back = null; subs.forEach((f) => f(false)); }, 900); }
/** The props a page's ScrollView spreads to take part. */
export const fabScrollProps = { onScrollBeginDrag: fabHide, onScrollEndDrag: fabShowSoon, onMomentumScrollEnd: fabShowSoon } as const;
