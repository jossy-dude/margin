# STATE: Margin

_Updated 2026-11-12. Keep this file to where things stand now; move finished history to `docs/archive/`._
History before v0.7 (task log, v0.3–v0.6 status, audits): `docs/archive/STATE-history-2026-11.md`.

## Morning report (2026-11-13, overnight build)

**Done**
- Margin (`v2-improvements`, pushed, native CI green): DB reconnect fix BUGS #11 (own commit `f63f727`) · 0.7.0 / vc 6 ·
  Kotlin sync hub (SyncService, SyncEngine, SAF vault writer, sync.db, no location permission) · Settings → Obsidian →
  "Sync with your desktop" · To-do filter (BUGS #7) · export counts (item 8) · migration 7 (components, task order,
  one-off moves) · component grade maths (R4) · no 30 s bridge polling (S9) · margin-bridge 0.7 live client (built).
- Margin, morning (after you woke): alarm can be silenced (volume keys, double tap, Silence action), ramps 15 → 100 %
  over 45 s, tone picker with Stop (N6/R10) · reminder rules engine + planner (R9) · widget 30-min wake-up gone (N7) ·
  v2 building blocks: tokens (U1), sky (U3), glass card (U4), bubble (U5), nav island (U6), twelve faces (U7).
- Desktop (`~/Documents/Projects/vault-sync`, local git): `sync-core` (30 tests) and `bone-syncd` hub (9 tests incl. the
  phone plugin end to end). Dry run on your vault: 2,802 files hashed in 1.2 s.
- Vault: F1 phone notes full width · F2 graph per device + reason when empty · V0 Bone v2 skin switch + tokens
  (contrast-checked) · V1 Log look · V3 veil (13 hidden, 91 blurred; Library "Hidden" filter; Recent covers).
  v2 is OFF until you pick it (Bone Home → Look, per device).

**Half-done**
- Sync is built but never ran between real devices: the phone had no adb (see below). Kotlin compiles; behaviour on
  the A51 is untested. Text merge on the phone is left to the hub (decision B5). NSD discovery not written (pair text
  carries the address).
- Margin redesign: components exist, screens not rebuilt on them yet (Phase 5); sound set (A1–A4) and the three
  widgets (G1–G4) not started. Bone F3, V2, V4–V12 not started.
- A full phone test (Opus agent, phone muted, DND on) ran this morning; its report is `~/Documents/Projects/test-reports/2026-11-13/TEST-REPORT.md` (kept off GitHub: screenshots show vault content).
  Fixed since: #1 an alarm is always stoppable, #3/#4 chess promotion and drags, #10/#11 To-do Done labels and counts.

**Needs you**
1. Wireless adb was off (it resets on reboot): re-enable it so I can test on the phone.
2. Install the dev APK (`output/margin-0.7.0-dev-android.apk` once CI finishes; it installs beside the real app).
3. Start the hub: `ln -s ~/Documents/Projects/vault-sync/systemd/bone-syncd.service ~/.config/systemd/user/ &&
   systemctl --user enable --now bone-syncd`, then `node ~/Documents/Projects/vault-sync/daemon/bone-syncd.mjs pair`
   and paste the text into the dev app (Settings → Obsidian). My sandbox refused to add a service.
4. Release-key secrets (N2) and the data move stay yours, as agreed.

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
