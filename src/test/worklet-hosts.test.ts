import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * A function called from the UI runtime must be a worklet, or the app does not boot.
 *
 * `useFrameCallback`, `useAnimatedStyle`, `useDerivedValue`, a gesture handler's `.onUpdate`, and
 * `useAnimatedReaction` all run their bodies on the UI thread. A plain JS function captured in one of those
 * bodies is not called — it is *serialised* and invoked across the bridge, which
 * `react-native-worklets` refuses: `[Worklets] Tried to synchronously call a Remote Function.`
 *
 * That refusal is a thrown `Error`, not a warning, so it takes the whole screen with it. It has happened
 * twice in this repository, both times in a commit whose `tsc`, `eslint`, `jest` and `expo export` were all
 * green, because none of those four ever run a worklet:
 *
 * - `eac2a65` ("DST clock") extracted `handAngles` out of `ClockFace.tsx` into the dial engine and called it
 *   from the frame callback. **The app's first frame was a red box. Today could not be opened at all.**
 * - `escapementAngle`/`escapementTurn`, the Focus dial's escapement (since removed with the dial redesign),
 *   were remote for the same reason.
 *
 * `useAnimatedStyle(() => …)` and friends are workletised by Babel automatically, so nothing in the source
 * says "this runs on the UI thread". These two rules are what stands in for that.
 */

const SRC = resolve(__dirname, '..');

/** Every JSX/TSX file, so an import can be followed to where it is defined. */
const files: string[] = [];
(function walk(dir: string): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'test') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e.name)) files.push(p);
  }
})(SRC);

/** The hooks and chainable calls whose bodies execute on the UI runtime. */
const HOSTS = ['useFrameCallback', 'useAnimatedStyle', 'useDerivedValue', 'useAnimatedProps', 'useAnimatedReaction', 'useHandler', 'withTiming', 'withSpring', 'runOnUI', 'useWorkletCallback'];

/** Names re-exported from these packages that are safe to call from a worklet because they *are* worklets. */
const NATIVE = /^(interpolate|interpolateColor|Easing|Math|Date|Object|Array|Number|String|JSON|console|isSharedValue|makeMutable|runOnJS|runOnUI|measure|scrollTo|setGestureState|isSharedValueRef|toString|valueOf|hasOwnProperty|push|pop|shift|slice|join|keys|entries|values|from|of|assign|freeze|now|get|set|log|warn|error|sin|cos|tan|atan2|min|max|round|floor|ceil|abs|sqrt|pow|random)$/;

const hasDirective = (src: string, at: number): boolean => {
  // the directive goes in the body of an arrow or a function expression; look at the next 400 chars
  const body = src.slice(at, at + 400);
  return /['"]worklet['"]/.test(body);
};

const srcOf = (abs: string) => readFileSync(abs, 'utf8');

/** Resolve a relative specifier the way the bundler does, trying `.ts` then `.tsx` then `/index.*`. */
function resolveModule(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null; // a package export, not ours to judge — NATIVE covers the ones we know
  const base = resolve(dirname(from), spec);
  for (const p of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (files.includes(p)) return p;
  }
  return null;
}

/** Where an imported name is defined: one hop through the barrel, which is how this repo imports everything. */
function definitionOf(from: string, name: string): { file: string; at: number } | null {
  let file: string | null = from;
  for (let hop = 0; hop < 4 && file; hop++) {
    const src = srcOf(file);
    const decl = new RegExp(`export\\s+(?:const|let|function)\\s+${name}\\b`).exec(src);
    if (decl) return { file, at: decl.index + decl[0].length };
    let spec: string | undefined;
    const named = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'([^']+)'`).exec(src);
    const star = /export\s*\*\s*from\s*'([^']+)'/.exec(src);
    const fromClause = new RegExp(`import[^;]*?from\\s*'([^']+)'`, 's').exec(src);
    spec = named?.[1] ?? (fromClause && new RegExp(`\\b${name}\\b`).test(fromClause[0]) ? fromClause[1] : undefined) ?? star?.[1];
    file = spec ? resolveModule(file, spec) : null;
  }
  return null;
}
const relOf = (abs: string) => abs.slice(SRC.length + 1);

const offenders: string[] = [];
const workletised = new Set<string>();

/** Everything named inside a body that runs on the UI thread has to be a worklet itself. `where` names the
 *  context so a failure reads as a place a person can go and look. */
function checkBody(path: string, body: string, where: string): void {
  const src = srcOf(path), rel = relOf(path);
  for (const name of new Set([...body.matchAll(/(\w+)\s*\(/g)].map((x) => x[1]!))) {
    if (NATIVE.test(name)) continue;
    const localDecl = new RegExp(`(?:^|\\W)(?:const|let|function)\\s+${name}\\b`).exec(src);
    if (localDecl) {
      if (hasDirective(src, localDecl.index + localDecl[0].length)) workletised.add(`${rel}: ${name}`);
      else offenders.push(`${rel}: \`${name}\` is called ${where} with no 'worklet' directive`);
      continue;
    }
    const def = definitionOf(path, name);
    if (!def) continue; // a package export; NATIVE covers the ones we know are safe
    if (hasDirective(srcOf(def.file), def.at)) workletised.add(`${relOf(def.file)}: ${name}`);
    else offenders.push(`${relOf(def.file)}: \`${name}\` is called ${where} (${rel}) with no 'worklet' directive`);
  }
}

/** The source text of the balanced bracket group that opens at `open`. */
function group(src: string, open: number, limit = 4000): string {
  let depth = 0, q: string | null = null;
  for (let i = open; i < src.length && i < open + limit; i++) {
    const c = src[i]!;
    if (q) { if (c === q && src[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) { depth--; if (depth === 0) return src.slice(open + 1, i); }
  }
  return '';
}

// Pass 1 — the bodies of the hooks themselves.
for (const path of files) {
  const src = srcOf(path);
  for (const host of HOSTS) {
    for (const m of src.matchAll(new RegExp(`\\b${host}\\s*\\(`, 'g'))) {
      const body = group(src, m.index + m[0].length - 1);
      if (body) checkBody(path, body, `inside \`${host}(\``);
    }
  }
}

// Pass 2 — the bodies of the worklets pass 1 approved, because a worklet calling a plain function fails the
// same way: `escapementTurn` (since removed with the dial) used to be reachable only that way, from a worklet
// calling a worklet, and the same trap waits one call deeper for whatever gets extracted next.
for (let round = 0; round < 4; round++) {
  const before = workletised.size;
  for (const entry of [...workletised]) {
    const i = entry.lastIndexOf(': '), rel = entry.slice(0, i), name = entry.slice(i + 2);
    const path = join(SRC, rel), src = srcOf(path);
    const decl = new RegExp(`(?:const|let|function)\\s+${name}\\b`).exec(src);
    if (!decl) continue;
    const brace = src.indexOf('{', decl.index);
    if (brace < 0) continue;
    checkBody(path, group(src, brace), `inside the worklet \`${name}\``);
  }
  if (workletised.size === before) break;
}

test('everything a worklet calls is itself a worklet', () => {
  expect(offenders).toEqual([]);
});

test('the sweep found worklets, so the rule is reading something', () => {
  // without this the test above would pass on an empty sweep after a refactor that broke the matcher
  expect([...workletised].sort()).toEqual(['ui/clock/faces.ts: handAngles']);
});

describe('the real bundle, when one is being served', () => {
  /** Babel's output is the only proof that matters here: the directive is a comment, and a comment the plugin
   *  does not recognise is worth nothing. Fetched from Metro on 8081 when it is up, and when it is not the check
   *  says so in the log rather than passing quietly. */
  const port = process.env.BUNDLE_PORT ?? '8081';
  let bundle: string | null = null;
  beforeAll(() => {
    try {
      const res = execFileSync('curl', ['-s', '--max-time', '40', `http://127.0.0.1:${port}/index.bundle?platform=android&dev=true&minify=false`],
        { maxBuffer: 512 * 1024 * 1024, encoding: 'utf8' });
      bundle = res.startsWith('<') || res.length < 100_000 ? null : res;
    } catch { bundle = null; }
  });

  it('the dial helper is emitted as a worklet factory, not a plain function', () => {
    if (!bundle) {
      console.warn(`no Metro bundle on :${port} — the source rule above still ran; this check did not`);
      return;
    }
    // A workletised declaration is rewritten to `var f = function <name>Factory(_refN) { var _worklet_<hash>_init_data = …`.
    // A plain function keeps its own body, which on the UI thread is a *remote* call and a hard throw.
    for (const name of ['handAngles']) {
      const factory = new RegExp(`var ${name} = function \\w+Factory\\(_ref`).test(bundle!);
      expect({ name, workletFactory: factory }).toEqual({ name, workletFactory: true });
    }
    // …and the control: a same-file export that is *not* a worklet is still emitted plainly, so the check
    // above cannot be passing because the pattern matches everything.
    for (const name of ['compositeSvg', 'dialPal']) {
      expect({ name, workletFactory: new RegExp(`var ${name} = function \\w+Factory\\(_ref`).test(bundle!) }).toEqual({ name, workletFactory: false });
    }
  });
});