# STATE: Margin

_Updated 2026-11-12. Keep this file to where things stand now; move finished history to `docs/archive/`._
History before v0.7 (task log, v0.3–v0.6 status, audits): `docs/archive/STATE-history-2026-11.md`.

## Now
- **Shipped:** v0.6.0 (versionCode 5), tag `v0.6`, debug-signed `over` APK. Branch `v2-improvements`.
- **Since the APK:** `68bd9a2`…`a8a83b3` bridge work (Margin ↔ Obsidian over `.margin/*.json`), verified on
  the phone 2026-11-12; not yet in an APK.
- **Next:** v0.7, planned in `docs/v07/` (PLAN.md first). Sync hub over Wi-Fi/hotspot, full redesign,
  new mascot faces, course components with editable weights, reminders, sounds from Openverse.

## Open facts
- No release-key build has ever run: the four secrets in `docs/RELEASING.md` §1 are unset.
- Owner's phone pass `docs/DEVICE_CHECKLIST.md` §V06 is still blank.
- Kotlin compiles only in CI (`native.yml` on native changes, `release-apk.yml` by hand).
- Rejected tools: Real SFX (licences unstated), earshot (1.1 GB torch models).
