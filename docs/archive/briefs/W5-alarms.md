# W5 — Reminders that actually ring (Android): exact timing, full-screen, boot re-arm, permissions

**let's make v1 first.** One shippable slice: a reminder arrives at the minute the planner says, can
appear over the lock screen, opens the thing it is about, survives a reboot — and the D4 lock-screen
text switch is real. The exclusions list is part of the contract.

Owner row (PLAN W5): the planner and the sync exist; W5 makes the timing true and the ring honest.
DeepSeek builders only. Native-only surfaces cannot run on this machine — every claim lands either as
a unit/DOM assertion or as a line in `docs/DEVICE_CHECKLIST.md` §W5 marked UNVERIFIED-ON-DEVICE.

## Already built — verify, do not duplicate (recent commits, W1–W4)

- **The planner** — `src/domain/reminders.ts`: pure `planReminders(PlanInput) → Plan { items, deferred,
  dropped }`; ids encode entity+minute; quiet hours/active days/weekend rules by design. W5 touches it
  only for h12 in the bodies (deliverable 8).
- **The service** — `src/services/notifications.ts`: `configureNotifications()` (handler + action
  categories + 3 channels), `ensurePermission()`, `status()`, `sync(plan, accent)` (diff queue by id,
  `scheduleNotificationAsync` with `SchedulableTriggerInputTypes.DATE`), `sendTest`,
  `sendActionTest`, `scheduleFocusEnd`, `onReceived`, `onOpened`. `src/services/notifApi.ts` re-exports
  the expo-notifications surface (the seam tests/web rely on).
- **The actions** — `src/domain/notifActions.ts`: categories `mgatt` (Here/Late/Absent) and `mgtask`
  (Done); target travels in `data` (kind+entityId); `dispatchOpened` writes + navigates; `onceGuard`;
  `PERMISSION`/`statusHint`/`logState` copy rules — all unit-tested.
- **The UI** — Settings → Reminders (`src/sheets/Settings.tsx`): master toggle, classes/tasks/hours/
  quiet/course-lead pages, and **Delivery status** (permission line, queue count, "Next one rings …",
  allow/open-settings buttons, test sends, log rows).
- **Native** — `android/` is committed and `expo run:android` uses it **as-is** (no re-prebuild). The
  operative files are `android/app/src/main/AndroidManifest.xml` and `android/app/build.gradle`;
  `app.json` (`android.permissions: [POST_NOTIFICATIONS, VIBRATE]`, no `plugins`) only matters if
  someone later runs `prebuild --clean`. **Edit the committed native files and keep `app.json` in
  sync** — the W2 convention (hand-kept `values-night/colors.xml`). Do not run `prebuild`.

## Deliverable 0 — the mechanism investigation (first; cite ground truth)

Before any code, settle the mechanism from **local sources + current docs** and put the findings at the
top of the builder report:

1. Grep `node_modules/expo-notifications/android/` for `AlarmManager`, `setExact`, `setAlarmClock`,
   `SCHEDULE_EXACT_ALARM`, `BOOT_COMPLETED`, `fullScreenIntent`. What does version **57.0.21** actually
   do for a `DATE` trigger? Exact or inexact? Re-arm on boot or not? Full-screen intent: present or not?
   Quote file paths + lines into the report.
2. What does the module's own manifest declare, and what must the app declare (Android 12+
   `SCHEDULE_EXACT_ALARM`; Android 14+ `USE_FULL_SCREEN_INTENT` and its per-app grant)?
3. Check whether a maintained library covers the gaps on **new architecture + SDK 57**
   (`newArchEnabled: true` in `app.json`): release/changelog/maintenance in the last months, and what it
   would cost (dependency, config, migration of the existing queue). A dependency needs a
   `DECISIONS.md` question **with the default implemented in-tree** — do not silently add one.
4. If a gap remains, the sanctioned path is PLAN W5's: **a small local Expo module + config plugin**
   under `modules/`, built around `AlarmManager.setAlarmClock` (or `setExactAndAllowWhileIdle` where
   setAlarmClock semantics are wrong) and a full-screen intent. Autolinking picks local modules up at
   Gradle time; verify that claim before writing code.

Write the three-line verdict ("timing / full-screen / boot — mechanism = …") and gate your plan on it.
**If the honest verdict is that one of the three needs a native module too large for one slice, stop
and report** — do not silently downgrade; the orchestrator re-scopes with a `DECISIONS.md` entry.

## v1 deliverables

1. **Exact timing.** With notifications allowed, a queued reminder fires at its minute, screen off,
   through Doze. If the exact-alarm permission is missing, the fallback is honest: Delivery status says
   reminders can land *within a window*, never "at 08:25" when they cannot. The window rule lives in a
   pure, tested helper (e.g. `inexactWindow(min)`) beside its copy in `notifActions.ts`.
2. **Full-screen ringing.** A reminder can appear over the lock screen as a full-screen intent (class
   kinds first; task/exam the same mechanism) carrying the existing action buttons; tapping it opens
   Today/Tasks on the right entity — the existing `dispatchOpened` path, unchanged. If the phone
   refuses full-screen intents, it still heads-up normally. No new ringing visual design in v1: the
   full-screen surface is the system's, with our title/body/buttons.
3. **Boot re-arm.** After reboot — and after force-stop + reopen — the OS queue equals the plan again.
   If expo-notifications' own `BOOT_COMPLETED` receiver covers it, prove it (file + line) in the report
   and add nothing; only add a receiver when the proof fails. Keep the existing app-open `sync` as the
   top-up.
4. **Three permission flows.** Delivery status handles, per phone, each in its own honest state:
   `POST_NOTIFICATIONS` (exists), `SCHEDULE_EXACT_ALARM` (Android 12+; open
   `Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM`), `USE_FULL_SCREEN_INTENT` (Android 14+;
   `NotificationManager.canUseFullScreenIntent()` when the API answers, link to
   `Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT`). Lines + tones stay in `notifActions.ts`
   (`PERMISSION` map style) and are tested; a button appears only when a button can help.
5. **D4 — "Show reminder text on the lock screen".** New field on `NotifSettings` + `DEFAULT_NOTIF`,
   default **ON** (settings merge handles old stores — no SQL migration). ON → platform default; OFF →
   `lockscreenVisibility: SECRET` on the `classes` and `tasks` channels. Channels keep state, so the
   toggle must re-apply the channels on change, and Delivery status must print the channel's **actual**
   visibility read back, not the setting's wish. Hint text: the reminder still rings; its text is
   hidden until unlock. Sitting in Settings → Reminders, above Delivery status.
6. **The dev-build banner.** Web / a build without the notification module: the notif pages say, in one
   honest sentence, that alarms need the development build — no dead toggles that pretend to work.
   Delivery status already says `unavailable`; extend that honesty to the Reminders row.
7. **h12 reaches the bodies (cheap reach).** `reminders.ts` bodies (`fmtTime(start)` ~:188, `due
   ${fmtTime(t.dueAt)}` ~:199) and `notifActions.ts` `testTarget` body (~:148) take the setting —
   thread it through `PlanInput` (or the call site) without breaking planner purity. `src/services/
   export.ts` is **not** in this slice.
8. **Nothing else moves.** Quiet hours, active days, ids, categories, `onceGuard`, navigation — byte-
   for-byte behaviour preserved except where a deliverable says otherwise.

## Acceptance / evidence

- `npm run check` green (typecheck + eslint 0 warnings + jest + depcruise).
- Unit tests for: h12 bodies; D4 mapping (toggle × channel visibility + read-back copy); the inexact
  fallback helper; Delivery-status lines for the two new permission states (denied / granted /
  unavailable); the dev-build sentence selector. Pure logic goes in `notifActions.ts` beside its tests.
- `tools/w5-assert.mjs` (web, 412×915): the D4 toggle round-trips in the session and persists on the
  page; the notif pages show the dev-build/unavailable copy with no module; whatever the web cannot
  honestly show is listed there as UNVERIFIED-ON-DEVICE. Keep it in the W4 script's voice.
- `docs/DEVICE_CHECKLIST.md` §W5 — the only place these pass: alarm at its minute with the screen off
  (schedule >1 h out, phone untouched); full-screen over the lock screen; buttons write and land on the
  right row; text hidden with D4 OFF (and visible ON); reboot re-arm; exact-alarm permission denied →
  the window copy, not a lie; `canUseFullScreenIntent` false → still heads-up.
- Report: the D0 verdict, every claim with its command output or source citation, and the UNVERIFIED
  list. Builders leave everything uncommitted; the orchestrator gates and commits.

## Exclusions (v1 contract)

- iOS — none of this ships there in v1.
- No new visual design for a ringing screen; the system's full-screen surface carries our content.
- No alarm sounds beyond the channels' existing vibration/sound behaviour; no custom tones.
- `export.ts` timestamps and anything W6 (trips, export) or W8 (onboarding's D4 ask) owns.
- No changes to the planner's scheduling rules (quiet hours, active days, weekend, caps).
- No `prebuild`, no dependency additions without the DECISIONS entry above.
