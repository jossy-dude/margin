/**
 * v0.6 — the Obsidian half of the bridge (obsidian-plugin/margin-bridge/main.js) against Margin's own
 * half (src/domain/bridge.ts). The two are written apart, so this is where the contract is held: the
 * same task line both ways, and an envelope either side can read.
 */
import { parseEnvelope, taskLine, type BridgeTask } from '../domain/bridge';
import { leafOf } from '../services/vaultFiles';

jest.mock('obsidian', () => ({ Plugin: class {}, PluginSettingTab: class {}, TFile: class {}, Notice: class {}, Setting: class {}, debounce: (f: unknown) => f }), { virtual: true });
interface Row { id: string; origin: string; updatedAt: number; deleted?: boolean; data?: BridgeTask }
interface State { seen: Record<string, unknown>; sent: Record<string, unknown> }
interface Pure {
  FORMAT: string; taskLine(id: string, t: BridgeTask): string;
  applyMargin(text: string, env: unknown, s: State): { text: string; changed: boolean };
  collectFile(text: string, path: string, mtime: number, s: State, o: { tag: string; tasksNote: string; makeId?: () => string }): { rows: Row[]; text: string; changed: boolean };
  tombstones(s: State, live: Set<string>, now: number): Row[]; buildOut(rows: Row[], now: number): { tasks: Row[] };
  patchLine(line: string, d: Partial<BridgeTask>): string; timetableNote(env: unknown): string;
}
const { pure } = jest.requireActual<{ pure: Pure }>('../../obsidian-plugin/margin-bridge/main.js');

const task = (over: Partial<BridgeTask> = {}): BridgeTask => ({ title: 'Lab report', done: false, doneOn: null, due: '2026-11-14', time: '09:00', start: null, prio: 4, estimateMin: null, spentMin: 0, course: 'Discrete Mathematics', kind: null, notes: '', path: null, steps: [], ...over });
const env = (tasks: Row[]) => ({ format: 'margin-bridge/1', app: 'margin', writtenAt: 1, tasks, events: [], sessions: [] });
const opts = { tag: '#school', tasksNote: 'Margin/Tasks.md', makeId: () => 'mabc123' };

describe('the task line is one grammar on both sides', () => {
  it('the plugin writes a Margin task exactly as Margin would', () => {
    for (const t of [task(), task({ done: true, doneOn: '2026-11-12', spentMin: 40 }), task({ course: null, time: null, prio: 0 })]) expect(pure.taskLine('t 1', t)).toBe(taskLine('t 1', t));
    expect(pure.FORMAT).toBe('margin-bridge/1');
  });
});

describe('Margin → the tasks note', () => {
  it('adds a new task, rewrites a changed one, removes a deleted one, and applies each stamp once', () => {
    const s: State = { seen: {}, sent: {} };
    const a = pure.applyMargin('', env([{ id: 't1', origin: 'margin', updatedAt: 100, data: task() }]), s);
    expect(a.text).toBe('- [ ] Lab report #Discrete-Mathematics ⏫ 📅 2026-11-14 ⏰ 09:00 ^t1');
    expect(pure.applyMargin(a.text, env([{ id: 't1', origin: 'margin', updatedAt: 100, data: task({ title: 'Ignored' }) }]), s).changed).toBe(false);
    const b = pure.applyMargin(a.text, env([{ id: 't1', origin: 'margin', updatedAt: 200, data: task({ done: true, doneOn: '2026-11-13' }) }]), s);
    expect(b.text).toContain('- [x] Lab report');
    expect(pure.applyMargin(b.text, env([{ id: 't1', origin: 'margin', updatedAt: 300, deleted: true }]), s).text).toBe('');
  });
});

describe('the vault → Margin', () => {
  it('sends an open, dated, tagged task and gives it a block id; leaves the rest of the vault alone', () => {
    const s: State = { seen: {}, sent: {} };
    const r = pure.collectFile('- [ ] Read DB note #school 🔺 📅 2026-11-08\n- [ ] Buy milk 📅 2026-11-08\n- [x] Old #school 📅 2026-10-01\n- [ ] No date #school', 'Daily/2026-11-08.md', 500, s, opts);
    expect(r.rows.map((x) => [x.id, x.origin, x.updatedAt, x.data?.title, x.data?.prio])).toEqual([['mabc123', 'obsidian', 500, 'Read DB note', 5]]);
    expect(r.text.split('\n')[0]).toBe('- [ ] Read DB note #school 🔺 📅 2026-11-08 ^mabc123');
    expect(r.text.split('\n').slice(1).join('|')).not.toContain('^');
  });
  it('writes an envelope Margin reads without a problem', () => {
    const s: State = { seen: {}, sent: {} };
    const r = pure.collectFile('- [ ] Read DB note #school #Database 📅 2026-11-08 ⏰ 7:30', 'a.md', 500, s, opts);
    const parsed = parseEnvelope(JSON.stringify(pure.buildOut(r.rows, 900)));
    expect(parsed.problems).toEqual([]);
    expect(parsed.envelope?.tasks[0]).toMatchObject({ id: 'mabc123', origin: 'obsidian', data: { title: 'Read DB note', course: 'Database', due: '2026-11-08', time: '07:30' } });
  });
  it('does not send a Margin task back untouched, and does send it once it is ticked in a note', () => {
    const s: State = { seen: {}, sent: {} };
    const a = pure.applyMargin('', env([{ id: 't1', origin: 'margin', updatedAt: 100, data: task() }]), s);
    expect(pure.collectFile(a.text, 'Margin/Tasks.md', 500, s, opts).rows).toEqual([]);
    const ticked = pure.collectFile(a.text.replace('[ ]', '[x]'), 'Margin/Tasks.md', 900, s, opts).rows;
    expect(ticked.map((x) => [x.id, x.origin, x.updatedAt, x.data?.done])).toEqual([['t1', 'margin', 900, true]]);
  });
  it('a line that is gone becomes a tombstone, once, for Obsidian\'s own tasks only', () => {
    const s: State = { seen: {}, sent: {} };
    pure.applyMargin('', env([{ id: 't1', origin: 'margin', updatedAt: 100, data: task() }]), s);
    pure.collectFile('- [ ] Read DB note #school 📅 2026-11-08', 'a.md', 500, s, opts);
    expect(pure.tombstones(s, new Set(['mabc123', 't1']), 1000)).toEqual([]);
    expect(pure.tombstones(s, new Set(), 2000)).toEqual([{ id: 'mabc123', origin: 'obsidian', updatedAt: 2000, deleted: true }]);
    expect(pure.tombstones(s, new Set(), 3000)).toEqual([{ id: 'mabc123', origin: 'obsidian', updatedAt: 2000, deleted: true }]);
  });
  it('a tick made in Margin changes only the checkbox and the done date of the note\'s line', () => {
    expect(pure.patchLine('- [ ] Read DB note #school 🔺 📅 2026-11-08 ^mabc123', { done: true, doneOn: '2026-11-09', due: '2026-11-08' })).toBe('- [x] Read DB note #school 🔺 📅 2026-11-08 ✅ 2026-11-09 ^mabc123');
  });
});

describe('the timetable note and the vault folder', () => {
  it('lists classes by day and strikes a cancelled one', () => {
    const at = new Date(2026, 10, 12, 8, 30).getTime();
    const note = pure.timetableNote({ events: [{ id: 'c1', data: { title: 'Database', at, end: at + 50 * 60_000, room: 'B-12', cancelled: false } }, { id: 'c2', data: { title: 'Economics', at: at + 3_600_000, end: null, room: null, cancelled: true } }] });
    expect(note).toContain('## Thursday 2026-11-12\n- 08:30–09:20 Database · B-12\n- ~~09:30 Economics~~ cancelled');
  });
  it('reads the folder name out of a document URI', () => {
    expect(leafOf('content://com.android.externalstorage.documents/tree/primary%3ADocuments%2FBone%2F.margin')).toBe('.margin');
    expect(leafOf('content://x/tree/primary%3ABone')).toBe('Bone');
  });
});
