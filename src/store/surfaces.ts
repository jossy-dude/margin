import type { AgendaDoc } from '../domain/agenda';
import { agendaSig, buildAgenda, spentAlarms } from '../domain/agenda';
import { setAgenda } from '../services/native';
import { recordCrash } from '../services/problems';
import { getState, set } from './core';
import { db, R } from './persist';

/* ───── the agenda: what the widgets, the pinned class and the alarms read (v0.7) ─────
 *
 * The phone's half (`modules/margin-native`) runs without the app, so it cannot ask the store anything; the
 * store tells it instead. `pushAgenda` builds the document (`domain/agenda.ts`) and hands it over, and it is
 * called from the one place every change already passes through — the reminder rebuild — so a new class, a
 * cancelled one, a finished task or an edited alarm all reach the home screen without each action knowing
 * that widgets exist. An unchanged agenda is not sent twice. */
let lastSig = '';

export function pushAgenda(force = false): void {
  const s = getState();
  if (!s.ready) return;
  const now = Date.now();
  /* A one-off alarm that has rung is switched off, here, before the agenda is built from it. */
  const spent = db.demo ? null : spentAlarms(s.settings.alarms ?? [], now);
  if (spent) {
    set((x) => ({ settings: { ...x.settings, alarms: spent } }));
    try { void R().putSettings({ alarms: spent }).catch((e) => recordCrash(e, 'save', getState().route)); } catch { /* repository not open yet */ }
  }
  const st = getState();
  /* The sample semester is a playground: its classes never reach the home screen, and no alarm is armed from it. */
  const doc: AgendaDoc = db.demo
    ? { v: 1, at: now, h12: st.settings.hour12, pinClass: false, classes: [], tasks: [], alarms: [] }
    : buildAgenda({ now, courses: st.courses, meetings: st.meetings, variants: st.variants, attendance: st.attendance, dayMarks: st.dayMarks, tasks: st.tasks, settings: st.settings });
  const sig = agendaSig(doc);
  if (!force && sig === lastSig) return;
  lastSig = sig;
  setAgenda(JSON.stringify(doc));
}
