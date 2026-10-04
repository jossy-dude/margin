import { inMountWindow } from '../navigation/window';

/** Simulates BookView's stamp bookkeeping: every navigation (and the navigator's own mount
 * effect) stamps the route it lands on with `counter + 1`. */
function hop(stamps: Record<string, number>, counter: number, to: string) {
  const next = counter + 1;
  return { stamps: { ...stamps, [to]: next }, counter: next };
}

describe('book navigator mount window', () => {
  it('mounts the initial screen even before its stamp is re-applied', () => {
    expect(inMountWindow({ Today: 1 }, 1, 'Today')).toBe(true);
    expect(inMountWindow({ Today: 1 }, 1, 'Week')).toBe(false);
  });
  it('keeps current + previous after every hop, drops everything older', () => {
    // navigator's mount effect re-stamps Today, then Today → Week → Tasks → Grades
    let s: Record<string, number> = { Today: 1 }, c = 1;
    ({ stamps: s, counter: c } = hop(s, c, 'Today'));
    expect(inMountWindow(s, c, 'Today')).toBe(true);
    ({ stamps: s, counter: c } = hop(s, c, 'Week'));
    expect([inMountWindow(s, c, 'Today'), inMountWindow(s, c, 'Week')]).toEqual([true, true]);
    ({ stamps: s, counter: c } = hop(s, c, 'Tasks'));
    expect([inMountWindow(s, c, 'Today'), inMountWindow(s, c, 'Week'), inMountWindow(s, c, 'Tasks')]).toEqual([false, true, true]);
    ({ stamps: s, counter: c } = hop(s, c, 'Grades'));
    expect([inMountWindow(s, c, 'Week'), inMountWindow(s, c, 'Tasks'), inMountWindow(s, c, 'Grades')]).toEqual([false, true, true]);
  });
  it('a revisit re-stamps the old screen back into the window and evicts the one before it', () => {
    let s: Record<string, number> = { Today: 2, Week: 3, Tasks: 4 }, c = 4;
    ({ stamps: s, counter: c } = hop(s, c, 'Today'));
    expect([inMountWindow(s, c, 'Today'), inMountWindow(s, c, 'Week'), inMountWindow(s, c, 'Tasks')]).toEqual([true, false, true]);
  });
  it('never mounts more than two screens, for any hop sequence', () => {
    let s: Record<string, number> = { Today: 1 }, c = 1;
    const names = ['Today', 'Week', 'Tasks', 'Grades', 'Stats', 'Focus'];
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 200; i++) {
      ({ stamps: s, counter: c } = hop(s, c, names[Math.floor(rnd() * names.length)]!));
      const mounted = names.filter((n) => inMountWindow(s, c, n));
      expect(mounted.length).toBeLessThanOrEqual(2);
      const holder = (stamp: number) => Object.keys(s).find((k) => s[k] === stamp);
      expect(inMountWindow(s, c, holder(c)!)).toBe(true); // current always mounted
      const prev = holder(c - 1);
      if (prev) expect(inMountWindow(s, c, prev)).toBe(true); // and the screen behind it
    }
  });
  it('routes that were never visited are not mounted', () => {
    expect(inMountWindow({ Today: 5, Week: 6 }, 6, 'Stats')).toBe(false);
    expect(inMountWindow({}, 3, 'Today')).toBe(false);
  });
});
