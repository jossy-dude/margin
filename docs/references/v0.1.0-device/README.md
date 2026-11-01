# Device baseline: Margin v0.1.0 on the owner's phone

**These show the OLD app on real hardware.** They are a "before" reference for v0.5, alongside the web captures in `../v0.3.1/`. Never treat them as the target.

- **Captured:** 2026-11-01 over adb, read-only (only taps on tabs and sheets, no data changed).
- **Device:** Galaxy A51 5G (SM-A516N), 1080×2400 at 420 dpi, font scale 1.0.
- **Installed build:** v0.1.0 (versionCode 1). This build predates v0.3.1, so its database has migrations 0–2.
- **Settings:** theme Light, refined palette, Scales and Lily clock. The data is the owner's own.

## Findings only the device shows
- **Sound never plays.** `dumpsys audio` lists 40 player events from Margin's uid, all `stopped` and none `started`, with media unmuted.
- **Week blocks are too small to read.** Labels truncate to "D LR-601…".
- **Rooms are stored as one string.** "Database" keeps "LR-601, LR-303" in a single field.
- **Two separate subjects form a variant case.** "Database" and "Database LAB" should be one subject with a variant.
- **Diagnostics shows 2 entries.** Both are the built-in test crash.
