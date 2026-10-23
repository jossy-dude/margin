import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_VERSION } from '../domain/version';
import { buildTables } from '../services/export';
import { seedSnapshot } from '../data/seed';

/** `app.json` is the build's number and `APP_VERSION` is the app's; the bug this pins is that they were
 *  two different numbers (the file said 0.2.0, the Summary said "Margin 1.0"). Read with `readFileSync`
 *  rather than `require` so a relative JSON import cannot be resolved by a bundler in one place and not
 *  another. */
const app = JSON.parse(readFileSync(join(__dirname, '../../app.json'), 'utf8')) as { expo: { version: string } };
const NOW = new Date(2026, 9, 12, 9, 30).getTime();

describe('the one version string', () => {
  it('is the version in app.json', () => {
    expect(app.expo.version).toBe(APP_VERSION);
  });

  it('is what the export Summary says, instead of the old "Margin 1.0"', () => {
    const summary = buildTables(seedSnapshot(NOW), NOW).find((t) => t.name === 'Summary')!;
    const rows = Object.fromEntries(summary.rows.map((r) => [String(r[0]), r[1]]));
    expect(rows.app).toBe(`Margin ${APP_VERSION}`);
    expect(rows.app).not.toBe('Margin 1.0');
  });

  it('and the same Summary carries the semester range the export actually used', () => {
    const summary = buildTables(seedSnapshot(NOW), NOW).find((t) => t.name === 'Summary')!;
    const rows = Object.fromEntries(summary.rows.map((r) => [String(r[0]), r[1]]));
    expect(rows.semester).toBe('from 7 Sep 2026'); // the seed's semesterStart, open-ended by default
  });
});
