/** BUGS #7: "All" is gone from To-do; a stored 'all' reads as 'open', and the subject choice is a setting. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SETTINGS, withDefaults } from '../domain/defaults';
import { doneLine } from '../domain/time';

describe('To-do filter (BUGS #7)', () => {
  it("a stored 'all' reads as 'open'; 'done' stays", () => {
    expect(withDefaults({ taskFilter: 'all' as never }).taskFilter).toBe('open');
    expect(withDefaults({ taskFilter: 'done' }).taskFilter).toBe('done');
    expect(DEFAULT_SETTINGS.taskFilter).toBe('open');
  });
  it('the subject choice is persisted in settings, not component state', () => {
    expect(withDefaults({ taskSubject: 'c1' }).taskSubject).toBe('c1');
    const src = readFileSync(join(__dirname, '..', 'screens', 'Tasks.tsx'), 'utf8');
    expect(src).toContain("act.setSettings({ taskSubject: o.id })");
    expect(src).not.toMatch(/useState<string \| null \| 'all'>/);
    // one row of controls: a segmented Open/Done, a subject DropChip, a sort button
    expect(src).toContain('<Segmented'); expect(src).toContain('<DropChip');
  });
});

describe('a finished task says how late it was when finished (phone test #10)', () => {
  it('never "0 mlate"', () => {
    const due = Date.UTC(2026, 10, 12, 9);
    expect(doneLine(due, due - 60_000)).toBe('done on time');
    expect(doneLine(due, due + 13 * 3_600_000)).toBe('done 13 h late');
    expect(doneLine(due, due + 2 * 86_400_000)).toBe('done 2 d late');
    expect(doneLine(due, due + 20 * 60_000)).toBe('done 20 min late');
  });
});
