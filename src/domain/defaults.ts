import type { NotifSettings, Settings, SoundGroup } from './types';

export const SOUND_GROUPS: { id: SoundGroup; label: string; hint: string }[] = [
  { id: 'taps', label: 'Taps', hint: 'page turns, swipes, switches, the focus dial and clock tick' },
  { id: 'marks', label: 'Marks', hint: 'attendance, deleting, peeling the break sticker' },
  { id: 'confirm', label: 'Confirmations', hint: 'task done, in-app reminder chime' },
  { id: 'focus', label: 'Focus', hint: 'focus start, round done, break' },
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
  soundOn: true, soundVol: { taps: 0.8, marks: 0.9, confirm: 0.9, focus: 0.9 },
  hapticsOn: true, tickOn: true, lockAttendance: false, reduceMotion: 'system', sky: 'live',
  taskFilter: 'open', taskSubject: '', taskSort: 'due', seededAt: 0,
  breakMin: 5, breaksPerRound: 2, focusFlow: true, focusPresetMin: 25,
  notif: DEFAULT_NOTIF,
};

/** v0.6 stored eight sliders (paper, stamp, done, dial, …); v0.7 has four. Each new slider takes the old one that
 *  covered most of its sounds, so a phone keeps its levels; the old keys are dropped on the next save. */
const OLD_SOUND: Record<SoundGroup, string> = { taps: 'paper', marks: 'stamp', confirm: 'done', focus: 'dial' };
function soundVolOf(v: Partial<Record<string, number>> | undefined): Record<SoundGroup, number> {
  const out = { ...DEFAULT_SETTINGS.soundVol };
  for (const g of Object.keys(out) as SoundGroup[]) {
    const n = v?.[g] ?? v?.[OLD_SOUND[g]];
    if (typeof n === 'number' && Number.isFinite(n)) out[g] = n;
  }
  return out;
}

export const withDefaults = (s: Partial<Settings>): Settings => ({
  ...DEFAULT_SETTINGS, ...s, ...lookUpgrade(s),
  /* BUGS #7: "All" is gone (done tasks are an archive, not a mode of the list). A stored 'all' reads as 'open';
     the KV row is rewritten on the next save, so no SQL migration. */
  taskFilter: (s.taskFilter as string) === 'done' ? 'done' : 'open',
  soundVol: soundVolOf(s.soundVol),
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
