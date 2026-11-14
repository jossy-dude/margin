/**
 * v0.7 U7 — where the face reacts (`ui/mascot/moments.ts`): the D-21 "Used for" column, the one-face rule, the
 * top-bar faces of each page, and `useFaceMoment` holding a reaction and letting it go.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { FACE_NAMES, type FaceName } from '../ui/mascot/faces';
import { EMPTY, EMPTY_KINDS, FACE_EVENTS, MOMENTS, ONBOARDING, SNACK, emptyFace, faceEvent, pageFace, useFaceMoment, type FaceEvent, type Moment } from '../ui/mascot/moments';

const all: [FaceEvent, Moment][] = FACE_EVENTS.map((e) => [e, MOMENTS[e]]);

describe('moments follow D-21', () => {
  it('every reaction is one of the twelve faces, and holds briefly or until the next one', () => {
    for (const [, m] of all) {
      expect(FACE_NAMES).toContain(m.face);
      expect([0, 2400, 4000]).toContain(m.holdMs);
    }
  });
  it('a bounce is good news and a droop is bad news, never the other way round', () => {
    for (const [e, m] of all) {
      if (m.motion === 'droop') expect({ e, face: m.face }).toEqual({ e, face: 'sad' });
      if (m.motion === 'bounce') expect(['sad', 'sleepy', 'excited', 'surprised']).not.toContain(m.face);
      if (m.face === 'sad') expect({ e, motion: m.motion }).toEqual({ e, motion: 'droop' });
    }
  });
  it('the owner\'s list: task done bounces, absent droops, Focus starts calm and ends laughing, the alarm wakes up', () => {
    expect(MOMENTS.taskDone).toEqual({ face: 'happy', motion: 'bounce', holdMs: 2400 });
    expect(MOMENTS.markedPresent.face).toBe('happy');
    expect(MOMENTS.markedAbsent).toEqual({ face: 'sad', motion: 'droop', holdMs: 2400 });
    expect(MOMENTS.focusStart).toEqual({ face: 'content', slowBlink: true, holdMs: 0 });
    expect(MOMENTS.focusEnd).toMatchObject({ face: 'laugh', motion: 'bounce' });
    expect(MOMENTS.gradeAtGoal).toMatchObject({ face: 'smug', motion: 'bounce' });
    expect(MOMENTS.gradeBelowGoal).toMatchObject({ face: 'sad', motion: 'droop' });
    expect([MOMENTS.alarmRinging.face, MOMENTS.alarmDismissed.face]).toEqual(['sleepy', 'happy']);
    expect(MOMENTS.weekAttended.face).toBe('blush');
    expect(MOMENTS.taskArrived).toEqual({ face: 'surprised', holdMs: 2400 });
    expect([MOMENTS.tip.face, MOMENTS.hello.face, MOMENTS.nameTyped.face]).toEqual(['wink', 'wink', 'blush']);
  });
  it('a snackbar shows a face only for an outcome: happy when it worked, sad when it did not', () => {
    expect(Object.keys(SNACK).sort()).toEqual(['error', 'success']);
    expect(MOMENTS[SNACK.success].face).toBe('happy');
    expect(MOMENTS[SNACK.error].face).toBe('sad');
  });
});

describe('one face per page', () => {
  it('only a page-wide empty state gets a face; an empty card on a busy page is words only', () => {
    const faced = EMPTY_KINDS.filter((k) => emptyFace(k) !== null).sort();
    expect(faced).toEqual(['gradesNoSubjects', 'statsNothingYet', 'tasksAllClear', 'tasksNoMatch', 'weekNoClasses']);
    for (const k of EMPTY_KINDS) if (k.startsWith('today')) expect(emptyFace(k)).toBeNull();
    expect(EMPTY.tasksAllClear).toBe('cat'); // nothing open is good news
    for (const k of faced) expect(FACE_NAMES).toContain(emptyFace(k));
  });
  it('onboarding has a face for each of its five pages', () => {
    expect(Object.keys(ONBOARDING)).toEqual(['welcome', 'layout', 'name', 'data', 'reminders']);
    expect(ONBOARDING.reminders).toBe('sleepy'); // and `remindersOn` wakes it up
  });
});

describe('the top bar\'s face (D-21 placement)', () => {
  it('Today follows the day', () => {
    expect(pageFace('Today', { hour: 23, classesToday: 3, classesLeft: 0 })).toBe('sleepy');
    expect(pageFace('Today', { hour: 3 })).toBe('sleepy');
    expect(pageFace('Today', { hour: 10, classesToday: 0 })).toBe('sleepy'); // no classes today
    expect(pageFace('Today', { hour: 10, classesToday: 0, weekend: true })).toBe('cat'); // a free weekend
    expect(pageFace('Today', { hour: 9, classesToday: 4, classesLeft: 4, startsInMin: 4 })).toBe('surprised'); // starts in 5 min
    expect(pageFace('Today', { hour: 9, classesToday: 4, classesLeft: 4, startsInMin: 20 })).toBe('smirk');
    expect(pageFace('Today', { hour: 18, classesToday: 4, classesLeft: 0 })).toBe('content'); // after the last class
    expect(pageFace('Today', { hour: 10, classesLeft: 2 })).toBe('smirk');
  });
  it('To-do: cheerful panic when something is due today or a lot is overdue; a cat when nothing is open', () => {
    expect(pageFace('Tasks', { hour: 9, dueToday: 2, open: 5 })).toBe('excited');
    expect(pageFace('Tasks', { hour: 9, overdue: 3, open: 5 })).toBe('excited');
    expect(pageFace('Tasks', { hour: 9, overdue: 2, open: 5 })).toBe('smirk');
    expect(pageFace('Tasks', { hour: 9, open: 0 })).toBe('cat');
  });
  it('Grades: smug only when every goal is met, sad only when most are missed', () => {
    expect(pageFace('Grades', { hour: 9, atGoal: 5, belowGoal: 0 })).toBe('smug');
    expect(pageFace('Grades', { hour: 9, atGoal: 4, belowGoal: 1 })).toBe('smirk');
    expect(pageFace('Grades', { hour: 9, atGoal: 1, belowGoal: 2 })).toBe('sad');
    expect(pageFace('Grades', { hour: 9 })).toBe('smirk'); // no goals set
  });
  it('Week and Stats rest on the smirk', () => {
    expect(pageFace('Week', { hour: 9 })).toBe('smirk');
    expect(pageFace('Stats', { hour: 9 })).toBe('smirk');
  });
});

describe('useFaceMoment', () => {
  type Hook = ReturnType<typeof useFaceMoment>;
  const got: Record<string, Hook> = {};
  function Probe({ id, rest, listen }: { id: string; rest: FaceName | Moment; listen?: boolean }) {
    got[id] = useFaceMoment(rest, listen);
    return null;
  }
  let r: TestRenderer.ReactTestRenderer | null = null;
  const render = (el: React.ReactElement) => act(() => { r = TestRenderer.create(el); });
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { act(() => { r?.unmount(); }); r = null; jest.useRealTimers(); });

  it('rests, reacts with a face and one motion, then goes back to rest without a second motion', () => {
    render(React.createElement(Probe, { id: 'a', rest: 'smirk' }));
    expect(got.a!.face).toEqual({ name: 'smirk', react: null, slowBlink: false });
    act(() => got.a!.play('taskDone'));
    expect(got.a!.face).toEqual({ name: 'happy', react: { motion: 'bounce', n: 1 }, slowBlink: false });
    act(() => { jest.advanceTimersByTime(2399); });
    expect(got.a!.face.name).toBe('happy');
    act(() => { jest.advanceTimersByTime(1); });
    expect(got.a!.face).toEqual({ name: 'smirk', react: { motion: 'bounce', n: 1 }, slowBlink: false }); // same n: no new hop
  });
  it('a reaction with no motion keeps the last motion count; a held one stays until clear()', () => {
    render(React.createElement(Probe, { id: 'b', rest: 'smirk' }));
    act(() => got.b!.play('markedAbsent'));
    act(() => got.b!.play('nameTyped'));
    expect(got.b!.face).toEqual({ name: 'blush', react: { motion: 'droop', n: 1 }, slowBlink: false });
    act(() => { jest.advanceTimersByTime(60_000); });
    expect(got.b!.face.name).toBe('blush');
    act(() => got.b!.clear());
    expect(got.b!.face.name).toBe('smirk');
  });
  it('rests on a moment too: Focus is content with a slow blink, and laughs at the end of a round', () => {
    render(React.createElement(Probe, { id: 'f', rest: MOMENTS.focusStart }));
    expect(got.f!.face).toEqual({ name: 'content', react: null, slowBlink: true });
    act(() => got.f!.play('focusEnd'));
    expect(got.f!.face).toEqual({ name: 'laugh', react: { motion: 'bounce', n: 1 }, slowBlink: false });
    act(() => { jest.advanceTimersByTime(4000); });
    expect(got.f!.face.slowBlink).toBe(true);
  });
  it('faceEvent reaches only the faces that listen (the live page), and none once they unmount', () => {
    render(React.createElement(React.Fragment, null,
      React.createElement(Probe, { id: 'live', rest: 'smirk', listen: true }),
      React.createElement(Probe, { id: 'hidden', rest: 'smirk', listen: false })));
    act(() => faceEvent('markedPresent'));
    expect(got.live!.face.name).toBe('happy');
    expect(got.hidden!.face.name).toBe('smirk');
    act(() => { r!.unmount(); }); r = null;
    expect(jest.getTimerCount()).toBe(0); // the hold timer went with it
    expect(() => act(() => faceEvent('markedPresent'))).not.toThrow();
  });
});
