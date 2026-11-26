import { readFileSync } from 'fs';
import { join } from 'path';
import { ERR, clashNote, problemFrom, problemGroups, skewOf, syncView, problemOf } from '../domain/syncView';

const NOW = new Date(2026, 10, 20, 20, 31).getTime();
const base = { paired: true, live: true, obsidian: false, vault: true, lastOk: NOW, presence: [{ role: 'desktop-obsidian' }], path: 'Wi-Fi', addr: '192.168.1.11:7428' };

describe('Obsidian & Sync page', () => {
  it('connected: four devices, the path, up to date', () => {
    const v = syncView(base, NOW, false);
    expect(v.devices.map((d) => `${d.name}:${d.dot}`)).toEqual(['Marrow (this phone):on', 'Obsidian on the phone:off', 'Desktop hub:on', 'Obsidian on the desktop:on']);
    expect(v.connection).toBe('Home Wi-Fi · desktop at 192.168.1.11');
    expect(v.stage?.text).toBe('Up to date · 20:31');
    expect(v.ok).toBe(true);
  });
  it('a stage with a size reads with its numbers', () => {
    expect(syncView({ ...base, stage: 'Comparing files', stageDone: 1204, stageOf: 2850 }, NOW, false).stage).toEqual({ text: 'Comparing files 1,204 / 2,850', done: 1204, of: 2850 });
  });
  it('offline and the folder lost: the plain cause and one action each', () => {
    const v = syncView({ ...base, live: false, vault: false, lastPath: 'Tailscale', errors: [{ at: NOW, msg: 'The desktop was not found on this network (tried 192.168.1.11:7428). Is bone-syncd running and the computer awake?' }] }, NOW, false);
    expect(v.connection).toBe('Offline: desktop not found on this network (last time: Tailscale).');
    expect(v.problems.map((p) => p.action)).toEqual(['folder', 'retry']);
    expect(v.problems.map((p) => p.code)).toEqual(['E-PERM', 'E-AWAY']);
    expect(v.ok).toBe(false);
  });
  it('problems are told apart by what to do', () => {
    expect(problemOf('The desktop does not know this phone any more. Pair again (Settings → Obsidian & sync).', 0).action).toBe('pair');
    expect(problemOf("Couldn't write Daily/x.md on the phone", 0).action).toBe('retry');
  });
});

describe('error codes and "What went wrong" (v0.7.8, SPEC §8 G3)', () => {
  const kt = readFileSync(join(__dirname, '..', '..', 'modules', 'margin-native', 'android', 'src', 'main', 'java', 'app', 'marginalia', 'nativebits', 'SyncEngine.kt'), 'utf8');
  const enumBody = kt.slice(kt.indexOf('enum class Err'), kt.indexOf('val code get()'));
  const kotlin = [...enumBody.matchAll(/^\s+([A-Z]+)\("(phone|desktop)", "(\w+)"\)/gm)].map((m) => ({ code: `E-${m[1]}`, side: m[2], action: m[3] }));
  it('JS knows every Kotlin code, with the same side and action', () => {
    expect(kotlin.length).toBeGreaterThanOrEqual(9);
    for (const k of kotlin) expect({ code: k.code, side: ERR[k.code]?.side, action: ERR[k.code]?.action }).toEqual(k);
    expect(Object.keys(ERR).sort()).toEqual(kotlin.map((k) => k.code).sort());
  });
  it('the spec\'s nine codes are all there', () => {
    for (const c of ['E-AWAY', 'E-PAIR', 'E-VERSION', 'E-SEAL', 'E-PERM', 'E-BIG', 'E-HELD', 'E-CLASH', 'E-WRITE']) expect(ERR[c]).toBeDefined();
  });
  it('every card has one button with a label', () => {
    for (const k of Object.values(ERR)) expect(k.label.length).toBeGreaterThan(1);
  });
  it('no fail() without a code is left in the sync code', () => {
    const dir = join(__dirname, '..', '..', 'modules', 'margin-native', 'android', 'src', 'main', 'java', 'app', 'marginalia', 'nativebits');
    for (const f of ['SyncEngine.kt', 'SyncFiles.kt', 'SyncLocal.kt']) expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/\bfail\("/);
  });
  it('a coded row keeps its code, file and fix time', () => {
    const p = problemFrom({ at: 5, msg: 'D/Plan.excalidraw.md changed on both sides.', code: 'E-CLASH', side: 'desktop', action: 'open', arg: 'D/Plan (phone 2026-11-26 1252).excalidraw.md', fixed: 9 });
    expect(p).toMatchObject({ code: 'E-CLASH', action: 'open', label: 'Open', arg: 'D/Plan (phone 2026-11-26 1252).excalidraw.md', fixed: 9, side: 'desktop' });
  });
  it('an old row without a code is read by its words', () => {
    expect(problemFrom({ at: 1, msg: 'Daily/big.pdf is over 20 MB, too big to sync from the phone.' }).code).toBe('E-BIG');
  });
  it('grouped by device; open first, newest first; fixed ones last', () => {
    const ps = [
      problemFrom({ at: 1, msg: 'a', code: 'E-WRITE' }), problemFrom({ at: 3, msg: 'b', code: 'E-WRITE', fixed: 4 }),
      problemFrom({ at: 2, msg: 'c', code: 'E-PERM' }), problemFrom({ at: 9, msg: 'd', code: 'E-AWAY' }),
    ];
    const g = problemGroups(ps);
    expect(g.map((x) => x.title)).toEqual(['This phone', 'The desktop']);
    expect(g[0]!.items.map((p) => p.cause)).toEqual(['c', 'a', 'b']);
  });
  it('a fixed problem no longer makes sync "not ok"', () => {
    expect(syncView({ ...base, errors: [{ at: NOW, msg: 'x', code: 'E-AWAY', fixed: NOW }] }, NOW, false).ok).toBe(true);
    expect(syncView({ ...base, errors: [{ at: NOW, msg: 'x', code: 'E-AWAY' }] }, NOW, false).ok).toBe(false);
  });
  it('the link coming up, the folder picked and a hold answered mark their problems fixed', () => {
    expect(kt).toContain('fixed(Err.AWAY, Err.PAIR, Err.VERSION, Err.SEAL, Err.HICCUP)');
    expect(kt).toContain('fixed(Err.PERM)');
    const files = readFileSync(join(__dirname, '..', '..', 'modules', 'margin-native', 'android', 'src', 'main', 'java', 'app', 'marginalia', 'nativebits', 'SyncFiles.kt'), 'utf8');
    expect(files).toContain('E.fixed(SyncEngine.Err.HELD)');
  });
  it('a clash from the hub becomes an E-CLASH card that opens the other version', () => {
    expect(kt).toMatch(/"conflicts-note" -> .*fail\(Err\.CLASH, .*, f\)/);
    expect(kt).toMatch(/"copy" -> .*fail\(Err\.CLASH, .*, f\)/);
  });
});

describe('clashes, the phone log and clock skew (v0.7.8.1, SPEC §8 G2, G4)', () => {
  const dir = join(__dirname, '..', '..', 'modules', 'margin-native', 'android', 'src', 'main', 'java', 'app', 'marginalia', 'nativebits');
  const kt = readFileSync(join(dir, 'SyncEngine.kt'), 'utf8');
  it('skew over 2 minutes shows, in words', () => {
    expect(skewOf(90_000)).toBeNull();
    expect(skewOf(-120_000)).toBeNull();
    expect(skewOf(3 * 60_000)).toBe("The desktop's clock is 3 min ahead of this phone's. Set both to automatic time.");
    expect(skewOf(-5 * 3600_000)).toBe("The desktop's clock is 5 h behind this phone's. Set both to automatic time.");
    expect(syncView({ ...base, offset: 600_000 }, NOW, false).skew).toContain('10 min ahead');
    expect(syncView({ ...base, live: false, offset: 600_000 }, NOW, false).skew).toBeNull();
  });
  it('a clash row says where the other version is', () => {
    expect(clashNote({ at: 1, p: 'Week.md', file: 'Conflicts/2026-11-26.md', how: 'note' })).toBe('Other version in Conflicts/2026-11-26.md');
    expect(clashNote({ at: 1, p: 'D/Plan.excalidraw.md', file: 'D/Plan (phone 2026-11-26 1252).excalidraw.md', how: 'copy' })).toBe('Both kept · Plan (phone 2026-11-26 1252).excalidraw.md');
  });
  it('the hub\'s conflict frames fill the clash list; Done removes it and greys its card', () => {
    expect(kt).toContain('clash(cp, f, "note")');
    expect(kt).toContain('clash(cp, f, "copy")');
    expect(kt).toContain('.put("clashes", ');
    expect(kt).toMatch(/fun clashDone\(at: Long\)[\s\S]*it\.put\("fixed"/);
  });
  it('the phone writes its last 200 events to .margin/sync-log.phone.json, once a minute at most, only when new', () => {
    expect(kt).toContain('LOG_PATH = ".margin/sync-log.phone.json"');
    expect(kt).toContain('LOG_MS = 60_000L');
    expect(kt).toContain('if (id == loggedId) return');
    expect(kt).toContain('SyncLocal.editNow(LOG_PATH, "*", ');
    expect(readFileSync(join(dir, 'SyncStore.kt'), 'utf8')).toContain('WHERE kind <> ?');
  });
  it('the log is single:phone, so it goes to the PC one way', () => {
    const fx = JSON.parse(readFileSync(join(__dirname, '..', '..', 'modules', 'margin-native', 'android', 'src', 'test', 'resources', 'classes.json'), 'utf8'));
    expect(fx.cases).toContainEqual({ p: '.margin/sync-log.phone.json', cls: 'single', writer: 'phone' });
  });
});
