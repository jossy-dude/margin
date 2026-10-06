# HANDOFF — A4 ONBOARD

Everything below is a **shared or unowned file**. I did not edit any of them. Apply serially.

My files, all new and all mine: `src/screens/Onboarding.tsx`, `src/ui/onboard/screens.ts`,
`src/ui/onboard/art.tsx`, `src/test/onboarding.test.ts`, `qa/ONBOARDING-PLAN.md`.
One shared file I *was* given: `src/domain/defaults.ts`.

The component is prop-driven and holds no gate logic, so all of the wiring is additive and nothing
else in the app changes. **There is no new store action, no new state field, no new route, and no new
module-level flag** — replay is a second write of `0` to the same field that records finishing.

---

## BLOCKED ON SHARED FILE: `src/domain/types.ts` — one line

`Settings` is unowned. The gate reads one number off it.

```diff
 export interface Settings {
   name: string; theme: 'light' | 'dark' | 'auto'; paper: 'dots' | 'grid' | 'ruled' | 'plain';
   pen: 'warm' | 'graphite' | 'red' | 'blue'; palette: 'refined' | 'original'; texture: 'grain' | 'photo' | 'none';
   clock: string; bar: string; semesterStart: string;
   soundOn: boolean; soundVol: Record<SoundGroup, number>; hapticsOn: boolean; tickOn: boolean;
   lockAttendance: boolean; reduceMotion: 'system' | 'on' | 'off';
   taskFilter: 'all' | 'open' | 'done'; taskSort: 'due' | 'priority' | 'created'; seededAt: number;
   breakMin: number; breaksPerRound: number; focusFlow: boolean; focusPresetMin: number;
+  /** How many builds of the onboarding tour this phone has finished. `0` (or absent) = not seen.
+   *  See `toured()` in `domain/defaults.ts`. Optional on purpose: a settings row written before the
+   *  tour existed has no such key, which is the same answer as "has not seen it", so `DEFAULT_SETTINGS`
+   *  needs no entry and a cold start needs no migration. */
+  onboarded?: number;
   notif: NotifSettings;
 }
```

**Optional, not required.** `undefined` and `0` mean the same thing to `toured()`, which is what lets
the whole thing survive a database that has never seen the field. Adding it as required would force
`DEFAULT_SETTINGS` to change and every existing row to be migrated for no gain.

---

## BLOCKED ON SHARED FILE: `src/App.tsx` — the gate (5 lines)

`Gate` currently returns `<Shell/>`. This is the whole change.

```diff
 import { getState, hydrate, set, useStore, wireLifecycle, act } from './store/store';
+import { Onboarding } from './screens/Onboarding';
+import { TOUR_VERSION, toured } from './domain/defaults';
 import { openRepository } from './data/sqliteExpo';

 function Gate() {
-  const ready = useStore((s) => s.ready), error = useStore((s) => s.error);
+  const ready = useStore((s) => s.ready), error = useStore((s) => s.error), onboarded = useStore((s) => s.settings.onboarded);
   if (!ready) return <Splash />;
   if (error) return <Fatal message={error} />;
+  if (!toured(onboarded)) return <Onboarding onFinish={() => act.setSettings({ onboarded: TOUR_VERSION })} />;
   return <Shell />;
 }
```

Notes:

- **`onFinish` is called with `'done'` or `'skipped'`, and both write the same value.** Skipping
  records finishing: the point is not to show it a second time, and the tour stays replayable.
- **No local state, no `useState`.** The gate is one predicate over one persisted number, so replay is
  a write of `0` from anywhere and there is nothing to keep in sync.
- **`act.setSettings` is already correct here**: it calls `configureFx` and `putSettings(patch)`, and
  `putSettings` JSON-merges a patch into the settings row, so no migration is involved.
- **Replacing `Shell` rather than covering it** is deliberate. No page mounts underneath the tour, so
  no hidden clock ticks, no hidden `DayBar` fills, and no gesture can reach the app under it. That is
  `prompt.md` V17, and it is why this is a screen rather than a sheet.
- The tour draws `PaperBg`, which reads `settings.paper` and `settings.texture` — so it honours the
  ruling and the texture the user already chose, and it is themed by the existing `ThemeProvider`
  above `Gate`. No theme plumbing is needed.
- One thing to know: `act.setSettings` calls `fx.tap()`? No — it does not; `fx` calls in `setSettings`
  are `configureFx` only. The button that finished the tour is unmounting at that moment, so no sound
  is wanted there.

---

## BLOCKED ON SHARED FILE: `src/sheets/Settings.tsx` — "Show the tour again" (3 lines)

One row on the Settings root page, next to the other navigational rows.

```diff
     <Nav icon="note" label="Diagnostics" hint={`${crashes} crash${crashes === 1 ? '' : 'es'} recorded`} to="diagnostics" />
+    <Nav icon="note" label="Show the tour again" hint={`${toured(s.onboarded) ? 'Finished — it is replayable' : 'Not seen yet'}`} to="tour" />
     <Nav icon="trash" label="Reset" hint="Back to the demo set" to="about" />
   </>);
+  if (page === 'tour') body = (<>
+    <Txt f="serif" s={16} c="mut">The five-screen tour that runs the first time this app opens. It teaches the five things a first-time user cannot guess: that everything is on this phone, that the + is the only way to add anything, that swiping left crumples and Undo brings it back, that attendance is one tap and then a hold, and that the Focus dial is a real dial.</Txt>
+    <Btn kind="ghost" icon="play" label="Run it now" onPress={() => { act.setSettings({ onboarded: 0 }); act.close(); }} />
+  </>);
```

with, at the top of the file:

```diff
 import { SOUND_GROUPS } from '../domain/defaults';
+import { TOUR_VERSION, toured } from '../domain/defaults';
```

Two details:

- Writing `0` is the entire replay mechanism. `Gate` re-evaluates the predicate, the tour mounts, and
  there is no modal, no route and no second piece of state to tear down.
- `TITLES` already has a catch-all (`TITLES[page] ?? 'Settings'`), so no title entry is required;
  add `tour: 'The tour'` to `TITLES` if you want the marker heading to match.
- This page is where the tour is *replayed*, not where it is configured, so it does not belong under
  Look & feel. Root is right: it is a first-run affordance, like Diagnostics and Reset.

---

## What I did **not** need, and why that is worth knowing

- **No store action.** There was a temptation to add `act.onboardDone()` / `act.tourReplay()`. Both
  would be `act.setSettings({ onboarded: n })` with a different name, and `setSettings` already
  persists, configures fx, and is what Settings uses for every other preference.
- **No `onboardingVisible` boolean, no route, no `SheetSpec` variant.** A boolean plus a version stamp
  is two sources of truth that can disagree; one number cannot.
- **No change to `store.ts`, `Book.tsx`, `theme.ts`, `kit.tsx`, `PaperBg.tsx` or `hand.ts`.** The
  artwork is built from imports of those, not by editing them. In particular the gear / cog artifact
  and the hand-drawn outline system are untouched, per the gear scope lock.
- **No new dependency and no new asset.** The dial is `react-native-svg`, the clock inside it is the
  app's own `ClockFace` at `live={false}`, and every icon is `ui/kit`'s existing set.

---

## One risk I could not close without a device

`ClockFace` at `live={false} hands={false}` returns its static composite and arms no `useFrameCallback`,
which is what keeps a hidden clock from ticking. That is asserted in
`src/test/onboarding.test.ts` by reading the props, but **the dial's drag, the crumple, the sheet rise
and the page placement have not been watched moving.** No phone is available (see `qa/STATE.md`,
BUG-031). Every curve is copied from the app's own numbers — `navigation/window.ts` for the placement,
`ui/Swipe.tsx` for the crumple, `screens/common.tsx` for the attendance pulse, `ui/Sheet.tsx` for the
sheet rise — so they should read identically, but "should" is not "did".

What to look at first when a phone is reachable:

1. Drag the dial on screen 4. The detent should fire every 5 minutes and the readout should change with
   it; if the feel is wrong the mapping is `deg / DEG_PER_MIN` in `art.tsx`.
2. Interrupt a page change halfway (tap Next twice fast). The second tap must continue the motion, not
   snap back — that is the defect `Placed` in `Book.tsx` already guards against, and this copy should
   inherit it.
3. Screen 2's crumple: paper squashes → rotates → falls 330 px over 1100 ms linear, thud at 620 ms.
