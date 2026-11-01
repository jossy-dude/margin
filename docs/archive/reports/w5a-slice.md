# W5a — the JS/manifest slice of "Reminders that actually ring" (builder report, 2026-10-17)

Scope: `DECISIONS.md` **D9 a** — everything in `briefs/W5-alarms.md` that does not need a new native
module. W5b (the local Expo module that owns full-screen presentation) is **not** in this diff.

Nothing is committed: the working tree is left as-is for the orchestrator's gate.

**All gates green:**
`npm run check` → `CHECK EXIT=0`, `Test Suites: 52 passed, 52 total`, `Tests: 851 passed, 851 total`
(830 before this slice), `✔ no dependency violations found (201 modules, 690 dependencies cruised)` —
log `/tmp/opencode/logs/w5a-check-final.log`.
`node tools/w5-assert.mjs` → `ASSERT EXIT=0`, `W5 ASSERT: ALL PASS` (8 assertions) — log
`/tmp/opencode/logs/w5a-assert-final.log`, shots `.shots/w5/{settings-root,reminders,delivery-status}-web.png`.

---

## 1. What changed, file by file (line numbers are post-change)

### Manifest + config, kept in sync (deliverable 1)

- `android/app/src/main/AndroidManifest.xml:2-8` — the comment recording why both permissions are here
  and which half is W5b's.
- `…:12` `SCHEDULE_EXACT_ALARM`, `…:14` `USE_FULL_SCREEN_INTENT` — declared only, nothing else native
  moved. `USE_FULL_SCREEN_INTENT` is declared **now** on purpose: an undeclared permission cannot be
  granted later without another manifest change + reinstall, and W5b needs it grantable.
- `app.json:21-22` — the same two names added to `android.permissions`, so the mirror list is not stale.

### Timing honesty (deliverable 2)

- `src/domain/notifActions.ts:139` `EXACT_ALARM_UNKNOWN` — the explicit state: *"This phone will not tell
  the app whether exact alarms are allowed, so the times below are windows, not promises."*
  It is true of this build: `AlarmManager.canScheduleExactAlarms()` is exposed by no installed dependency
  (`reports/w5-d0-mechanism.md` §4), so the app cannot know and must not pretend.
- `…:143-144` `INEXACT_WINDOW_MIN = 5` / `inexactWindow(min = …)` — the window's words in one place.
- `…:147` `nextRingLine(at, fmt, rel, min)` — pure; `fmt`/`rel` are the caller's h12-aware `fmtTime` and
  `relFire`, so `domain/` stays store-free. Output: `Next one is planned for around 08:25 — give or take
  5 min — in 25 min.` Never `rings at 08:25`.
- `src/sheets/Settings.tsx:256` renders it; `…:257` renders the `EXACT_ALARM_UNKNOWN` sentence under it.
  The old `Next one rings …` string is gone from the codebase (assert 4c).
- No new buttons anywhere on the page.

### D4 — lock-screen visibility (deliverable 4)

- `src/domain/types.ts:57` `NotifSettings.lockText`, `src/domain/defaults.ts:21` `lockText: true`.
  `withDefaults` merges `DEFAULT_NOTIF`, so a settings row written before this field gets ON — no SQL
  migration, and `README`-style settings are a JSON blob keyed `notif`, not columns.
- `src/services/notifApi.ts:8,12` re-exports `getNotificationChannelAsync` and
  `AndroidNotificationVisibility`.
- `src/services/notifications.ts:23` `channelConfigs(lockText)` — ON spreads **nothing** (Android's own
  choice stands; the app never claims a visibility it did not pick), OFF pins
  `lockscreenVisibility: SECRET`; the `focus` channel is not reminder text and is untouched.
- `…:33` `configureNotifications(lockText = true)` keeps its `configured` latch (a re-call is a no-op),
  which is exactly why the toggle needs its own entry point:
- `…:58` `applyLockscreenText(lockText)` — re-applies **only** `classes` + `tasks`, Android only, never
  the handler or the categories.
- `…:76` `readLockscreen()` + `…:96` put the phone's own answer in `NotifStatus.lockText`
  (`'public' | 'private' | 'secret' | 'unknown' | null`); every failure path (`no channel`, thrown read)
  is `null`, never a guess.
- `src/store/store.ts:183` — `setNotif` calls `applyLockscreenText` **only** when `patch.lockText` is
  defined; `…:126` `nsSame` compares `lockText` so the read-back actually lands in the UI.
- `src/sheets/Settings.tsx:217` the `Toggle` (`testID show-reminder-text-on-the-lock-screen`), hint
  *"When off, it still rings but the text stays hidden until you unlock"* (state-neutral — vision round 1
  caught the earlier *"Off: …"* leading label contradicting the switch's ON state), sitting directly above
  the `Delivery status` `Nav` (`…:218`).
- `src/sheets/Settings.tsx:260` — `lockTextLine(n.lockText, ns.lockText)` on the Delivery status page
  (Android only, because only Android has channels). `notifActions.ts:164` builds it so the line always
  names both the setting **and** what the phone reports, and says *"the channel wins until Android
  recreates it"* when they disagree.

### Dev-build banner (deliverable 5)

- `notifActions.ts:175-183`: `NO_MODULE_LINE`, `NO_MODULE_HINT`, `noModuleNote(platform, permission)` —
  `web` or `permission === 'unavailable'`; a permission that has simply not been read yet is **not**
  "no module", so a slow boot never prints the sentence.
- `Settings.tsx:114` computes it once; `…:208` and `…:250` render the sentence at the top of the
  Reminders page and of Delivery status; `…:155` appends the short form to the root **Reminders row**.
  No toggle is disabled or faked.

### h12 bodies (deliverable 6)

- `src/domain/reminders.ts:17` `PlanInput.hour12?: boolean` (optional → every existing call site keeps
  the shipped 24-hour default); `…:193` class body `fmtTime(start, i.hour12)`; `…:204` task/exam body
  `fmtTime(t.dueAt, i.hour12)`.
- `notifActions.ts:196` `testTarget(…, h12 = false)`; `Settings.tsx:244` passes `s.hour12`.
- `store.ts:114` passes `hour12: s.settings.hour12` into the plan; `…:177` `setSettings` calls
  `resync(400)` when `hour12` changes, because the queue's bodies are written from it and nothing else
  in `Look & feel` reaches the plan.

### Untouched (deliverable 7)

Quiet hours, active days, ids (plan/category/action ids), categories, `onceGuard`, and navigation are
byte-for-byte unchanged — `git diff` touches none of them. `src/services/export.ts` was not edited.
Boot has nothing added: the app-open `sync` stays the top-up and `expo-notifications`' own
`BOOT_COMPLETED` receiver is the re-arm (`reports/w5-d0-mechanism.md` §5).

---

## 2. Evidence

| Command | Outcome |
|---|---|
| `npm run check` | `EXIT=0`; 52/52 suites, 851/851 tests, boundaries clean (re-run after vision fixes — green) |
| `node tools/w5-assert.mjs --url http://localhost:8098` | `EXIT=0`; 9/9 PASS (incl. new `[4d]` scroll-reset pin) |
| `node tools/w4-assert.mjs --url http://localhost:8098` | `ALL PASS` — the shared `Sheet` change regresses nothing |
| `npm run typecheck` | clean (run standalone before lint/test; no output) |
| `npm run lint` | `--max-warnings=0`, 0 problems |
| `npm run boundaries` | `no dependency violations found (201 modules, 690 dependencies cruised)` |

New/updated unit tests (all inside the green suite):

- `src/test/notifications.test.ts` — `nextRingLine` pinned to the **exact** sentence including the
  window and the relative part; `inexactWindow()`/`INEXACT_WINDOW_MIN`; `EXACT_ALARM_UNKNOWN` wording;
  `noModuleNote` for `web` / `unavailable` / `granted` / `null` (not-read-yet must be silent);
  `lockTextLine` in agreement, in disagreement ("the channel wins"), and with `null` / `'unknown'`;
  `testTarget` body in both clocks (`due 10:00` vs `due 10:00 AM`).
- `src/test/notif-configure.test.ts` — ON → **no** `lockscreenVisibility` key on any channel; OFF → `3`
  (`SECRET`) on `classes`+`tasks` and `undefined` on `focus`; `applyLockscreenText` re-applies exactly
  `['classes','tasks']` after boot has already run, and re-registers nothing else; iOS → no writes;
  `status().lockText` maps `3→secret`, `1→public`, `2→private`, `0→unknown`, and `null` for "no channel"
  and for a thrown read.
- `src/test/notif-store.test.ts` — the D4 toggle calls `applyLockscreenText([false])` then `([true])`,
  and **every other** reminder setting calls it zero times.
- `src/test/domain.test.ts` — the class body prints `08:30` / `8:30 AM` and no `AM` in 24-hour mode, the
  task body prints `due 12:00` / `due 12:00 PM`, and `hour12: undefined` is byte-identical to `false`.
- `src/test/settings-render.test.ts` — Delivery status: the window phrasing matches and `Next one rings`
  is absent; the dev-build sentence appears on both pages; the D4 read-back renders the disagreement and
  the agreement; the Reminders row keeps W4's `min before class` **and** gains the short addendum; the
  D4 toggle round-trips through the store (pressed twice, `settings.notif.lockText` flips both ways).

Browser evidence (`tools/w5-assert.mjs`, web, 412×915, real time — 8 PASS):

1. Row aria-label: `Reminders. 10 min before class · quiet 22:00–07:00 · alarms need the development build`.
2/2b. The no-module sentence renders on the Reminders page (y-order: sentence above the D4 toggle).
3/3b. The switch's track goes `rgb(138,75,39) → rgb(255,251,241)` and the knob `x 26 → 3`; after leaving
the page and coming back it is **still** `rgb(255,251,241)/3`, i.e. the state came from the store, not
from a local `useState` — and it goes back on.
4/4b/4c/4d. Delivery status shows the same sentence above its own verdict (y 416.7 before y 494.7), the
removed phrase `Next one rings` appears nowhere, and the page opens at the top (zero retained `scrollTop`
after the sub-page swap; verdict line 78 px clear of the header).

The switch's state is read off the track colour and the knob's matrix, **not** `aria-checked`: this RNW
build renders `role="switch"` with no `aria-checked` (the same finding `tools/w4-assert.mjs` recorded for
the clock toggle), so a state assertion on that attribute would have been a false pass.

---

## 3. Judgement calls (all deliberate; each is a place a reviewer could disagree)

1. **The Reminders row hint appends instead of replaces.** `tools/w4-assert.mjs` 7h asserts W4's clock
   is in that hint (`/min before class/` and an AM/PM string). Replacing it would break a W4 assertion
   that is still true, so the build fact is appended: `… · quiet 22:00–07:00 · alarms need the
   development build`. Assertion 7h still reads `min before class` in the rendered text.
2. **The D4 toggle stays enabled on web.** It round-trips and persists in-app, so disabling it would be
   a control that lies in the other direction. The honesty is carried by the sentence above it, and the
   assert pins that ordering (assertion 2b) so the "still rings" hint can never be read without it.
3. **Channel re-apply is not a delete+recreate.** Expo calls
   `NotificationManagerCompat.createNotificationChannel`, and its own `setNotificationChannelAsync.d.ts`
   says *"After a channel has been created, you can modify only its name and description"*. So the app
   cannot force the change, which is precisely why the read-back exists and why the copy names the
   disagreement instead of asserting success. UNVERIFIED-ON-DEVICE (checklist W5.2c/W5.2d).
4. **`setSettings` re-syncs on `hour12`.** Nothing else in `Look & feel` reaches the plan, and without
   this the queued bodies would keep the old clock until the next natural resync. A 400 ms debounce keeps
   it from racing the keystroke-batched settings writes.
5. **The exact-alarm sentence is tied to the next-reminder line.** It explains the window right under it,
   so it only renders when there is a next reminder to be wrong about. Delivery status is still honest
   when the queue is empty or unreadable (`queueRead` copy, unchanged).
6. **`NotifStatus.lockText` widened an existing interface**, so every untyped `status()` mock in the test
   suite keeps compiling while the real module stays the only producer. Only the two typed fixtures in
   `settings-render.test.ts` needed the new field.

---

## 4. UNVERIFIED (nothing below was executed here)

- **UNVERIFIED-BUILD** — no Android SDK on this machine (`ANDROID_HOME`/`ANDROID_SDK_ROOT` unset, no
  `~/Android/Sdk`, no `android/local.properties`, no `android/app/build`). The merged manifest of a real
  build, and therefore whether `SCHEDULE_EXACT_ALARM`/`USE_FULL_SCREEN_INTENT` end up in the installed
  APK, was **not** built or inspected. `prebuild` was not run (constraint).
- **UNVERIFIED-ON-DEVICE** — every native claim: the exact-vs-inexact branch actually taken; the window
  wording next to a real queue; `SECRET` landing on `classes`+`tasks` (and the focus channel keeping its
  own visibility); the read-back mapping against a real channel; the lock screen actually hiding the
  text (and still ringing); the post-reboot re-arm; the h12 bodies as the phone shows them. Each has a
  step in `docs/DEVICE_CHECKLIST.md` §W5.1–W5.4.
- **UNVERIFIED-VISUAL on web → judged: vision round 1 + re-check.** The three `.shots/w5/*.png` frames
  were judged by the vision critic after this slice: round 1 returned **FAIL** on two items (see §6),
  both were fixed in-pass and the re-shoot of the same frames was **judged clean by the orchestrator**.
  The two NOT-fixed findings logged from that round are pre-existing W3/W4 issues, byte-identical in
  `97c1783` (day-strip `Tue 20 Tue` duplicate weekday; browser focus ring on the `✓ Done` chip) — not
  W5a regressions.
- **UNVERIFIED — persist across a page reload on web.** The assert proves the D4 value survives leaving
  the Settings page and returning. It does **not** survive a full page reload: on web the app's SQLite
  database is in-memory (measured on the running app: `opfsRoot: []`, `indexedDB.databases(): []`,
  `localStorage: []` — nothing is written anywhere). So "persists" here means *in the app*, and the
  restart-level claim belongs to the phone, where `marginalia.db` is a real file. Checklist W5.2a–d.
- **W5b does not exist yet** — full-screen, `canUseFullScreenIntent()`, and the
  `ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT` grant. `USE_FULL_SCREEN_INTENT` is declared and unusable.
  `docs/DEVICE_CHECKLIST.md` §W5b is marked "pending DECISIONS D9" and cannot pass on this build.

---

## 5. D9 second slice, as this slice leaves it

W5b has to add exactly two native reads and one presentation path, and this slice has pre-shaped the JS
side so it is a drop-in:

- `notifications.ts:96` — `const lockText = Platform.OS === 'android' ? await readLockscreen() : null`.
  The exact-alarm read (`canScheduleExactAlarms()`) and the full-screen read
  (`canUseFullScreenIntent()`) take the same shape (module read → `NotifStatus` field → copy), and
  `EXACT_ALARM_UNKNOWN` (`notifActions.ts:139`) is the one constant the UI must stop printing when the
  real answer exists.
- The declared permissions in `AndroidManifest.xml:12,14` are what make both grants reachable.

---

## 6. Vision round 1 → fixes → re-verified (orchestrator pass)

Vision critic judged the three W5 frames (`Reminders page`, `Delivery status`, `Settings root`) at
412×915: items 1 (honesty sentence placement) and 4 (frame reads as designed) **PASS**; two **FAIL**,
both real and fixed in this pass:

1. **D4 hint contradicted the switch.** The hint led with the state label `Off: …` while the toggle
   renders ON → any reader sees a contradiction. Fix: state-neutral conditional
   *"When off, it still rings but the text stays hidden until you unlock"* — it never asserts current
   state, so it cannot lag or contradict the switch. Pinned in `src/test/settings-render.test.ts:346`
   and assert `[2b]`.
2. **Delivery status opened mid-scroll: the first line was cut by the sheet edge.** Root cause:
   `Sheet`'s `ScrollView` persists across sub-pages (the sheet stays mounted, only `children` swap),
   so the Reminders page's scroll position — the assert's own toggle tap scrolls ~91 px — carried over
   and the shorter new page opened under the header. Fix: `Sheet` takes an optional `scrollKey` that
   keys its `ScrollView`, and `SettingsSheet` passes the current `page` (`Settings.tsx:348`), so each
   sub-page remounts its scroll container at the top. Default `'s'` keeps every other sheet caller
   byte-identical in behaviour. Pinned by assert `[4d]` (zero retained `scrollTop` after the nav +
   verdict line clear of the header box): pre-fix the page arrived with ~91 px retained and the line
   bisected; post-fix `[] `and 78 px clearance.

Re-verification after both fixes: `npm run check` green (52/851), `w5-assert` **9/9 ALL PASS**,
`w4-assert` **ALL PASS** (the shared `Sheet.tsx` edit regresses W4's net), frames re-shot to
`.shots/w5/` and the two repaired regions inspected directly.

The user-tester DOM regression round was **skipped at the owner's request** (session speed); every
fact it was scoped to check (sentence presence + y-order, toggle round-trip, honesty copy, W4 smoke) is
covered by `w5-assert` + `w4-assert`, both ALL PASS. On-device behaviour remains
UNVERIFIED-ON-DEVICE per §4.
