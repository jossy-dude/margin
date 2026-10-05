import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Every `npm run` script that names a file must name one that exists. `plates:gen` and
 *  `plates:preview` pointed at scripts that were never written, so both failed with MODULE_NOT_FOUND
 *  on first run — and they are the documented entry points for the <plates> work in prompt.md. */
const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as { scripts: Record<string, string> };
const ROOT = resolve(__dirname, '../..');

/** The path a script runs, if it runs a local file: `node … scripts/x.mjs`, `node ./y.js`, etc. */
function localPaths(cmd: string): string[] {
  const out: string[] = [];
  // bare `scripts/…` or `./scripts/…`, anything with a path separator; a bare `expo`/`jest` is a binary
  for (const m of cmd.matchAll(/(?:^|\s)((?:\.{0,2}\/)?(?:[\w.-]+\/)+[\w.-]+\.(?:mjs|cjs|js|ts|sh))(?=\s|$)/g)) out.push(m[1]!);
  return out;
}

describe('every npm script runs something that exists (BUG-012)', () => {
  it('the scripts block is not empty, so the check below is not vacuous', () => {
    expect(Object.keys(pkg.scripts).length).toBeGreaterThan(5);
    expect(pkg.scripts.sounds).toContain('synth-sounds.mjs'); // the one script that does exist
    expect(existsSync(join(ROOT, 'scripts/synth-sounds.mjs'))).toBe(true);
  });

  it('no script points at a file that is not there', () => {
    const missing: string[] = [];
    for (const [name, cmd] of Object.entries(pkg.scripts)) {
      for (const p of localPaths(cmd)) if (!existsSync(resolve(ROOT, p))) missing.push(`${name} → ${p}`);
    }
    expect(missing).toEqual([]);
  });

  it('and the two dead plate entry points are gone, not merely repointed', () => {
    // The <plates> feature is blocked on PNGs the user has not supplied (prompt.md: "ask the user;
    // stop and ask if absent"), so the honest fix is to stop shipping entry points that cannot run.
    // When the PNGs arrive the scripts come back with them.
    expect(Object.keys(pkg.scripts).filter((k) => k.startsWith('plates:'))).toEqual([]);
    expect(JSON.stringify(pkg.scripts)).not.toContain('plate-preview');
    expect(JSON.stringify(pkg.scripts)).not.toContain('plates.generated');
  });

  it('the sounds script it kept still works, and no other script was touched', () => {
    expect(pkg.scripts.sounds).toBe('node scripts/synth-sounds.mjs');
    for (const kept of ['check', 'test', 'lint', 'typecheck', 'boundaries', 'bundle']) expect(pkg.scripts[kept]).toBeTruthy();
  });

  it('no source comment claims a script exists that does not', () => {
    // faces.ts asserted that scripts/plate-preview.mjs imports PLATE_DARK_MATRIX, which is how a
    // reader would conclude the matrix was covered. There was no such script.
    const faces = readFileSync(join(__dirname, '../ui/clock/faces.ts'), 'utf8');
    expect(faces).not.toContain('scripts/plate-preview.mjs');
    expect(faces).toContain('PLATE_DARK_MATRIX'); // the matrix itself stays; the plates work needs it
  });
});