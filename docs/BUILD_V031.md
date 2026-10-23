# Building v0.3.1 — read this before the build

v0.3.1 is committed (`5136499` A, `6f5bb63` B, `d745ba2` docs) on `v2-improvements`. Nothing was built,
tagged or pushed: the build is yours.

This page exists because **the APK is built from the committed `android/` folder, not from `app.json`.**
This project is not a CNG project — `npx expo prebuild` does not run during a build — so every config
plugin, including the one that wires up over-the-air updates, is inert. Whatever `app.json` says, the
native files are what ship. They disagreed, and the first build from here would have been an updater
that could never update.

## What the APK will say

| | value | where it comes from |
|---|---|---|
| Android `versionName` | `0.3.1` | `android/app/build.gradle` |
| Android `versionCode` | `3` (was `2`) | `android/app/build.gradle` |
| updates | `ENABLED=true` | `AndroidManifest.xml` |
| update URL | `https://u.expo.dev/a1177786-…` | `AndroidManifest.xml` |
| runtime version | `0.3.1` | `res/values/strings.xml` → `expo_runtime_version` |
| channel | `preview` | `AndroidManifest.xml` → `expo-channel-name` |
| About screen | `Margin 0.3.1` | `src/domain/version.ts` |

`src/test/native-config.test.ts` holds every row of that table to the matching value in `app.json` /
`eas.json`, and fails if any of them drifts. It is in `npm run check` — so this cannot regress silently
again. It fails if `ENABLED` goes back to false, if the URL or channel disappears, if the runtime
version stops matching `version`, or if `versionCode` is not above the last shipped build.

## Building

Either path works; the channel is no longer dependent on which one you use.

```bash
# local, no account, signed with the committed debug keystore
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

```bash
# EAS, if you want the build in the cloud
npx eas build -p android --profile preview
```

**Version bumps are manual, in `android/app/build.gradle`** — that is the only place a build reads them.
`autoIncrement` was removed from `eas.json` for that reason: with a committed native project it would
increment a number in `app.json` that the APK never sees, and the next build would ship the same
`versionCode` as the last one. Bump `versionCode` and `versionName` together, and bump
`expo_runtime_version` + `app.json`'s `version` with them — `src/test/native-config.test.ts` fails if you
forget one.

Install over the current app — same `applicationId` and keystore, so it replaces it and **keeps the
database**. That is the point of the release: the data survives the update.

## The first five things to check

1. Android's own app info says **0.3.1** (not 0.2.0). If it says 0.2.0, the build picked up a stale
   native project and nothing else here is trustworthy.
2. Settings → About says `Margin 0.3.1 · runtime 0.3.1 · built in …`, and there is a **Check for
   updates** button. On the web build that section is a sentence instead — that is correct, not a bug.
3. Your subjects, timetable and attendance are all still there.
4. Settings → Sound & haptics: tap **Play** on each of the eight rows. This is the item that could not
   be verified here — on web it plays; on the phone it is the test.
5. Settings → Look & feel → Progress bar → **Spiral**: a groove whose played part is half-strength ink,
   no dot. It should read at arm's length; if it is too quiet, the one dial is `op: 0.5` → `0.4` in
   `src/ui/instruments/catalog/anySubject.ts`.

Then the full pass is `docs/DEVICE_CHECKLIST.md` **§V031** (9 steps: the pre-migration safety copy,
import idempotency, sharing the backup, the OTA loop).

## What the update cannot do yet

**An APK built before the updater existed cannot be updated over the air — there is no updater in it.**
v0.3.1 installs the mechanism. So:

- The build you make now is the **oldest** build that can ever receive an update.
- Proving the loop needs a second step: publish something to `preview` with runtime `0.3.1`
  (`npx eas update --channel preview --message "…"`), cold-start the installed 0.3.1 twice, and confirm
  the change appears. That is v0.3.2's headline, and it is deliberately not in v0.3.1.
- Do **not** publish an update for runtime `0.3.1` until a `0.3.1` build is installed on the phone, or
  there is nothing for it to land on.

## `npx expo-doctor` still reports five things — none blocks this build

Run for the record: **16/21 checks passed**. What is left, and why it is not in the way:

1. **Config schema** (`splash` is not a valid top-level key in SDK 57) — the splash is defined in the
   native project, which is what ships; the `android.splash` duplicate and the deprecated
   `newArchEnabled` flag were removed, and `splash` was left alone deliberately because it is the only
   declaration of the image for a future prebuild. Re-declare it as the `expo-splash-screen` plugin
   config if `android/` is ever regenerated.
2. **`eas-cli` installed locally** — cosmetic; it still works via `npx`. Removing it now would churn the
   lockfile for no gain before a build.
3. **`react-dom` missing as a direct peer of `react-native-web`** — the web build resolves it and works
   (25 browser assertions pass); it has no role in an Android APK. W9 hygiene.
4. **"app config fields may not be synced in a non-CNG project"** — correct, and it is the very reason
   this page exists. Not fixable by editing `app.json`; fixable only by regenerating `android/`, which
   would throw away the hand-commented manifest.
5. **12 packages behind the SDK's expected versions** (TypeScript 5.9 vs 6.0, React 19.3 vs 19.2.3,
   patches elsewhere) — pre-existing, green at 65 suites / 1029 tests, and upgrading twelve packages
   immediately before a build is how you turn a working app into a debugging session. `expo-updates`
   itself is at the expected version; that is the only one this release added. W9's job.
