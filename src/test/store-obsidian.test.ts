/**
 * v0.8 §1.5 / §3.4 through the store, against an in-memory vault standing in for the native sync engine: an
 * Obsidian task arrives with its reminder; a re-read changes nothing; a tick in Margin ticks the line (and only
 * that); a new school task is appended to Margin/Tasks.md; a deleted line removes the task; `- [!]` survives.
 */
import { MemoryRepository } from '../data/memory';
import { act, getState, hydrate } from '../store/store';
import { refreshVault, resetObsidianCache, obsidianNow } from '../store/obsidian';
import { applySnapshot } from '../store/core';

const mockVault = new Map<string, string>();
const vault = mockVault;
const mockHash = (t: string) => { let h = 0; for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) | 0; return `h${h >>> 0}`; };
jest.mock('../services/native', () => ({
  vaultFiles: async (known: Record<string, string>, only: string[]) => {
    const paths = only.length ? only : [...mockVault.keys()].filter((p) => p.endsWith('.md'));
    const files = paths.filter((p) => mockVault.has(p)).map((p) => { const h = mockHash(mockVault.get(p)!); return known[p] === h ? { p, h } : { p, h, text: mockVault.get(p)! }; });
    const gone = only.length ? only.filter((p) => !mockVault.has(p)) : Object.keys(known).filter((p) => !mockVault.has(p));
    return { files, gone };
  },
  vaultEdit: async (p: string, expect: string, text: string) => {
    const cur = mockVault.get(p);
    if (expect !== '*' && expect !== (cur === undefined ? '' : mockHash(cur))) return `changed:${cur === undefined ? '' : mockHash(cur)}`;
    mockVault.set(p, text); return `ok:${mockHash(text)}`;
  },
  vaultChanges: () => [], syncInbox: () => [], syncStart: () => true, onSyncEvent: () => () => {},
}));
jest.mock('../services/fx', () => ({ configureFx: () => {}, fx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../services/notifications', () => ({ ensurePermission: async () => 'granted', sync: async () => ({ added: 0, removed: 0, planned: [] }), cancelAll: async () => {}, cancelFocusEnd: async () => {}, scheduleFocusEnd: async () => {}, status: async () => ({ permission: 'granted', scheduled: 0, next: null, canAskAgain: false, queueRead: true, platform: 'test' }), onOpened: () => {}, onReceived: () => {} }));

const NOW = new Date(2026, 10, 20, 10).getTime();
const settle = () => new Promise((r) => setTimeout(r, 20));
async function fresh() { vault.clear(); resetObsidianCache(); let t = NOW; const repo = new MemoryRepository(() => t++); await hydrate(repo); return repo; }

describe('the vault through the store', () => {
  it('an Obsidian #school task arrives with its ⏰ reminder; an untagged one does not; a re-read changes nothing', async () => {
    await fresh();
    vault.set('Daily/Nov 20.md', '# Log\n- [ ] Revise joins #school ⏫ 📅 2026-11-22 ⏰ 17:00\n- [ ] Buy milk\n');
    await refreshVault();
    const t = getState().tasks.filter((x) => x.origin === 'obsidian');
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ title: 'Revise joins', priority: 3, reminders: [{ minutes: 0 }], extPath: 'Daily/Nov 20.md' });
    // the line got a block id, written back once
    expect(vault.get('Daily/Nov 20.md')).toMatch(/- \[ \] Revise joins #school ⏫ 📅 2026-11-22 ⏰ 17:00 \^m\w+\n- \[ \] Buy milk/);
    const before = vault.get('Daily/Nov 20.md');
    await refreshVault();
    expect(getState().tasks.filter((x) => x.origin === 'obsidian')).toHaveLength(1);
    expect(vault.get('Daily/Nov 20.md')).toBe(before);
  });
  it('a tick in Margin ticks the line and nothing else; "- [!]" and unknown text survive a due change', async () => {
    await fresh();
    vault.set('N.md', '- [ ] A #school some words 📅 2026-11-22 ^a1\n- [!] B #school 📅 2026-11-22 ^b1\n');
    await refreshVault();
    const a = getState().tasks.find((x) => x.extId === 'a1')!, b = getState().tasks.find((x) => x.extId === 'b1')!;
    expect(b.important).toBe(true);
    act.saveTask({ ...a, status: 2, completedAt: NOW });
    act.saveTask({ ...b, dueAt: new Date(2026, 10, 23, 23, 59).getTime() });
    await settle();
    await obsidianNow();
    expect(vault.get('N.md')).toBe('- [x] A #school some words 📅 2026-11-22 ✅ 2026-11-20 ^a1\n- [!] B #school 📅 2026-11-23 ^b1\n');
  });
  it('a new school task from Margin is appended to Margin/Tasks.md with its subject and kind tags', async () => {
    await fresh();
    act.saveCourse({ id: 'db', name: 'Database Systems', rooms: [], teacher: '', goal: null, sort: 0, demo: false });
    await settle();
    const c = getState().courses.find((x) => x.name === 'Database Systems');
    const task = { id: 'tk1', title: 'Lab report', courseId: c?.id ?? null, kind: 'lab' as const, dueAt: new Date(2026, 10, 22, 9).getTime(), startAt: null, estimateMin: null, priority: 0 as const, notes: '', status: 0 as const, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false, tags: ['school', 'lab'] };
    act.saveTask(task); await settle();
    await obsidianNow();
    expect(vault.get('Margin/Tasks.md')).toContain(`- [ ] Lab report #school #lab${c ? ' #Database-Systems' : ''} 📅 2026-11-22 ⏰ 09:00 ➕ 2026-11-20 ^tk1`);
    expect(getState().tasks.find((x) => x.id === 'tk1')).toMatchObject({ extId: 'tk1', extPath: 'Margin/Tasks.md' });
  });
  /* Rationale (v0.7.4 phone pass, 2026-11-20): the first read after the upgrade from 0.7.2 ran pushOut with no out
     cursor and no known lines, so every Obsidian task looked like a new Margin task: it was appended to
     Margin/Tasks.md as `^ob-<id>`, re-pointed there, and ingest (reading the notes as they were before that write)
     then deleted it. Six of the owner's tasks vanished from To-do and Tasks.md got six copies. */
  it('the first read after the upgrade links every old task to its line and writes nothing new', async () => {
    await fresh();
    const base = { courseId: null, kind: 'other' as const, startAt: null, estimateMin: null, priority: 0 as const, notes: '', status: 0 as const, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false };
    // what 0.7.2 left: an Obsidian task (the old bridge's `ob-` row) and Margin's own task, both already in the notes
    act.saveTask({ ...base, id: 'ob-a1', title: 'Finish the CP exercises', dueAt: new Date(2026, 10, 10, 23, 59).getTime(), origin: 'obsidian', extId: 'a1', extPath: 'Daily/Nov 13.md', tags: ['school'] });
    act.saveTask({ ...base, id: 'tk1', title: 'Hh', dueAt: new Date(2026, 10, 15, 16, 30).getTime(), tags: ['reading', 'school'] });
    await settle();
    const daily = '# Log\n- [ ] Finish the CP exercises #school 📅 2026-11-10 ^a1\n';
    const tasksNote = '---\ncreated: 2026-11-12\n---\n- [ ] Hh #school #reading 📅 2026-11-15 ⏰ 16:30 ^tk1\n';
    vault.set('Daily/Nov 13.md', daily);
    vault.set('Margin/Tasks.md', tasksNote);
    await obsidianNow();
    expect(vault.get('Margin/Tasks.md')).toBe(tasksNote);   // no `^ob-a1` copy appended
    expect(vault.get('Daily/Nov 13.md')).toBe(daily);
    const a = getState().tasks.find((x) => x.id === 'ob-a1');
    expect(a).toMatchObject({ title: 'Finish the CP exercises', extId: 'a1', extPath: 'Daily/Nov 13.md' });
    expect(getState().tasks.find((x) => x.id === 'tk1')).toBeDefined();
    expect(getState().tasks).toHaveLength(2);
    // and from then on Margin's edits go out as usual: a tick reaches the daily note's line
    act.saveTask({ ...a!, status: 2, completedAt: NOW });
    await settle();
    await obsidianNow();
    expect(vault.get('Daily/Nov 13.md')).toBe('# Log\n- [x] Finish the CP exercises #school 📅 2026-11-10 ✅ 2026-11-20 ^a1\n');
    expect(vault.get('Margin/Tasks.md')).toBe(tasksNote);
  });
  it('a phone that ran v0.7.4 gets the dropped tasks back on its next full read, and only that once', async () => {
    const repo = await fresh();
    const daily = '- [ ] Finish the CP exercises #school 📅 2026-11-10 ^a1\n';
    vault.set('Daily/Nov 13.md', daily);
    await refreshVault();
    // what v0.7.4 left: the row deleted, the out cursor past that delete, the note known, no re-read done yet
    await repo.removeMany([{ entity: 'task', id: 'ob-a1' }]);
    const ch = await repo.changes('task', 0);
    await repo.setKv('vault.outAt', String(Math.max(...ch.map((x) => x.updatedAt))));
    await repo.setKv('vault.reread', '');
    applySnapshot(await repo.load(), true);
    resetObsidianCache();   // the app restarts on the new build
    expect(getState().tasks.some((x) => x.extId === 'a1')).toBe(false);
    await refreshVault(['Daily/Nov 13.md']);   // a single-note event is not the full read
    expect(getState().tasks.some((x) => x.extId === 'a1')).toBe(false);
    await refreshVault();
    expect(getState().tasks.find((x) => x.extId === 'a1')).toMatchObject({ id: 'ob-a1', title: 'Finish the CP exercises', status: 0 });
    expect(vault.get('Daily/Nov 13.md')).toBe(daily);
    expect(await repo.getKv('vault.reread')).toBe('1');
  });
  it('a school task made in Margin before any vault was read still goes to Margin/Tasks.md on the first read', async () => {
    await fresh();
    act.saveTask({ id: 'tk9', title: 'Lab report', courseId: null, kind: 'lab', dueAt: new Date(2026, 10, 22, 9).getTime(), startAt: null, estimateMin: null, priority: 0, notes: '', status: 0, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false, tags: ['school', 'lab'] });
    await settle();
    await obsidianNow();
    expect(vault.get('Margin/Tasks.md')).toContain('- [ ] Lab report #school #lab 📅 2026-11-22 ⏰ 09:00 ➕ 2026-11-20 ^tk9');
    expect(getState().tasks.find((x) => x.id === 'tk9')).toMatchObject({ extId: 'tk9', extPath: 'Margin/Tasks.md' });
  });
  /* Rationale (v0.7.4 phone pass): every class in the snapshot carried `updatedAt: now`, so .margin/margin.json was
     rewritten (and synced to the desktop) on every change in Margin, even when nothing in it had changed. */
  it("Margin's notes and the snapshot are not rewritten when nothing in them changed", async () => {
    await fresh();
    act.saveCourse({ id: 'db', name: 'Database Systems', rooms: ['LR601'], teacher: '', goal: null, sort: 0, demo: false });
    act.saveMeeting({ id: 'm1', courseId: 'db', weekday: 0, start: '09:45', end: '11:15', demo: false });
    await settle();
    await obsidianNow();
    const snap = vault.get('.margin/margin.json');
    expect(snap).toContain('"kind": "class"');
    await new Promise((r) => setTimeout(r, 15));
    act.saveTask({ id: 'tk2', title: 'Unrelated', courseId: null, kind: 'other', dueAt: null, startAt: null, estimateMin: null, priority: 0, notes: '', status: 0, createdAt: NOW, completedAt: null, reminders: [], subtasks: [], demo: false, tags: [] });
    await settle();
    await obsidianNow();
    expect(vault.get('.margin/margin.json')).toBe(snap);
  });
  it('a line deleted in Obsidian removes its task', async () => {
    await fresh();
    vault.set('N.md', '- [ ] A #school ^a1\n');
    await refreshVault();
    expect(getState().tasks.some((x) => x.extId === 'a1')).toBe(true);
    vault.set('N.md', 'nothing left\n');
    await refreshVault(['N.md']);
    expect(getState().tasks.some((x) => x.extId === 'a1')).toBe(false);
  });
});
