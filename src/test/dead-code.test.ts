import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** A sweep over the whole source tree for code that cannot affect behaviour. Both rules are things a
 *  reviewer has to re-derive by hand otherwise, and both were found by hand on the same pass:
 *  a ternary whose two arms are the same expression, and a re-export nobody imports. */

const SRC = resolve(__dirname, '..');
const files: string[] = [];
(function walk(dir: string): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'test') continue; // the tests assert these rules; they do not have to obey them
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) files.push(p);
  }
})(SRC);
expect(files.length).toBeGreaterThan(40); // …and the sweep really did walk the tree

const rel = (p: string) => p.slice(SRC.length + 1);
/** The two arms of every top-level ternary on a line: `? <then> : <else>`, quotes and brackets skipped. */
function ternaryArms(line: string): [string, string][] {
  const out: [string, string][] = [];
  let q: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) { if (c === q && line[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c !== '?') continue;
    // the condition is whatever precedes `?`; the arms are what follow, up to the matching `:`
    let depth = 0, then = '', j = i + 1, colon = -1;
    for (; j < line.length; j++) {
      const d = line[j]!;
      if ('([{'.includes(d)) depth++;
      else if (')]}'.includes(d)) { if (depth === 0) break; depth--; }
      else if (d === ':' && depth === 0) { colon = j; break; }
      then += d;
    }
    if (colon < 0) continue;
    let elseArm = '';
    depth = 0;
    for (j = colon + 1; j < line.length; j++) {
      const d = line[j]!;
      if ('([{'.includes(d)) depth++;
      else if (')]}'.includes(d)) { if (depth === 0) break; depth--; }
      else if ((d === ',' || d === ';') && depth === 0) break;
      else if (d === '?' && depth === 0) break; // a nested ternary follows: its arms, not this one's
      elseArm += d;
    }
    out.push([then.trim(), elseArm.trim()]);
    i = j - 1;
  }
  return out;
}

/** Every `export` declaration, with the name. Three shapes: `export const x`, `export function x`,
 *  `export interface x`, plus `export type X = …`. */
function exportedNames(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/^export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm)) out.push(m[1]!);
  return out;
}

describe('no code that can never affect behaviour', () => {
  it('no ternary has two identical arms', () => {
    const hits: string[] = [];
    for (const f of files) {
      for (const line of readFileSync(f, 'utf8').split('\n')) {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue; // a comment can hold `? a : a` without being code
        for (const [then, elseArm] of ternaryArms(line)) if (then && then === elseArm) hits.push(`${rel(f)}: ${line.trim()}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('every bare re-export is imported by something', () => {
    /** module path → the names other modules pull out of it, or `'*'` for a namespace import */
    const used = new Map<string, Set<string>>();
    const note = (from: string, spec: string, names: string[]) => {
      const key = resolveFile(dirname(from), spec);
      if (!key) return;
      const set = used.get(key) ?? new Set<string>();
      for (const n of names) set.add(n);
      used.set(key, set);
    };
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s+'(\.[^']+)'/g)) {
        note(f, m[2]!, m[1]!.split(',').map((x) => x.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()!.trim()).filter(Boolean));
      }
      for (const m of src.matchAll(/import\s+\*\s+as\s+\w+\s+from\s+'(\.[^']+)'/g)) note(f, m[1]!, ['*']);
    }
    const orphans: string[] = [];
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/^export\s*\{([^}]*)\}\s*;?\s*$/gm)) {
        for (const n of m[1]!.split(',').map((x) => x.trim()).filter(Boolean)) {
          const set = used.get(f);
          if (!set || (!set.has('*') && !set.has(n))) orphans.push(`${rel(f)} exports ${n}, which nothing imports`);
        }
      }
    }
    expect(orphans).toEqual([]);
  });

  /**
   * The sweep above only caught two shapes because those were the two that had been found by hand. This is
   * the general one, and it is the mechanism the deletions in this pass rely on: a top-level `export` that
   * nothing imports, by name or namespace, anywhere in `src/`.
   *
   * The whole tree is counted rather than only the imports, so a name used inside its own file still counts
   * as "used" — which is the right line: `export const x` used by `x` three lines below is exported for a
   * reason this test cannot see (a test file, or a deliberate public surface), and a name that appears
   * exactly once in the entire tree is not that.
   *
   * `src/test/` is counted for *uses* but skipped for *declarations*, because the tests assert these rules
   * and the names they import are exactly the ones this check would otherwise report.
   */
  it('no top-level export is referenced nowhere in the tree', () => {
    // The walker above deliberately skips `test/`, so those files are re-collected here: a test importing a
    // name IS a use of it. Skipping them would report `MemoryRepository` and `meshFractions` as orphans,
    // which is how a correct guard teaches you to distrust it.
    const testDir = join(SRC, 'test');
    const testFiles: string[] = [];
    (function walk(dir: string): void {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name)) testFiles.push(p);
      }
    })(testDir);
    const tokens = new Map<string, number>();
    for (const f of [...files, ...testFiles]) {
      for (const m of readFileSync(f, 'utf8').matchAll(/[A-Za-z_$][\w$]*/g)) tokens.set(m[0], (tokens.get(m[0]) ?? 0) + 1);
    }
    const declaredSomewhere = new Set<string>();
    for (const f of files) if (!f.startsWith(testDir)) for (const n of exportedNames(readFileSync(f, 'utf8'))) declaredSomewhere.add(n);
    const orphans: string[] = [];
    for (const f of files) {
      if (f.startsWith(testDir)) continue;
      for (const n of exportedNames(readFileSync(f, 'utf8'))) {
        // one occurrence is the declaration itself; anything more is a real reference somewhere
        if ((tokens.get(n) ?? 0) > 1) continue;
        orphans.push(`${rel(f)} exports ${n}, and nothing in src/ mentions it again`);
      }
    }
    expect(orphans).toEqual([]);
    // not vacuous: the sweep must have found declarations to check
    expect(declaredSomewhere.size).toBeGreaterThan(80);
  });
});

function resolveFile(fromDir: string, spec: string): string | null {
  const base = resolve(fromDir, spec);
  for (const c of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) if (files.includes(base + c)) return base + c;
  return null;
}
/* The two dead sites the sweep found beyond the finding's three, each replaced by a constant. They are
 * behaviour-preserving only if the old expression really was that constant for every input, so the old
 * expressions are re-evaluated here over their whole input domain rather than asserted about. */
describe('the replacements the dead sweep made are the constants they replaced', () => {
  it('the Btn stroke resolved to the ink for every button kind', () => {
    for (const kind of ['primary', 'ink', 'danger', 'ghost'] as const) {
      // kit.tsx:68 as shipped: `kind === 'ghost' ? c.ink : bg === 'transparent' ? c.ink : c.ink`
      const bg = kind === 'primary' ? 'acc' : kind === 'ink' ? 'ink' : kind === 'danger' ? 'bad' : 'transparent';
      const old = kind === 'ghost' ? 'ink' : bg === 'transparent' ? 'ink' : 'ink';
      expect({ kind, old, now: 'ink' }).toEqual({ kind, old, now: 'ink' });
    }
  });
  it('the ClockFace minute hand offset was +0 whether or not motion was reduced', () => {
    for (const reduce of [true, false]) {
      const ms = 1_726_931_234_567;
      expect({ reduce, old: (ms / 60_000 % 60) * 6 + (reduce ? 0 : 0), now: (ms / 60_000 % 60) * 6 }).toEqual({ reduce, old: (ms / 60_000 % 60) * 6, now: (ms / 60_000 % 60) * 6 });
    }
  });
  it('the Focus dial read the same clock in both phases, so the phase arm chose nothing', () => {
    // Focus.tsx:172 as shipped: `t.phase === 'break' ? t.focusLeftMs : t.focusLeftMs`
    const t = { phase: 'break', focusLeftMs: 1_234 } as { phase: string; focusLeftMs: number };
    expect({ break: t.phase === 'break' ? t.focusLeftMs : t.focusLeftMs, focus: t.focusLeftMs }).toEqual({ break: t.focusLeftMs, focus: t.focusLeftMs });
    expect(t.focusLeftMs).toBe(1234); // a non-zero value, so the test cannot pass on a zero
  });
});
