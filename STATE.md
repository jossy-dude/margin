# STATE: Margin

_Updated 2026-11-20. Keep this file to where things stand now; move finished history to `docs/archive/`._
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
- Desktop (`~/Documents/Projects/tools/vault-sync`, local git): `sync-core` (30 tests) and `bone-syncd` hub (9 tests incl. the
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
- A full phone test (Opus agent, phone muted, DND on) ran this morning; its report is `~/Documents/Projects/experiments/test-reports/2026-11-13/TEST-REPORT.md` (kept off GitHub: screenshots show vault content).
  Fixed since: #1 an alarm is always stoppable, #3/#4 chess promotion and drags, #10/#11 To-do Done labels and counts.
  Then (2026-11-14): #12 sample term removed whole (`b3cc37c`) · #13 time fields open the number keyboard (`73d4686`) ·
  #17 Focus pause: the clock logic holds still, pinned by a test (`868a455`); likely screenshot lag, recheck on the phone.
  Still open: #13 Save covering the next field with the keyboard up, #14 onboarding page 5 card under the dots (both
  need the phone to see), #15 never-idle UI (goes with R1, Today), #2 (next dev build).

**Needs you**
1. Wireless adb was off (it resets on reboot): re-enable it so I can test on the phone.
2. Install the dev APK (`output/margin-0.7.0-dev-android.apk` once CI finishes; it installs beside the real app).
3. Start the hub: `ln -s ~/Documents/Projects/tools/vault-sync/systemd/bone-syncd.service ~/.config/systemd/user/ &&
   systemctl --user enable --now bone-syncd`, then `node ~/Documents/Projects/tools/vault-sync/daemon/bone-syncd.mjs pair`
   and paste the text into the dev app (Settings → Obsidian). My sandbox refused to add a service.
4. Release-key secrets (N2) and the data move stay yours, as agreed.

## Mascot faces (2026-11-14, U7)
Jot is gone; the twelve faces are in (commits above in PLAN U7). One face per page: a 28 dp top-bar face on To-do,
Grades, Week and Stats (tap it: a wink), a 64 dp face in page-wide empty states, 72 dp on Focus and About, 160 dp in
onboarding, 20 dp on "saved"/"failed" snackbars, sleepy → happy on the alarm screen. Reactions: task done, present /
absent / full week, a mark on or under its goal, a new task from Obsidian. Not yet: Today (R1 owns it), widgets (G1–G4).
Check on the phone: `polish-pass/handoff/mascot/CHECK.md`.

## Overnight 2026-11-14 (Agent M)
- R12 weekly backup: Settings → Your data → Automatic backup, folder picked once, newest four kept (`28af407`).
- R11 "Bring my data back" on onboarding's data page → Import; a restored export gives equal counts (`678bcc0`).
- R3 swipe to done has Undo; "My order" stored per task and kept across restarts (`85034e9`). Not built: the drag
  handle to reorder (D-23), so "My order" is not offered in the sort button yet.
- Number fields open Android's number keyboard (`73d4686`, `65654eb`).

## Overnight 2026-11-14, part 2 (Agent M)
- R7: no steppers left, a sweep test keeps them out (`9bb24ef`); Mark sheet asks which part (`da12cde`).
- R4: Grades card uses the parts' shares, one row per part (`adcae7a`). Split editor waits for Jossy.
- R5: Stats attendance per part against its own goal (`be4ccb8`).
- R6 waits: Focus D-16 is visual and swaps Break for +5 (question for Jossy).

## Now
- **v0.7.4** (versionCode 10, tag `v0.7.4`, 2026-11-20): the v0.8 overhaul (all four phases, `docs/v08/PROGRESS.md`)
  plus a dead-code sweep (ui/charts.tsx, the never-wired Do Not Disturb calls, unused native wrappers, SyncStore's
  ext_reminder accessors). The `v0.7.5` tag (versionCode 9) points at a commit whose Kotlin did not compile; it has
  no release and 0.7.4 replaces it (owner's pick). Phone pass: `docs/DEVICE_CHECKLIST.md` §V08. Needs vault-sync's
  v0.8 hub and margin-bridge 0.8 in the vault.
- **v0.8 overhaul spec** (2026-11-19): `docs/v08/SPEC.md`: 4 phases (1 sync rebuild, 2 speed/clean code/one UI
  with skins, 3 Add/tags/Subjects/Notices/Obsidian tasks, 4 full-page Settings, sync page, widget).
  Phone state after the test: vault folder re-picked (it had been lost, S9); alarm verified stoppable.
- **v0.7.2** (versionCode 8, tag `v0.7.2`, 2026-11-15): one Focus timer shared by Margin, phone and desktop
  Obsidian (offline actions queued and sent on reconnect, ends on every device at once); SyncEngine guards a socket
  closed mid-reply; margin.json writes read back and redone, readers repair trailing junk (`domain/jsonRepair.ts`).
  Needs vault-sync `0b50dc9` or later. Phone checklist: `tools/vault-sync/docs/v07/BATCH-2026-11-15.md`.
- **v0.7.1** (versionCode 7, tag `v0.7.1`, 2026-11-15): lab/tutorial parts editable in the subject sheet, plus the
  sync hardening from the 2026-11-15 stress test: seal 2 on every link (loopback too), O's 6-digit key swapped for a
  random one (`rekey`), desktop priority in merges, same-new-note keeps both, cursors move only after files land,
  big files in 1 MB parts with OkHttp back-pressure, big deletes held with a question (Settings → Sync card,
  notification, phone Obsidian dialog), deletes go to `.trash/`, ignore list enforced. Needs vault-sync `a45d550`
  or later on the desktop (older hubs get refused: no seal 2). Kotlin compiled only in CI.
- **Next candidates:** one "Manage" page for every subject, test and less-used setting (asked 2026-11-15).
- **v0.7 in progress** (`docs/v07/PLAN.md`, decisions B1–B9 there):
  - done: BUGS #11 reconnect (`f63f727`), #7 To-do filter, item 8 export counts; N1 version, N4/N5 sync module + manifest
    (native CI green); Settings → Obsidian → Sync card; margin-bridge 0.7 live client (built, not yet in the vault).
  - desktop half lives in `~/Documents/Projects/tools/vault-sync/` (sync-core + `bone-syncd`, read-only first).
  - not started: N2 release signing (owner), N3 migration 7, N6 alarm engine, N7 widgets, Phases 4–7 (redesign, sound, widgets).
## Open facts
- No release-key build has ever run: the four secrets in `docs/RELEASING.md` §1 are unset.
- Owner's phone pass `docs/DEVICE_CHECKLIST.md` §V06 is still blank.
- Kotlin compiles only in CI (`native.yml` on native changes, `release-apk.yml` by hand).
- Rejected tools: Real SFX (licences unstated), earshot (1.1 GB torch models).
