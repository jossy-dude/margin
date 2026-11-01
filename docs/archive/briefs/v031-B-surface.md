# v0.3.1-B — It updates itself: OTA plumbing, the Play button, the spiral's elapsed ink

**let's make v1 first.** One shippable surface slice. Exclusions are part of the contract.
Owner source: Obsidian `Daily_Notes/Oct 19 + Oct 21 + Oct 22, 2026` (auto-update without reinstall,
per-sound Play does nothing, spiral should dim instead of a dot rotating).

Baseline gate at dispatch: **58 suites / 888 tests green**, boundaries clean. Brief A must be merged first.

## Deliverables

### 1. OTA plumbing (`expo-updates`) — configure, do not build

- `npx expo install expo-updates` (SDK 57 picks the version; do not hand-write it).
- `app.json`:
  - `"runtimeVersion": { "policy": "appVersion" }`
  - `"updates": { "url": "https://u.expo.dev/a1177786-3b71-4f60-89b5-30fc633d3534", "enabled": true,
    "checkAutomatically": "ON_LOAD", "fallbackToCacheTimeout": 0 }`
  - keep the existing `version: "0.3.1"` from brief A (do not re-bump).
- `eas.json`: `build.preview.channel = "preview"`, `build.production.channel = "production"`.
- New `src/services/ota.ts`, total and non-throwing on every platform:
  - `otaAvailable(): boolean` — false on web, false when `Updates.isEnabled` is false
  - `checkForUpdate(): Promise<'unavailable'|'current'|'ready'|'error'>`
  - `applyUpdate(): Promise<void>` — reload only when `ready`
  - `versionLine(): string` — bundled version + runtime version, for the About row
- Settings → About: an "Updates" section — `versionLine()`, a "Check for updates" `Btn`, and one result
  line. On web it reads "updates are checked in the installed app" (the existing dev-build banner tone).
- `docs/DEVICE_CHECKLIST.md`: append a **V031** section with the exact phone steps:
  install the v0.3.1 APK → change one setting → publish a test OTA to `preview` → kill and relaunch →
  the change is present, the SQLite data is intact, and About shows the new update id.
- **Do not run `eas build`, `eas update`, `git push`, `git tag`, or any release command.** Configuration
  and code only. The owner builds and ships.

### 2. Sound & haptics: the per-sound Play button actually plays

Reported twice ("inside sound and habtics the play for each sound doesn't actually work").
Root-cause before changing anything:

- Reproduce on the built web page at 412×915 (`tools/cap-baseline.mjs` `tap()` rules, port 8098): open
  Settings → Sound & haptics, tap each Play, and record whether `play()` returns true. Instrument rather
  than guess — a temporary `console.log` is fine, remove it before reporting.
- Known suspects, in order: (a) the `Row` in `sheets/Settings.tsx:308` is `flexWrap: 'nowrap'` with a
  full-width `Stepper`, so the Play button may be clipped to zero width and untappable; (b)
  `configureFx` (`services/fx.ts:12`) may not have run before the first tap, leaving `vols === null` and
  `play()` returning false at `services/audio.ts:97`; (c) `SOUND_GROUPS` and `SAMPLE` may disagree.
- Fix the real cause. Then make the control honest: tapping Play must be audible whenever the group
  volume is above zero, and when it is zero the control must say so instead of doing nothing silently.
- Add `src/test/audio-preview.test.ts`: `SAMPLE` is total over `SOUND_GROUPS` (no missing key), every
  value is a real `SRC` entry, and every group resolves to a volume key that exists. Export whatever
  minimal surface (`SOUND_NAMES`, `SAMPLE`) the test needs — do not copy the map into the test.
- If the haptics rows carry their own preview control, give it the same treatment; if they do not,
  say so in the report and leave it.

### 3. Spiral bar: dim the elapsed ink instead of a rotating dot

- `src/ui/instruments/catalog/anySubject.ts:42` (`spiral`). Today the groove is drawn and a playhead
  **dot** rides it. Replace the dot with the owner's read: the **elapsed portion is the dimmer/darker
  ink**, the remaining portion stays the resting groove, and the eye reads the boundary as "gone".
- Keep the resting state at `p=0` a clean groove (no leftover mark). Keep the bar's existing ink tokens
  and stroke weights; do not restyle the instrument or touch any other bar in the catalogue.
- `src/test/bars.test.ts:293` pins the old "resting groove plus the playhead dot" contract — update the
  contract to the new one (elapsed path present, no playhead dot) and keep every other bar's assertions
  untouched.
- Mark the look `UNVERIFIED-VISUAL` and name the frames the vision pass must shoot: `p=0`, `p=0.5`,
  `p=1`, light and dark.

## Out of scope (v1 excludes)

- Any build, upload, publish, tag or push.
- Widget, notifications, focus mode, card shuffle, Today header, desktop tease.
- Restyling other progress bars; changing `VOICES`/pool sizing or the audio engine's architecture.
- New dependencies beyond `expo-updates`.

## Evidence contract

- `npm run typecheck`, `npm run lint`, `npm run test`, `npm run boundaries` green, counts reported.
- Web reproduction evidence for the sound bug: the before/after observation, not a claim.
- Report changed files with line refs. `UNVERIFIED-ON-DEVICE` for anything only a phone can prove, with
  the exact steps that would prove it. Never claim a visual result.
