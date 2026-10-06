# HANDOFF — A2 BARS (`src/ui/DayBar.tsx`, `src/ui/instruments/**`)

Everything below is code I could not apply because the file belongs to another agent. Each block is
complete and droppable. Nothing here is speculative — every import and symbol named exists in my
files as shipped.

---

## 1. BLOCKED ON SHARED FILE: `src/domain/defaults.ts` — the default bar

**Owner: A4 ONBOARD.** One character, one line, line 24.

The default is `spines` / "Bookshelf" — one spine per class, i.e. exactly the "just a bar chart" the
owner complained about. My recommendation is `gauge`, argued from the design in §6 of my report.

```diff
--- a/src/domain/defaults.ts
+++ b/src/domain/defaults.ts
@@ -22,7 +22,7 @@ export const DEFAULT_SETTINGS: Settings = {
   name: 'Jossy', theme: 'auto', paper: 'dots', pen: 'warm', palette: 'refined', texture: 'grain',
-  clock: 'rb', bar: 'spines', semesterStart: '2026-09-07',
+  clock: 'rb', bar: 'gauge', semesterStart: '2026-09-07',
   soundOn: true, soundVol: { … }, hapticsOn: true, tickOn: true, lockAttendance: false,
```

**No migration is needed and none should be written.** `Settings.bar` is `string`, so every saved
value — `spines`, `glass`, `trace`, `ticker` and all 22 new ids — already round-trips. `withDefaults`
only fills a *missing* key, so an existing user's stored `bar` survives the change untouched. Only a
fresh install gets `gauge`.

---

## 2. BLOCKED ON SHARED FILE: `src/sheets/Settings.tsx` — the bar-kind picker

**Owner: A6 ANIM.** This is the blocking one: Part 2 requires all 22 selectable in Settings, and the
picker is the only place a kind can be selected. Today it maps `BAR_KINDS` (4) and nothing else.

Three new imports at the top of the file, next to the existing `DayBar` import:

```tsx
// after: import { BAR_KINDS, DayBar, type BarKind } from '../ui/DayBar';
import { GROUPS, INSTRUMENTS } from '../ui/instruments/catalogue';
import { previewSvg } from '../ui/instruments/svg';
import { SvgXml } from 'react-native-svg';
```

Replace the whole `if (page === 'bar')` block (currently `Settings.tsx:127–134`) with:

```tsx
  if (page === 'bar') body = (<>
    <Txt f="serif" s={15} c="mut">A bar that measures. The twenty-two instruments count the class you are in, from the
      real clock: full when it starts, empty when the bell goes. The four at the top read your whole day
      instead. Each keeps its own machine.</Txt>
    <Label>Your whole day</Label>
    {BAR_KINDS.map((b) => <BarPick key={b.id} id={b.id} n={b.n} d={b.d} on={s.bar === b.id}
      onPress={() => { set({ bar: b.id }); fx.select(); }} />)}
    {GROUPS.map((g) => {
      const list = INSTRUMENTS.filter((i) => i.g === g.id);
      return (
        <React.Fragment key={g.id}>
          <Label>{g.n}</Label>
          <Txt f="serif" s={13.5} c="mut">{g.hint}</Txt>
          {list.map((i) => <BarPick key={i.id} id={i.id} n={i.n} d={i.d} on={s.bar === i.id}
            onPress={() => { set({ bar: i.id }); fx.select(); }} />)}
        </React.Fragment>
      );
    })}
  </>);
```

And the two small helpers, immediately above `const DEMO_NOW` (`Settings.tsx:268`):

```tsx
/**
 * One row of the picker. The SELECTED kind is a live `DayBar`; the other twenty-five are static
 * `SvgXml` strings from the same geometry module. That is not an optimisation for its own sake: the
 * sheet mounts every kind at once and a live instrument is 20–95 react-native-svg nodes, so twenty-six
 * live previews is roughly 800 nodes and twenty-six Reanimated worklet subscriptions in one bottom
 * sheet. The static path draws the identical markup with the dash offset already baked in.
 */
function BarPick({ id, n, d, on, onPress }: { id: string; n: string; d: string; on: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: on }}
      accessibilityLabel={`${n}. ${d}`} onPress={onPress}>
      <HandBox seed={id} fill={c.slab} stroke={on ? c.acc : c.slab} sw={on ? 3 : 1.6} style={{ padding: 10, gap: 2 }}>
        <Txt f="bold" s={19} c={c.slabInk}>{n}{on ? '  ✓' : ''}</Txt>
        <Txt f="serif" s={13.5} c={c.slabMut}>{d}</Txt>
        {on
          ? <DayBar kind={id as BarKind} periods={DEMO_PERIODS} now={DEMO_NOW} ink={c.slabInk} bg={c.slab} w={280} h={52} />
          : <View style={{ height: 44, width: 280 }}>
              <SvgXml xml={previewSvg(id, {
                p: DEMO_P, w: 280,
                ink: c.slabInk, slab: c.slab, acc: c.acc, warn: c.warn,
                total: DEMO_TOTAL, left: DEMO_P * DEMO_TOTAL,
              })} width={280} height={44} />
            </View>}
      </HandBox>
    </Pressable>
  );
}
```

`DEMO_NOW` is `2026-10-05 10:20`, which sits inside `DEMO_PERIODS[1]` (10:00 → 10:50). So every preview
must be drawn at **p = 0.6**, not a fixed 0.5 — otherwise the picker shows a state no user is ever in.
Add next to the existing `DEMO_NOW` line:

```tsx
/** DEMO_NOW is 10:20 and DEMO_PERIODS[1] runs 10:00–10:50, so every instrument preview is drawn at
 *  30/50 remaining. Getting this wrong shows a state the user is never in. */
const DEMO_TOTAL = 50 * 60_000, DEMO_P = 30 / 50;
```

`import { Label, Sheet }` already exists in that file, so `<Label>` is available. `View` is already
imported. `SvgXml` is **not** — that is the one new import.

### 2a. The id collision this removes, and the one to know about

R11 in `prompt.md` is real and this sheet is where it bites: it renders every kind **live** in one
tree. My instruments emit **zero** SVG ids — no gradient, no clip, no pattern — so twenty-six copies
cannot collide, and there is nothing to make unique. `bars.test.ts` asserts that across all 22
instruments × 5 widths × 6 values of `p` × 2 palettes.

The two ids that DID exist in this system, `hat` (Bookshelf's cancelled hatch) and `liq` (Sight
glass's liquid hatch), are gone: they are drawn as clipped geometry in `src/ui/instruments/hatch.ts`
and as a solid fill. That also removed the only two `patternTransform` uses in the app, which
`qa/EXPO_GO_AUDIT.md` B2 records as **never reached on a device** — the single riskiest thing the
previous bar depended on is now not depended on.

---

## 3. BLOCKED ON SHARED FILE: `src/screens/Today.tsx` — the off-screen gate

**Owner: A5 CARD.** One prop, from A1's handoff (`qa/HANDOFF-A1.md` §"DayBar — the worst offender").

`DayBar` now takes `live?: boolean` (default `true`, so nothing breaks if this is never applied). It
gates the 240 ms period-change wipe, so a bar on a hidden page stops animating:

```diff
--- a/src/screens/Today.tsx
+++ b/src/screens/Today.tsx
@@ -47,1 +47,1 @@
-          <DayBar kind={st.settings.bar as BarKind} periods={periods} now={now} ink={c.slabInk} bg={c.slab} w={width - 32 - 28} />
+          <DayBar kind={st.settings.bar as BarKind} periods={periods} now={now} ink={c.slabInk} bg={c.slab} w={width - 32 - 28} live={st.route === 'Today'} />
```

The existing `useNow(st.route === 'Today' ? 30_000 : 60_000)` two lines above already establishes that
this screen knows whether it is focused, so the value is there.

`Today.tsx` passes a *picked* day's periods, which is correct for the four day bars and also correct
for the instruments: a future day reads p = 1 (all of every class still ahead) and a past day reads
p = 0. No change needed there.

---

## 4. NOT REQUIRED, and why — `src/domain/types.ts`

**Nothing is blocked here.** `Settings.bar` is already typed `string` (`types.ts:44`), so all 26 ids
are expressible without touching the file, and that is deliberate: tightening it to a union is a nice
to-have that buys no runtime safety, since the value comes out of SQLite and the type is erased.

If the union is wanted anyway, this is the exact change — it is additive and `AnyBarKind` already
exists in `src/ui/DayBar.tsx`:

```diff
--- a/src/domain/types.ts
+++ b/src/domain/types.ts
@@ -44,1 +44,2 @@ export interface Settings {
-  clock: string; bar: string; semesterStart: string;
+  clock: string; bar: BarKindId; semesterStart: string;
```

with, added above `export interface Settings`:

```ts
/** The 26 bar kinds: the app's own four plus the twenty-two instruments. Kept as a union of literals
 *  rather than imported from src/ui so `domain` stays free of UI imports — `.dependency-cruiser.cjs`
 *  enforces that `src/domain` must not import `src/ui`. */
export type BarKindId =
  | 'spines' | 'glass' | 'trace' | 'ticker'
  | 'odometer' | 'gauge' | 'leader' | 'cassette' | 'graduated' | 'spiral' | 'ladder'
  | 'tape' | 'surplus' | 'compound'
  | 'lattice' | 'sieve' | 'sets'
  | 'scope' | 'spectrum' | 'blocks'
  | 'stack' | 'commits' | 'heap'
  | 'btree' | 'join' | 'log';
```

This will require `Today.tsx:47` to drop its `as BarKind` cast (`st.settings.bar` is already the
union) — one character. **My recommendation is not to do it in this pass.** It adds a shared-file
change and a touch point in another agent's file for a type that is erased at runtime, and I would
rather spend the serialisation budget on the two changes above.

---

## 5. The per-subject decision, and the v2 shape if the owner wants it

**Decided: NOT in v1.** The picker is one global choice for all subjects, as it is today. Reasoning in
§5 of my report. The subject groups (`Intro to Economics`, `Discrete Mathematics`, …) exist in the
picker as **organisational grouping of the 26 kinds**, which is what Part 2 asks for, and they are not
bound to a course.

If the owner rules for per-subject assignment, the v2 slice is exactly this, and nothing in my files
changes:

```ts
// src/domain/types.ts, inside Settings
  /** One bar kind per course; a course with no entry uses `bar`. Optional by design: absent means
   *  "use the global one", so the migration is a no-op for every existing user. */
  barsByCourse?: Record<string, BarKindId>;
```

```ts
// src/domain/defaults.ts, inside DEFAULT_SETTINGS — omit the key entirely
```

```ts
// src/screens/Today.tsx, line 47 — resolve per course before rendering
const kind = (curCourseId && st.settings.barsByCourse?.[curCourseId]) || st.settings.bar;
```

and in the picker, `BarPick` gains `onPress={() => set({ barsByCourse: { ...s.settings.barsByCourse, [courseId]: id } })}`
next to the existing global `set({ bar: id })`, plus one "All subjects" row that clears the map.

That is `types.ts` + `defaults.ts` + `Today.tsx` + the picker. **Four shared files, two of them owned
by agents who are not finished.** It is not a one-line change dressed up as a feature, which is why it
is a v2.

---

## 6. Not mine, found on the way — do not let these get lost

1. **`src/tokens/theme.ts` — the accent is unreadable on the command-deck slab.** Measured on the four
   palettes that exist today:

   | palette / theme | `slab` | `acc` | contrast |
   |---|---|---|---|
   | refined light | `#2F2920` | `#8A4B27` | **2.14:1** |
   | refined dark | `#1F1B16` | `#E0A47A` | 7.96:1 |
   | original light | `#26201C` | `#67696B` | **2.92:1** |
   | original dark | `#E7E4DC` | `#A6A9AC` | **1.86:1** |

   Three of four are under the 3:1 floor for a graphic that carries information. I did **not** change
   a palette — palette rules forbid it, and it is not my file. I gated it: `twoInks()` only spends the
   accent where it clears 3:1, and falls back to full ink otherwise. So in three of four palettes the
   instruments are strictly two inks, exactly as the reference paints them, and in refined dark the
   moving part is accent-coded. **If the accent is ever made legible on the slab, the instruments need
   no change** — they pick it up. That is the right place for this finding.

2. **Part 5's fourth (pure black) palette does not exist yet.** `src/tokens/theme.ts:19` is
   `palettes = { refined, original }` — two palettes, not three-plus-black. Nothing in my code branches
   on palette identity: inks are derived from whatever `slabInk` / `slab` / `acc` / `warn` the caller
   passes, so adding one needs zero changes here. Whoever lands it should re-run `npx jest
   src/test/bars.test.ts`, which already loops both palettes × both themes and will fail if a new
   palette puts the accent below 3:1 on its slab without the gate catching it.

3. **`src/domain/types.ts:44` `bar: string` is not validated anywhere.** `withDefaults` fills missing
   keys only, so an unknown `bar` from an imported snapshot or a future build reaches `DayBar`. It is
   handled — `asInstrument()` returns `undefined` and the dispatcher falls through to `Bookshelf`, so an
   unknown id renders a real bar rather than an empty strip, and there is a test asserting the
   fallthrough. Worth a `bar: isBarKind(x) ? x : 'gauge'` sanitiser in `withDefaults` if anyone wants
   it closed; I have not touched it.

4. **The reference's own defects I ported and then fixed.** Listed in §7 of my report. The
   `cassette` spool radii in the reference are inverted (at full time remaining the supply reel is
   nearly empty), and its odometer separator dots land *inside* drum two at any width above ~300px.
   Both are fixed here and covered by tests. Anyone diffing this against the HTML will see a
   difference and should read this note rather than assume a regression.