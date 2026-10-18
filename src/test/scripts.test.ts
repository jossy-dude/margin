import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Every `npm run` script that names a file must name one that exists. `plates:gen` and
 *  `plates:preview` pointed at scripts that were never written, so both failed with MODULE_NOT_FOUND
 *  on first run — and they are the documented entry points for the <plates> work. */
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
    // The <plates> feature is blocked on PNGs the user has not supplied, so the honest fix is to stop
    // shipping entry points that cannot run.
    // When the PNGs arrive the scripts come back with them.
    expect(Object.keys(pkg.scripts).filter((k) => k.startsWith('plates:'))).toEqual([]);
    expect(JSON.stringify(pkg.scripts)).not.toContain('plate-preview');
    expect(JSON.stringify(pkg.scripts)).not.toContain('plates.generated');
  });

  it('the sounds script it kept still works, and no other script was touched', () => {
    expect(pkg.scripts.sounds).toBe('node scripts/synth-sounds.mjs');
    for (const kept of ['check', 'test', 'lint', 'typecheck', 'boundaries', 'bundle']) expect(pkg.scripts[kept]).toBeTruthy();
  });

  it('and no half-finished remnant of the plates feature is left behind in the source', () => {
    // The last thing standing for <plates> was `PLATE_DARK_MATRIX` in faces.ts — a luminance-invert matrix for
    // a `PlateFace` component that does not exist — and a test "covering" it by asserting the string
    // 'PLATE_DARK_MATRIX' appears in faces.ts. A test that checks a constant's own name in its own file proves
    // nothing: it passes exactly as long as the dead code stays. Both are gone; if the plates ever come back
    // they land together with a test that renders one.
    // Comments are stripped first, and deliberately: the docstrings that record *why* something was removed
    // have to name it, and a check that forbade the name everywhere would forbid the explanation too.
    const code = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const sources: Record<string, string> = {
      'ui/clock/faces.ts': code(join(__dirname, '../ui/clock/faces.ts')),
      'tokens/theme.ts': code(join(__dirname, '../tokens/theme.ts')),
    };
    for (const [name, src] of Object.entries(sources)) {
      for (const ghost of ['PLATE_DARK_MATRIX', 'ONYX.light', 'plate-preview', 'plates.generated', 'assets/plates']) {
        expect({ name, ghost, present: src.includes(ghost) }).toEqual({ name, ghost, present: false });
      }
    }
  });

  it('and no source comment claims a script or an asset exists that does not', () => {
    // faces.ts used to assert that scripts/plate-preview.mjs imported PLATE_DARK_MATRIX, which is how a reader
    // would conclude the matrix had coverage. There was no such script and now there is no such comment.
    const root = join(__dirname, '..');
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'test') walk(p, out); } else if (/\.tsx?$/.test(e.name)) out.push(p);
      }
      return out;
    };
    const claims: string[] = [];
    for (const f of walk(root)) {
      const rel = f.slice(root.length + 1);
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (!/^\s*(\*|\/\/|\/\*)/.test(line)) return;
        for (const m of line.matchAll(/\b(?:scripts|assets)\/[\w./-]+\.(?:mjs|cjs|js|ts|sh|png|jpg)\b/g)) {
          if (!existsSync(join(root, m[0]!))) claims.push(`${rel}:${i + 1}  ${m[0]}`);
        }
      });
    }
    expect(claims).toEqual([]);
  });
});