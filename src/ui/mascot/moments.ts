/**
 * Face moments: the one place that decides which face shows where and how it reacts (DESIGN.md D-21 "Used for"),
 * so no screen invents its own. A screen does one of four things:
 *
 *   pageFace('Tasks', { hour, dueToday, open })      the face a page's top bar rests on
 *   const { face, play } = useFaceMoment(rest, live)  be that face: <Face {...face} size={28} awake={live} />
 *   faceEvent('taskDone')                             tell the live page's face something happened
 *   emptyFace('tasksAllClear')                        the face of a page-wide empty state (or null: words only)
 *
 * The one-face rule (restraint is part of the contract):
 *   · a page shows ONE face. It is the top bar's (28 dp), except where the page has its own bigger face: Focus
 *     (72 dp) and a page-wide empty state (64 dp). Then the top bar shows none.
 *   · an empty card on a page that has other content is one line of words, no face: the top bar speaks for the page.
 *   · sheets carry no face, except About (one) and onboarding (one, 160 dp).
 *   · a snackbar shows a 20 dp face only for an outcome (saved / failed), never for a notice or an undo.
 *   · only the page under your finger listens: pass `live` (`useScreenLive()`), because every route stays mounted.
 *
 * A reaction is a face plus at most one motion: a bounce for good news, a droop for bad. It holds for `holdMs`, then
 * the face goes back to its rest (0 = it stays until the next reaction or `clear()`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FaceMotion, FaceName } from './faces';

export interface Moment { face: FaceName; motion?: FaceMotion; slowBlink?: boolean; holdMs: number }
/** How long a reaction keeps its face: the motion, then a beat to be seen; LINGER for news worth reading twice. */
const HOLD = 2400, LINGER = 4000, STAY = 0;

/** Things that happen, and the face's answer. Each one has a trigger site in the mascot INTEGRATE.md. */
export const MOMENTS = {
  /* To-do */
  taskDone: { face: 'happy', motion: 'bounce', holdMs: HOLD },
  taskArrived: { face: 'surprised', holdMs: HOLD }, // a new task came in from Obsidian
  /* attendance */
  markedPresent: { face: 'happy', motion: 'bounce', holdMs: HOLD },
  markedAbsent: { face: 'sad', motion: 'droop', holdMs: HOLD },
  weekAttended: { face: 'blush', motion: 'bounce', holdMs: LINGER }, // every class of the week marked present
  /* grades: a saved mark lands the course on or under its goal */
  gradeAtGoal: { face: 'smug', motion: 'bounce', holdMs: LINGER },
  gradeBelowGoal: { face: 'sad', motion: 'droop', holdMs: LINGER },
  /* Focus */
  focusStart: { face: 'content', slowBlink: true, holdMs: STAY },
  focusEnd: { face: 'laugh', motion: 'bounce', holdMs: LINGER },
  /* snackbars (SNACK below) */
  saved: { face: 'happy', motion: 'bounce', holdMs: HOLD },
  saveFailed: { face: 'sad', motion: 'droop', holdMs: LINGER },
  /* the full-screen alarm (native: static faces, see INTEGRATE.md) */
  alarmRinging: { face: 'sleepy', holdMs: STAY },
  alarmDismissed: { face: 'happy', motion: 'bounce', holdMs: HOLD },
  /* onboarding and About */
  hello: { face: 'wink', holdMs: HOLD },
  nameTyped: { face: 'blush', holdMs: STAY },
  importPreview: { face: 'surprised', holdMs: STAY },
  remindersOn: { face: 'happy', motion: 'bounce', holdMs: HOLD },
  starred: { face: 'happy', motion: 'bounce', holdMs: HOLD },
  tip: { face: 'wink', holdMs: LINGER }, // tapping the top bar face: a tip of the day in a small bubble
} as const satisfies Record<string, Moment>;
export type FaceEvent = keyof typeof MOMENTS;
export const FACE_EVENTS = Object.keys(MOMENTS) as FaceEvent[];

/** A snackbar's 20 dp face: only for an outcome. Plain notices and undo snackbars carry none. */
export type SnackKind = 'success' | 'error';
export const SNACK: Record<SnackKind, FaceEvent> = { success: 'saved', error: 'saveFailed' };

/** Every empty state in the app. A face only where the whole page is empty; `null` = one line of words, no face
 *  (the page has other content, so its top bar's face already speaks for it, or it is inside a sheet). */
export const EMPTY = {
  tasksAllClear: 'cat', // To-do: nothing open (good news)
  tasksNoMatch: 'surprised', // To-do: a search with no hits
  gradesNoSubjects: 'wink', // Grades: no subjects yet (the line is a tip)
  statsNothingYet: 'wink', // Stats: nothing to report yet
  weekNoClasses: 'sleepy', // Week: no timetable yet
  todayNoClasses: null, // Today cards: the top bar is already `sleepy` on a day with no classes
  todayNothingDue: null,
  todayNothingPinned: null,
  leadTimesNoSubjects: null, // Settings → Reminders → lead times
  notificationLogEmpty: null, // Settings → Reminders → delivery status
  noCrashes: null, // Diagnostics
} as const satisfies Record<string, FaceName | null>;
export type EmptyKind = keyof typeof EMPTY;
export const EMPTY_KINDS = Object.keys(EMPTY) as EmptyKind[];
export const emptyFace = (k: EmptyKind): FaceName | null => EMPTY[k];

/** The onboarding pages' faces (D-22): a hello, a tour, your name, your data, a nudge. One face, 160 dp, moving
 *  from page to page; `nameTyped`, `importPreview` and `remindersOn` are its reactions there. */
export const ONBOARDING = { welcome: 'smirk', layout: 'cat', name: 'smirk', data: 'smirk', reminders: 'sleepy' } as const satisfies Record<string, FaceName>;

export type PageName = 'Today' | 'Week' | 'Tasks' | 'Grades' | 'Stats';
export interface PageFaceCtx {
  hour: number;
  /** Today */
  weekend?: boolean; classesToday?: number; classesLeft?: number; startsInMin?: number | null;
  /** To-do */
  dueToday?: number; overdue?: number; open?: number;
  /** Grades: courses with a goal, on or over it / under it */
  atGoal?: number; belowGoal?: number;
}
/** Which face a page's top bar rests on (D-21 placement). Pure; recompute it when the page's data changes. */
export function pageFace(page: PageName, c: PageFaceCtx): FaceName {
  if (page === 'Today') {
    if (c.hour >= 23 || c.hour < 5) return 'sleepy';
    if (c.classesToday === 0) return c.weekend ? 'cat' : 'sleepy';
    if (c.startsInMin != null && c.startsInMin >= 0 && c.startsInMin <= 5) return 'surprised';
    return c.classesLeft === 0 ? 'content' : 'smirk';
  }
  if (page === 'Tasks') {
    if ((c.dueToday ?? 0) > 0 || (c.overdue ?? 0) >= 3) return 'excited';
    return c.open === 0 ? 'cat' : 'smirk';
  }
  if (page === 'Grades') {
    const on = c.atGoal ?? 0, under = c.belowGoal ?? 0;
    /* smug only when every course with a goal is on track ("on track in 5 of 5"); sad only when most are behind,
       so one weak course does not make the whole page sulk */
    if (on > 0 && under === 0) return 'smug';
    return under > on ? 'sad' : 'smirk';
  }
  return 'smirk';
}

/* ── the bus: a plain set of listeners, so a deep component (a task card) can reach the page's face ── */
const listeners = new Set<(m: Moment) => void>();
/** Tell the listening face something happened. With no live listener it is a no-op, which is right: a page
 *  nobody is looking at does not react. */
export function faceEvent(e: FaceEvent): void {
  const m = MOMENTS[e];
  for (const l of [...listeners]) l(m);
}

/** Props for `<Face>`: the face to show, the motion to play (bump `n`), and whether it blinks slowly. */
export interface FaceState { name: FaceName; react: { motion: FaceMotion; n: number } | null; slowBlink: boolean }

/** Be a face. Rests on `rest` (a name, or a moment such as `MOMENTS.focusStart` for its slow blink); while `listen`
 *  is true it answers `faceEvent`s, holds the answer for the moment's `holdMs` (0 = until the next one or `clear`),
 *  then returns to rest. `play` applies a moment to this face alone, without the bus (Diagnostics, a snackbar). */
export function useFaceMoment(rest: FaceName | Moment, listen = false): { face: FaceState; play: (e: FaceEvent) => void; clear: () => void } {
  const base = typeof rest === 'string' ? { face: rest, slowBlink: false } : { face: rest.face, slowBlink: !!rest.slowBlink };
  /* `motion` and `n` outlive the reaction, so going back to rest never looks like a new motion to `<Face>`. */
  const [now, setNow] = useState<{ m: Moment | null; n: number; motion: FaceMotion | null }>({ m: null, n: 0, motion: null });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const apply = useCallback((m: Moment | null) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setNow((s) => (m?.motion ? { m, n: s.n + 1, motion: m.motion } : { ...s, m }));
    if (m && m.holdMs > 0) timer.current = setTimeout(() => setNow((s) => ({ ...s, m: null })), m.holdMs);
  }, []);
  useEffect(() => {
    if (!listen) return;
    listeners.add(apply);
    return () => { listeners.delete(apply); };
  }, [listen, apply]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const play = useCallback((e: FaceEvent) => apply(MOMENTS[e]), [apply]);
  const clear = useCallback(() => apply(null), [apply]);
  const m = now.m;
  return {
    face: { name: m ? m.face : base.face, react: now.motion ? { motion: now.motion, n: now.n } : null, slowBlink: m ? !!m.slowBlink : base.slowBlink },
    play,
    clear,
  };
}
