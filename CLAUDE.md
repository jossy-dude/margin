# Margin

Expo/React Native school planner for Android (package `marginalia`), Kotlin bits in `modules/margin-native`.

## Rules
- Commits carry no AI attribution: no `Co-Authored-By` or "Generated with" lines. The `.githooks/commit-msg`
  hook enforces it (`git config core.hooksPath .githooks` once per clone).
- Gradle runs in GitHub Actions only (`native.yml`, `release-apk.yml`). The committed `android/` folder is what
  ships, not `app.json`.
- Gate before every commit: `npm run check`.

## Where to look
- `STATE.md`: where things stand now. `docs/v07/PLAN.md`: the current plan.
- `docs/BRIDGE.md`: Margin ↔ Obsidian bridge. `docs/RELEASING.md`: APKs, OTA and the runtime-version trap.
- `DECISIONS.md`: past design decisions (D1…), read when a choice looks odd.
- Lessons from Obsidian/vault sessions (phone testing over adb, rejected UI directions):
  `~/.claude/projects/-home-jossy-Documents-Obsidian-Vault---Bone--/memory/MEMORY.md`.
