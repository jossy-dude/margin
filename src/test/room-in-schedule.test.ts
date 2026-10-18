/**
 * v0.2 — the room is asked when you schedule the class, not when you name the subject.
 *
 * Jossy's report (2026-10-19): "when creating a subject it asks for room which shouldn't be
 * asked… only during schedules." Naming a subject is about what you study; the room is a property
 * of the timetable slot where you attend it.
 *
 * The fix moves the Room INPUT from `CourseSheet` to `MeetingSheet`. It stays bound to the same
 * `course.room` field — a subject has one room — so there is no schema migration and none of the
 * six places that render `course.room` (Today, Week, Grades, reminders, export, card) change.
 *
 * Two properties are pinned, and the second is the one that would silently regress: the subject
 * form must STOP asking for a room, and the class form must START asking for it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const forms = readFileSync(join(__dirname, '../sheets/forms.tsx'), 'utf8');

/** The slice of a function body, so a Room field in one form is not confused with another's. */
const body = (name: string) => {
  const i = forms.indexOf(`export function ${name}`);
  expect(i).toBeGreaterThan(-1);
  const next = forms.indexOf('export function ', i + 10);
  return forms.slice(i, next > -1 ? next : forms.length);
};

describe('the room is asked when you add a class, not when you add a subject', () => {
  it('the subject form no longer asks for a room', () => {
    expect(body('CourseSheet')).not.toMatch(/label="Room"/);
  });

  it('the class form now asks for a room', () => {
    expect(body('MeetingSheet')).toMatch(/label="Room"/);
  });

  it('the class form saves the room it asked for', () => {
    // MeetingSheet must thread a room value through to the record it saves.
    expect(body('MeetingSheet')).toMatch(/room/);
  });
});
