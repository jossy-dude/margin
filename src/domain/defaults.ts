import type { NotifSettings, Settings, SoundGroup } from './types';

export const SOUND_GROUPS: { id: SoundGroup; label: string; hint: string }[] = [
  { id: 'paper', label: 'Paper', hint: 'page placing, swiping, crumpling' },
  { id: 'stamp', label: 'Attendance stamp', hint: 'marking a class' },
  { id: 'done', label: 'Task done', hint: 'pencil tick and chime' },
  { id: 'notify', label: 'Reminder chime', hint: 'in-app, while the app is open' },
  { id: 'toggle', label: 'Switches', hint: 'settings clicks' },
  { id: 'dial', label: 'Focus dial', hint: 'crunchy detents, start, stop' },
  { id: 'clock', label: 'Clock tick', hint: 'old-clock tik-tak while focusing' },
  { id: 'break', label: 'Break', hint: 'tape stick and peel' },
];

export const DEFAULT_NOTIF: NotifSettings = {
  enabled: true, classSoon: true, classLeadMin: 10, courseLead: {}, classEnded: true,
  taskReminders: true, startBy: true, examReminders: true, defaultTaskMinutes: [60],
  activeDays: [true, true, true, true, true, true, true], activeFrom: '07:00', activeTo: '22:00',
  quietEnabled: true, quietFrom: '22:00', quietTo: '07:00', weekend: 'normal', duringClass: 'defer',
  homeAt: '16:30', effortBuffer: 0.25,
  // D4/W5. ON is the platform default; OFF is a SECRET channel (text hidden until unlock).
  lockText: true,
};

export const DEFAULT_SETTINGS: Settings = {
  name: '', theme: 'auto', paper: 'dots', pen: 'warm', palette: 'refined', texture: 'grain',
  clock: 'rb', bar: 'glass', semesterStart: '2026-09-07',
  hour12: false,
  soundOn: true, soundVol: { paper: 0.8, stamp: 0.9, done: 0.9, notify: 0.9, toggle: 0.6, dial: 0.9, clock: 0.35, break: 0.8 },
  hapticsOn: true, tickOn: true, lockAttendance: false, reduceMotion: 'system',
  taskFilter: 'all', taskSort: 'due', seededAt: 0,
  breakMin: 5, breaksPerRound: 2, focusFlow: true, focusPresetMin: 25,
  notif: DEFAULT_NOTIF,
};

export const withDefaults = (s: Partial<Settings>): Settings => ({
  ...DEFAULT_SETTINGS, ...s,
  soundVol: { ...DEFAULT_SETTINGS.soundVol, ...(s.soundVol ?? {}) },
  notif: { ...DEFAULT_NOTIF, ...(s.notif ?? {}) },
});

/* ───── the onboarding tour ─────
 *
 * **A version stamp, not a boolean.** `Settings.onboarded` holds how many builds of the tour this
 * phone has finished, so "show me the tour again" is one write of `0` (Settings → Show the tour
 * again) and there is no second piece of state anywhere — no `onboardingVisible`, no modal, no
 * route. The gate in `App.tsx` is a single predicate: `!toured(settings.onboarded)`.
 *
 * `TOUR_VERSION` is bumped whenever the screen list in `ui/onboard/screens.ts` changes, and every
 * phone is shown the new tour exactly once more. Bump it when a screen is *added or reworded*; do
 * not bump it to nag anyone.
 *
 * **Why no default here.** `withDefaults` never sees the field, so on a fresh install
 * `settings.onboarded` is `undefined` — and `toured(undefined)` is `false`, which is exactly right.
 * That is also why this survives a cold start and a `withDefaults` round trip with no migration and
 * no entry in `DEFAULT_SETTINGS`: absent means "has not seen it". A default of `0` would be the
 * same answer, bought with a schema field that every existing settings row would be missing.
 */
export const TOUR_VERSION = 1;

/** Has this phone finished the current tour? `undefined` (a settings row written before the tour
 *  existed, or a fresh install) means no. */
export const toured = (seen: number | undefined): boolean => (seen ?? 0) >= TOUR_VERSION;
