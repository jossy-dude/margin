# Marrow v0.7.7 overhaul — spec

_2026-11-25 · branch `marrow-overhaul` · for Jossy to review before anything is built._
Base: 0.7.6.5 (speed pass 1, class-card widget, GPA, task sheet). Nothing here is built yet.

**How to read this:** each complaint has **Found** (what is wrong today, with evidence), **Plan** (what I'd build),
and **Done when** (how we'll know). Decisions you need to make are marked **D1…D10** and collected at the end.
The build order at the bottom is one small release per item, as usual.

---

## 1. Daylight: a theme should be an overlay, and it isn't

**Found**
- Daylight isn't really a theme. It's the Plain skin plus a `sky` flag, and it reaches into components through
  special cases: `ui/kit.tsx` HandBox has `if (look === 'plain') { if (sky) … }`, `navigation/Book.tsx` has its own
  `sky ? glass island : …` branch, and `ui/PaperBg.tsx` swaps paper for `Sky`. Each new component has to remember
  to add a Daylight branch, and most never did.
- What Daylight still borrows from the paper skins (screenshot `shots/daylight-light-Today.png`):
  - the **paper clock** (cream face, pencil hands) on a glass page
  - the **pen accent** (brown `+` and "Open" chip on a cool blue sky)
  - the paper skins' deck slab in a flat dark grey
  - handwritten labels (Newsreader italic "Good afternoon", "All done for today")
  - dashed tick boxes from the notebook
- Until 0.7.6.3 the sky never showed at all: the navigator painted paper over it. So the Daylight you've been
  judging was grey boxes on grey.
- Colours come from three places: `tokens/theme.ts` (palettes), `tokens/v2.ts` (V2 glass tokens) and inline
  `hexA(...)` calls. There are 622 inline styles (v0.8 PROGRESS).

**Plan: a skin is one object, components only read it**
- One `Skin` per look (Collage, Notebook (refined/original), Plain, Daylight), made once in `tokens/skins.ts`:
  - `ground`: what's behind the pages (paper with ruling and grain / flat / sky by the hour)
  - `surface`: card fill, edge (torn / hand-cut / hairline / lit glass), radius, lift (shadow), highlight
  - `type`: font per role (display, title, body, numerals, hand)
  - `ink`: ink, muted ink, accent, the deck pair, statuses
  - `instruments`: clock face, day-bar style, check-box style, tag style
  - `motion`: page swap and press feedback (Daylight soft, Collage paper-snap)
- Components ask the skin and never test `look ===` or `sky`. HandBox becomes `<Surface>` with one renderer per edge
  type. A cheap test fails on any `look ===` / `sky ?` outside `tokens/skins.ts`.
- Daylight, rebuilt as a real skin:
  - **Ground:** the sky by the hour (6 keyframes per mode, already in `tokens/v2.ts`), with a slow fade.
  - **Surface:** lit glass (0.7.6.3), radius 20, lift only on sheet-sized cards.
  - **Type:** one grotesque for everything (Hanken Grotesk). Digits are tabular. No hand fonts.
  - **Ink:** the accent follows the sky (dawn amber, noon blue, dusk rose, night indigo), checked to 4.5:1 on
    glass. The pen choice applies to paper skins only (D1).
  - **Deck:** a darker glass, tinted from the sky's top colour, with the lit rim.
  - **Instruments:** a new glass clock (thin ring, no paper), and a thin capsule bar with a glowing fill for the class
    progress. Check boxes are rounded squares; tags are tinted capsules.
- The other skins move onto the same object with **no visual change**. A screenshot test of each skin before and
  after (`tools/shot.mjs`) proves it.

**Done when:** each skin is one file; `grep "look ===\|sky ?" src/ui src/screens` finds nothing; Daylight screenshots
of all 6 pages in light and dark at 3 times of day look like one family; the paper skins show no pixel change
beyond 1 % (screenshot diff).

---

## 2. Speed: as close to native as it gets

**Found** (measured in Node with the real shell, `PERF=1 npx jest perf-profile`; 0.7.6 already fixed the worst)

| What you do | JS render now | What still costs |
|---|---|---|
| First visit to a tab | 60–120 ms | the page mounts; every HandBox renders twice (measure, then draw its SVG) |
| Revisit a tab | 5–11 ms JS, plus native relayout | `display:none` throws away the hidden page's layout, so Android rebuilds 300–750 views on every switch (`navigation/Book.tsx`, `Placed`) |
| Change skin | 32–42 ms | the visible page and the sheet re-skin; every inline style object is recreated |
| Tick a task | 11–20 ms | fine |
| Cold start | not measurable off the phone | JS bundle load, opening the DB, first Today render (~1 500 components) |

- **HandBox is the biggest per-card cost:** each card is an `Svg` whose path depends on its size. It renders once to
  measure (`onLayout` → `setSz`), then again to draw. Today has 48 of them, so 96 renders, and the first frame shows
  cards without edges.
- **To-do isn't virtualised.** It's capped at 60 rows, all mounted.
- **Clocks:** Today's 1 Hz card clock re-renders the deck every second while visible. Fine in Node, but it adds up
  on the A51.

**Plan, in order of payoff**
1. **Keep hidden pages laid out.** Move a hidden page off-screen (translate, which `react-native-screens` also does)
   instead of `display:none`, so switching back doesn't rebuild native views. Measure on the phone first; this
   affects memory.
2. **Native edges for non-paper skins.** Plain and Daylight cards become plain `View`s (border, radius, shadow): no
   SVG, no measure pass. Paper skins draw their edge with a native drawable (one Kotlin `HandEdgeView` that draws
   the same wobble path on a Canvas) or cache the SVG path by size and seed, so it only measures once (D2).
3. **FlashList for To-do and the Stats lists:** only what's on screen gets mounted.
4. **Styles out of render:** `StyleSheet.create` per skin, made once (622 inline style objects today).
5. **The deck's 1 Hz clock** only ticks the digits (a Reanimated text or native `Chronometer`-style view), not the
   card.
6. **Cold start:** load Today's data first and the rest after the first frame; Hermes bytecode check; keep the
   bundle lean (lazy-require Stats/Grades/Onboarding).

**Measuring on the phone** (once wireless adb is on):
- `adb logcat -s ReactNativeJS` shows the boot marks (`[margin-boot] js= data= fonts= frame=`).
- `adb shell am start -W` gives the cold-start time.
- Perfetto traces for a tab switch and a skin change.
- Each fix ships with before/after numbers from the A51.

**Done when:** on the A51, a tab switch has no dropped frame (≤16 ms), a skin change finishes in under 150 ms, and
cold start to Today is under 1.2 s (measured before and after; targets adjusted to what the first measurement shows).

---

## 3. Lab classes share one attendance line

**Found**
- The data already knows about parts. `SubjectVariant` has `kind: 'lecture' | 'lab' | 'tutorial' | …`, an
  attendance goal (`attGoal`) and a grade weight, and each `Meeting` points at one part (`variantId`). Stats already
  computes attendance per part (`attendanceByPart`, R5).
- The Grades page ignores parts: `screens/Grades.tsx` draws **one** strip of every class of the subject (lecture
  and lab mixed in time order), **one** percentage, and **one** teacher's count (`settings.teacherAbsent[courseId]`).
  That's the "overlap" you see on Database Systems and Computer Programming.
- "Mark day" (whole-day marks) applies to every class that day, lab or lecture alike. That's correct, but it isn't shown
  per part.

**Plan**
- On Grades, a subject with parts shows **one block per part**: "Lecture" and "Lab", each with its own strip,
  percentage, goal line, and teacher's count. The grade stays one number for the subject, made up of the parts'
  weights (unchanged).
- The cells show the part (a small "L"/"Lab" tag in the long-press title), and Today's class rows say "Lab".
- `teacherAbsent` becomes per part: the key is `courseId` or `courseId~variantId`. Existing values stay on the
  lecture part (migration in settings, no DB change).
- Stats: "By subject" opens into parts (already computed).
- If a subject has no parts, nothing changes.

**Done when:** DB Systems with a Lab part shows two strips, two percentages and two counts; marking a lab cell
never changes the lecture percentage; old teacher counts are still there.

---

## 4. Notebook skins: the teacher's count number runs into the side

**Found** (screenshot `shots/tc-all.png`: Collage, Notebook refined, Notebook original, Plain)
- `NumberField` (`ui/fields.tsx`) right-aligns the number with **no inner right padding** (`textAlign: 'right'`,
  `paddingVertical` only), in a box fixed at `width: 88`.
- In the Notebook skins the numerals use the handwriting font. Its glyphs carry a wide right side-bearing and a slant,
  so the digit sits on, or past, the box's hand-drawn right edge. On the phone (font scale > 1) it crosses the edge.
- The row is a kit `Row`, which wraps by default (`flexWrap: 'wrap'`). With a large font scale the field drops under
  the label instead of staying on the right.

**Plan:** `NumberField` gets 12 dp inner padding each side and centres its value; numerals use the skin's
numeral face (§1, `type.numerals`); the teacher row uses `flexWrap: 'nowrap'` and the label shrinks instead. The
same fix applies everywhere `NumberField` is used (curve, credit hours, sound).

**Done when:** at font scale 1.0 and 1.3, in all skins, the digits sit inside the box with visible margin (screenshot
set).

---

## 5. The widget: deleted and redone properly

**Found**
- Today's widget is RemoteViews XML plus Kotlin (`Surfaces.kt` `Widgets`, `mg_widget_card*.xml`, `mg_row_tick.xml`,
  `Gauge.kt`, `mg_hatch*`, `mg_pill`, `mg_dash`, `Look.kt`'s widget fields). RemoteViews can't do real layout, rounded
  clipping before Android 12, or per-size layouts without hand work. That's why every version looked assembled.
- **Options researched**
  - **`expo-widgets`** (Expo's own): **iOS only** on SDK 57 (its docs list `platforms: ['ios']`). Out.
  - **`react-native-android-widget`**: JSX widgets rendered to RemoteViews by a headless JS task. Every update has
    to start the JS engine (slow, battery), and you're still limited to RemoteViews underneath.
  - **Jetpack Glance** (androidx `glance-appwidget` 1.2.0 stable): Compose-style Kotlin, the current Android way.
    It gives responsive sizes (`SizeMode.Responsive`), real rounded corners, lazy lists, buttons and check boxes
    (`ToggleableStateKey`), Material 3 dynamic colours, and generated previews (`providePreview`, 1.2.0).
- **Recommendation: Glance**, inside the existing Kotlin module. It reads the agenda JSON the app already writes,
  so there's no JS on the update path. It needs the Compose compiler plugin in Gradle, which only runs in CI; the
  first release does just that step and builds an empty widget, to prove the build.

**Plan: three widgets, one design language** (the deck look from §1, in the active skin; Daylight uses the sky
colours; "Match my phone" uses Material You colours as an option, D3)

```
NOW (2×1, the small one)          CLASS (4×2, the main one)                 TASKS (4×2 → 4×4, resizable)
┌───────────────────┐   ┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
│ DB Systems  23:41 │   │ NOW · LR601                    23:41 │  │ To do                      + Add task │
│ ▓▓▓▓▓▓▓░░░░░░░░░ │   │ Database Systems                     │  │ ○ Lab report          today 17:00 ⚠ │
└───────────────────┘   │ ▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░ │  │ ○ Quiz: worksheets     tomorrow     │
                        │ then Economics 10:55 · B-12          │  │ ○ Read ch. 5           Fri          │
                        │ ○ Lab report                 17:00   │  │ ○ …                                  │
                        └──────────────────────────────────────┘  └──────────────────────────────────────┘
```
- **Now:** the class on now (or next) with a live countdown and a bar. Nothing else.
- **Class:** the in-app class card. At 4×1 it's the class only; at 4×2 it adds one line of "then…" and the single
  most urgent task.
- **Tasks:** a scrollable list (most urgent first: late, then due, then priority), tick to finish (works without
  opening the app), "+ Add task" opens the sheet.
- All three update on class boundaries (the existing alarm), on any task change from the app or from Obsidian
  (§9), and on skin change. Countdowns use the system chronometer, so they cost no battery.
- **Removed for good:** all of `mg_widget_card*`, `mg_row_tick`, `Gauge.kt`, `mg_hatch*`, `mg_pill`, `mg_dash`,
  `Widgets` in `Surfaces.kt`, and the widget fonts in `res/font`. The new widgets get new provider names, so the
  old one disappears from the picker (D4: the old provider is kept as a no-op for one release so a placed widget
  says "Replaced — long-press to add the new one" instead of an error).

**Done when:** all three widgets render at every size in the generated preview and on the A51, follow skin and dark
mode, tick a task without opening the app, and the old widget's files are gone from the repo.

---

## 6. "Paper with a dot" at launch

**Found**
- The launch sequence is three layers:
  - Android's system splash (`values-v31/styles.xml`: paper colour + `splashscreen_logo`, the M card in a 288 dp
    canvas masked to a circle)
  - the activity window, painted by `MainActivity.splashLayer()` (paper of the last skin + the same logo)
  - JS: `App.tsx` paints nothing until Today is ready.
- All five density PNGs of the logo are the M card (checked). None is the old Expo grid placeholder any more.
- So the "paper with a dot" isn't in the logo files. The likely sources, which I can't confirm without the phone:
  1. On Android 12+, the system masks `windowSplashScreenAnimatedIcon` to a circle. The M card was sized for the
     192 dp circle, so on One UI's smaller icon size it can shrink to a **tiny centred blob: the "dot"**.
  2. A frame of the **Dots ruling** (`paper: 'dots'`) paper drawn by `PaperBg` before Today's content lands.
- **To confirm:** `adb shell screenrecord` of a cold start, stepped frame by frame.

**Plan:** one look from tap to Today.
- Android 12+ gets a proper splash icon: a vector M at icon size, with no card or paper square inside a circle.
- `MainActivity` keeps the same paper colour with **no** logo, so the system splash fades straight into it.
- JS shows Today's frame in the first commit, and the ruling appears with it, never before.

**Done when:** the frame-by-frame recording shows paper → M → Today, and nothing else.

---

## 7. Other improvements worth doing (ranked)

1. **Error log you can read** (shared with §8): one "What went wrong" page and a `.margin/log.md` in the vault, so
   I can read it too.
2. **Backup before migration**: an automatic copy of the DB before any schema change. There's a weekly backup but no
   pre-migration copy.
3. **Today's "now" card shows the lab part and the room.**
4. **Undo for attendance taps** (already there for tasks).
5. **Search across tasks, notices and subjects** (To-do search only covers tasks).

---

## 8. Sync: robust, readable errors, the special cases

**Found**
- The hub (`vault-sync`, `bone-syncd`) is running: the systemd user service is enabled, up 27 h, with nothing
  logged in the last day.
- **The "From the phone, not applied" boxes:** `Conflicts/2026-11-23.md` holds **Excalidraw drawings**. A
  `*.excalidraw.md` file matches the `note` class (`core/src/classes.js`: "`*.md` … diff3"), so the hub tries a text
  merge on compressed drawing data. Those can never merge cleanly, and that's the box you kept seeing.
- Errors reach you as short sync-page lines. There's no history you or I can read later, and no plain-language fix
  for each.

**Plan: special cases and what happens**

| Case | Today | Plan |
|---|---|---|
| Excalidraw / any `*.excalidraw.md` edited on both sides | text merge → conflict box | class `file`: the newest wins and the other is kept in `.trash/versions/`, with a log line, no conflict box |
| Phone offline for days, then back | full replay; slow, can re-conflict | resume from the cursor; batch by folder; progress shown |
| Same note edited on both | diff3, clash → Conflicts file | unchanged, but the conflict also appears in Marrow's sync page with **Keep phone / Keep desktop / Open** |
| Delete on one side, edit on the other | edit wins? (not tested) | edit wins, delete is logged (never lose writing) |
| Rename / move | seen as delete + new | detected by hash; moves the file, no duplicate |
| Vault folder permission lost (phone) | "Nothing syncs until…" | notification + one-tap re-pick, sync waits |
| Hub down / PC asleep | phone retries silently | sync page says "Desktop not reachable since 14:02", retries with backoff |
| Clocks differ (phone vs PC) | merges by order, not time | unchanged (already order-based), but the skew is shown in diagnostics if it's over 2 min |
| Huge files (> 20 MB) | chunked | skipped by default, listed, opt-in per folder |
| Partial write (app killed mid-write) | margin.json repaired | every phone write goes to a temp file and is then renamed |
| Obsidian open on the phone while syncing | deferred while editing | unchanged |

- **Error handling:** every failure gets a code, a plain sentence, and one action
  (`E-PERM "Marrow lost the vault folder" → Pick folder`). They're kept in a 500-line log, shown on the sync page,
  and mirrored to `.margin/log.md`. Both devices write their own section.

**Done when:** a scripted soak (the hub's `SOAK_OPS`) plus a phone script covering each row above passes, and no
conflict box appears for drawings.

---

## 9. Obsidian notifications on the phone; tasks and events connected properly

**Found**
- **Why Obsidian only notifies the PC:** bone-tasks' reminders run inside desktop Obsidian (`reminderTick` every
  30 s, `main.js:641`). They pop a desktop notification for a task due today at its `⏰` time, plus the digests.
  Nothing tells the phone.
- **Why only some tasks reach Marrow:** Marrow reads a task line only if it carries a tracked tag (`#school` or a
  subject tag, `domain/vaultTasks.ts` `tracked()`). Plain timed tasks in daily notes (e.g.
  `- [ ] Plan and execute … 📅 2026-11-25 ⏰ 15:15-16:45`) are invisible to the phone.
- **Concrete bugs in the round trip**
  - **Time ranges:** bone-tasks writes `⏰ 15:15-16:45`. Marrow keeps only the start, and when Marrow re-dates the
    task its patch (`setField(body, '⏰', p.time, '\\d{1,2}:\\d{2}')`) replaces just the first time and leaves
    `-16:45` behind, so the range gets corrupted.
  - **Reminder fields don't map:** bone-tasks has one time (`⏰`); Marrow has a list of reminders (lead or absolute
    time). A reminder set in Marrow doesn't exist in the note, and Obsidian can't show or keep it.
  - **Marrow's own task file:** `Margin/Tasks.md` holds Marrow's tasks, but it lost the `margin: tasks` header the
    code writes (it was created with `created:` front matter). It works today by luck of the parser.
  - **Day-plan events** from bone-calendar (finished / failed / cancelled / forwarded blocks) don't reach Marrow at
    all.

**Plan: Marrow becomes Obsidian's phone half for tasks, reminders and events**
- **What reaches the phone (D5):** every open task with a date or a time anywhere in the vault, not just `#school`.
  `#school` and subject tags still decide which tasks count as **school** (subjects, Grades, Stats). Everything else
  shows up in To-do as "Life" and can ring.
- **One reminder grammar, readable in both apps:** `⏰ 09:00` stays the time (and range). Extra reminders are written
  in the line as `🔔 -1h, -10m, 07:30` (a lead before the due time or start, or a time of day). bone-tasks gets the same
  field so both apps can set and show them. Marrow schedules every one of them as a real Android notification. The
  desktop keeps its own pop-up (D6: or the desktop stops notifying when the phone is paired, so you don't get
  everything twice).
- **Events:** bone-calendar day blocks (and its events) sync as read-only items in Today's timeline and can ring
  `🔔` like tasks. Their status (finished, failed, …) shows in Marrow (D7: whether to edit them from the phone).
- **Easy to reach on the phone:**
  - To-do gets **School / Life / All**.
  - The Tasks widget (§5) shows both.
  - Each notification has **Done** and **Snooze 10 min**, and both write back to the note.
- **The bugs above get fixed:** ranges kept and patched whole; `Margin/Tasks.md` header restored on the next write;
  block ids added only to lines Marrow tracks; a round-trip test suite of real lines from the vault (time range,
  recurring `🔁`, done `✅`, cancelled `❌`, nested sub-tasks, tasks inside callouts).
- **Order of writes:** a reminder change from the phone is a field patch, like other edits today. When both sides
  change the same line, it goes to Conflicts as a whole line, never half-merged.

**Done when:** a task written on the PC with `📅 tomorrow ⏰ 09:00 🔔 -10m` rings on the phone at 08:50 with the PC
asleep; Done on the notification ticks the line in the note within seconds when the hub is up; a range `⏰ 15:15-16:45`
survives a re-date from the phone; a calendar block shows on Today.

---

## Build order (one thing per release)

| Release | One thing |
|---|---|
| 0.7.7 | Splash: one look from tap to Today (§6) |
| 0.7.7.1 | Teacher's count field fix in all skins (§4) |
| 0.7.7.2 | Lab parts separated on Grades (§3) |
| 0.7.7.3 | Speed: hidden pages stay laid out + native edges for Plain/Daylight (§2.1–2.2) |
| 0.7.7.4 | Speed: FlashList, styles once, deck digits only (§2.3–2.5) |
| 0.7.7.5 | Skin object; all skins on it with no visual change (§1, step 1) |
| 0.7.7.6 | Daylight rebuilt on the skin object (§1, step 2) |
| 0.7.7.7 | Glance build step + old widget removed (§5) |
| 0.7.7.8 | Now + Class widgets (§5) |
| 0.7.7.9 | Tasks widget with tick (§5) |
| 0.7.8 | Sync: Excalidraw class, error codes + readable log (§8, §7.1) |
| 0.7.8.1 | Sync special cases from the table (§8) |
| 0.7.8.2 | Tasks: ranges, header, round-trip tests (§9 bugs) |
| 0.7.8.3 | All dated tasks reach the phone; School / Life (§9) |
| 0.7.8.4 | `🔔` reminders in both apps; notification Done / Snooze write back (§9) |
| 0.7.8.5 | Calendar events on Today (§9) |

**Risks**
- **Glance adds the Compose compiler to the Gradle build** (CI only). If CI fights it, the fallback is
  `react-native-android-widget`, with the same designs on RemoteViews.
- **Keeping hidden pages laid out costs memory** on the A51. It gets measured before shipping.
- **Every task with a date reaching the phone** may be many notifications. D5/D6 decide the filter.
- **The splash "dot" isn't confirmed** without a recording from the phone.

## Decisions for you

- **D1** Daylight's accent follows the sky (my pick), or your pen colour like the other skins?
- **D2** Paper skins' hand-cut edges: native Kotlin drawing (fastest, more work) or cached SVG (simpler)?
- **D3** Widgets in your app skin (my pick), with a "Match my phone (Material You)" option, or skin only?
- **D4** Keep the old widget as a "Replaced" placeholder for one release, or remove it at once?
- **D5** Which Obsidian tasks reach the phone: every task with a date or time (my pick), only ones with `⏰`/`🔔`,
  or only tracked tags as today?
- **D6** When the phone is paired, should the desktop still pop its own reminder (you'd get both)?
- **D7** Calendar day blocks on the phone: read-only (my pick) or editable (finish/cancel from the phone)?
- **D8** Old Excalidraw conflict entries in `Conflicts/`: should I clean them up once the fix ships?
- **D9** To-do: School / Life tabs (my pick), or one list with a filter chip?
- **D10** Can you turn on wireless debugging when I start §2 and §6? Those need measurements from the phone.
