/**
 * WS2 Task 3 — the Semesters page, driven as a reader drives it.
 *
 * Three claims, and each one fails for its own reason:
 *
 *  1. **The list is the truth about the term.** The active row prints its name, its range and how many
 *     days are left; the archived rows are below it and are not mixed in with the live one. This is the
 *     page the owner opens to answer "which term is this?".
 *  2. **Roll-over asks before it destroys.** "Start new semester" only arms; the keep/wipe choice does
 *     the archive. Keeping attendance leaves the term's record; starting fresh does not. The archive is
 *     a real snapshot (the old timetable is readable afterwards), and the day tables are lean.
 *  3. **R1: the range is typed on a keypad, not stepped.** Three numeric fields per date — a term date a
 *     stepper away is two thousand presses a year. The Settings copy of the same control must write the
 *     active row as well as the settings mirror, or the page and the rest of the app disagree about the
 *     term they are printing.
 *
 * Only native/platform modules are stubbed (audio, keep-awake, notifications, files, reanimated,
 * safe-area); the page, the store and both repository adapters are the real code.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { MemoryRepository } from '../data/memory';
import { seedSnapshot } from '../data/seed';
import { getState, hydrate, set, stopResync } from '../store/store';
import { buildSnapshot, readSnapshot } from '../domain/archive';
import type { SemesterRow } from '../domain/types';
import { SemestersPage } from '../sheets/Semesters';
import { SettingsSheet } from '../sheets/Settings';

jest.mock('expo-audio', () => ({ createAudioPlayer: () => ({ play: () => {}, seekTo: () => {}, remove: () => {} }), setAudioModeAsync: async () => {} }));
jest.mock('expo-keep-awake', () => ({ activateKeepAwakeAsync: async () => {}, deactivateKeepAwake: async () => {} }));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../services/notifications', () => ({
  ensurePermission: async () => 'granted',
  status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: true, queueRead: true, lockText: null, platform: 'test' }),
  sync: async () => ({ added: 0, removed: 0, planned: [] }),
  cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {},
  sendTest: async () => true, sendActionTest: async () => true, TEST_ACTION_ID: 'action-test',
  applyLockscreenText: async () => {}, onOpened: () => {}, onReceived: () => {},
}));
jest.mock('expo-constants', () => ({ default: { expoConfig: { version: '1.0.0', sdkVersion: '57.0.0' } } }));
jest.mock('expo-file-system', () => {
  class File {
    get exists() { return false; }
    create() {}
    delete() {}
    write() {}
    textSync() { return ''; }
  }
  return { File, Paths: { document: 'doc' } };
});
jest.mock('react-native-safe-area-context', () => {
  const R = jest.requireActual<typeof import('react')>('react');
  const Provider = ({ children }: { children: unknown }) => R.createElement(R.Fragment, null, children as React.ReactNode);
  Provider.displayName = 'SafeAreaProvider';
  return { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaProvider: Provider };
});
jest.mock('react-native-reanimated', () => {
  const { View: RNView } = jest.requireActual<typeof import('react-native')>('react-native');
  const R = jest.requireActual<typeof import('react')>('react');
  const mk = () => { const C = (p: object) => R.createElement(RNView, p); C.displayName = 'AnimatedProxy'; return C; };
  const api = {
    __esModule: true, View: mk(), Text: mk(), ScrollView: mk(), Image: mk(),
    createAnimatedComponent: (c: unknown) => c,
    useSharedValue: (v: number) => ({ value: v, get: () => v, set: () => {} }),
    useAnimatedStyle: (fn: () => object) => fn(),
    useAnimatedProps: (fn: () => object) => fn(),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    useAnimatedReaction: () => {}, useAnimatedScrollHandler: () => () => {}, useAnimatedRef: () => R.createRef(),
    useFrameCallback: () => ({ setActive: () => {} }), useEvent: () => () => {},
    useHandler: () => ({ context: null, doDependenciesDiffer: false, useWeb: false }),
    setGestureState: () => {}, isSharedValue: () => false, makeShareable: (v: unknown) => v,
    startMapper: () => {}, stopMapper: () => {}, makeMutable: (v: number) => ({ value: v }),
    Easing: { out: (f: unknown) => f, in: (f: unknown) => f, inOut: (f: unknown) => f, quad: 2, cubic: 3, bezier: () => (t: number) => t, back: () => (t: number) => t },
    interpolate: (_v: number, i: number[], o: number[]) => o[0] ?? 0,
    interpolateColor: (_v: number, _i: number[], o: string[]) => o[0] ?? '',
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    cancelAnimation: () => {}, runOnJS: (f: unknown) => f, runOnUI: (f: unknown) => f,
    withTiming: (to: number, _c?: unknown, cb?: (d: boolean) => void) => { cb?.(true); return to; },
    withSequence: (...a: number[]) => a[a.length - 1] ?? 0, withRepeat: (v: number) => v, withSpring: (to: number) => to, withDelay: (_d: number, v: number) => v,
    FadeIn: { duration: () => ({}) }, FadeOut: { duration: () => ({}) }, FadeInDown: { duration: () => ({}) }, FadeOutDown: { duration: () => ({}) },
  };
  return { ...api, default: api };
});

const NOW = new Date(2026, 9, 5, 8).getTime(); // 2026-10-05: inside the 7 Sep – 20 Dec 2026 term

const row = (extra: Partial<SemesterRow> = {}): SemesterRow => ({
  id: 's1', name: 'Autumn 2026', start: '2026-09-07', end: '2026-12-20', active: true,
  snapshotJson: null, createdAt: '2026-09-01T10:00:00.000Z', archivedAt: null, ...extra,
});

/** The repository the page reads: one active term, one archived one, attendance and a day mark. */
async function repoWithTerm() {
  const r = new MemoryRepository(() => NOW);
  await r.seed(seedSnapshot(NOW));
  await r.saveSemester(row());
  await r.setActiveSemester('s1');
  await r.saveSemester(row({ id: 's0', name: 'Spring 2026', start: '2026-01-12', end: '2026-05-01', active: false, archivedAt: '2026-05-02T10:00:00.000Z', snapshotJson: buildSnapshot([], [], {}, [], [], {}) }));
  await r.upsert('attendance', { key: 'k1', status: 'p', at: NOW, reason: '' });
  await r.upsert('dayMark', { date: '2026-09-07', status: 'p', at: NOW, reason: '' });
  return r;
}

let live: TestRenderer.ReactTestRenderer | undefined;
afterEach(async () => { await act(async () => { live?.unmount(); }); live = undefined; stopResync(); });

function leaves(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (Array.isArray(node)) return node.flatMap(leaves);
  const kids = (node as { children?: unknown[] } | null)?.children;
  return kids ? leaves(kids) : [];
}

const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

async function mountPage(given?: MemoryRepository) {
  const repo = given ?? await repoWithTerm();
  await hydrate(repo);
  set({ now: NOW, settingsPath: [] });
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => { r = TestRenderer.create(React.createElement(SemestersPage)); });
  await flush();
  live = r;
  return {
    r,
    repo,
    text: () => leaves(r.toJSON()).join('') + r.root.findAll((n) => typeof n.props?.value === 'string').map((n) => String(n.props.value)).join(' '),
    async press(testID: string) {
      const nodes = r.root.findAll((n) => n.props?.testID === testID && typeof n.props?.onPressIn === 'function');
      if (!nodes.length) throw new Error(`no button with testID "${testID}"`);
      await act(async () => { (nodes[0]!.props as { onPressIn: () => void }).onPressIn(); });
      await flush();
    },
    async type(testID: string, text: string) {
      const nodes = r.root.findAll((n) => n.props?.testID === testID && typeof n.props?.onChangeText === 'function');
      if (!nodes.length) throw new Error(`no field with testID "${testID}"`);
      await act(async () => { (nodes[0]!.props as { onChangeText: (v: string) => void }).onChangeText(text); });
      await flush();
    },
  };
}

describe('the Semesters page lists the terms it really has', () => {
  it('prints the active term with its name, its range and the days left', async () => {
    const s = await mountPage();
    const t = s.text();
    expect(t).toContain('Current term');
    expect(t).toContain('Autumn 2026');
    expect(t).toContain('7 Sep – 20 Dec 2026');
    expect(t).toContain('76 days left'); // 2026-10-05 → 2026-12-20 inclusive
  });

  it('lists the archived term separately, with its own range', async () => {
    const s = await mountPage();
    const t = s.text();
    expect(t).toContain('Earlier semesters');
    expect(t).toContain('Spring 2026');
    expect(t).toContain('12 Jan – 1 May 2026');
    expect(t.indexOf('Current term')).toBeLessThan(t.indexOf('Earlier semesters'));
  });

  /* R1 — the brief's review finding: a semester date is not a quantity to step up by one. Six numeric
     fields (year/month/day × start/end) and no Stepper anywhere on the page. */
  it('the range is keypad fields, never steppers', async () => {
    const s = await mountPage();
    // v0.5 U1 deleted the Stepper itself; what this pins now is that nothing on the page is a +/− pair.
    expect(s.r.root.findAll((n) => /^(Increase|Decrease) /.test(String(n.props?.accessibilityLabel ?? '')))).toHaveLength(0);
    const ids = ['semester-start-year', 'semester-start-month', 'semester-start-day', 'semester-end-year', 'semester-end-month', 'semester-end-day'];
    for (const id of ids) {
      const field = s.r.root.findAll((n) => n.props?.testID === id && typeof n.props?.onChangeText === 'function')[0];
      expect(field).toBeDefined();
      expect((field!.props as { keyboardType?: string }).keyboardType).toBe('numeric');
    }
  });
});

describe('rename and range edit save to the active row', () => {
  it('a renamed term is renamed in the database, not just on screen', async () => {
    const s = await mountPage();
    await s.type('semester-active-name', 'Autumn term');
    await s.press('semester-save-name');
    const active = (await s.repo.listSemesters()).find((x) => x.active)!;
    expect(active.name).toBe('Autumn term');
    expect(s.text()).toContain('Autumn term');
  });

  it('a typed day saves the range into the row AND the settings mirror', async () => {
    const s = await mountPage();
    await s.type('semester-start-day', '14');
    await s.type('semester-end-day', '11');
    const active = (await s.repo.listSemesters()).find((x) => x.active)!;
    expect(active.start).toBe('2026-09-14');
    expect(active.end).toBe('2026-12-11');
    expect(getState().settings.semesterStart).toBe('2026-09-14');
    expect(getState().settings.semesterEnd).toBe('2026-12-11');
    expect(s.text()).toContain('14 Sep – 11 Dec 2026');
  });
});

describe('roll-over asks keep-or-wipe before it clears anything', () => {
  it('the first press only asks, and nothing is archived or deleted yet', async () => {
    const s = await mountPage();
    const meetings = (await s.repo.load()).meetings.length;
    await s.press('semester-rollover');
    const t = s.text();
    expect(t).toContain('Keep attendance');
    expect(t).toContain('Start fresh');
    expect(await s.repo.listSemesters()).toHaveLength(2); // s1 is still active, s0 still archived
    expect((await s.repo.load()).meetings).toHaveLength(meetings);
    expect((await s.repo.listSemesters()).find((x) => x.active)!.id).toBe('s1');
  });

  it('keep attendance: the old term is frozen into a readable snapshot and the day tables go', async () => {
    const s = await mountPage();
    const before = await s.repo.load();
    await s.press('semester-rollover');
    await s.press('semester-rollover-keep');

    const all = await s.repo.listSemesters();
    const archived = all.find((x) => x.id === 's1')!;
    expect(archived.active).toBe(false);
    expect(archived.archivedAt).not.toBeNull();
    const frozen = readSnapshot(archived.snapshotJson!)!;
    expect(frozen.datasets.meetings).toHaveLength(before.meetings.length);
    expect(frozen.datasets.tasks).toHaveLength(before.tasks.length);
    expect(frozen.datasets.settings.semesterStart).toBe('2026-09-07');

    const next = all.find((x) => x.active)!;
    expect(next.id).not.toBe('s1');
    const after = await s.repo.load();
    expect(after.meetings).toHaveLength(0); // Today/Week are lean
    expect(after.tasks).toHaveLength(0);
    expect(Object.keys(after.attendance)).toEqual(['k1']); // the term's record is kept
    expect(after.courses.map((c) => c.id)).toEqual(before.courses.map((c) => c.id)); // subjects are inherited

    // the store is reloaded from the repository, not patched by hand, and the page shows the new term
    expect(getState().meetings).toHaveLength(0);
    expect(Object.keys(getState().attendance)).toEqual(['k1']);
    expect(getState().settings.semesterStart).toBe(next.start);
    expect(s.text()).toContain(next.name);
    expect(s.text()).toContain('Current term');
  });

  it('start fresh wipes attendance with everything else', async () => {
    const s = await mountPage();
    await s.press('semester-rollover');
    await s.press('semester-rollover-wipe');
    const after = await s.repo.load();
    expect(Object.keys(after.attendance)).toHaveLength(0);
    expect(Object.keys(after.dayMarks)).toHaveLength(0);
    expect(getState().settings.semesterStart).toBe((await s.repo.listSemesters()).find((x) => x.active)!.start);
  });
});

describe('the Settings door and the Settings copy of the range', () => {
  async function mountSettings(given?: MemoryRepository, path: string[] = []) {
    const repo = given ?? await repoWithTerm();
    await hydrate(repo);
    set({ now: NOW, settingsPath: path });
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => { r = TestRenderer.create(React.createElement(SettingsSheet)); });
    await flush();
    live = r;
    return {
      r,
      repo,
      text: () => leaves(r.toJSON()).join('') + r.root.findAll((n) => typeof n.props?.value === 'string').map((n) => String(n.props.value)).join(' '),
      async type(testID: string, text: string) {
        const nodes = r.root.findAll((n) => n.props?.testID === testID && typeof n.props?.onChangeText === 'function');
        if (!nodes.length) throw new Error(`no field with testID "${testID}"`);
        await act(async () => { (nodes[0]!.props as { onChangeText: (v: string) => void }).onChangeText(text); });
        await flush();
      },
    };
  }

  it('Settings has a Semesters row, and it opens the page', async () => {
    const s = await mountSettings();
    expect(s.text()).toContain('Semesters');
    const nav = s.r.root.findAll((n) => typeof n.props?.onPress === 'function' && String(n.props?.accessibilityLabel ?? '').startsWith('Semesters.'))[0]!;
    await act(async () => { (nav.props as { onPress: () => void }).onPress(); });
    await flush();
    expect(getState().settingsPath).toContain('semesters');
    expect(s.text()).toContain('Current term');
  });

  /* The Settings → Attendance control is the same two dates. It used to write only `settings`, which
     after v0.5 is a mirror of the row: the page would then print a range the Semesters row did not have. */
  it('editing the range in Settings → Attendance writes the active row too', async () => {
    const s = await mountSettings(await repoWithTerm(), ['attendance']);
    await s.type('semester-start-day', '14');
    const active = (await s.repo.listSemesters()).find((x) => x.active)!;
    expect(active.start).toBe('2026-09-14');
    expect(getState().settings.semesterStart).toBe('2026-09-14');
  });
});
