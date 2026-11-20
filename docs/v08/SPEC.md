# Margin v0.8: the overhaul spec (4 phases)

_Written 2026-11-19 after a week of daily use of v0.7.2 and a test session on both devices (Galaxy A51 over USB,
Android 13, Margin 0.7.2 / versionCode 8, Obsidian 1.15.1; desktop Obsidian with margin-bridge 0.7.2 and
`bone-syncd` from vault-sync `0b50dc9`). Every finding below was seen on the devices or in the logs that day;
none is a guess unless it says so._

Owner's asks, in his order: (1) loading screen and theme switching, one UI with themes as skins, Daylight rebuilt
to fit; (2) slow to register state on reopen, clean the code like a senior developer without deleting features;
(3) Obsidian sync overhaul, robust on LAN, hotspot and no internet; (4) widget smaller, card-like, themed;
(5) Add sheet cut down to Task / Class / Mark / Notice / Subject, kinds become tags, a Subjects page, Note becomes
Notice; (6) check the alarm can always be stopped; (7) Settings as a full page; (8) the Obsidian section with real
progress, stage text and failures, all of Settings redesigned per theme; (9) task integration with Obsidian by tag
(default `#school`, more tags allowed), status changes in real time.

Phases run in order: **1 Sync** (it is damaging notes today) → **2 Foundation** (speed, clean code, one UI with
skins) → **3 Product** (Add, tags, Subjects, Notices, Obsidian task integration) → **4 Surfaces** (full-page
Settings, Obsidian & Sync page, widget, final device pass). Each phase ends with a device test by the owner.

---

## 0. What the test found

### 0.1 Sync (the worst)

| # | Seen | Root cause |
|---|---|---|
| S1 | Conflict callouts inside notes, nested on every reconnect: today's daily note got 3 `merged-with-callout` conflicts in one day; Nov 17 has 11 callouts; a project note has a callout inside a callout, labelled "From phone" for text typed on the desktop. | Two writers on the phone with split bookkeeping. When phone Obsidian is open it writes notes through the vault API; Margin's file table (`sync.db`) never learns the new bases. When Obsidian closes, Margin rescans, sees "changed" files and pushes them with **stale bases**; the hub does a 3-way merge against the wrong base and wraps the difference in a callout. Each reconnect repeats it on top of the last callout. |
| S2 | Margin says `hello … cursor=7618` on every connect (including after a restart) while the hub is at 8693+; the whole backlog replays each time. | The cursor only moves when the in-memory `pendingWant` set is empty (`SyncEngine.advance`); a want that never lands (ignored, failed, relayed to Obsidian) keeps it shut forever. `obsidianGone()` also rewinds the cursor to where phone Obsidian came in. |
| S3 | A desktop edit (seq 8515, a school note) never reached the phone, though the cursor later moved past it. Phone and desktop differed in 24 files during the test. | Changes relayed to phone Obsidian count as landed when Obsidian acks; if Obsidian closes first, nothing re-asks. |
| S4 | Callout merges were written into **plugin code**: bone-chess `main.js`, `build.py`, `src/*.js`, bone-yt, bone-type, margin-bridge, `snippets/bone-base.css` (4–5 times each in the hub log). | The hub's merge picks "text with callout" for any text file, not only notes. Plugin code and CSS must never be merged. |
| S5 | `json3` conflicts on `.margin/margin.json` (written only by Margin), `.margin/obsidian.json` (8×), and device-local plugin state (`bone-home/data.json`, `frec.phone.json`, `margin-bridge/data.json`). | Single-writer and device-local files go through the same multi-writer merge. |
| S6 | margin-bridge runs on **both** Obsidians: phone (default for mobile) and desktop (a `margin-bridge-run` localStorage flag). | Both write `.margin/obsidian.json`, `Margin/Timetable.md`, and add block ids to task lines: two writers per generated file. The desktop copy of `margin.json` was 2 days old; the desktop timetable was stale (missed a cancellation). |
| S7 | Duplicate task in Margin ("Do exerise the rest" twice: one Assignment, one To-do). Bridge state stores tasks with `> > > - [x] …` as their text. | The bridge's identity maps (`seen`/`sent`) live in `margin-bridge/data.json`, which is itself synced and json-merged between devices, so origin flags drift; and the parser accepts task lines inside quotes/callouts. |
| S8 | The hub showed Margin "online" for 4 h 25 min with **zero acks**; hub log has 153 desktop-Obsidian hellos and 147 byes; Margin's own counter said "212 connects · 118 errors" for the day. | No liveness check: no ping/pong deadline on either side, so half-open sockets look alive; reconnects are not single-flight. |
| S9 | Settings → Obsidian said **"No vault yet"** while Android still held the persisted folder grant. After an app restart the sync engine logged "Pick the vault folder". | The vault folder lives in two places (JS `settings.vaultUri` and Kotlin prefs). `startVault()` runs in `App`'s first effect, **before** `boot()` loads settings, and pushes `null` to Kotlin. JS had already lost its copy, so the restart erased the last working one. (Re-picked during the test; sync resumed.) |
| S10 | A new `#school` task added on the desktop was in the phone's `obsidian.json` within 7 s, but Margin did not show it after 5 min in the foreground; it appeared only after leaving and reopening Margin. | Margin reads `obsidian.json` only on app resume or when its own rows change. Nothing tells JS that the file arrived. |
| S11 | A task ticked done in Margin at 09:43 reached the desktop note at 20:28 (11 h), and only because another edit woke the desktop bridge. | The desktop bridge runs on vault `modify` events and window focus. Obsidian emits no events for the `.margin/` dot-folder, so an incoming `margin.json` is never noticed. |
| S12 | Only open tasks with the tag **and** a due date reach Margin; one tag only; Margin's own tasks are written with the subject tag only (`#Database-Systems`), not `#school`. | `collectFile` scope rule and `applyMargin` line format. |
| S13 | Task title in Margin: "Finish all CP exercises, as promised in class 📅 2026-". | The title parser stops at `⏳` / `➕` but leaves a `📅` fragment. |
| S14 | `Margin/Timetable.md` lists a notice as a class: "00:00 Chap 123 4 is unclear". | `timetableNote` renders every event, including untimed notices. |
| S15 | Margin tried the desktop at its LAN and Tailscale addresses; no mDNS lookup though the hub advertises `_bone-sync._tcp`. Hotspot path never exercised. | NSD discovery was never written (STATE.md). |
| S17 | Today's daily note, rebuilt from the hub's 17 stored versions: the desktop wrote it 02:37–09:30 (log + a task). The phone's copy was only the **empty template** (frontmatter, no body), made by phone Obsidian's daily-notes plugin while sync was stalled. Margin pushed that copy at 14:53, 15:42 and 16:03 from the same stale base: the first two added `(deleted)` callouts and blanked `created:`; the third moved the whole desktop body into a callout labelled "From phone". At 16:40 the vault logger, finding no `# Log` outside a callout, started a second Log, so the morning's 8 entries now sit inside the conflict box. | S1/S2, plus: an empty or untouched-template body is treated as "deleted everything", and the same stale put is merged again on every reconnect (not idempotent). Fix in 1.2/1.3, plus two rules: a file **both** sides created is merged as a union (an untouched template loses to real text), and a change that would delete most of a note is never applied automatically. |
| S18 | A task written `- [!]` (important) became `- [ ]` after a round trip through Margin. | `patchLine` writes `[x]` or `[ ]` only; any other status character is lost. Fix in 3.4 (status mapping, untouched characters stay). |
| S16 | Hub keeps stale peers (an old Margin device id, a test phone). Vault health check: remote is HTTPS (token expiry), phone vault still has a `.git` folder. | No peer pruning; leftover setup from GitSync. |

### 0.2 Speed and themes

| # | Seen | Cause |
|---|---|---|
| P1 | Cold start ≈ 2.5 s through **five** looks: white system splash with the M → brown blank → cream lined paper → dark screen with spinner → half-styled Today → Today. | Native splash hides at once; 16 Google fonts load at runtime (`loadAsync`); the theme is unknown until SQLite opens, so the JS `Splash` draws the light default paper, then the dark theme. |
| P2 | Collage → Daylight → Collage: a single **650 ms frame**, 22 % janky frames, 29–110 "high input latency" events; a tap on Collage during the switch was **dropped**. | Daylight swaps whole screens (`TodayV2`, `WeekV2`) and draws an SVG sky behind every page; every component reads the theme from context (128 `useTheme()` calls) and builds inline style objects (622, zero `StyleSheet.create`, 3 `memo`), so a theme change re-renders and re-allocates the entire tree. |
| P3 | Tab arrivals: Week 8 % janky (200 ms worst), To-do 25 % (300 ms), Grades 16 % (600 ms), Stats **46 %** (250 ms). | Same as P2, plus big screens rendered in one pass. |
| P4 | Reopening the app "takes time to register". | On every resume, all at once on the JS thread: `set({ now })` (global re-render), `resync(400)` (rebuilds every reminder and the widget agenda), notification status, an OTA network check (every 5 min), backup check, and a vault read/write over SAF. |
| P5 | Daylight's glass Settings sheet lets the task list show through behind its text. | Glass opacity too low for text; no contrast floor. |

### 0.3 Product and UI

| # | Seen |
|---|---|
| U1 | Settings is a bottom sheet starting at mid-screen; 18 sub-pages in a half-height sheet. |
| U2 | Obsidian page: two "Sync now" buttons (bridge vs desktop), raw error lines, "Your git sync carries the .margin folder" (outdated), no stages, no progress. |
| U3 | Add sheet: Assignment, Exam, Reading, Project, Class, Mark, Note, Subject + Focus. Owner uses Task, Class, Mark, Notice, Subject. |
| U4 | Widget (`BoardWidget`, 4×4): big empty areas, shows 2 of tomorrow's 3 classes and 1 of 5 overdue tasks, fixed brown colours that ignore the app theme. |
| U5 | Today after the last class says "Free day · nothing on · Rest day" above a list of the day's two classes. Daylight's Today says the right thing ("Done for today · 2 classes · all present"). |
| U6 | The + button covers text at the bottom of To-do and Stats ("tigh…", percentages). |
| U7 | Edit-task kind chips overflow the row ("Reading" cut at the edge). |
| U8 | The top-bar face's accessibility label still says "Jot" (the mascot was retired in v0.7). |
| U9 | Open from STATE.md: Save hidden by the keyboard on some forms (#13), onboarding page 5 card under the dots (#14). |

### 0.4 Alarm: it can be stopped

Tested on the locked phone with a real alarm (volume 2/15, restored to 13 after): the full-screen alarm page opened
over the lock screen at 20:17:00; **volume-down stopped the sound and the buzz within a second** (MediaPlayer
stop + release in the log); **Dismiss** ended the service and its notification and closed the page. The
notification carries Silence, Snooze and Dismiss; Back does not dismiss by accident; it gives up after the ring
limit and leaves "Missed alarm". The old "can't stop it" bug is fixed. Two small items go into Phase 4: the alarm
page is not themed, and after Silence the alarm waits for an answer with no time limit.

To check with the owner (not a bug unless he says so): the weekday alarm is set to **21:45**; its label reads like a
morning alarm.

### 0.5 Code health

`tsc` clean; 1,808 of 1,809 tests pass; `store-session.test.ts` "a fresh install runs the tour…" fails only under
the full parallel run (timing flake). `src/` is 19.5k lines without tests, `importPlan.ts` 1,185 lines,
`SyncEngine.kt` 1,008 lines, `Settings.tsx` 528, `Today.tsx` 520.

---

## Phase 1 · Sync you can trust

**Goal:** the phone vault and the desktop vault converge after any sequence of edits, network changes and
restarts, with no text ever written into a note by the sync, and Margin ↔ Obsidian task changes arriving in
seconds. Works on the home Wi-Fi, on the phone's hotspot (with or without mobile data), on a router with no
internet, and over Tailscale as the last resort.

### 1.1 The new shape: one writer per device

```
 desktop                                   phone
 ┌──────────────────────┐   sealed WS    ┌──────────────────────────────────────┐
 │ bone-syncd (hub)      │◄─────────────►│ Margin SyncService (Kotlin)           │
 │  · op log, objects    │  LAN/hotspot/ │  · the ONLY phone-side sync writer    │
 │  · writes the desktop │  Tailscale    │  · sync.db: files, bases, cursor, log │
 │    vault on disk      │               │  · writes the phone vault (SAF)       │
 └─────────▲────────────┘               └───────▲───────────────▲──────────────┘
           │ watches disk                          │ loopback hints │ events
 ┌─────────┴────────────┐               ┌─────────┴─────────┐ ┌───┴──────────────┐
 │ desktop Obsidian      │               │ phone Obsidian     │ │ Margin JS        │
 │ margin-bridge (thin)  │               │ margin-bridge(thin)│ │ task ingest/patch│
 └──────────────────────┘               └───────────────────┘ └──────────────────┘
```

- **Margin's Kotlin engine is the only thing on the phone that reads or writes synced files.** Phone Obsidian no
  longer sends or receives file contents. Its plugin becomes a thin client: it tells Margin "I am editing
  `path`" / "I saved `path`" (hints), and on Margin's "changed `path`" it makes Obsidian re-read that file. This
  removes S1, S2's rewind, S3 and S7 at the root.
- **The desktop is unchanged in shape**: the hub writes the vault on disk and Obsidian sees external changes
  natively. The desktop margin-bridge stops writing bridge files.
- **The file bridge (`obsidian.json` / `margin.json`) is retired as a transport.** Task and timetable changes
  travel as notes (the task lines themselves) through the same file sync, and Margin reacts to changed paths as
  events (see 1.5). `margin.json` stays as a read-only snapshot, written by Margin only.

**Spike first (½ day, phone):** confirm how Obsidian Android picks up a file Margin rewrote through SAF: with no
hint, with `app.vault.adapter` re-read on hint, and while the file is open in the editor with unsaved typing.
Pick the hint mechanism from the measurement. If Obsidian cannot reload an open file safely, Margin defers writes
to a path the plugin reports as "editing" until it reports "saved" (2 s idle), then re-reads and re-applies its
change (task patches are addressed by block id, so they re-apply cleanly).

### 1.2 File classes (one table, shared by hub and phone)

| Class | Matches | Direction | On both changed |
|---|---|---|---|
| Notes | `*.md`, `*.canvas`, `*.base`, `*.excalidraw.md` outside `.obsidian/` | both ways | diff3 line merge against the **true** base; overlapping hunks → desktop text stays, the other side's hunk goes to `Conflicts/YYYY-MM-DD.md` with a link back, one notice on each device. Nothing is ever written into the original note. A merge result is content-addressed, so replaying the same put yields the same file and no new conflict. |
| Plugin code | `.obsidian/plugins/*/{main.js,styles.css,manifest.json}`, `src/**`, `*.py`, `snippets/*.css`, `themes/**` | desktop → phone only | never merged; a plugin lands atomically (all its files, then a reload hint) |
| Shared JSON | per-plugin allow-list of `data.json`, `cache/*.json` that hold real data (chess games, yt history, media library…) | both ways | json3 with the true base |
| Device-local | `workspace*.json`, `*.phone.json` / `*.desktop.json`, plugin `data.json` not on the allow-list, `.obsidian/app.json` UI bits | not synced (or one writer by name: `*.phone.json` only from the phone) | – |
| Single writer | `.margin/margin.json` (Margin), `Margin/Timetable.md`, `Margin/Subjects.md`, `Margin/Notices.md` (Margin) | writer → others | the writer's version wins; never merged |
| Ignored | `.trash/`, `.git/`, `.smart-env/`, caches, `node_modules/` | – | – |

The table lives in vault-sync `core/` with fixtures and is ported once to Kotlin; both run the same fixture set in
CI (Kotlin JVM unit tests in `native.yml`).

### 1.3 Cursor, bases and landing (fixes S2, S3)

- `sync.db` stores, per file: current hash, **base hash and base body** (text files only, compressed), size,
  mtime, last seq. The phone always knows the real common ancestor.
- The cursor moves inside the same SQLite transaction that records a landed change. A change that cannot land
  (ignored, too big, write failed three times) is recorded in a `skipped` table with the reason and shown on the
  sync page; the cursor moves past it. No in-memory gate, no rewind.
- Every incoming change is verified by hash after the write, as now; a failed write retries with backoff and is
  never acked.
- On connect: chunked manifest exchange, then three lists from the bases: changed here only (push), changed there
  only (pull), both (merge on the hub with the base the phone sends; if the hub lacks that base object, the phone
  sends it).
- Hub: prune peers not seen for 30 days; one live session per device id (a new hello replaces the old one).

### 1.4 Connection: find, keep, notice when dead (fixes S8, S15)

- **Discovery order:** last address that worked → mDNS `_bone-sync._tcp` (Android NSD) → hotspot mode (phone is
  the gateway: Margin listens on the AP interface and the desktop dials it, as designed in `SYNC_ANDROID.md`) →
  Tailscale address. The path in use is part of the status ("Home Wi-Fi", "Phone hotspot", "Tailscale").
- **No internet needed:** nothing touches DNS or the internet; tested with the router's WAN unplugged and with the
  hotspot's mobile data off.
- **Liveness:** while a socket is open, ping every 20 s, close if no pong in 10 s; the hub drops a session idle
  for 60 s. Dialling is single-flight with backoff 1-2-4-8-…-60 s plus jitter, reset on a network change. Screen-off
  policy stays as in `SYNC_ANDROID.md` (no heartbeat while the screen is off; catch up on existing wakeups).
- **Hotspot test** is mandatory in this phase, not later.

### 1.5 Margin ↔ vault data, real time (fixes S9–S14)

- **Vault folder:** Kotlin owns it. JS reads it from the native module and never sends `null` at boot; on start
  Kotlin checks `contentResolver.persistedUriPermissions` and adopts a granted vault folder if its own pref is
  missing. Choosing a folder in Settings writes Kotlin only.
- **Events, not polling:** Kotlin emits `onVaultChanged(paths)` to JS whenever a synced `.md` lands or the scanner
  sees a local change. JS parses only those files for task lines (debounced 300 ms) and updates tasks while
  Margin is open. Target: a new `#school` task typed on the desktop shows in Margin's To-do **≤ 5 s** later on
  the same network, without leaving the app.
- **Margin's changes go into the notes directly:** a tick, a new due date or a new task in Margin is written by
  Margin (Kotlin writer, via the JS → native API) as a field-level patch of that task's line in the phone vault,
  addressed by block id; file sync carries it to the desktop. Target: tick in Margin → `[x]` in the desktop note
  **≤ 5 s** on the same network.
- **Identity lives in Margin's database** (task `extId` = block id, `extPath`), not in a synced plugin
  `data.json`. A migration rebuilds it from the current notes and de-duplicates tasks that share a block id
  (fixes the double "Do exerise the rest").
- **Parser rules:** a task line counts only outside quotes, callouts, code blocks, `Conflicts/`, `Templates/` and
  `.trash/`; title stops at the first Tasks-format field (`⏫🔼🔽📅⏳🛫➕✅❌⏰⏱🔁`), all fields parsed, unknown text
  kept verbatim on write-back.
- **Generated notes** (`Margin/Timetable.md`, `Margin/Subjects.md`, `Margin/Notices.md`) are written by Margin
  only; untimed items (notices) never appear as `00:00` classes.

### 1.6 Clean-up of the current mess (one-off, with the owner)

1. Freeze sync, take a copy of both vaults.
2. A script lists every `[!conflict]` callout (desktop and phone) with both versions; the owner picks per note
   (default: keep the text outside the callouts, which is what the desktop has); the script removes the callouts.
3. Make the phone vault equal to the desktop (desktop is the source for everything except files changed only on
   the phone, which are listed for him).
4. Turn off margin-bridge's file bridge on both Obsidians; reset bridge `seen`/`sent` maps (identity moves to
   Margin's database).
5. Vault-sync health: switch the vault remote to SSH; delete the phone vault's leftover `.git` (asks first).

### 1.7 Tests (Phase 1 is done only when all pass)

**Automated (CI + desktop):** file-class fixtures on hub and Kotlin; merge fixtures (non-overlapping → clean,
overlapping → conflict file, replay → no change); cursor fixtures (lost want, skipped file, restart mid-batch,
Obsidian open/close no longer matters); a soak test with a fake phone client doing random edits/renames/deletes
against the hub for 10 000 operations, checking the invariants below after each quiet period.

**On the devices, the chaos matrix:**

| Network | Cases |
|---|---|
| Same Wi-Fi | baseline; desktop asleep then woken; hub restarted mid-transfer |
| Phone hotspot, mobile data on / off | desktop joins the hotspot; switch Wi-Fi → hotspot mid-transfer |
| Router with no internet | everything still syncs |
| Tailscale only | phone on mobile data away from home |
| Interruptions | airplane mode on/off; phone reboot; Margin force-stopped; screen off 1 h (Doze); Battery Saver on |

| Content | Cases |
|---|---|
| Same note both sides offline | different lines → clean merge; same line → desktop wins + `Conflicts/` entry, no callout |
| Daily note made on both | phone Obsidian makes today's note from the template while the desktop already has a full one → the desktop's text wins, nothing is wrapped or deleted; repeat the reconnect 3× → still one clean note |
| Phone Obsidian open on a note the desktop edits | text updates in place; typing on the phone at the same time loses nothing |
| Margin ticks a task while that note is open and being typed in on the phone | no lost characters, tick lands |
| Bulk | rename a folder with 200 notes; delete 100 files (hold question appears); 50 MB video; case-only rename; emoji and Amharic text |
| Plugins | update a bone plugin on the desktop → phone gets it atomically, never sends it back |
| Clock | phone clock 5 min off |

**Invariants (added to `vault-sync/health.sh`):** after 30 s quiet, phone and desktop hash trees match except
device-local classes; no `[!conflict]` anywhere; no block id twice in the vault; the phone's cursor equals the hub
head; no duplicate tasks (by block id) in Margin; hub peers ≤ the real devices.

**Targets:** desktop edit → phone vault ≤ 5 s (screen on, same network); reconnect after a day offline with 300
changed files ≤ 60 s; ≤ 5 mAh/day added (the `SYNC_ANDROID.md` budget).

Ships as a dev APK from `native.yml` (Kotlin changes cannot be tested in Expo Go) plus vault-sync and
margin-bridge updates. **Size: L.**

---

## Phase 2 · Foundation: fast, clean, one UI with skins

**Goal:** the app opens straight into Today with one continuous splash, theme changes are instant, every tap
registers at once, and the code is smaller and easier to change, with no feature removed.

### 2.1 One UI, four skins (Daylight rebuilt to fit)

- **One structure.** Today, Week, To-do, Grades, Stats, Focus, every sheet and Settings have one layout each.
  The style changes only **tokens**: colours, fonts, the background layer, the card material, corner and edge
  treatment, nav bar material, motion accents.
- **Daylight becomes a skin**, not a set of screens: its sky becomes Daylight's background layer, the glass card
  becomes Daylight's card material (opaque enough that text on it holds 4.5:1 against the worst background
  behind it: fixes P5), its nav island becomes the nav material. Things worth keeping from `TodayV2`/`WeekV2`
  move into the shared screens for **every** style: the "Done for today · 2 classes · all present" line instead of
  "Free day" after the last class (U5), Week's hold-and-drag to move a class. Then `TodayV2`, `WeekV2`,
  `kitv2.tsx` and the per-style branches go.
- **Theme engine:** styles are created once per skin and switched natively, without re-rendering the React tree.
  Use `react-native-unistyles` 3 (New Architecture is on: RN 0.88, Reanimated 4.7): themes registered at
  start-up, `UnistylesRuntime.setTheme()` on change. Fallback if it fails the spike: one `StyleSheet` per skin
  precomputed at start, theme context split so only colour-bearing leaves re-render, all list rows memoised.
- **Background layer** is one component per skin (paper grain, dots/ruled, sky gradient) drawn once behind the
  navigator, not per page.
- **Target:** a style switch commits in one frame, no frame over 32 ms during it, no dropped tap (measured with
  `dumpsys gfxinfo` as in the test: today 650 ms worst).

### 2.2 Loading screen

- Keep the native splash up until the first real frame of Today (`expo-splash-screen` `preventAutoHideAsync` →
  `hideAsync` when the Gate is ready). Its background is the **last used skin's** desk colour, read synchronously
  at launch (stored natively on every theme change; MMKV or SharedPreferences through the native module).
- Fonts are embedded at build time (`expo-font` config plugin), not loaded at runtime; only the faces the four skins
  use stay (today 16 load; usage: serif, bold, type, marker, hand, script).
- No JS spinner screen, no `PaperBg` on the splash. One fade from splash to Today.
- **Target:** one look from tap to Today; Today interactive ≤ 1.2 s on the A51 cold (today ≈ 2.5 s), measured by
  screen recording as in the test.

### 2.3 Taps register at once

- On resume, only the clock value updates right away. Reminder planning, the widget agenda and notification status
  run after interactions (`InteractionManager`), debounced to 2 s; the OTA check runs at most once a day and never
  on resume; backup runs when idle. Vault work arrives as native events (Phase 1), never as a SAF read on the JS
  thread.
- Store selectors return only what a component draws; list rows are memoised; To-do and Stats lists virtualise.
  Per-second ticks live only in leaf components (clock hands, countdown text), never in a whole screen.
- **Targets:** every tab arrival 99th-percentile frame ≤ 32 ms (today 200–600 ms; Stats 46 % janky); a checkbox
  tick shows in the next frame; reopening from the background shows current data in ≤ 300 ms.

### 2.4 Clean code, nothing lost

- Delete dead or duplicate paths after their features move: `TodayV2`/`WeekV2`/`kitv2`, the "Classic" peeks,
  the v0.6 file-bridge code once Phase 1's events replace it, unused fonts, stale copy ("git sync carries the
  `.margin` folder", "Jot").
- Split files over 400 lines by responsibility (`importPlan.ts`, `SyncEngine.kt`, `Settings.tsx`, `Today.tsx`,
  `Onboarding.tsx`, `kit.tsx`); comments shortened to the *why*.
- Styles move into skin-aware style sheets (no inline style objects in render paths).
- **No feature is removed:** before deleting a path, a test proves its behaviour still exists in the shared code,
  or the removal is listed in this file with the reason.
- Fix the `store-session` flake (await the boot under load, no wall-clock race).
- **Target:** `src/` without tests ≤ 15k lines (today 19.5k); no file over 400 lines; `npm run check` green.

Ships as a dev APK (fonts, splash and Unistyles are native). **Size: L.**

---

## Phase 3 · Product: Add, tags, Subjects, Notices, Obsidian tasks

### 3.1 Add sheet

Five entries, in this order: **Task · Class · Mark · Notice · Subject**, plus Start focus. Assignment, Reading,
Project, Lab and Deadline become **tags on a task**; Exam becomes a **Notice with a date** (owner: "exam can
technically be substituted with notes").

- **Task form:** title, subject (chips), due (date and time, optional), tag chips (`assignment`, `reading`,
  `project`, `lab`, `deadline`, plus any tag he types), effort, remind me. `#school` is on by default and shown as
  a chip he can switch off.
- **Data:** migration 8 adds `tags: string[]` to tasks, fills it from `kind`, keeps `kind` derived for export and
  older imports; `exam` tasks become notices with their date and a reminder; nothing is dropped.

### 3.2 Notice board (was Note)

- A notice is a pinned reminder for future self: text, optional subject, optional date (countdown and an optional
  reminder), importance.
- Today's "Notes" strip becomes "Notice board" (pinned first, dated ones by date); tapping its title opens the
  full Notice board page. Swipe to unpin/archive, with Undo.
- Synced to Obsidian as the generated note `Margin/Notices.md` (single writer: Margin).

### 3.3 Subjects page

- A full page, opened from Grades' header, from Settings, and from any subject name in the app.
- **List:** one card per subject (colour, name, average vs goal, attendance vs goal, next class).
- **Subject page:** name, colour, Obsidian tag (e.g. `#Database-Systems`, editable, unique), teacher, rooms,
  parts (lab/tutorial with share and attendance goal, today's subject-sheet editor moves here), grade goal,
  weekly slots (editable), marks, tasks and notices for the subject, archive and delete (with the existing
  safety: delete asks twice and says what goes with it).
- Synced to Obsidian as `Margin/Subjects.md` (single writer).

### 3.4 Obsidian task integration (on Phase 1's transport)

- **Scope:** every task line in the vault that carries **any tracked tag**: open or done, with or without a due
  date. Tracked tags are a list in Settings → Obsidian, default `#school`, more can be added (e.g. `#lab`,
  `#exam-prep`); a subject's own tag also counts.
- **Mapping:** subject tag ↔ subject; kind tags ↔ task tags; `- [ ]`/`- [x]`/`- [-]` ↔ open/done/cancelled;
  `- [!]` ↔ important; `⏫🔼🔽` priority; `📅` due; `⏰` time (Bone Tasks); `⏳` scheduled; `🛫` start; `➕` created;
  `✅` done date; `❌` cancelled date; `⏱` estimate (Bone Tasks); `🔁` kept untouched (read-only in Margin).
- **Margin-made tasks** are written to `Margin/Tasks.md` as Tasks-format lines with `#school`, the subject tag and
  their kind tags, plus a block id. Margin only ever patches the fields it owns; everything else on the line stays.
- **Real time:** both directions ≤ 5 s on the same network (1.5); offline changes on both sides merge on reconnect
  field by field (status from the later change; text edits from the note).
- **Bone Tasks (Obsidian):** its quick-add gets a School switch (adds `#school` and a subject picker fed by
  `margin.json`), and its task list shows Margin's subject name and the "now" class from `margin.json`. Code in
  the vault plugin repo (`.obsidian/plugins/bone-tasks/src`).
- **Classes in Obsidian:** the active class and the next one are in `margin.json` and in the live status, so
  Bone Home and the status bar can show "Now: Database Systems · LR601 · 23 min left".

### 3.5 To-do fixes

Title parser (S13), duplicate merge (S7), the + button never covers content (bottom inset on every list, U6),
the edit-task chip row wraps (U7), face label (U8), Save above the keyboard on every form (U9 #13), onboarding
page 5 (U9 #14).

Ships as JS (OTA-able) except where Phase 1 native APIs are needed (already in the Phase 1 APK). **Size: M.**

---

## Phase 4 · Surfaces: Settings page, Obsidian & Sync page, widget, final pass

Design work in this phase goes through the impeccable skill (shape → build → critique → polish) on each surface,
inside the skins of Phase 2; every surface is checked in all four skins, light and dark.

### 4.1 Settings becomes a full page

- A route with its own header, the search field at the top (the R8 index stays), grouped sections (You · Look &
  feel · Classes & semester · Reminders & alarms · Widgets · Obsidian & sync · Your data · About), each sub-page
  pushed as a full page with system Back.
- Each skin restyles it fully (paper cut in Collage, plain stock in Plain, ruled in Notebook, sky and glass in
  Daylight) with the same structure.

### 4.2 Obsidian & Sync page

One place that answers "is it working, and if not, why":

- **Devices row:** Margin (this phone) · Obsidian on the phone · the desktop hub · Obsidian on the desktop, each
  with a state dot and last-seen time.
- **Connection line:** path in use ("Home Wi-Fi · desktop at 192.168.1.11", "Phone hotspot", "Tailscale",
  "Offline: desktop not found on this network").
- **Stage text + progress:** what is happening now, in words, with a bar when it has a size: "Comparing
  files 1,204 / 2,850", "Receiving 3 changes · 1.2 MB", "Sending 1 change", "Up to date · 20:31".
- **Problems** as cards: plain cause, what it affects, one action button (Choose the folder again, Try again, Show
  how to start the desktop hub, Pair again). Skipped files listed with reasons. Conflicts listed with
  "Open" and "Keep desktop / Keep phone". Big-delete holds with the question.
- **Event log:** the last 200 sync events with time, copyable for a bug report.
- **Setup:** vault folder, pairing by **QR code** shown by the desktop (no text to paste, no 6-digit code to type in
  phone Obsidian: Margin pairs phone Obsidian itself over loopback the first time both are open), tracked tags
  editor, "Run the Obsidian bridge here" removed (Margin is the only bridge).
- One "Sync now" button.

### 4.3 Widget: one card

- Replaces the 4×4 board. Default **4×2**, resizable 4×1 to 4×3, and it looks like Today's Now card in the current
  skin (colours, fonts and corner pushed from JS to Kotlin on every theme change, light/dark too).
- **4×2 content:** now/next class with the instrument bar and minutes left, room; the next two due tasks with
  tap-to-tick (Android 12+ checkbox RemoteViews), "+N more" count. 4×1: class line only. 4×3: up to five tasks and
  tomorrow's first class.
- Every list shows what fits and says how many it left out (fixes "2 of 3 classes", "1 of 5 tasks").
- Updates on class boundaries, task changes and theme changes; no polling.

### 4.4 Small items

Alarm page uses the current skin; after Silence the alarm gives up at the normal ring limit and leaves "Missed
alarm" if unanswered. PRODUCT.md updated (sync exists now; "local-only" becomes "no cloud").

### 4.5 Final device pass

The owner's checklist (`docs/DEVICE_CHECKLIST.md` §V08, written in this phase), the Phase 1 chaos matrix again,
two days of battery readings, then the release question. Per the standing rule, nothing is tagged or published
until he says so.

Ships as a dev APK, then the release APK when he says. **Size: M.**

---

## Decisions taken in this spec (change any of them before Phase 1 starts)

| # | Decision | Why |
|---|---|---|
| D1 | Margin's Kotlin engine is the only phone-side sync writer; phone Obsidian sends hints, not files | the two-writer design is the root of S1–S3, S7 |
| D2 | Conflicts go to `Conflicts/YYYY-MM-DD.md`, never inline callouts; desktop text stays in place | inline callouts nested and leaked into code |
| D3 | Plugin code syncs desktop → phone only | phone never edits plugin code; merges corrupted it |
| D4 | The file bridge (`obsidian.json`) is retired; task lines in notes are the transport | removes two writers and the dot-folder event gap |
| D5 | Today/Week layout = the one Collage/Plain/Notebook use today; Daylight's good parts fold into it | owner: themes are skins over one UI |
| D6 | Exam → dated Notice; Assignment/Reading/Project/Lab/Deadline → task tags | owner's Add sheet ask |
| D7 | Unistyles 3 for the theme engine (fallback: precomputed sheets + split context) | instant theme switch without re-rendering |
| D8 | Widget default 4×2, resizable | owner: "significantly reduce it", card-like |

## Not in this spec

iPhone; a desktop Margin UI; cloud sync; Play Store. The vault's other plugins only change where named
(margin-bridge, bone-tasks, the vault-sync hub).
