/**
 * Keeps the lock-screen focus countdown (domain/focusLive.ts) in step with the timer: posted when a round or a
 * break starts or resumes, taken down when it pauses, ends or stops. The system draws the seconds; this only runs
 * when the timer's state changes.
 */
import { getState, subscribe } from './core';
import { hideLive, showLive } from '../services/native';
import { focusLive } from '../domain/focusLive';

export function startFocusLive(): () => void {
  let shown: string | null = null, last = '';
  const sync = () => {
    const s = getState(), t = s.timer;
    const sig = `${t.phase}|${t.running}|${t.checkpoint}|${t.breaksUsed}|${t.rounds}`;
    if (sig === last) return;
    last = sig;
    const subject = s.courses.find((c) => c.id === t.courseId)?.name ?? null;
    const live = focusLive(t, Date.now(), subject, s.settings.hour12);
    if (shown && shown !== live?.id) { hideLive(shown); shown = null; }
    if (live && showLive(live.id, live.title, live.text, live.endAt, 'marrow://focus')) shown = live.id;
  };
  sync();
  const off = subscribe(sync);
  return () => { off(); if (shown) hideLive(shown); };
}
