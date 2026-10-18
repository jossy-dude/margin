import { createContext, useContext } from 'react';

/** Is this page the one under your finger right now?
 *
 *  Every route stays mounted for the whole session, so "is my page the current one" can no longer be a
 *  `useStore((s) => s.route)` subscription: six pages watching one atom means every tap re-renders six
 *  screens before the first moving frame — the exact cold-mount latency the always-mounted window
 *  exists to kill, paid on the other side. The navigator knows the truth (it owns the focus), hands it
 *  down as a plain boolean, and only the screens that *do* something with `live` (today's page picture,
 *  the focus timer's tick rate, a chart container's entrance) read it — a tap then re-renders the
 *  shell and the two screens whose focus actually flipped, not every page in the app.
 *
 *  Default `false`, because tests and previews render a screen standalone: off-screen is the honest
 *  answer until a navigator says otherwise, and it is the state that must tick at the slow cadence. */
export const ScreenLive = createContext(false);
/** The screen's own focus flag — never `useStore(s.route)`: see `ScreenLive`. */
export const useScreenLive = () => useContext(ScreenLive);
