/**
 * Every row of Settings, findable (PLAN R8, DESIGN D-18): what it is called, the page path that shows it
 * (`settingsPath`, as `act.openSettingsPath` takes it), the settings keys it edits, and other words people use for it.
 * The search in Settings reads this; `settings-index.test.ts` walks it against the v0.6 baseline (every row and every
 * key still reachable) and against `Settings.tsx` (every label here is still drawn there). Pure data.
 */

/** The pages, as `Settings.tsx` titles them. */
export const PAGES: Record<string, string> = {
  appearance: 'Look & feel', theme: 'Theme & palette', paper: 'Paper & texture', bar: 'Progress bar', pen: 'Accent pen', notifications: 'Reminders',
  alarms: 'Alarms', widgets: 'Widgets', obsidian: 'Obsidian', ncls: 'Classes', ntask: 'Tasks & exams', nhours: 'Hours & quiet time',
  ncourse: 'Per-subject lead time', nstatus: 'Delivery status', sound: 'Sound & haptics', attendance: 'Attendance & semester', semesters: 'Semesters',
  focus: 'Focus & breaks', data: 'Data & export', import: 'Import', diagnostics: 'Diagnostics', tour: 'The introduction', about: 'About', reset: 'Reset',
};

export interface SettingsEntry {
  label: string;
  /** the settings path that shows it; [] = the first page */
  path: string[];
  /** the `Settings` keys it edits (`notif.x` for `Settings.notif.x`) */
  keys?: string[];
  /** other words for it, lower case */
  words?: string[];
}

const A = ['appearance'], N = ['notifications'], D = ['data'];
const e = (label: string, path: string[], keys?: string[], words?: string[]): SettingsEntry => ({ label, path, ...(keys ? { keys } : null), ...(words ? { words } : null) });

export const SETTINGS_INDEX: SettingsEntry[] = [
  /* the first page */
  e('What should the app call you?', [], ['name'], ['name', 'greeting']),
  e('Look & feel', A, undefined, ['appearance', 'look']),
  e('Reminders', N, ['notif.enabled'], ['notifications', 'master switch']),
  e('Alarms', ['alarms'], ['alarms'], ['wake', 'alarm sound']),
  e('Widgets', ['widgets'], undefined, ['home screen']),
  e('Obsidian', ['obsidian'], ['vaultUri'], ['vault', 'sync', 'notes']),
  e('Sound & haptics', ['sound'], undefined, ['volume', 'vibration']),
  e('Attendance & semester', ['attendance'], ['semesterStart', 'semesterEnd'], ['term', 'semester dates', 'start of term', 'end of term']),
  e('Semesters', ['semesters'], undefined, ['past terms', 'archive']),
  e('Focus & breaks', ['focus'], undefined, ['pomodoro', 'timer']),
  e('Data & export', D, undefined, ['export', 'backup', 'xlsx', 'csv', 'json']),
  e('Diagnostics', ['diagnostics'], undefined, ['crash', 'face check', 'logs']),
  e('Show the introduction again', ['tour'], ['onboarded'], ['tour', 'onboarding', 'introduction']),
  e('About', ['about'], undefined, ['version', 'github', 'update']),
  e('Reset', ['reset'], undefined, ['erase', 'delete everything']),
  /* Look & feel */
  e('Theme & palette', [...A, 'theme'], ['theme', 'palette', 'reduceMotion'], ['dark', 'light', 'follow phone', 'motion', 'reduce motion', 'animations']),
  e('Paper & texture', [...A, 'paper'], ['paper', 'texture'], ['ruled', 'grid', 'dots', 'grain']),
  e('Progress bar', [...A, 'bar'], ['bar'], ['instrument', 'day bar']),
  e('Accent pen', [...A, 'pen'], ['pen'], ['colour', 'color', 'accent']),
  e('24-hour clock', A, ['hour12'], ['12-hour', 'am pm', 'time format']),
  /* Reminders */
  e('Classes', [...N, 'ncls'], undefined, ['class reminders']),
  e('Tasks & exams', [...N, 'ntask'], undefined, ['deadlines']),
  e('Hours & quiet time', [...N, 'nhours'], undefined, ['quiet', 'active hours']),
  e('Per-subject lead time', [...N, 'ncourse'], ['notif.courseLead'], ['subject', 'lead time']),
  e('Pin the class that is running', N, ['notif.pinClass'], ['ongoing', 'notification pin']),
  e('Show reminder text on the lock screen', N, ['notif.lockText'], ['privacy', 'lock screen']),
  e('Delivery status', [...N, 'nstatus'], undefined, ['log', 'test notification', 'not arriving']),
  e('Class starting soon', [...N, 'ncls'], ['notif.classSoon'], ['heads-up']),
  e('Lead time', [...N, 'ncls'], ['notif.classLeadMin'], ['minutes before class', 'heads-up']),
  e('Ask me when a class ends', [...N, 'ncls'], ['notif.classEnded'], ['attendance prompt', 'after class']),
  e('Task reminders', [...N, 'ntask'], ['notif.taskReminders'], ['homework']),
  e('Exam reminders', [...N, 'ntask'], ['notif.examReminders'], ['test']),
  e('Start-by nudges', [...N, 'ntask'], ['notif.startBy', 'notif.defaultTaskMinutes'], ['start by', 'nudge', 'how long a task takes']),
  e('Effort buffer', [...N, 'ntask'], ['notif.effortBuffer'], ['buffer']),
  e('“When I get home”', [...N, 'ntask'], ['notif.homeAt'], ['home', 'after school']),
  e('Active from', [...N, 'nhours'], ['notif.activeFrom', 'notif.activeDays', 'notif.weekend'], ['active days', 'weekend', 'morning']),
  e('Active until', [...N, 'nhours'], ['notif.activeTo'], ['evening']),
  e('Quiet hours', [...N, 'nhours'], ['notif.quietEnabled'], ['quiet', 'do not disturb', 'silent', 'night', 'sleep']),
  e('Quiet from', [...N, 'nhours'], ['notif.quietFrom'], ['quiet']),
  e('Quiet until', [...N, 'nhours'], ['notif.quietTo'], ['quiet']),
  e('Hold reminders until class ends', [...N, 'nhours'], ['notif.duringClass'], ['during class', 'in class']),
  e('Open phone settings', [...N, 'nstatus'], undefined, ['permission']),
  e('Allow notifications', [...N, 'nstatus'], undefined, ['permission']),
  e('Rebuild queue', [...N, 'nstatus'], undefined, ['reschedule']),
  e('Test in 10 s', [...N, 'nstatus'], undefined, ['test notification']),
  e('The next 14 days', [...N, 'nstatus'], undefined, ['planned', 'upcoming']),
  e('What actually arrived', [...N, 'nstatus'], undefined, ['log', 'history']),
  /* Sound & haptics */
  e('Sound', ['sound'], ['soundOn', 'soundVol'], ['volume', 'mute']),
  e('Haptics', ['sound'], ['hapticsOn'], ['vibration', 'vibrate']),
  e('Old-clock tick while focusing', ['sound'], ['tickOn'], ['tick', 'ticking']),
  e('Play', ['sound'], undefined, ['preview sound']),
  /* Attendance & semester */
  e('Lock attendance grid', ['attendance'], ['lockAttendance'], ['lock', 'attendance']),
  e('Add class', ['attendance'], undefined, ['timetable', 'new class']),
  e('Add subject', ['attendance'], undefined, ['course', 'new subject']),
  /* Focus & breaks */
  e('Break length', ['focus'], ['breakMin', 'breaksPerRound'], ['break', 'rest', 'breaks per round']),
  e('Flow mode by default', ['focus'], ['focusFlow'], ['flow', 'overrun']),
  /* Data & export */
  e('Save to folder…', D, undefined, ['export', 'file']),
  e('Share…', D, undefined, ['export', 'send']),
  e('Import', [...D, 'import'], undefined, ['restore', 'bring my data back', 'csv', 'timetable file']),
  e('Automatic backup', D, ['backupUri'], ['backup', 'weekly', 'folder']),
  e('Back up now', D, undefined, ['backup']),
  e('Turn off', D, ['backupUri'], ['backup off', 'stop backups']),
  e('Safety copies', D, undefined, ['undo', 'recover']),
  e('Share newest', D, undefined, ['safety copy']),
  /* The introduction */
  e('Show it now', ['tour'], ['onboarded'], ['tour']),
];

/** Settings keys that no row of Settings edits, and where they are changed instead (or why nobody does). */
export const ELSEWHERE: Record<string, string> = {
  clock: 'kept for the Focus clock face; v0.6 had no picker for it either',
  focusPresetMin: 'Focus page: the round length tabs',
  taskFilter: 'To-do page: Open / Done', taskSort: 'To-do page: sort', taskSubject: 'To-do page: subject filter',
  teacherAbsent: 'Grades page: the teacher\'s count per subject',
  reminders: 'reminder rules (R9); their page comes with D-19',
  sky: 'the sky behind the v0.7 pages; Still / Off arrive with the shared sky (U3)',
  moves: 'Week page: a class moved this week only',
  lookV: 'internal: which default look this row has been moved to', seededAt: 'internal: when the sample term was made',
  backupAt: 'internal: when the last automatic backup ran',
};

const fold = (s: string) => s.toLowerCase().replace(/[“”"…]/g, '').trim();
/** The rows that match `q`, best first: a label that starts with it, then a word of the label, then any other word,
 *  then the page it is on. Empty `q` finds nothing. */
export function searchSettings(q: string, limit = 8): SettingsEntry[] {
  const t = fold(q);
  if (t.length < 2) return [];
  const scored: [number, number, SettingsEntry][] = [];
  SETTINGS_INDEX.forEach((x, i) => {
    const l = fold(x.label), page = fold(PAGES[x.path[x.path.length - 1] ?? ''] ?? '');
    const s = l.startsWith(t) ? 0 : l.split(/[^a-z0-9-]+/).some((w) => w.startsWith(t)) ? 1 : l.includes(t) ? 2
      : (x.words ?? []).some((w) => w.startsWith(t) || w.split(' ').some((p) => p.startsWith(t))) ? 3 : page.includes(t) ? 4 : -1;
    if (s >= 0) scored.push([s, i, x]);
  });
  return scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, limit).map((x) => x[2]);
}

/** Where a row is, in words: "Reminders › Hours & quiet time". */
export const crumbs = (x: SettingsEntry) => (x.path.length ? x.path.map((p) => PAGES[p] ?? p).join(' › ') : 'Settings');
