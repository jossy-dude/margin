/**
 * The app's ORIGINAL four day bars, as data.
 *
 * They live in their own module, not in `DayBar.tsx`, for one reason: this file has no React in it,
 * so a plain node test can assert what they are without pulling `react-native-reanimated` into a jest
 * environment that cannot load its native packager. `DayBar.tsx` re-exports both, so
 * `src/screens/Today.tsx` and `src/sheets/Settings.tsx` keep importing them from exactly where they
 * did before and neither file changes.
 *
 * Why they are KEPT rather than replaced: each answers a question the twenty-two instruments do not.
 * `spines` is what the whole day looks like, `glass` how much of the school day is gone, `trace` the
 * rhythm of it, `ticker` how long until the next thing. An instrument counts the CURRENT class; none
 * of these four do. `spines` is also the fallback for an unrecognised id, so an id from an older or
 * newer build can never render an empty strip.
 */
export const BAR_KINDS = [
  { id: 'spines', n: 'Bookshelf', d: 'one spine per class, the current one fills' },
  { id: 'glass', n: 'Sight glass', d: 'the whole day as a filling tube' },
  { id: 'trace', n: 'Trace', d: 'a pen line drawn through your classes' },
  { id: 'ticker', n: 'Ticker', d: 'a countdown to the next class' },
] as const;

export type BarKind = (typeof BAR_KINDS)[number]['id'];

export const isBarKind = (id: string): id is BarKind => (BAR_KINDS as readonly { id: string }[]).some((b) => b.id === id);