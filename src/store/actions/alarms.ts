import type { AlarmRule } from '../../domain/types';
import { nextClockTime } from '../../domain/agenda';
import { getState } from '../core';
import { resync } from '../reminders';
import { setSettings } from './entities';

/* ───── alarms (v0.7) ─────
 * The rules live in the settings row; every write goes through `setSettings` (optimistic, reverted if the
 * database refuses) and then the rebuild, which is what hands the new rules to the phone. */
const write = (alarms: AlarmRule[]) => { setSettings({ alarms }); resync(150); };
/** A clock alarm with no weekday chosen rings once: its moment is fixed when it is saved or switched on. */
const stamped = (r: AlarmRule): AlarmRule => (r.kind === 'clock' && !r.days.some(Boolean) ? { ...r, once: nextClockTime(r.h, r.m, Date.now()) } : r);

export const alarmActions = {
  saveAlarm(rule: AlarmRule) {
    const all = getState().settings.alarms ?? [], next = stamped(rule);
    write(all.some((a) => a.id === rule.id) ? all.map((a) => (a.id === rule.id ? next : a)) : [...all, next]);
  },
  toggleAlarm(id: string, on: boolean) {
    write((getState().settings.alarms ?? []).map((a) => (a.id === id ? stamped({ ...a, on }) : a)));
  },
  removeAlarm(id: string) {
    write((getState().settings.alarms ?? []).filter((a) => a.id !== id));
  },
};
