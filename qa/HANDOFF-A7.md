# HANDOFF-A7 — shared-file patches I am not allowed to make

> Agent A7 SCAN. `COORDINATION.md` §2: `src/store/store.ts`, `src/tokens/theme.ts`,
> `src/domain/types.ts`, `src/App.tsx` and `src/ui/theme-context.tsx` are **shared and unowned**.
> I do not make changes to them. I write the exact patch here for the orchestrator / A8 to apply
> serially, after the owning agent has finished.
>
> **My only other output is `qa/FINDINGS-UNSTATED.md`. I have written nothing in `src/`.**
> `git status --short` shows only `qa/COORDINATION.md` and this file.

---

## BLOCKED ON SHARED FILE: `src/tokens/theme.ts` — the fourth palette (PROMPT.md Part 5)

**Owner ruling required first.** `COORDINATION.md` §4 says *"Never remove, rename, or alter an existing
palette. Every one that exists today stays selectable with its current values."* Part 5 says pure black
is **added**, not substituted — so the two are compatible and nothing existing changes. But see
HANDOFF §4: extending the contrast test will fail on `ORIGINAL`, and fixing that requires altering an
existing palette, which §4 forbids. **That needs a ruling before any of this is applied.**

### Patch 1 — `src/tokens/theme.ts`

Add one `Colors` record. Do not touch `REFINED`, do not touch `ORIGINAL`.

```ts
// after line 15 (the closing `};` of ORIGINAL), before the PENS block on line 16
/** Pure black, added as the 4th palette (PROMPT.md Part 5) and made the default dark.
 *  Every existing palette stays selectable and unaltered (COORDINATION.md §4).
 *  `shadow` is deliberately NOT #000000 here: on a genuinely black page a black shadow is invisible,
 *  so the hand-drawn card shadows are carried by `rule`/`dot` at low alpha instead — the same job the
 *  grain and the outline stroke already do. */
const BLACK: Record<'light' | 'dark', Colors> = {
  light: { ...ORIGINAL.light },
  dark: {
    paper: '#000000', card: '#0B0B0C', desk: '#000000', ink: '#F2EAD8', mut: '#B8AE9B',
    acc: '#E8A87C', hl: '#1E1C19', rule: '#F2EAD83D', dot: '#F2EAD81F', shadow: '#000000',
    ok: '#8FC49A', warn: '#E3B04B', bad: '#F08C7A', slab: '#141311', slabInk: '#F2EAD8',
    slabMut: '#C9BEA8', grain: 0.32, photo: 0.14, onAcc: '#0B0B0C',
  },
};
```
and change line 19:
```ts
- export const palettes = { refined: REFINED, original: ORIGINAL };
+ export const palettes = { refined: REFINED, original: ORIGINAL, black: BLACK };
```
and line 25-27 (the `ONYX` docstring names the plates work; `ONYX.light` is dead — see FINDINGS §3 #4):
```ts
- *  `ONYX.light` is the same material a shade down and stays for the plate work. Neither should follow
- *  `palette: 'original'` — but neither belongs in a screen. */
-export const ONYX = { light: '#26201A', dark: '#17130F' } as const;
+ *  Neither should follow `palette: 'original'` — but neither belongs in a screen. */
+export const ONYX = { dark: '#17130F' } as const;
```
`ONYX.light` is read by **nothing** (verified: `rg ONYX src/` returns only `faces.ts:1,26` for
`.dark` and the declaration). Deleting it is the safe half of the plates cleanup — **but only if the
owner drops the plate feature**; if they supply the PNGs, keep it. The `as const` narrowing is why
`faces.ts:26`'s `ONYX.dark` keeps working unchanged.

### Patch 2 — `src/domain/types.ts` line 43

```ts
-   pen: 'warm' | 'graphite' | 'red' | 'blue'; palette: 'refined' | 'original'; texture: 'grain' | 'photo' | 'none';
+   pen: 'warm' | 'graphite' | 'red' | 'blue'; palette: 'refined' | 'original' | 'black'; texture: 'grain' | 'photo' | 'none';
```
That is the whole change. `makeTheme` (`theme.ts:39-46`) already indexes `palettes[s.palette][mode]`, so
adding a key is sufficient — no other site needs touching. Note `makeTheme` also uses
`palettes.original[mode].acc` for the `graphite` pen (`:44`), which is unaffected.

### Patch 3 — `src/domain/defaults.ts` (A4's file, not shared — hand to A4 or apply after)

Line 23-24, to make black the default **dark** as Part 5 requires:
```ts
-   name: 'Jossy', theme: 'auto', paper: 'dots', pen: 'warm', palette: 'refined', texture: 'grain',
+   name: 'Jossy', theme: 'auto', paper: 'dots', pen: 'warm', palette: 'black', texture: 'grain',
```
**⚠️ Do NOT do this without checking migration.** `withDefaults` (`defaults.ts:32-36`) spreads
`DEFAULT_SETTINGS` under the stored value, so an existing install that stored `palette: 'refined'`
keeps `refined` and will never see black. Making black the default therefore needs an explicit
one-way migration at the `withDefaults` call sites (`store.ts:35` and `store.ts:129`), **not** a change
to `DEFAULT_SETTINGS`, or every existing user is silently switched. Recommend: leave `DEFAULT_SETTINGS`
alone and handle the default in `makeTheme` only for the dark mode, or write the migration. **Flagged
rather than decided — this is a product call.**

### Patch 4 — `src/sheets/Settings.tsx` line 112 (A6's file)

```tsx
- <Label>Palette</Label><Seg value={s.palette} opts={[['refined', 'Refined (lighter cream)'], ['original', 'Original']]} onChange={(v) => set({ palette: v })} />
- <Txt f="serif" s={15} c="mut">Original is the first version of the look: the cooler gray desk and the near-black night mode. Everything behind this sheet changes as you tap.</Txt>
+ <Label>Palette</Label><Seg value={s.palette} opts={[['refined', 'Refined (lighter cream)'], ['original', 'Original'], ['black', 'Black']]} onChange={(v) => set({ palette: v })} />
+ <Txt f="serif" s={15} c="mut">Original is the first version of the look: the cooler gray desk and the near-black night mode. Black is the same warmth on a true black page. Everything behind this sheet changes as you tap.</Txt>
```
Line 108's hint is also a ternary that hardcodes the two names:
```tsx
- <Nav icon="palette" label="Theme & palette" hint={`${s.theme} · ${s.palette === 'refined' ? 'Refined cream' : 'Original'}`} to="theme" />
+ <Nav icon="palette" label="Theme & palette" hint={`${s.theme} · ${{ refined: 'Refined cream', original: 'Original', black: 'Black' }[s.palette]}`} to="theme" />
```
Without this, choosing Black shows the hint "Original".

### Patch 5 — `android/app/src/main/res/values-night/colors.xml` (outside `src/`; nobody owns `android/`)

`PROMPT.md` Part 5 point 1 and `COORDINATION.md` §4 both name this. It is currently:
```xml
<color name="splashscreen_background">#2B2620</color>
<color name="iconBackground">#2B2620</color>
<color name="activityBackground">#2B2620</color>
```
With black as the default dark, these must become the black palette's `paper`:
```xml
<color name="splashscreen_background">#000000</color>
<color name="iconBackground">#000000</color>
<color name="activityBackground">#000000</color>
```
and the existing explanatory comment above them ("These are the REFINED.dark values, which is the app's
default palette") must be corrected. **Only apply this together with the palette actually becoming the
default** — changing it now, with no black palette in the app, produces a black flash in front of a
`#2B2620` app, which is strictly worse than the brown flash it fixes.

### Patch 6 — `src/test/ui.test.ts` (nobody owns it)

`COORDINATION.md` §4: *"extend it rather than weakening it."* **Do not touch line 15-18** — the
`dark paper is not pitch black` assertion is what keeps `REFINED.dark` from being dragged to black.

Extend the `for (const mode …)` loop at line 10 to cover every palette, not just refined:
```ts
- for (const mode of ['light', 'dark'] as const) {
-   const c = palettes.refined[mode];
+ for (const name of ['refined', 'original', 'black'] as const) for (const mode of ['light', 'dark'] as const) {
+   const c = palettes[name][mode];
```
…which needs the `describe` title and the `it.each` template updated to include `${name}`. **This will
fail on `original` immediately** — see next section.

---

## BLOCKED ON SHARED FILE: `src/store/store.ts` — the `slip` dead spec

FINDINGS F-05: `SheetSpec.slip` (`store.ts:20`), `State.slip` (`:29`), the initialiser (`:35`),
`Overlay.tsx:32`, and `forms.tsx:102` are all live code paths for a spec **nothing can construct**.

```ts
// line 20
-   | { t: 'settings' } | { t: 'course'; id?: string } | { t: 'meeting'; courseId: string; id?: string; weekday?: number } | { t: 'mark'; courseId: string; id?: string } | { t: 'notice'; id?: string } | { t: 'slip'; key: string; title: string; date: string };
+   | { t: 'settings' } | { t: 'course'; id?: string } | { t: 'meeting'; courseId: string; id?: string; weekday?: number } | { t: 'mark'; courseId: string; id?: string } | { t: 'notice'; id?: string };

// line 29
-   notifStatus: notifs.NotifStatus | null; plan: PlanInfo | null; notifLog: NotifLogRow[]; slip: { key: string; title: string; date: string } | null;
+   notifStatus: notifs.NotifStatus | null; plan: PlanInfo | null; notifLog: NotifLogRow[];

// line 35
-   timer: initTimer(), sheet: null, settingsPath: [], toast: null, route: 'Today', prevRoute: null, focusTaskId: null, notifStatus: null, plan: null, notifLog: [], slip: null, fev: null,
+   timer: initTimer(), sheet: null, settingsPath: [], toast: null, route: 'Today', prevRoute: null, focusTaskId: null, notifStatus: null, plan: null, notifLog: [], fev: null,
```
and, in **A6's** files:
```tsx
// src/ui/Overlay.tsx:32
- : sheet.t === 'status' || sheet.t === 'slip' ? <StatusSheet key={sheet.key} spec={sheet} /> : sheet.t === 'settings' ? <SettingsSheet />
+ : sheet.t === 'status' ? <StatusSheet key={sheet.key} spec={sheet} /> : sheet.t === 'settings' ? <SettingsSheet />

// src/sheets/forms.tsx:102
-export function StatusSheet({ spec }: { spec: Extract<SheetSpec, { t: 'status' | 'slip' }> }) {
+export function StatusSheet({ spec }: { spec: Extract<SheetSpec, { t: 'status' }> }) {
```
**Verification that nothing constructs it** (run before applying):
```bash
rg -n "t: 'slip'|t:'slip'|state\.slip|s\.slip" src/     # → only the five declaration sites above
```
`qa/EXPO_GO_AUDIT.md` A3 and its open question #5 are the provenance. **This is safe to delete** — but
the owner may want to give it a trigger instead (FINDINGS decision #6).

---

## Owner rulings I need before the patches above can be applied

1. **Can an existing palette's `mut` be re-valued to pass 4.5:1?** `COORDINATION.md` §4 forbids
   altering an existing palette; `prompt.md` V15 orders the colour fixed in `theme.ts`. I measured the
   failure: `ORIGINAL.light` `mut`/`desk` = **4.03**, `ORIGINAL.dark` `mut`/`hl` = **4.02**, and the
   `mut`/`hl` pair is live at `src/sheets/forms.tsx:83`. Patch 6 will not go green until this is ruled
   on. **My recommendation:** permit a `mut`-only change in `ORIGINAL` (one token, two values), because
   §4's intent is to protect the palettes' *identity* and 4.03:1 on a `STRETCHED` line of body text is
   a defect, not an identity.
2. **Drop or finish the plate faces?** Governs whether `ONYX.light` is deleted (Patch 1's second half)
   and whether `PLATE_DARK_MATRIX` goes. FINDINGS F-02.
3. **Should black become the default for existing installs too, or new installs only?** Patch 3 is
   explicitly *not* decided by me — `withDefaults` will not migrate a stored value on its own.
