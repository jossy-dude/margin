/**
 * v0.7.8.4 (SPEC §9.3 Tests): bone-tasks (the desktop) reads `🔔` the way Marrow does. Its pure block (`rings:start` …
 * `rings:end` in the vault's bone-tasks/main.js) is run here on the same fixture lines. Skipped where the vault is not
 * on disk (CI).
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { parseLine } from '../domain/vaultTasks';
import { lineRingTimes } from '../domain/vaultMap';

const MAIN = join(homedir(), 'Documents', 'Obsidian_Vault', '𐂯Bone𐂯', '.obsidian', 'plugins', 'bone-tasks', 'main.js');
const there = existsSync(MAIN) ? describe : describe.skip;
const LINES = readFileSync(join(__dirname, 'fixtures', 'vault-lines.md'), 'utf8').split('\n').filter((l) => l.trim());

there('bone-tasks rings like Marrow', () => {
  const src = existsSync(MAIN) ? readFileSync(MAIN, 'utf8') : '';
  const block = src.slice(src.indexOf('/* rings:start'), src.indexOf('/* rings:end */'));
  const bt = new Function(`${block}; return { parseRings, ringTimes, phoneRings, BELL_RE };`)() as {
    parseRings: (l: string) => unknown[]; ringTimes: (t: object) => number[]; phoneRings: (s: unknown, t: string, ms: number, d: string) => boolean; BELL_RE: RegExp;
  };
  it.each(LINES.map((l) => [l]))('%s', (raw) => {
    const t = parseLine(raw)!;
    const bell = bt.BELL_RE.exec(raw);
    expect(bell ? bt.parseRings(bell[1]!) : []).toEqual(t.rings);
    if (t.time || t.rings.length) expect(bt.ringTimes({ due: t.due, scheduled: t.scheduled, time: t.time, rings: t.rings }).sort((a, b) => a - b)).toEqual(lineRingTimes(t));
  });
  it('D6: a ring the phone rings today (or yesterday\'s list) keeps the desktop quiet; an old list does not', () => {
    const at = new Date(2026, 10, 27, 8, 50).getTime();
    const snap = { phoneRingsDay: '2026-11-26', phoneRings: [{ t: 'Test', at }] };
    expect(bt.phoneRings(snap, 'Test', at + 30_000, '2026-11-27')).toBe(true);
    expect(bt.phoneRings(snap, 'Other', at, '2026-11-27')).toBe(false);
    expect(bt.phoneRings(snap, 'Test', at, '2026-11-29')).toBe(false);
    expect(bt.phoneRings(null, 'Test', at, '2026-11-27')).toBe(false);
  });
});
