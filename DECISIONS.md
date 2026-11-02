# DECISIONS — numbered questions for Jossy

Answer with numbers only (e.g. "D1: a, D2: a"). Each has a recommended default that is **already in
effect** unless you pick another option; switching is cheap.

---

## D1 — Reference screenshots are missing

`docs/reference/` does not exist in the repo (no git history, nothing on disk). The brief said
timer-clock-overlap.png, timer-screen.png and onboarding-1..5.png live there.

- **a (default, in effect):** I capture baselines myself from Expo web (`.shots/baseline/`) and the
  vision-critic judges against those plus your written observations.
- **b:** You drop the five/seven reference files into `docs/reference/` and I re-run the baseline review
  against them.
- **c:** Both — proceed on (a) and re-check against (b) when the files appear.

**Recommendation: (a) now, (c) if convenient.** Web baselines cannot show the native-only grain/status-bar
problems, so W2 still relies on your Expo Go observations — but they pin layout, overlap and hierarchy.

**Resolved 2026-10-16 (owner): (a)** — self-captured baselines stand; image judgement runs through
MiMo V2.6 Flash (`vision-critic`, `user-tester`) since the orchestrator text models do not read images.
Done: `docs/archive/reports/vision-baseline.md`.

## D2 — "study_sessions" vs the existing focus_session table

The brief asks migration 2 to add `study_sessions(subject, optional_task, start, end, planned_min,
actual_min, mode, completed)`. The DB **already has** `focus_session` (id, task_id, course_id,
started_at, ended_at, focus_sec, break_sec, over_sec, rounds, plan_min, demo) written when a timer round
finishes, and Stats already reads it. Adding a second session table would fork the data path.

- **a (default, in effect):** extend `focus_session` with `mode` and `completed` (+ any missing
  columns), treat it as the study-sessions table in docs/UI. Existing rows survive untouched; one
  writer, one reader.
- **b:** new `study_session` table exactly as named; backfill old rows from `focus_session` once; timer
  writes the new table; Stats reads it.
- **c:** keep `focus_session` but expose a SQL `study_session` **view** projecting the brief's names.

**Recommendation: (a)** — smallest honest change, zero data fork, and the UI can still say "study session".

**Resolved 2026-10-16 (owner): (a)** — extend `focus_session` with `mode` + `completed`. In W1's migration 2.

## D3 — Where `stats_config` lives

The brief's migration list names a `stats_config` table. The app already persists every setting —
including the whole `NotifSettings` object — as rows in the `setting` KV table (`Settings` type,
`putSettings`). A one-row config table would be the only settings-like object with its own schema.

- **a (default, in effect):** stats config (tracked metrics, weekly goals per subject, week start day,
  default range) is one typed `stats` key in the existing `setting` table, like `notif`.
- **b:** create the `stats_config` table as named; one row per key.
- **c:** per-subject study goals go on the `course` table as a column; the rest in `setting`.

**Recommendation: (a)** — one persistence pattern, no orphan schema, export/import keeps working for free.

**Resolved 2026-10-16 (owner): the recommended one — (a)**, a typed `stats` key in the `setting` table.

## D4 — Lock-screen notification visibility

The code audit (H4) found reminder titles and bodies — course and task names — go to the lock screen
with the platform default visibility. Android offers per-channel `lockscreenVisibility`.

- **a:** classes and tasks channels set `AndroidNotificationVisibility.SECRET`: the notification still
  buzzes and can be opened, its text is hidden until unlock.
- **b:** leave the platform default; the user's system setting decides.
- **c:** a Settings toggle ("Show reminder text on the lock screen"), default off.

**Resolved 2026-10-16 (owner): b + c, on by default, asked during onboarding.** So: a real Settings
toggle **"Show reminder text on the lock screen", default ON** (text visible = platform default); the
onboarding flow asks it (W8), Settings holds it, and W5 wires the channels: OFF → `SECRET`.
The onboarding ask must be honest about what "off" does (reminder still rings, text hidden until unlock).

## D5 — What happens when a write fails or stored data is corrupt

The code audit (H1–H3) found three silent-loss shapes: a failed write left the optimistic UI in place
with only a 2.6 s toast; an unparseable JSON column loaded as `[]` and the next save committed that
loss; an unparseable setting key silently fell back to its default.

- **a (default, in effect in W1):** failed writes are recorded in the Problems log (Diagnostics) next
  to the toast; corrupt row-level values are skipped **from the UI** at load (never written back), the
  raw bytes stay untouched in the database, and each occurrence is listed in Diagnostics. The UI does
  not roll back optimistic state on its own.
- **b:** additionally revert the optimistic write by re-reading the affected row (audit H1's stronger
  option) — the visible state snaps back to what is actually on disk.
- **c:** refuse to boot when any row fails to parse (loudest, but one bad byte hides the whole app).

**Recommendation: (a)** — C1 (serialised writes) removes the failure that was reachable from normal
use; (b) can follow once a real write failure has been observed in the field. (c) trades one corrupt
row for a bricked app, which C2's fix exists precisely to avoid.

**Resolved 2026-10-16 (owner): (a)** — as being implemented in W1.

**Superseded in v0.5 (F5, per the approved v0.5 plan): (b).** A refused write now reverts the row it moved
(`store/persist.ts → optimistic`), compound writes are one transaction (`removeMany`, the tour hand-over via
`importSnapshot`), and damaged rows are reported once per table per load instead of once per row.

## D6 — Focus dial: the taped slip below the dial vs the translucent in-face readout

W3 shipped the default you locked and captured the alternative from the same build. Screenshots (light
theme, 412×915; `.shots/` is gitignored — open the files on disk): default = `.shots/w3/w3-default-set.png`
+ `w3-default-running.png`; alternative = `.shots/w3/w3-alt-set.png` + `w3-alt-running.png`.

- **a (default, in effect):** see-through face (0.86) + the time on a hand-cut taped paper slip below the
  dial. The rosette reads as a complete medallion; the countdown sits on clean cream. Costs: eye travel
  dial → slip; the status line under the slip is the screen's tightest gap (6 canvas units — reviewed as
  acceptable); the tape corner clears the feathered rim by 12.3 canvas units (measured in the browser).
- **b:** same see-through face, time stays in the face's centre on a translucent readout. Keeps time +
  progress one instrument, needs no extra element — but the readout covers exactly the artwork the
  redesign exists to reveal, its digits cross the drawing's busiest lines, and it leaves a dead band
  under the dial.

**Recommendation: (a).** The vision review agrees: (a) is the only one where the rosette reads as a
complete medallion, and "if glanceability is the worry, fix it inside (a), not by swapping designs."

**Answer:** _(awaiting Jossy — "D6: a" keeps what is shipped; "D6: b" is a small swap)_

**Note 2026-11-01 (v0.5): moot once the Focus screen is rebuilt.** The v0.5 spec (section H) redesigns
the Focus screen from scratch around large typewriter digits, keeping only the timer engine. Neither the
taped slip nor the in-face readout survives that redesign, so this question no longer needs an answer.
Option (a) stays in effect until the rebuild lands. Kept as history.

## D7 — The tour teaches an attendance gesture that only works on one screen

The audit (UX-3) walked the tutorial's "attendance is one tap and then a hold": it holds on the By-subject
(Grades) grid — tap cycles the mark, hold opens the chooser — but not on Today, where a tap opens the
chooser and a long-press opens **Edit class**. A student repeating the taught gesture on Today lands on
the edit screen instead of a mark.

- **a (the fix W8 will make):** the tour states the screen it means ("on the By-subject screen"), so the
  copy is true; Today's gestures stay as they are (its rows are a different job).
- **b:** (a) + an "Edit class" row inside Today's status chooser, so editing stops hiding behind a
  long-press nobody is taught.
- **c:** unify the gestures: Today's long-press opens the status chooser like Grades, and editing moves
  into the chooser.

**Recommendation: (a) + (b).** (c) is the tidiest gesture story but it deletes Today's one-tap path to
editing, which the flows have used since v1 — not a change to make inside a polish pass.

**Answer:** _(awaiting Jossy — "D7: a" / "D7: b" / "D7: c")_

**Note 2026-11-01 (v0.5): moot once onboarding is rebuilt.** The v0.5 spec (section C) deletes the
coach-mark tour and replaces it with a five-page introduction that does not teach this gesture, so the
copy this question was about goes away. Whether Today and By-subject should share one attendance gesture
is a Today design question for v0.5 (spec section G), not this entry. Kept as history.

## D8 — 12/24h times: an in-app toggle vs following the device's own preference

The brief asked for a "12/24h device setting". Two honest readings, and they cannot both be v1:

- **a (default, being implemented in W4):** a Settings toggle — "24-hour clock", **default ON** (exactly
  today's look until changed). Works identically on every phone and is provable in the web build.
- **b:** follow the *device's* 12/24h preference automatically (reads the OS/locale; needs
  `expo-localization` or an `Intl` probe — Hermes' Intl support is version-dependent and cannot be
  verified in this environment, and a wrong answer would silently lie about times).

**Recommendation: (a) now; (b) as a follow-up if you want it** — the toggle is the part that cannot be
wrong; the device probe is the part we can't check from here.

**Answer:** _(awaiting Jossy — "D8: a" keeps what is shipped; "D8: b" switches to follow-device later)_

## D9 — W5's full-screen ringing: which native shape, and what ships first

The W5 mechanism investigation (dossier: `docs/archive/reports/w5-d0-mechanism.md`, verdict in `STATE.md`) found two
of the three mechanisms already inside `expo-notifications@57.0.21` — exact `DATE` triggers
(`setExactAndAllowWhileIdle` when `canScheduleExactAlarms()`, else the honest inexact window) and boot
re-arm (the module's own `BOOT_COMPLETED` receiver → `setupScheduledNotifications`) — but **full-screen
is absent**: zero `fullscreen` citations in the library and its poster never calls
`setFullScreenIntent`. The two phone-side permission states (`canScheduleExactAlarms()`,
`canUseFullScreenIntent()`) also have no JS path (the permission bundle exposes only
`{importance, interruptionFilter}`). So "full-screen, honestly" cannot ship without native work; the fork:

- **a (default, being implemented now — W5a):** the honest JS slice — exact-alarm + full-screen-intent
  declarations in the Android manifest (the latter inert until (b)/(c) code exists), the window /
  "this phone won't tell us" wording, boot left as the library's (proven, not re-added), the D4
  lock-screen text toggle with channel read-back, the dev-build banner, h12 bodies. Full-screen ringing
  is an explicit exclusion and its UI rows do not appear yet. Provable on web + unit tests today.
- **b (W5b):** (a) + a small app-level Kotlin hook (~40–60 lines): subclass
  `ExpoPresentationDelegate` / `NotificationsService` to put `fullScreenIntent` on the existing
  notifications and add the two permission reads. Keeps the library's scheduler and boot receiver;
  touches the component that delivers every reminder, so it needs its own slice + device pass. Not
  buildable in this environment (no Android SDK) — it would land UNVERIFIED-ON-DEVICE.
- **c:** the brief's named path — a full local Expo module with its own `AlarmManager.setAlarmClock`
  stack (own queue, receiver, boot re-arm, presenter). Alarm-clock-grade exactness, but a second
  scheduler that contradicts W5 deliverables 1/3 ("leave the library's scheduler and boot receiver
  alone") — a workstream of its own.

**Recommendation: (a) now; (b) as the follow-up slice.** (a) cannot lie and is provable here; (b) is the
smallest way to make the ringing screen real with its risk contained to presentation; (c) only if you
want `setAlarmClock` semantics as a deliberate project.

**Answer:** _(awaiting Jossy — "D9: a" keeps the honest slice; "D9: b" adds the small native hook;
"D9: c" green-lights the local-module scheduler)_

## D10 — How an update reaches the phone, and what the first one cannot do

The owner's note (Oct 21): "auto-update without reinstalling". `expo-updates` is now installed and
configured — `runtimeVersion` pinned to the app version (`appVersion` policy), the EAS updates URL,
`checkAutomatically: ON_LOAD`, `fallbackToCacheTimeout: 0`, and a channel per build profile
(`preview`, `production`).

The fork that matters is not technical, it is a sequencing fact worth writing down once:

- **An APK built before the updater existed cannot be updated over the air.** There is no updater in
  it. So v0.3.1 *installs* the mechanism and **v0.3.2 proves it**; the first build made from v0.3.1 is
  the oldest build that can ever receive an update.
- `fallbackToCacheTimeout: 0` means launch never waits on the network: the bundled JS runs immediately,
  an update downloads in the background and applies on the next start. The alternative (`3000+`) buys
  "the newest bundle on this launch" for up to three seconds of a student staring at a splash screen —
  wrong trade for a planner opened in a corridor.
- `ON_LOAD` (not `WIFI_ONLY`): an update is a few hundred KB; a student who is only ever on mobile data
  would otherwise never receive one.
- About says where updates are checked instead of offering a button that can only answer
  "unavailable" on web or in a build with updates off.

**The part that would have cost a build.** This project has a committed `android/` folder, so it is not
a CNG project and `npx expo prebuild` never runs: the config plugins that turn `app.json` into native
configuration are inert. The first version of this slice configured `app.json` correctly and left the
native project saying `expo.modules.updates.ENABLED = false`, with no update URL, no runtime version and
no channel — an updater that installs and can never update, while every test passes and About prints the
right version. It also still said `versionName "0.2.0"` / `versionCode 2`, so Android's app info would
have named the wrong build during the very test that has to tell one build from another.

The native files are now the truth: enabled, the project's URL, `@string/expo_runtime_version` = `0.3.1`,
and `expo-channel-name: preview` as a request header (`expo-updates` resolves the channel from that
header — an APK without it is answered with no update at all, silently). `versionCode` is 3.

`src/test/native-config.test.ts` (in `npm run check`) holds each of those to its `app.json` / `eas.json`
counterpart and fails if any drifts. It was verified by reintroducing the original bug: two assertions
went red, then green again.

**Answer:** as built — v0.3.1 installs, v0.3.2 proves; the proof is `docs/DEVICE_CHECKLIST.md` §V031,
and `docs/BUILD_V031.md` is what to read before making the APK.

## D11 — Import merges; it never deletes

A pasted file can be wrong in ways the app cannot see: a stale export, an AI that invented a subject, a
half-copied JSON. The import therefore:

- **upserts by id and never deletes.** A paste can add a term or correct rows it names; it cannot wipe
  the timetable. There is no "replace everything" mode — that is what the erase button and a fresh
  export are for.
- **is idempotent.** An explicit `id` wins; otherwise the id is derived from the row's natural key, so
  importing the same file twice produces the same rows rather than duplicates. The sheet says the row
  count before writing and the toast repeats it after.
- **blocks on problems, not on warnings.** An unresolvable course name, a bad weekday, an impossible
  time: the import button stays disabled and the sheet prints the row and the field. Unknown keys are a
  warning and are ignored, because an AI will always add one.
- **is paste-only.** No file picker, no new dependency: the source is a language model's answer, which
  is text on a clipboard. _(Superseded 2026-11-01: see the v0.5 note below.)_

**Answer:** as built (v0.3.1-A). If a "replace" mode is ever wanted it must be a separate, explicitly
armed action with its own undo.

**Note 2026-11-01 (v0.5): "paste-only" is superseded.** v0.5 imports through a file picker as well as
paste, for JSON and CSV (spec section B4; the picker landed in the WS1 import commit). The source is no
longer only a language model's answer on a clipboard, but also an export file or a spreadsheet saved as
CSV. The merge rule above (upsert by id, never delete) still stands.

## D12 — The spiral: which way the ink goes

`Ctx.p` is the fraction of the active period **still to run** (`types.ts:41`) — `1` has not started,
`0` is over. The spiral therefore draws one groove and dims the **played** part to half strength,
growing from the **outer** end inwards, the way a record plays. At `p=1` the groove is whole and bright;
at `p=0` all of it is spent; in between the boundary — same stroke, same ink, half the weight — is the
thing the eye finds, which is exactly what the dot used to say and no longer has to.

It replaced a playhead **dot** (owner, Oct 22: "dim instead of a dot rotating"). Two properties are
contracts, not taste, and `bars.test.ts` pins both: no circle at any `p`, and the spent path's opacity
strictly between 0 and 1. A future edit that flips the direction, or reintroduces a marker, is
inverting what the bar says — not restyling it.

The Settings picker draws every instrument at the same demo moment (`DEMO_P = 0.6`). Its **selected**
row used to ignore that moment and use the wall clock, so tapping an instrument showed it in the
"period over" state — for the spiral, a fully faded disc. `DayBar` gained `frozen` for that; `Today`
keeps the 1 Hz tick.

**Answer:** as built (v0.3.1-B), frames in `.shots/v031/spiral-{light,dark}.png`.

## D13 — The collage: a new default look, a paper mascot, and what stayed a cut

**Owner, 2026-11-01:** the v0.5 build "is ass"; asked for a completely redesigned, calmer Focus that rests
like a dimmed home screen and tracks what is studied most; a "+" pop-up that feels like paper; a new theme,
texture, colour and accent; a 2-D mascot in the spirit of a torn-paper collage reference (Snip) instead of
the Rive bear, "very high effort", with uneven torn-paper dividers and a crushed-paper look; an onboarding
that takes its minimalism and background art from two references (Ancient Time, a coffee app), five full
pages that set the term up; and an app that feels more fluid. Keep the old, but a complete upgrade.

**Answered (built):**
- **Palette `collage`** (default; `refined` and `original` kept): off-white recycled paper, bright card,
  charcoal ink, denim accent pen, a denim command deck, and pale subject papers (`TINTS`). A one-time
  `lookV` move puts existing installs on it; a later choice sticks.
- **Texture `crumple`**: crease facets from a triangulated height field (scripts/paper-art/crumple.js),
  not noise. All paper art is rendered offline to WebP by `scripts/paper-art.mjs`; the phone runs no filter.
- **Type per look**: Bricolage Grotesque + DM Mono in the collage; the notebook keeps Caveat/Marker/Special
  Elite. Line boxes are computed from the requested size, so no layout moved.
- **Edges**: big surfaces tear (white core, soft lift), small controls are scissor-cut; sheets, the nav
  (kraft) and onboarding's hero use full-width torn edges as dividers.
- **Mascot: Scrap**, a dog-eared scrap of denim paper, built from generated bitmaps and moved on the UI
  thread. This **supersedes O8 (Teddy, Rive)**: Rive and Nitro are removed; the rule "no hand-authored SVG
  art" is set aside by the owner's own request for a collage mascot, and Scrap is raster paper, not SVG.
- **Onboarding**: five pages replace the coach tour (TOUR_VERSION 2); nothing is written until the end.
- **Focus**: rebuilt on the same engine; ambient rest after 9 s; sessions filed by subject (`focusSummary`).
- **Page switches stay a cut.** A landing animation was tried and reverted: the owner's earlier report that
  pages arrived "sooo long" after a tap is why a page wrapper never animates (perf-placement.test.ts). The
  fluid motion lives inside pages and in the chrome (the nav's sliding scrap) instead.

**Open:** the owner's reference image for the clock faces ("they need a bit more extra") did not arrive;
the faces are unchanged until it does.

---

_More questions will be appended as workstreams surface real forks (each with screenshots where visual)._
