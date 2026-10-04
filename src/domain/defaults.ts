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
};

export const DEFAULT_SETTINGS: Settings = {
  name: 'Jossy', theme: 'auto', paper: 'dots', pen: 'warm', palette: 'refined', texture: 'grain',
  clock: 'rb', bar: 'spines', semesterStart: '2026-09-07',
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
