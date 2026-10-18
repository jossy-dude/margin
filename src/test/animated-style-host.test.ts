import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * A Reanimated `useAnimatedStyle` handle only means anything to Reanimated.
 *
 * Hand one to a plain host element — `<View>`, `<Text>`, `Box`, `Row` — and two things happen, both bad:
 *
 * 1. **It is dead.** Only `Animated.*` runs `PropsFilter.filterNonAnimatedProps`, which swaps the handle for
 *    its `initial` snapshot and leaves the rest to the mapper. A plain view passes the handle straight
 *    through, so the native side is handed the handle's own bookkeeping keys — `viewDescriptors`, `initial`,
 *    `styleUpdaterContainer` — as though they were style props, and the animation never runs.
 * 2. **It crashes in `__DEV__`.** React Fabric deep-freezes every style prop on mount
 *    (`ReactNativePrivateInterface.deepFreezeAndThrowOnMutationInDev`, in
 *    `react-native/Libraries/Renderer/implementations/ReactFabric-dev.js`), which walks into the handle and
 *    arms a throwing setter on `styleUpdaterContainer.current`. `useAnimatedStyle`'s own mount effect then
 *    assigns through it and the screen dies with *"You attempted to set the key `current` … has been
 *    frozen."*
 *
 * Bug 2 is how this test came to exist. It took the attendance screen of the onboarding tour — the one
 * screen whose whole lesson is a tap and then a hold — down with a red box in Expo Go, and the pulse and the
 * ring had never animated anywhere.
 *
 * The rule is cheap to state and easy to break by accident, so it is checked across the tree instead of
 * remembered at each call site. The one subtlety is scope: the handle reaches the element through a
 * *parameter* (`const halo = (style) => <View style={[..., style]}/>`), so a sweep that only looked at local
 * declarations would pass straight over the line that broke it — and a sweep that treated the parameter name
 * as a file-wide handle would then flag every unrelated `style={[…]}` prop in the same file. Handle-ness is
 * therefore resolved per function scope, innermost enclosing scope first.
 */

const SRC = resolve(__dirname, '..');
const files: string[] = [];
(function walk(dir: string): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'test') continue; // the tests assert this rule; they do not have to obey it
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.tsx')) files.push(p);
  }
})(SRC);
expect(files.length).toBeGreaterThan(20); // …and the sweep really did walk the tree

interface Scope { name: string; start: number; end: number; params: string[]; handles: Set<string>; fromArgs: Set<string> }

const ident = /^[A-Za-z_$][\w$]*$/;

/** Index of the bracket closing the one at `open`; -1 if unbalanced. Strings, templates and comments skipped. */
function matchClose(src: string, open: number): number {
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i]!;
    if (c === '"' || c === "'" || c === '`') { const q = c; i++; while (i < src.length && (src[i] !== q || src[i - 1] === '\\')) i++; continue; }
    if (c === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); if (nl < 0) return -1; i = nl; continue; }
    if (c === '/' && src[i + 1] === '*') { const cl = src.indexOf('*/', i); if (cl < 0) return -1; i = cl + 1; continue; }
    if (pairs[c]) depth++;
    else if (pairs[c!] === undefined && ')]}'.includes(c)) { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** First index at or after `from` matching `stop`, outside every bracket, string and comment. */
function scan(src: string, from: number, stop: (c: string, i: number, depth: number) => boolean): number {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i]!;
    if (c === '"' || c === "'" || c === '`') { const q = c; i++; while (i < src.length && (src[i] !== q || src[i - 1] === '\\')) i++; continue; }
    if (c === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); if (nl < 0) return src.length; i = nl; continue; }
    if (c === '/' && src[i + 1] === '*') { const cl = src.indexOf('*/', i); if (cl < 0) return src.length; i = cl + 1; continue; }
    if ('([{'.includes(c)) { depth++; continue; }
    if (')]}'.includes(c)) { if (depth === 0) return i; depth--; continue; }
    if (stop(c, i, depth)) return i;
  }
  return src.length;
}

function paramsOf(src: string, open: number): string[] {
  const close = matchClose(src, open);
  if (close < 0) return [];
  return src.slice(open + 1, close).replace(/[{}]/g, ' ').split(',').map((s) => s.split(/[:=?]/)[0]!.trim()).filter((s) => ident.test(s));
}

/** One scope per locally-declared function, plus the module scope. Memoised per source string: the scopes
 *  are *mutated* as the analysis learns which names hold handles, so a fresh parse per question would throw
 *  that knowledge away between questions. */
const scopeCache = new Map<string, Scope[]>();
function scopesOf(src: string): Scope[] {
  const hit = scopeCache.get(src);
  if (hit) return hit;
  const scopes: Scope[] = [{ name: '<module>', start: 0, end: src.length, params: [], handles: new Set(), fromArgs: new Set() }];
  const re = /(?:^|[\s;}])(?:export\s+)?(?:const|let|var|function)\s+(\w+)\s*(?:=\s*)?(?:function\s*)?\(/g;
  for (const m of src.matchAll(re)) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(src, open);
    if (close < 0 || close >= src.length) continue;
    const params = paramsOf(src, open);
    const after = src.slice(close + 1);
    const arrow = after.indexOf('=>'), brace = after.indexOf('{');
    if (arrow >= 0 && (brace < 0 || arrow < brace)) {
      // expression-bodied arrow (`const halo = (style) => <View …/>`): the scope runs to the end of the statement
      const end = scan(src, close + 1, (c, _i, d) => c === ';' && d === 0);
      scopes.push({ name: m[1]!, start: close + 1, end, params, handles: new Set(), fromArgs: new Set() });
    } else {
      const b = src.indexOf('{', close);
      const end = b < 0 ? -1 : matchClose(src, b);
      if (end < 0) continue;
      scopes.push({ name: m[1]!, start: b, end, params, handles: new Set(), fromArgs: new Set() });
    }
  }
  scopeCache.set(src, scopes);
  return scopes;
}

/** Every scope containing `at`, innermost first, so the first one wins. */
function resolveScopes(src: string, at: number): Scope[] {
  return scopesOf(src).filter((s) => at >= s.start && at <= s.end).sort((a, b) => b.start - a.start);
}

/** Names that hold a handle where they sit. A param is one only when its own function is called with a handle. */
function handleNames(src: string, at: number): Set<string> {
  const out = new Set<string>();
  for (const s of resolveScopes(src, at)) {
    for (const h of s.handles) out.add(h);
    for (const p of s.params) if (s.fromArgs.has(p)) out.add(p);
    if (s.name === '<module>') break; // the module scope encloses everything, so nothing outside it can add
  }
  return out;
}

/** The text of a `{…}` expression starting at `open`. */
function braced(src: string, open: number): string | null {
  const end = matchClose(src, open);
  return end < 0 ? null : src.slice(open + 1, end);
}

function analyse(src: string): { offenders: string[]; handles: number } {
  const scopes = scopesOf(src);
  const names = new Set<string>();
  for (const m of src.matchAll(/(\w+)\s*=\s*useAnimatedStyle/g)) {
    const s = resolveScopes(src, m.index + m[1]!.length)[0];
    if (s) { s.handles.add(m[1]!); names.add(m[1]!); }
  }
  for (const s of scopes) {
    if (s.name === '<module>') continue;
    // call sites anywhere in the file, not just in the callee's own body — that is the whole point:
    // the handle is declared at module level and arrives as an argument somewhere else entirely
    for (const call of src.matchAll(new RegExp(`\\b${s.name}\\s*\\(([^()]*)\\)`, 'g'))) {
      call[1]!.split(',').forEach((a, i) => {
        const arg = a.trim().replace(/^\.\.\./, ''), p = s.params[i];
        if (!p) return;
        for (const inner of resolveScopes(src, call.index! + call[0]!.length)) {
          if (inner.handles.has(arg)) { s.fromArgs.add(p); return; }
        }
      });
    }
  }
  const offenders: string[] = [];
  for (const open of src.matchAll(/<([A-Z]\w*)((?:\s[^>]*?)?)\/?>/gs)) {
    const tag = open[1]!;
    if (tag === 'React' || tag.startsWith('Animated.')) continue; // the animated path is the correct one
    const attrStart = open.index + 1 + tag.length;
    const handles = handleNames(src, attrStart);
    if (handles.size === 0) continue;
    for (const attr of open[2]!.matchAll(/(?:^|\s)style\s*=\s*\{/gs)) {
      const expr = braced(src, attrStart + attr.index + attr[0].length - 1);
      if (expr === null) continue;
      for (const name of handles) {
        if (new RegExp(`\\b${name}\\b`).test(expr)) {
          offenders.push(`${tag} takes \`${name}\` at offset ${attrStart + attr.index}`);
          break;
        }
      }
    }
  }
  return { offenders, handles: names.size };
}

const swept = files.map((p) => ({ p, ...analyse(readFileSync(p, 'utf8')) }));
const offenders = swept.flatMap((f) => f.offenders.map((o) => `${f.p.slice(SRC.length + 1)}: ${o}`));

test('no useAnimatedStyle handle reaches a non-animated host element', () => {
  expect(offenders).toEqual([]);
});

test('the sweep sees the animated styles it is guarding', () => {
  // if the handle count collapsed, the rule above would be passing because it reads nothing
  expect(swept.reduce((n, f) => n + f.handles, 0)).toBeGreaterThan(30);
});

test('the rule catches the shape it was written for, through the parameter', () => {
  // The tour's halo, verbatim. `style` is a handle only because `halo` is called with one, so a sweep that
  // did not follow arguments — or that treated `style` as a handle for the whole file — would get this wrong
  // in one direction or the other. Both directions are checked.
  const broken = `
const tapStyle = useAnimatedStyle(() => ({}));
const halo = (style) => <View pointerEvents="none" style={[{ position: 'absolute' }, style]} />;
const Card = ({ style }) => <View style={style} />;
const ringStyle = useAnimatedStyle(() => ({}));
halo(ringStyle);`;
  const found = analyse(broken).offenders;
  expect(found).toHaveLength(1);
  expect(found[0]).toMatch(/^View takes `style`/);
  // …and the same source with the one-word fix is clean, which is the whole claim
  expect(analyse(broken.replace('<View ', '<Animated.View ')).offenders).toEqual([]);
});