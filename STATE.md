# STATE: Margin

_Updated 2026-11-12. Keep this file to where things stand now; move finished history to `docs/archive/`._
History before v0.7 (task log, v0.3–v0.6 status, audits): `docs/archive/STATE-history-2026-11.md`.

## Now
- **Shipped:** v0.6.0 (versionCode 5), tag `v0.6`. Branch `v2-improvements` is now **0.7.0 / versionCode 6** (unreleased).
- **v0.7 in progress** (`docs/v07/PLAN.md`, decisions B1–B9 there):
  - done: BUGS #11 reconnect (`f63f727`), #7 To-do filter, item 8 export counts; N1 version, N4/N5 sync module + manifest
    (native CI green); Settings → Obsidian → Sync card; margin-bridge 0.7 live client (built, not yet in the vault).
  - desktop half lives in `~/Documents/Projects/vault-sync/` (sync-core + `bone-syncd`, read-only first).
  - not started: N2 release signing (owner), N3 migration 7, N6 alarm engine, N7 widgets, Phases 4–7 (redesign, sound, widgets).
## Open facts
- No release-key build has ever run: the four secrets in `docs/RELEASING.md` §1 are unset.
- Owner's phone pass `docs/DEVICE_CHECKLIST.md` §V06 is still blank.
- Kotlin compiles only in CI (`native.yml` on native changes, `release-apk.yml` by hand).
- Rejected tools: Real SFX (licences unstated), earshot (1.1 GB torch models).
