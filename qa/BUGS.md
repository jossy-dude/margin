# BUGS — Marginalia pre-launch gate

Severity: **Critical** (crash / data loss / blocked flow) > **Major** (feature wrong)
> **Minor** (any visual or UX defect, however small) > **Polish**.
Minor counts as a release blocker in this gate.

Status: `open` → `fixed` (Fixer committed) → `verified` (Verifier reproduced from
scratch with evidence). Anything not `verified` at exit is reported as unresolved.

**No bugs recorded yet.** Agents append below using the template.

---

## BUG-001 — open — Major
**Screen:** build configuration (not a UI screen)
**Found by:** Phase 0 preflight · `npx expo-doctor`
**Repro:** `npx expo-doctor` → "Check for app config fields that may not be synced in a non-CNG project"
**Expected:** `app.json` is the source of truth for orientation, scheme, userInterfaceStyle,
icon, backgroundColor, splash and the `android`/`ios` blocks, as the file implies and as
`BUILDING.md` describes.
**Actual:** this repo has committed `android/` and `ios/` native folders, so EAS Build
**silently ignores** `orientation`, `scheme`, `userInterfaceStyle`, `icon`,
`backgroundColor`, `splash`, `android.*` and `ios.*`. Editing `app.json` to change the
icon, splash, orientation or package id changes nothing in a real build.
**Evidence:** expo-doctor output; `app.json`; `BUILDING.md` (the folders are kept
deliberately for `reactNativeArchitectures=arm64-v8a` + `expo.useLegacyPackaging=true`).
**Impact:** every app-identity field in `app.json` is currently unverified for the
shipped artifact. A reviewer reading `app.json` would be misled.
**Needs a decision (not a unilateral fix):** either adopt CNG so `app.json` is
authoritative, or keep the native folders and treat them as the source of truth and
document `app.json` as advisory. Do not delete `android/` — it carries the size
optimisations in `BUILDING.md`.

## BUG-002 — open — Minor
**Screen:** build configuration
**Found by:** Phase 0 preflight · `npx expo-doctor`
**Repro:** `npx expo-doctor` → "Check Expo config schema"
**Expected:** `app.json` validates against the SDK 57 schema.
**Actual:** three invalid keys are silently dropped: top-level `newArchEnabled`,
top-level `splash`, and `android.splash`. They are not errors at runtime but they are
not doing anything either, which is misleading.
**Evidence:** expo-doctor schema output.
**Note:** New Architecture is genuinely on — `android/gradle.properties` has
`newArchEnabled=true` — so the intent is preserved, just not via that `app.json` key.

## BUG-003 — open — Polish
**Screen:** build configuration
**Found by:** Phase 0 preflight · `npx expo-doctor`
**Repro:** `npx expo-doctor` → "Check for legacy global CLI installed locally"
**Actual:** `eas-cli` is a local devDependency (~large) rather than global/npx.
**Evidence:** `package.json` devDependencies; `BUILDING.md` rule 4 says to prune unused
packages before packaging.

---

## Template — copy for each new bug

```
## BUG-NNN — <open|fixed|verified> — <Severity>
**Screen:** <route / sheet>
**Repro:** <numbered steps, exact and repeatable>
**Expected:** <what should happen>
**Actual:** <what actually happens, verbatim>
**Evidence:** qa/shots/<agent>_<screen>_<step>.png · logcat excerpt
**Root cause:** <file:line> (filled by Fixer)
**Fix commit:** <sha> (filled by Fixer)
```

---

## Summary

| Severity | Open | Fixed | Verified |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| Major | 1 | 0 | 0 |
| Minor | 1 | 0 | 0 |
| Polish | 1 | 0 | 0 |