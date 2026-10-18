/**
 * The app's ORIGINAL day bars, as data — reduced to Sight glass, the one variant that ships.
 *
 * They live in their own module, not in `DayBar.tsx`, for one reason: this file has no React in it,
 * so a plain node test can assert what they are without pulling `react-native-reanimated` into a jest
 * environment that cannot load its native packager. `DayBar.tsx` re-exports both, so
 * `src/screens/Today.tsx` and `src/sheets/Settings.tsx` keep importing them from exactly where they
 * did before and neither file changes.
 *
 * Why ONE is kept rather than none: `glass` measures the whole day — how much of the school day is
 * gone — which no instrument does; an instrument counts the CURRENT class. `glass` is also the
 * fallback for any unrecognised id: `DayBar` routes every non-instrument id to it, so a saved
 * setting from an older or newer build can never render an empty strip.
 */
export const BAR_KINDS = [
  { id: 'glass', n: 'Sight glass', d: 'the whole day as a filling tube' },
] as const;

export type BarKind = (typeof BAR_KINDS)[number]['id'];

export const isBarKind = (id: string): id is BarKind => (BAR_KINDS as readonly { id: string }[]).some((b) => b.id === id);
