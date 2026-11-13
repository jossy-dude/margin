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
  pinClass: true,
};

/** The default look's generation; see `lookUpgrade` below. Declared before the defaults that read it. */
export const LOOK_V = 2;
export const DEFAULT_SETTINGS: Settings = {
  name: '', theme: 'light', paper: 'ruled', pen: 'warm', palette: 'refined', texture: 'grain', lookV: LOOK_V,
  clock: 'field', bar: 'glass', semesterStart: '2026-09-07', semesterEnd: '',
  hour12: false,
  soundOn: true, soundVol: { paper: 0.8, stamp: 0.9, done: 0.9, notify: 0.9, toggle: 0.6, dial: 0.9, clock: 0.35, break: 0.8 },
  hapticsOn: true, tickOn: true, lockAttendance: false, reduceMotion: 'system', sky: 'live',
  taskFilter: 'open', taskSubject: '', taskSort: 'due', seededAt: 0,
  breakMin: 5, breaksPerRound: 2, focusFlow: true, focusPresetMin: 25,
  notif: DEFAULT_NOTIF,
};

export const withDefaults = (s: Partial<Settings>): Settings => ({
  ...DEFAULT_SETTINGS, ...s, ...lookUpgrade(s),
  /* BUGS #7: "All" is gone (done tasks are an archive, not a mode of the list). A stored 'all' reads as 'open';
     the KV row is rewritten on the next save, so no SQL migration. */
  taskFilter: (s.taskFilter as string) === 'done' ? 'done' : 'open',
  soundVol: { ...DEFAULT_SETTINGS.soundVol, ...(s.soundVol ?? {}) },
  notif: { ...DEFAULT_NOTIF, ...(s.notif ?? {}) },
});

/**
 * The collage look replaces the notebook as the default, and a phone that already has a settings row holds
 * the OLD defaults explicitly (`palette: 'refined'`, `texture: 'grain'`, …) — merging new defaults under it
 * would change nothing. So a row that predates the collage (`lookV` absent) is moved over once: palette and
 * texture to the collage's, the pen to denim if it was still the old default, the paper to plain if it was
 * still the old dots. A choice made after that (`lookV` present) is never touched again, and the old
 * palettes, pens and textures all stay selectable in Settings.
 */
function lookUpgrade(s: Partial<Settings>): Partial<Settings> {
  if ((s.lookV ?? 0) >= LOOK_V || (s.palette === undefined && s.texture === undefined)) return {};
  return { palette: 'collage', texture: 'grain', pen: !s.pen || s.pen === 'warm' ? 'denim' : s.pen, paper: !s.paper || s.paper === 'dots' ? 'plain' : s.paper, lookV: LOOK_V };
}

/* ───── the onboarding tour ─────
 *
 * **A version stamp, not a boolean.** `Settings.onboarded` holds how many builds of the tour this
 * phone has finished, so "show me the tour again" is one write of `0` (Settings → Show the tour
 * again) and there is no second piece of state anywhere — no `onboardingVisible`, no modal, no
 * route. The gate in `App.tsx` is a single predicate: `!toured(settings.onboarded)`.
 *
 * `TOUR_VERSION` is bumped whenever the onboarding's pages (`src/onboarding/`) change, and every
 * phone is shown the new tour exactly once more. Bump it when a screen is *added or reworded*; do
 * not bump it to nag anyone.
 *
 * **Why no default here.** `withDefaults` never sees the field, so on a fresh install
 * `settings.onboarded` is `undefined` — and `toured(undefined)` is `false`, which is exactly right.
 * That is also why this survives a cold start and a `withDefaults` round trip with no migration and
 * no entry in `DEFAULT_SETTINGS`: absent means "has not seen it". A default of `0` would be the
 * same answer, bought with a schema field that every existing settings row would be missing.
 */
/* 2 = the five-page onboarding with Scrap (the collage look). It replaced the ten-step coach tour, so
   every phone that finished build 1 is shown it once more. */
export const TOUR_VERSION = 2;

/** Has this phone finished the current tour? `undefined` (a settings row written before the tour
 *  existed, or a fresh install) means no. */
export const toured = (seen: number | undefined): boolean => (seen ?? 0) >= TOUR_VERSION;
