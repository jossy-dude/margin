/** v0.7.8.15 (owner's ask 2): the sheets, touch first: one-tap answers, weekdays on one row, no kickers. */
import { readFileSync } from 'fs';
import { join } from 'path';

const r = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
describe('touch-first sheets', () => {
  it('every weekday picker is the one-row DayRow, not seven wrapping chips', () => {
    for (const f of [['sheets', 'forms.tsx'], ['sheets', 'Settings.tsx'], ['sheets', 'Alarms.tsx'], ['sheets', 'ScheduleEditor.tsx']]) {
      const s = r(...f);
      expect(s).toContain('<DayRow');
      expect(s).not.toMatch(/DW\.map\(\(d, \w+\) => <Chip/);
    }
    expect(r('ui', 'kit.tsx')).toContain('minHeight: 44, borderRadius: 12');
  });
  it('one-tap answers: grade goal, class length, mark weight', () => {
    const f = r('sheets', 'forms.tsx');
    expect(f).toContain('[0, 60, 70, 80, 90].map((g)');
    expect(f).toContain('<Label>Length</Label>');
    expect(f).toContain('[5, 10, 15, 20, 30, 40].map((x)');
    expect(f).toContain("label={more ? 'Less' : 'More details'}");
  });
  it('no uppercase kickers above groups', () => {
    expect(r('sheets', 'AddSheet.tsx')).not.toContain('>FOR</Txt>');
    expect(r('sheets', 'ScheduleEditor.tsx')).not.toMatch(/toUpperCase\(\)|`CLASS /);
  });
  it('the Add sheet\'s subject tabs reach 48 dp with their slop', () => {
    expect(r('sheets', 'AddSheet.tsx')).toContain("style={{ minHeight: 40, paddingHorizontal: 13, flexDirection: 'row'");
  });
});
