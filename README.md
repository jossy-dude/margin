# Marginalia

Hand-drawn school planner. Expo SDK 57 + React Native + TypeScript. Offline-first (SQLite). Android-first. Tested as a **standalone release build**.

```bash
npm install
npx expo run:android --variant release   # builds + installs the standalone app
npm run check                 # typecheck + lint + 82 tests + architecture rules
npm run bundle                # proves the Android bundle compiles
npm run sounds                # regenerate assets/sounds/*.wav (deterministic)
```
Reset all data: Settings → Reset, or `adb shell pm clear host.exp.exponent`.
Full verification plan and architecture: `prompt.md`. Project state: `STATE.md`.
