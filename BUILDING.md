# Exporting slim builds (no dev tools)

v1 of this note = how to build/export Marginalia without the 272MB dev-client bloat.
Excludes: asset-size audit, dependency pruning deep-dive (future slices).

## TL;DR

Dev build (272MB APK) = `developmentClient: true` in eas.json.
Standalone build (27.6MB APK) = no `developmentClient` + slim native packaging (see below).

```bash
# EAS cloud, standalone Android APK
npx eas-cli build --platform android --profile preview --non-interactive --no-wait
```

## Rules that keep builds slim

1. **Never ship `developmentClient: true` outside development.** The dev client embeds the whole debug toolchain (Fast Refresh, inspector, dev-menu, unminified runtime). Keep it only in a dedicated `development` profile in eas.json.
2. **Two profiles, two jobs** (current eas.json):
   - `preview` → release-mode APK for internal installs (standalone, no dev tools).
   - `production` → AAB for the Play Store (`app-bundle`, `autoIncrement`).
   - Optional third `development` profile if you need a dev client again: add back `"developmentClient": true`.
3. **Profile before testing.** Judge performance only on release builds — `debugOptimized` or the preview APK — never on `expo start --android` dev builds (JS thread "suffers greatly" in dev mode).
   - Release-ish local: `npx expo run:android --variant release` (or `debugOptimized` for a debuggable release-grade build).
   - Approximate prod in dev server: `npx expo start --no-dev --minify`.
4. **Prune before packaging:**
   - `npx expo-doctor` — flags incompatible/unused deps.
   - `npx expo install --check --fix` — aligns dep versions to the SDK (avoids duplicate native libs).
   - Remove unused packages from package.json (a native dep you never import still ships its `.so`/classes into the APK).
5. **Native-side size levers — applied 2026-10-04 (109MB → 27.6MB):**
   - `android/gradle.properties`: `reactNativeArchitectures=arm64-v8a` + `android/app/build.gradle` `ndk { abiFilters 'arm64-v8a' }` — drops x86, x86_64, armeabi-v7a slices (only physical target is the arm64 A51). Revert both to `armeabi-v7a,arm64-v8a,x86,x86_64` / remove `ndk {}` if 32-bit or emulator support is ever needed.
   - `expo.useLegacyPackaging=true` — compresses `.so` in the APK (deflate ≈67%), extracted at install. Only lever with a real tradeoff (slightly longer install, extracted copy on disk).
   - Still on the table: R8/proguard + resource shrinking (`android.enableMinifyInReleaseBuilds=true`, `android.enableShrinkResourcesInReleaseBuilds=true`) ≈ −2–4MB but needs an on-device launch test first; removing `expo-dev-client` ≈ −1–2MB (kills the dev-client workflow); WAV preload (884KB) / font subsetting.

## Build history reference

| Date | Build | Profile | Size |
|---|---|---|---|
| 2026-10-03 | 4c14b6b0 | preview (dev client) | ~272MB |
| 2026-10-04 | b923468d | preview (standalone) | 105MB |
| 2026-10-04 | f02cf188 | preview (standalone, arm64-only + compressed libs) | 27.6MB |
