/** Notes (collage pass): a note shows a date only while it is still ahead, and urgent notes lead. */
import { noteDate, sortNotes } from '../ui/collage/notes';

const NOW = new Date(2026, 10, 4, 15).getTime(), midnight = new Date(2026, 10, 4).getTime(), day = 86_400_000;

describe('noteDate', () => {
  it('hides the old "pinned on" date (today at midnight or any past day)', () => {
    expect(noteDate({ dueAt: midnight }, NOW)).toBeNull();
    expect(noteDate({ dueAt: midnight - 3 * day }, NOW)).toBeNull();
  });
  it('shows a date later today or on a later day', () => {
    expect(noteDate({ dueAt: NOW + 3_600_000 }, NOW)).toBe(NOW + 3_600_000);
    expect(noteDate({ dueAt: midnight + 2 * day }, NOW)).toBe(midnight + 2 * day);
  });
});

describe('sortNotes', () => {
  it('puts urgent first, then the soonest date, then pin order', () => {
    const ns = [
      { id: 'a', priority: 0 as const, dueAt: midnight },
      { id: 'b', priority: 3 as const, dueAt: midnight },
      { id: 'c', priority: 1 as const, dueAt: midnight + 2 * day },
      { id: 'd', priority: 1 as const, dueAt: midnight + day },
      { id: 'e', priority: 0 as const, dueAt: midnight },
    ];
    expect(sortNotes(ns, NOW).map((n) => n.id)).toEqual(['b', 'd', 'c', 'a', 'e']);
  });
});
