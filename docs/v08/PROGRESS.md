# v0.8 progress (all four phases at once, owner's ask 2026-11-19)

Nothing is committed, pushed or released without asking. Kotlin compiles only in CI.

## Phase 1 · Sync
- [x] vault-sync core: `classes.js` (file classes + `.bone-sync-classes`), `mergeNote` (no callouts; head stays;
      union for both-created; untouched template loses), `deletesMost`, `conflictEntry`, `hint`/`changed` frames,
      client ping 20 s / pong 10 s. Fixtures: `fixtures/classes.json`, `fixtures/notes/*.json`. 96 core tests pass.
- [x] hub: classes enforced (plugin/single one way, local never synced and unlisted without a delete), clashes to
      `Conflicts/YYYY-MM-DD.md`, replay check (`merged` table), deletes-most guard, idle sweep 60 s, one session per
      device, peers pruned after 30 days, closest base never the head. `test/v08.test.mjs` (8) + all old tests pass.
- [x] hub: `need-base` / `baseBody`; soak test (`test/soak.test.mjs`, SOAK_OPS); health.sh v0.8 invariants. The soak
      found a real bug: a phone edit arriving while a desktop delete was settling threw and was never acked (fixed).
      The 10k run found a second one: the hub stat'ed the file, then read it later; a desktop delete in between threw
      and the put was never acked. The head is now read once, at the check (text only; media is stat'ed). SOAK_OPS=10000 now passes (5 min 12 s).
- [x] Kotlin (compiled only in CI, not yet built): FileClasses.kt + FileClassesTest (JVM, native.yml step),
      SyncStore v2 (base bodies, pending, skipped, events, vault_changes), engine split SyncEngine / SyncFiles /
      SyncLocal / SyncDiscovery (NSD), backoff 1–60 s + jitter, ping 20 s / pong 10 s, Kotlin owns the vault folder
      (adopts a persisted grant), onVaultChanged, vault API (vaultFiles / vaultRead / vaultEdit CAS / vaultChanges),
      phone Obsidian thin (hints, deferral while editing, auto-pairing via link.local.json), plugin batches.
- [x] margin-bridge 0.8 (built, NOT installed in the vault): thin client; no bridge files on either device.
- [x] JS: `domain/vaultTasks.ts` (parser/patcher), `domain/vaultMap.ts`, `domain/vaultNotes.ts`, `store/obsidian.ts`
      (ingest by event, field-level patches out, Margin/Tasks.md, generated notes, read-only margin.json snapshot),
      migration 8 (tags, important/cancelled, notices pinned/archived/remind/undated, subject tag/colour/archived,
      exam → notice, dedupe by block id), tracked tags field. Old `store/vault.ts`, `store/bridge.ts` removed.
- [x] 1.6 clean-up script `vault-sync/tools/conflicts.py` (--list ran: 3 notes on the desktop; --apply waits for him)
- Spike still owed on the phone (§1.1): how Obsidian Android re-reads a file Margin rewrote. `reread()` in
  margin-bridge tries the adapter's reconcile, then the vault API.

## Phase 2 · Foundation
- [x] one UI: TodayV2 / WeekV2 / kitv2 / WeekStrip / NowCard / DayTrack / TodayPage / WeekPage deleted after their
      good parts moved: Today says "Done for today" with the day's attendance (U5) in every skin; Week has
      hold-and-drag with "This week only / Every week" (`week/MoveSheet.tsx`) in every skin, and shows moved classes.
- [x] Daylight is a skin: its sky is the background layer, its glass near-opaque (cards 0.86–0.88, sheets 0.97, P5).
- [x] background layer drawn once behind the navigator (Shell), pages transparent.
- [x] theme engine (D7 fallback): one Theme per skin×mode×pen made once and kept; the re-skin is a deferred value, so
      the tap commits first and a second tap is never dropped. NOT done: moving the 622 inline styles to sheets.
- [x] splash: MainActivity draws the logo on the last skin's paper (`setLook`, SharedPreferences `margin_look`); JS
      draws nothing until Today; no spinner screen. Fonts embedded (android/app/src/main/assets/fonts, 16 faces),
      no runtime load when the APK has them.
- [x] resume: only the clock at once; reminders/widget/notification status after idle (2 s debounce); backup when
      idle; OTA once a day, never on resume (`services/idle.ts`).
- [x] U6: the + slides away while a page scrolls (`ui/fabScroll.ts`).
- [x] importPlan.ts split (importShared / importPlan / importCsv); store-session flake fixed (waits on the condition).
- Not yet: To-do/Stats virtualised (To-do is capped at 60 rows per page, memoised cards); files still over 400
  lines: importPlan.ts 571 (parseImport is one 537-line function), Today.tsx, Settings.tsx (Phase 4 rebuild),
  Onboarding.tsx, kit.tsx, sqlite.ts, SyncFiles.kt, SyncEngine.kt, Alarms.kt. src/ is 19.2k lines, of which 14.1k
  are code (target 15k met for code, not for comments).

## Phase 3 · Product
- [x] Add sheet: Task · Class · Mark · Notice · Subject (+ focus). Task form: tag chips (#school on by default,
      assignment/reading/project/lab/deadline, any typed tag), wrapping (U7). Migration 8: tags, exam → notice.
- [x] Notice board (`sheets/NoticeBoard.tsx`): pinned first, dated by date, swipe unpin/archive with Undo, archived
      kept; Today's strip renamed with "All"; dated notices remind (planner, exam switch); `Margin/Notices.md`.
- [x] Subjects pages (`sheets/SubjectsPage.tsx`, `domain/subjects.ts`): cards with grade/attendance vs goal and next
      class; subject page with colour (5 text-safe papers, used everywhere), unique Obsidian tag, marks, tasks,
      notices, archive, delete twice with what goes. From Grades, Settings. `Margin/Subjects.md`.
- [x] Obsidian tasks: any tracked tag, open or done, dated or not; status/priority/dates mapped, unknown text kept.
- [x] Bone Tasks (vault, `.obsidian/plugins/bone-tasks/main.js`, backup in the session scratchpad): School → subject
      picker from margin.json, the class on now pre-picked. NOT done: Margin's subject and "now" in its task list.
- [x] To-do fixes: S13, S7, U6, U7, U8 (Jot → Margin), U9 #13 (room above the keyboard; needs the phone),
      #14 (page 5 hero shorter; needs the phone).

## Phase 4 · Surfaces
- [x] Settings is a full page (`ui/FullPage.tsx`) with the spec's sections, search kept, Back one page at a time.
- [x] Obsidian & Sync page (`sheets/Obsidian.tsx`, `domain/syncView.ts`): device dots, path line, stage + bar,
      problem cards with one action, skipped files, holds, event log (copy), vault folder, QR pairing (Google code
      scanner, Play services), tracked tags, one Sync now. NOT done: conflicts listed with Open/Keep buttons (the
      hub files them in `Conflicts/`, the page shows them in the log).
- [x] Widget: one card, 4×2 default, 4×1–4×3, skin colours (`Look.kt`), tap-to-tick on Android 12+ (applied by JS on
      start/resume), "+N more". Old board layouts removed.
- [x] Alarm page wears the skin; after Silence it still gives up at the ring limit (bug: `quiet()` cleared the timer).
- [x] PRODUCT.md ("no cloud"); DEVICE_CHECKLIST §V08.
- Not done by me: the device pass, two days of battery readings, the release question.

## Extra asks (owner, 2026-11-20)
- [x] Alarm owns the screen: immersive (bars hidden, swipe shows them), drawn under the cut-out with its inset kept,
      bigger face that breathes, page rises in; Snooze shows "Snoozed until …" and every exit fades (`leave()`).
- [x] Icons: notification small icon is an M vector (`mg_stat`, `notification_icon` for expo-notifications via the
      manifest meta-data + rust colour); sync/hold notices use it too; launcher foreground M scaled from ~40 % to 60 %.
      The Expo Go icon only appears inside Expo Go (it posts the notifications); the APK uses Margin's.
- [x] Focus countdown on the lock screen: `domain/focusLive.ts` + `store/focusLive.ts` drive `showLive` (public,
      chronometer) for rounds and breaks; hidden on pause/end; tap opens `marginalia://focus`.
- [x] Transitions: FullPage drifts in/out (FadeInRight/FadeOutRight, EASE), Subjects stack (`PageStack`), Week's
      MoveSheet fades and rises; all off with Reduce motion. Sheets, toasts, the + and Settings pages already moved.

## Decisions taken while building
- D7 fallback chosen up front: Unistyles 3 needs Nitro modules and a device spike; the precomputed-sheet engine is
  pure JS, testable here, and reversible.
