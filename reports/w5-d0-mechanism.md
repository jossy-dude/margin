# W5 D0 — the mechanism investigation (builder dossier, 2026-10-17)

Scope: `briefs/W5-alarms.md` §"Deliverable 0". No source was changed for this dossier. This is the
evidence the W5 STOP/verdict rests on.

## Verdict (three lines)

1. **timing** — mechanism = **already present** in `expo-notifications@57.0.21`: `DATE` triggers go through
   `AlarmManagerCompat.setExactAndAllowWhileIdle(RTC_WAKEUP, …)` when `alarmManager.canScheduleExactAlarms()`
   is true, else `setAndAllowWhileIdle(RTC_WAKEUP, …)` (inexact window). No new module needed; the app
   must only declare `SCHEDULE_EXACT_ALARM` for the exact branch to be reachable.
2. **full-screen** — mechanism = **absent, and not reachable from JS or from the manifest**. The module has
   no `fullScreenIntent` anywhere (grep: zero hits in `android/ ios/ src/ build/`); the notification is built
   in `ExpoNotificationBuilder.build()` and never calls `setFullScreenIntent`; `NotificationContent`'s fields
   (the only thing JS can set) do not include it. Android only ever presents over the lock screen when
   `Notification.Builder.setFullScreenIntent` is set on the notification itself.
3. **boot** — mechanism = **already present** in the module: its manifest declares `RECEIVE_BOOT_COMPLETED`
   and a receiver for `BOOT_COMPLETED`/`REBOOT`/`QUICKBOOT_POWERON`/`MY_PACKAGE_REPLACED`; on those actions it
   re-schedules every stored request through the same `setupAlarm` path. Add nothing; prove it (below).

**Gate outcome: STOP.** Full-screen is the one of the three that needs native work, and the sanctioned form of
that work (a local Expo module + config plugin that *owns scheduling and presentation*) is a second alarm +
notification stack — bigger than one slice, and it contradicts deliverables 1/3, which both assume
expo-notifications stays the scheduler. See "Why STOP" and "Two honest mechanisms" below.

---

## 1. What the installed module actually does for a `DATE` trigger

`node_modules/expo-notifications/package.json` → `"version": "57.0.21"` (matches `package.json` dep `~57.0.21`).

**Exact or inexact** — `android/src/main/java/expo/modules/notifications/service/delegates/ExpoSchedulingDelegate.kt:105-121`:

```kotlin
105:  private fun setupAlarm(triggerAtMillis: Long, operation: PendingIntent) {
106:    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()) {
107:      AlarmManagerCompat.setExactAndAllowWhileIdle(
108:        alarmManager,
109:        AlarmManager.RTC_WAKEUP,
110:        triggerAtMillis,
111:        operation
112:      )
113:    } else {
114:      AlarmManagerCompat.setAndAllowWhileIdle(
115:        alarmManager,
116:        AlarmManager.RTC_WAKEUP,
117:        triggerAtMillis,
118:        operation
119:      )
120:    }
121:  }
```

called from `scheduleNotification` (`…ExpoSchedulingDelegate.kt:61-68`, `setupAlarm(nextTriggerDate.time, …)`).
So: **exact (wakeup, Doze-allowed) iff `canScheduleExactAlarms()`; otherwise inexact `setAndAllowWhileIdle`
— never `setAlarmClock`.** Nothing in the module calls `setAlarmClock` (grep: only `setExactAndAllowWhileIdle`
and `setAndAllowWhileIdle` appear).

**Re-arm on boot** — `…/service/NotificationsService.kt:33-39` and `:643-645`, `:828-829`:

```kotlin
33:    val SETUP_ACTIONS = listOf(
34:      Intent.ACTION_BOOT_COMPLETED,
35:      Intent.ACTION_REBOOT,
36:      Intent.ACTION_MY_PACKAGE_REPLACED,
37:      "android.intent.action.QUICKBOOT_POWERON",
38:      "com.htc.intent.action.QUICKBOOT_POWERON"
39:    )
…
644:    if (SETUP_ACTIONS.contains(intent.action)) {
645:      onSetupScheduledNotifications(context, intent)
…
828:  open fun onSetupScheduledNotifications(context: Context, intent: Intent) =
829:    getSchedulingDelegate(context).setupScheduledNotifications()
```

and `…ExpoSchedulingDelegate.kt:22-31`:

```kotlin
22:  override fun setupScheduledNotifications() {
23:    store.allNotificationRequests.forEach {
24:      try {
25:        scheduleNotification(it)
```

**Full-screen intent** — **absent.** `grep -rin "fullscreen\|full_screen" node_modules/expo-notifications/{android,ios,src,build}`
→ **0 matches**. The builder that posts the notification never sets one —
`…/notifications/presentation/builders/ExpoNotificationBuilder.kt:92-140` sets smallIcon, priority,
autoCancel, ongoing, title, text, subText, BigTextStyle, color, number, category actions, sound/vibration and
extras; no `setFullScreenIntent`. The only per-notification fields JS can influence are the
`NotificationContent` fields (`…/notifications/model/NotificationContent.java:38-51`): title, text, subtitle,
badgeCount, default sound, sound, default vibration, vibrationPattern, body, priority, color, autoDismiss,
categoryId, sticky. Nothing maps to a full-screen intent.

## 2. Manifest: what the module declares, what the app must declare

Module manifest `node_modules/expo-notifications/android/src/main/AndroidManifest.xml`:

- `:2  <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />`
- `:3  <uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>`
- `:14-28` receiver `.service.NotificationsService`, `android:exported="false"`, intent-filter
  `expo.modules.notifications.NOTIFICATION_EVENT` + `BOOT_COMPLETED` + `REBOOT` + `QUICKBOOT_POWERON`
  + `com.htc.intent.action.QUICKBOOT_POWERON` + `MY_PACKAGE_REPLACED`.
- **No** `SCHEDULE_EXACT_ALARM`, **no** `USE_EXACT_ALARM`, **no** `USE_FULL_SCREEN_INTENT`.

App side — `android/app/src/main/AndroidManifest.xml:2-7` declares INTERNET, POST_NOTIFICATIONS,
READ/WRITE_EXTERNAL_STORAGE (≤32), SYSTEM_ALERT_WINDOW, VIBRATE; `app.json:19-22` mirrors
`["POST_NOTIFICATIONS","VIBRATE"]`. Neither `SCHEDULE_EXACT_ALARM` nor `USE_FULL_SCREEN_INTENT` is declared
anywhere. `android/app/build.gradle` has no permission/plugin block of its own (`:159-186` is dependencies).

What the app must declare (Android docs, fetched 2026-10-17, pages "Last updated 2026-10-16 UTC"):

- **Android 12+ (`SCHEDULE_EXACT_ALARM`)**: "If your app targets Android 12 or higher, you must obtain the
  'Alarms & reminders' special app access. To do so, declare the `SCHEDULE_EXACT_ALARM` permission in your
  app's manifest file"; check with `canScheduleExactAlarms()`; the user-facing page is reached with
  `ACTION_REQUEST_SCHEDULE_EXACT_ALARM`; "The `SCHEDULE_EXACT_ALARM` permission is not pre-granted to fresh
  installs of apps targeting Android 13 (API level 33) and higher."
  (https://developer.android.com/develop/background-work/services/alarms/schedule)
- **Android 14+ (`USE_FULL_SCREEN_INTENT`)**: "For apps targeting Android 14 (API level 34) or higher, apps
  that are allowed to use this permission are limited to those that provide calling and alarms only. The
  Google Play Store revokes default `USE_FULL_SCREEN_INTENT` permissions for any apps that don't fit this
  profile. … You can use the new API `NotificationManager.canUseFullScreenIntent` to check if your app has
  the permission; if not, your app can use the new intent `ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT`."
  (https://developer.android.com/about/versions/14/behavior-changes-14 §"Secure full-screen Intent notifications")
- **Fallback is the system's**: "If your notification includes a full-screen intent to display an activity
  when the device is locked, the system UI displays a heads-up notification instead while the user actively
  uses the device." (https://developer.android.com/develop/ui/views/notifications/time-sensitive)
- **Boot re-arm is per-app work** (the module already does it, §1): a receiver for `ACTION_BOOT_COMPLETED`
  plus `RECEIVE_BOOT_COMPLETED`, because "all alarms are canceled when a device shuts down".

## 3. Is there a maintained library that covers the gaps on new-arch + SDK 57?

Checked from the registry and the upstream repos on 2026-10-17 (commands: `npm view …`, GitHub commits API):

| Candidate | Last release (registry) | Last upstream commit | Verdict |
|---|---|---|---|
| `@notifee/react-native` | `9.1.8`, published **2024-12-20** | **2026-04-07**, message: *"Update README with maintenance notice and migration advice"* | **Not a candidate** — upstream put itself in maintenance/EOL mode; nothing for RN 0.86 / SDK 57 / new arch. |
| `expo-alarm` | `0.2.2`, published 2025-07-03 | 2025-07-03 (`chore: bump version…`), single maintainer | **Not a candidate** — it only fires Android `AlarmClock` *intents* (`ACTION_SET_ALARM`, `ACTION_DISMISS_ALARM`, …), i.e. it opens the system Clock app; it is not a notification scheduler and carries no full-screen intent. |
| `react-native-alarm-notification` | `1.8.0`, published 2022-06-26 | — | Dead. |

So: **no maintained library**, and a dependency would need a `DECISIONS.md` question with the default
implemented in-tree anyway (house rule + brief §D0.3).

**Autolinking claim verified** (brief §D0.4 asked first): `expo-modules-autolinking` resolves a local module
directory by default — `node_modules/expo-modules-autolinking/build/commands/autolinkingOptions.js:169-172`:

```js
nativeModulesDir: options.nativeModulesDir
    ? (resolvePathMaybe(options.nativeModulesDir, appRoot) ?? null)
    : (resolvePathMaybe('./modules', appRoot) ?? null),
```

and `build/autolinking/findModules.js:41-43` prepends it: `searchPaths = autolinkingOptions.nativeModulesDir ?
[autolinkingOptions.nativeModulesDir, ...autolinkingOptions.searchPaths] : …`. So a local `modules/<name>/`
is picked up at Gradle time, provided the package has a `package.json` and an `expo-module.config.json`
(`findModules.js` only accepts a resolution whose `discoverExpoModuleConfigAsync` succeeds). The repo has no
`modules/` directory today.

## 4. Why STOP: the two honest mechanisms, and their real cost

The brief gates on this sentence: *"If the honest verdict is that one of the three needs a native module too
large for one slice, stop and report — do not silently downgrade."* Full-screen is that one.

**Mechanism A — the brief's sanctioned local module + config plugin (§D0.4).** Built around
`AlarmManager.setAlarmClock` *and* a full-screen intent, i.e. it must schedule the alarm, receive it, build
the notification (title/body/channel/action buttons), set the full-screen intent, and survive boot — its own
queue, its own cancel/diff, its own response plumbing to reach `dispatchOpened`. That is a second scheduler +
presenter beside the one that already works. It also **contradicts the brief's own deliverables 1 and 3**,
which state that expo-notifications' exact alarm stays and that its `BOOT_COMPLETED` receiver must be *proven
and left alone*. Cost: new `modules/` package (Kotlin module + `expo-module.config.json` + config plugin +
JS facade), a rewritten `services/notifications.ts` seam, a queue-migration story, and a `DECISIONS.md`
entry — and none of it can be built or run on this machine (no `ANDROID_HOME`, no `~/Android/Sdk`, no
`sdkmanager`, no `android/local.properties`; `java` is 27 with no SDK). **Too large for one slice.**

**Mechanism B — a small in-app hook into the library's own presentation path.** Strictly smaller, and it is
worth writing down because it is the shape a re-scope would take. Everything needed is `open`/public in the
installed source:

- `…service/delegates/ExpoPresentationDelegate.kt:31` `open class ExpoPresentationDelegate`, `:159`
  `protected open suspend fun createNotification(notification, behavior): android.app.Notification`;
  `:94` `override fun presentNotification(…)` (open — it overrides an interface member).
  `android.app.Notification.fullScreenIntent` is a plain public field, so a subclass that overrides
  `createNotification` (or reimplements `presentNotification`, ~15 lines) can set it per notification.
- `…service/NotificationsService.kt:615-616` `protected open fun getPresentationDelegate(context)`; the class
  is `open` (`:30`). The receiver component is the library's own class name, so using a subclass means
  removing/replacing that merged receiver entry in `android/app/src/main/AndroidManifest.xml`
  (`tools:node="remove"` + our receiver with the same intent-filter) — surgery on the component that today
  delivers *every* reminder, boot re-arm and action button.
- The tap target that keeps "the existing `dispatchOpened` path, unchanged" is
  `…service/delegates/ExpoHandlingDelegate.kt:62` `fun createPendingIntentForOpeningApp(context, broadcastIntent)`
  (companion, public) — the trampoline that turns a tap into a real notification response.

That is ~40-60 lines of Kotlin plus a manifest receiver swap — *smaller than A*, but it is **not** the
sanctioned path, it modifies the shared delivery path, and it still needs native for the permission reads
below. It is not a builder's call to improvise either shape inside a slice: the brief names the module, and
the house rules say a brief/code conflict gets reported, not improvised.

**The second native item nobody can route around.** Both new permission states have **no JS path** in the
installed deps:

- the module's Android permission module returns only `importance` + `interruptionFilter` in its `android`
  bundle (`…permissions/NotificationPermissionsModule.kt:55-70`), and `NotificationPermissionsStatus.android`
  is typed as `{ importance, interruptionFilter? }`;
- `AlarmManager.canScheduleExactAlarms()` and `NotificationManager.canUseFullScreenIntent()` are not exposed
  by expo-notifications (v57.0.21) or by anything else in `package.json`.

So deliverable 1's honest window copy and deliverable 4's third permission state both need a native read
back into JS — i.e. a (small) module even if full-screen were deferred. That is the decisive part of the
"too large for one slice" call: the slice would have to introduce the `modules/` infrastructure *anyway*, on
top of the presentation hook.

## 5. Deliverable map if the orchestrator re-scopes

| # | Deliverable | Reachable without native? |
|---|---|---|
| 1 | exact timing + honest inexact-window copy | behaviour exists (does not depend on us); **the honesty needs the `canScheduleExactAlarms()` read** |
| 2 | full-screen ringing | **no** — blocked (see §4) |
| 3 | boot re-arm | yes — already implemented by the module (prove in-source; device check is the only gap) |
| 4 | 3 permission flows | POST_NOTIFICATIONS yes; **`SCHEDULE_EXACT_ALARM` state and `USE_FULL_SCREEN_INTENT` state need native reads** (the *links* alone are plain `Linking.openSettings`/`ACTION_…` intents) |
| 5 | D4 lock-screen text toggle | **yes** — `setNotificationChannelAsync` + `getNotificationChannelAsync` are both in the vendor package (`build/getNotificationChannelAsync.android.*`); the seam `src/services/notifApi.ts` would need the getter re-exported |
| 6 | dev-build banner | yes |
| 7 | h12 into reminder bodies | yes |
| 8 | nothing else moves | n/a |

Suggested split (for the orchestrator's `DECISIONS.md` entry): **W5a** = 3, 5, 6, 7, 8 + the manifest
declarations (`SCHEDULE_EXACT_ALARM`, `USE_FULL_SCREEN_INTENT`, mirrored in `app.json`) + the honesty strings
whose state is knowable without native (POST_NOTIFICATIONS, the two "open this settings page" buttons, the
"we cannot read it" state); **W5b** = the `modules/` local module carrying (i) the two permission reads and
(ii) the full-screen presentation hook (Mechanism B shape, wrapped as the module the brief names).

## UNVERIFIED (everything native; nothing below was executed here)

- The merged manifest of a real build (no `ANDROID_HOME`, no `~/Android/Sdk`, no `sdkmanager`, no
  `android/local.properties`; nothing under `android/app/build`). The library's `BOOT_COMPLETED` receiver and
  the `.service.NotificationsService` class-name expansion in the merged manifest are reasoned from the AAR
  manifest + standard AGP merge — **UNVERIFIED-ON-DEVICE**.
- That `canScheduleExactAlarms()` is false on Jossy's phone and that the inexact branch is what actually runs
  — **UNVERIFIED-ON-DEVICE**.
- Any full-screen presentation, the `USE_FULL_SCREEN_INTENT` grant and the heads-up fallback —
  **UNVERIFIED-ON-DEVICE** (and unreachable until a native change lands).
- Doze/screen-off delivery at the planned minute — **UNVERIFIED-ON-DEVICE**.
- No web/DOM evidence exists for any of the above: the web build has no notification module at all.
