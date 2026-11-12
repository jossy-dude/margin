# Margin v0.7 design: the v2 redesign

Every screen and component redesigned from scratch; same content, same jobs. Decisions are numbered **D-1 … D-24**
so each can be shown as a visual and approved or swapped on its own. Screens of today's app are in
`docs/v07/screens/` (`v06-*`).

## 0. How this was made

| Step | What happened |
|---|---|
| Skills | `impeccable` (context, critique, new-work with `concept-seed`), `minimalist-ui`, `high-end-visual-design`, `frontend-design` principles, `motionsites-web-builder` (its motion rules only: it builds websites, so its timings and easings are translated to Reanimated below, and its web media/landing-page parts are not used) |
| Owner's pinned taste | minimal, **background-first, calm, collapsible soft glass**; speed and function first; visually captivating; rejected the busy HUD look |
| Lessons from his vault sessions | five Bone re-skin rounds on 2026-11-12 were all rejected as "websites, not me": tasting menus of styles and Pinterest-like demo screens fail. What he *kept* in his vault: a living illustrated sky behind everything, panels as soft paper/frost, chrome that hides until needed, Inter 600 tabular numbers, a 4-px grid, a strict radius and type scale. So this is **one committed direction** built from how he uses the app, with one alternate, not a menu |
| Mode | Operate (a tool used many times a day). The world lends type, palette, density and one signature move; navigation and controls stay standard Android |
| Roll | `impeccable concept-seed --scope direction --mode operate` → **seed:822fdd198ddc8f36**, assigned candidate **4** of the grounded list below |
| Substitution | I ran as a planning subagent with no decision page; the round is written here instead, and the owner chooses at the visual-artifact review (Questions in PLAN.md) |

Grounded candidates, ordered by resonance (from the student's world, not from tools he operates):

| # | Candidate | Why it resonates | How it looks |
|---|---|---|---|
| 1 | The sky over campus through the day | his vault already lives on day/night skies; the time of day *is* the schedule | sky gradient ground, soft glass panels, sun/moon position |
| 2 | Frosted lecture-hall window with room numbers | rooms and doors are where classes happen | frosted panes, stencil room numerals |
| 3 | Highlighter study desk | the colours of revision | white sheets, four highlighter inks |
| **4** | **The OMR answer sheet (bubble sheet)** | every student has filled one in exam halls; rows, columns and filled bubbles = a record of yes/no | drop-out-ink hairlines, graphite-filled bubbles, condensed form numerals |
| 5 | Library index-card catalogue | tabs, drawers, one card per thing | card stock, tab dividers |
| 6 | Campus notice board | pinned slips and dates | cork, pins, slips |
| 7 | Metronome and score | the tempo of a day | staves, beats |

Challengers dealt by the roll, fused with Margin's facts and weighed on audience identification and product clarity:

| Challenger | Verdict | What the direction keeps from it (a discipline, not its clothes) |
|---|---|---|
| Orienteering map (fixed terrain colours, purple course over it) | declined | **One reserved colour for "now"**: used only for the current/next class, the now-line and the running timer, never as decoration (D-6) |
| Streaming title wall (focused tile grows, rest dims) | declined | **The focused thing grows, the rest steps back**: the running class leads Today; the rest of the day dims to 64 % (D-11) |
| Dark-first console (hairline seams, isolated destructive actions) | declined | **Destructive actions isolated by space and outlined until confirmed** (D-9, D-22) |
| Centre-rail reference setting (ruling engine, states as printed marks) | declined | **Every rule is one device pixel; every state is a printed mark** (merges with the bubble vocabulary, D-7) |
| Midnight transit diagram (focus the corridor) | declined | **Never shrink the whole week into an unreadable miniature; focus the chosen day** (Week, widgets) |
| Split-flap departure board | **competitive** (holds clarity: "next class, room, time" is a departures row) | kept as the full alternate **A-2** below |

---

## 1. Critique of v0.6 (Plain, the owner's current look)

Scored against impeccable's heuristics on the web build in Plain, light and dark, during a class
(`screens/v06-web-plain-*.png`) and the phone (`v06-settings-*.png`).

| # | Finding | Where | Severity |
|---|---|---|---|
| C1 | The current class appears twice in a row (hero + first list row), identical cards in Plain | Today | high (BUGS.md 3a) |
| C2 | Display face (Syne ExtraBold, ultra-wide) breaks every subject name into two lines: "Database / Systems", "Intro to / Economics" | Today, Grades, all titles | high |
| C3 | 17 font files across 9 families load at start; `[margin-boot] fonts=1736 ms` of a 2,550 ms first frame | `App.tsx`, logcat | high (speed) |
| C4 | Three rows of chips before the first task; three filled accent chips at once | To-do (BUGS.md 7) | high |
| C5 | Week blocks are 40-dp tiles with 2–3 letter codes ("ItE", "DM") and red flags; unreadable at a glance; grid stops at 16:00 | Week | high |
| C6 | Notebook ruling and a red margin line run behind Plain's "smooth stock", cutting through headers and lists | `PaperBg.tsx` in Plain | medium |
| C7 | The FAB covers the right side of the last visible card (attendance square, time) on every list page | all tabs | medium |
| C8 | `+ / − / −` stepper for "Teacher's count" (v0.5 brief banned steppers) | Grades | medium |
| C9 | Settings: 15 rows of equal weight, one flat list; "Palette" in Theme silently switches the style away from Plain | Settings | medium |
| C10 | The old letters (late entry, sick) still in the Grades legend after v0.6 moved to Present/Absent/Cancelled + why | Grades | low |
| C11 | Countdown digits laid on a 26-px cell grid made for Special Elite: "2 9 : 4 4" looks letter-spaced in Plain | Today | low |
| C12 | Navy summary slabs (Today deck, Stats head) are the only dark blocks on a light page: heavy, HUD-like | Today, Stats | medium |
| C13 | Toasts for errors and undo (not Material snackbars); the save error cut at 60 chars | global | medium (BUGS.md 11) |
| C14 | 16 ExoPlayers + 16 media sessions created at start for UI sounds | `audio.ts` | medium (SOUND.md) |
| C15 | Mascot (Jot) is a large illustrated figure; reads as clip art beside a calm UI | onboarding, empty states, Stats, Focus, About | high (owner: "looks like ass") |

What works and stays: the information each page carries, the clock-driven day bar idea, tap-to-mark attendance,
swipe to finish, the sky-by-time-of-day from onboarding, the warm voice of the copy.

---

## 2. The direction: **Daylight sheet**

> The background is the day itself; the app is a sheet of soft glass over it; every yes/no is a pencil-filled bubble.

| | |
|---|---|
| THESIS | A planner that shows the **day** as the ground: the sky behind the app follows the real clock, so the time is felt before it is read. Everything you act on sits on calm glass that folds away. It refuses the category default of a white list of coloured blocks with a navy hero. |
| OWN-WORLD | Ground: a soft illustrated sky in six states (night, dawn, morning, noon, afternoon, dusk), baked images, no live blur. Panels: translucent glass with a one-pixel ring and a faint top highlight, radius 16. Ink: graphite neutrals tinted by the sky. One reserved amber for *now*. Marks: hollow and pencil-filled bubbles. Type: Inter (tabular numbers), Literata italic for the app's voice. |
| SIGNATURE MOVE | **The bubble.** Attendance history, the day's periods, a task's done state, a week's classes, a course's components: all rows of bubbles filled like an answer sheet. Present = filled graphite; absent = filled rose; late = half-filled; cancelled = hollow, struck through; not yet = hollow. One glance down a row reads a semester. |
| FIRST VIEWPORT (Today, in class) | top bar (date, the mascot's face, settings) → **Now card** (class, room, teacher, countdown, bubble track of the day's periods) → "Later today" rows → Due → the nav island floating at the bottom. |
| STORY | "What's on, how long is left, what's next, what's due" answered in the top 60 % of the screen with one hand. |
| FINISH | unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance |

### Alternate A-2: **Departures**

Today and the widgets as a station departures board: rows of classes with a fixed column rhythm (time · class ·
room as platform · status), the next one highlighted, the countdown changing digit by digit with a short flip. Same
tokens and components otherwise. Risk: livelier than "calm"; the flip motion must be very short to stay quiet. Kept
because it is the clearest reading of "what's next, where".

---

## 3. Tokens

### D-1 Type (Inter + Literata, 5 font files)

| Role | Face | Size / line (sp) | Weight | Tracking | Use |
|---|---|---|---|---|---|
| Display | Inter | 44 / 48 | 600 | −1% | the countdown, Focus time |
| Title L | Inter | 28 / 34 | 600 | −0.5% | page titles |
| Title | Inter | 20 / 26 | 600 | 0 | class name in the Now card, sheet titles |
| Subtitle | Inter | 17 / 22 | 600 | 0 | card headers, row titles |
| Body | Inter | 16 / 22 | 400 | 0 | rows, forms |
| Body S | Inter | 14 / 20 | 400 | 0 | meta lines (room · teacher) |
| Label | Inter | 13 / 16 | 500 | +0.5% | buttons, chips, tabs |
| Caps | Inter | 11 / 14 | 600 | +8% uppercase | section labels ("LATER TODAY") |
| Voice | Literata italic | 16 / 22 | 400 | 0 | empty states, the mascot's lines, notes preview |

Numbers are tabular (`fontVariant: ['tabular-nums']`) everywhere. All sizes in sp, capped at font scale 1.3 for the
countdown only (it must not wrap). Files: Inter 400/500/600/700 + Literata 400 italic (≈ 600 KB). The 17 current
font files go (Caveat, Newsreader, Permanent Marker, Special Elite, Bricolage, DM Mono, Hanken, Fraunces, Syne).
Expected fonts step at boot: under 400 ms (measure: `[margin-boot]`).

### D-2 Colour

Light (day skies) and dark (night skies) are both first-class. Glass tokens sit over the sky; text contrast is
measured against the glass over the brightest/darkest sky of each set.

| Token | Light | Dark | Use |
|---|---|---|---|
| `glass` | `rgba(255,255,255,0.74)` | `rgba(16,20,27,0.68)` | cards |
| `glass-strong` | `rgba(255,255,255,0.90)` | `rgba(20,24,31,0.92)` | sheets, nav island, inputs |
| `ring` | `rgba(17,24,33,0.10)` | `rgba(255,255,255,0.10)` | 1 device-px outline on every glass surface |
| `highlight` | `rgba(255,255,255,0.65)` top inner edge | `rgba(255,255,255,0.06)` | the glass edge |
| `fill` | `rgba(17,24,33,0.06)` | `rgba(255,255,255,0.07)` | secondary buttons, tracks, segmented track |
| `ink` | `#1A1E24` | `#ECEEF1` | primary text |
| `ink-2` | `#48505B` | `#B5BBC4` | secondary text |
| `ink-3` | `#68707C` | `#8B8D98` | meta, placeholders (≥ 4.5:1 on glass) |
| `now` (reserved, D-6) | `#E8961E` | `#F4B04A` | the current class, now-line, running timer, nothing else |
| `on-now` | `#1F1405` | `#1F1405` | text on `now` |
| `present` (bubble fill) | `#2B3038` graphite | `#E3E6EA` | filled bubble |
| `absent` | `#D6455D` | `#F2768A` | filled bubble, overdue |
| `late` | half graphite | half light | half-filled bubble |
| `ok` / `warn` / `bad` | `#2F8F5B` / `#B7791F` / `#D6455D` | `#5CC48A` / `#E0A64A` / `#F2768A` | grade goal reached / tight / out of reach |
| Subject tints (8) | sky `#5B9BD5`, sage `#6FAF83`, sand `#D2A54F`, rose `#D97B86`, lilac `#9C86D6`, teal `#45A9A3`, clay `#C98557`, slate `#7F8C9E` | +12 % lightness | a 4-dp dot or a 3-dp left bar only; never a filled card |

### D-3 The sky ground

| Keyframe | Hours | Light-theme sky (top → bottom) | Dark-theme sky |
|---|---|---|---|
| Night | 21:00–05:00 | – | `#0B1020 → #1B2340` + faint stars |
| Dawn | 05:00–07:00 | `#F6C8A8 → #FBE9DA` | `#1E2240 → #4A3A55` |
| Morning | 07:00–11:00 | `#BFD9F2 → #EEF5FB` | `#16243A → #2B3E5A` |
| Noon | 11:00–14:00 | `#A9CFF0 → #F2F7FC` | `#14233A → #273C58` |
| Afternoon | 14:00–17:30 | `#C4D6EA → #F6EFE4` | `#1A2235 → #3A3550` |
| Dusk | 17:30–21:00 | `#E9B9A3 → #F3E1D6` | `#1C1A33 → #4B3249` |

Each keyframe is a baked WebP (1080×2400, < 60 KB) with a soft horizon and sun/moon; the app cross-fades between two
images over 60 s when the period changes (one opacity animation; nothing runs in between). Setting: Sky = Live (default)
· Still (one image per theme) · Off (flat `#F4F5F7` / `#0E1116`). The existing `Sun.tsx`/`sky.ts` code is the
reference for colours and is retired as live SVG.

### D-4 Space, radius, elevation

| Token | Value |
|---|---|
| Grid | 4 dp |
| Page gutter | 16 dp |
| Card padding | 16 dp (12 for dense rows) |
| Gaps | 4 · 8 · 12 · 16 · 24 · 32 (section break) |
| Radius | 6 chips/bubbles' hit areas · 10 controls · 16 cards · 22 sheets · 28 nav island · full for bubbles |
| Elevation | glass has no drop shadow; sheets `0 −8 24 rgba(0,0,0,.18)`; the nav island `0 8 24 rgba(0,0,0,.14)`; a lifted (dragged) card `0 12 28 rgba(0,0,0,.22)` + scale 1.03 |
| Hairlines | `StyleSheet.hairlineWidth` (1 device px) |
| Touch targets | ≥ 48 × 48 dp, ≥ 8 dp apart |

### D-5 Motion tokens (Reanimated 4)

| Token | Value | Use |
|---|---|---|
| `press` | 120 ms, scale 0.97 | every pressable |
| `state` | 200 ms, `Easing.bezier(0.4,0,0.2,1)` | colour/opacity changes, bubble fill |
| `expand` | spring `{damping 22, stiffness 260, mass 1}` | card collapse/expand, island collapse |
| `sheet` | spring `{damping 24, stiffness 300}` | sheets |
| `page` | 240 ms shared-axis X: out 90 ms fade + 12 dp, in 150 ms fade + 24 dp → 0, `bezier(0.22,1,0.36,1)` | tab changes |
| `enter` | 220 ms, translateY 12 → 0 + opacity, stagger 40 ms, max 6 items, done by 450 ms | first paint of a page |
| `drag` | spring `{damping 18, stiffness 220}` follow; lift 150 ms | week cards, task reorder |
| Reduced motion | every token → instant (0 ms), cross-fades → cuts | system setting or Settings → Motion |

Not animated (restraint): the sky between keyframes, decorative layers, idle lists. No infinite loops except the
mascot's blink (D-21) and the live countdown.

---

## 4. Components (rebuilt from scratch)

| ID | Component | Spec |
|---|---|---|
| D-7 | **Bubble** | sizes 10 / 14 / 20 dp; states `empty` (1.25 dp ring `ink-3`), `filled` (`present`), `absent`, `half` (left half filled), `struck` (empty + 1.5 dp diagonal), `now` (ring `now`, 2 dp). Fill animates as an ink spread: scale 0.4 → 1 of the fill circle in 180 ms + haptic "stamp" |
| | **BubbleRow** | a row of bubbles with 4 dp gaps, wraps by week (a 12-dp gap every 5 or 7); long-press a bubble = what that day was ("Tue 4 Nov · Present · late entry") |
| | **BubbleTrack** | the day's periods as bubbles on a hairline; the running period fills from left to right with `now`; breaks are hairline gaps proportional to time |
| D-8 | **Glass card** | `glass` + `ring` + `highlight`, radius 16; optional header row (Caps label + trailing action); **collapsible**: tapping the header collapses it to one summary line ("Due · 3 today, 2 overdue") with `expand`; state remembered per card |
| D-9 | **Buttons** | Filled (ink on light / white on dark, the one primary per screen), Tonal (`fill`), Outlined (`ring` 1 dp), Text. Destructive = Outlined in `bad`, never next to the primary, 24 dp of space around it, second tap confirms with the label changing to "Tap again to delete" (3 s) |
| | **Segmented** | `fill` track radius 10, 4 dp padding, thumb `glass-strong` radius 8 with ring; 2–4 options; replaces paired chips |
| | **DropChip** | outlined chip with ▾; filled with the subject tint + × once set; opens a sheet list |
| | **Field** | glass-strong, radius 10, 52 dp, label above in Label style, helper/error below; numbers use a real numeric keyboard; times use the time picker (no steppers anywhere) |
| | **Switch** | Material 3 switch (52×32), thumb icon off |
| | **Sheet** | `glass-strong`, radius 22 top, grabber, snap points 55 % / 92 %, scrim `rgba(0,0,0,.28)`; header: title (Title), optional back, close |
| | **Snackbar** | Material snackbar above the island, one line + one action (Undo, Retry, Open); replaces toasts |
| | **Row** | 56 dp min; leading 24 dp icon or tint bar; title + meta; trailing value/control/chevron |
| D-10 | **Nav island** | floating `glass-strong` pill, 64 dp tall, 16 dp from the bottom inset, 5 destinations (Today, Week, To-do, Grades, Stats) with 24 dp icons + Label; the selected one gets a `fill` capsule. **Collapses** to a 48-dp pill with only the selected icon + "+" while scrolling down; expands on scroll up or tap. The **"+" is part of the island** (a 48 dp filled circle at its right end), so no FAB covers content (fixes C7). Long-press "+" = quick add task |
| | **Top bar** | transparent over the sky: page title (Title L) left; right: the mascot face (28 dp, D-21), timer chip when a focus session runs, settings. Scrolls away; a compact glass bar appears after 64 dp of scroll |
| | **Day bar instruments** | the 16 instruments stay as a choice (Settings → Today → Progress style), redrawn as monoline hairline drawings in `ink`/`now`; the default becomes the BubbleTrack |
| | **Clock faces** | Field, Studio, Diver stay as a choice, redrawn flat (hairline dial, `now` second hand); default: no analog clock on Today (the sky and the countdown carry time); the face appears in Focus and the widget |

---

## 5. Screens, before → after

### D-11 Today

| Before (v0.6 Plain) | After |
|---|---|
| analog clock taped over a navy deck; title in Syne; 68-dp countdown slot; the same class again as the first list row; week strip; class list; notes strip; due list; FAB over content | below |

```
┌ sky ────────────────────────────────────────────┐
│ Thu 12 Nov                        (•ᴗ•)  ⚙      │  top bar: date · face · settings
│ Good morning, Jossy                              │  Body S, ink-2
│ ┌ Now card (glass, ring now 1.5dp) ───────────┐ │
│ │ NOW · PERIOD 1 OF 3                L-4  ▸  │ │  Caps; room as a chip
│ │ Database Systems · Lecture                  │ │  Title
│ │ Nkemi                                        │ │  Body S
│ │ 29:44  min left              ○ Mark         │ │  Display + attendance bubble button
│ │ ●━━━━━━━○──────○──────○                      │ │  BubbleTrack of today's periods
│ │ Next 10:55 Computer Programming · C-4       │ │  Body S
│ └─────────────────────────────────────────────┘ │
│ LATER TODAY                                      │  Caps; the Now class is not repeated
│  10:55  Computer Programming   C-4     ○        │  rows on one glass card, 64 % opacity
│  13:15  Intro to Economics     B-12    ○        │  while a class runs (the focus rule)
│ DUE                                       All ▸  │
│  ○ Reading response — Ch. 7    3 d late         │  bubble = done; swipe right = done
│  ○ Flashcards: key dates       today 20:00      │
│ NOTES  ▸ 2 pinned                                │  collapsed by default
│           ╭───────────────────────────────╮     │
│           │ ▣ Today ▦ Week ☑ To-do ▥ ▤  (+)│     │  nav island
└───────────╰───────────────────────────────╯─────┘
```

States: before school (Now card = "First class 09:00 · in 1 h 20 min", sky = dawn), between classes (the card counts
down to the next one, BubbleTrack shows the gap), after the last class ("Done for today", tomorrow's first class),
no classes (card collapses to one line "No classes today" + tomorrow), two classes at once (two tabs inside the card),
picked another day (week strip opens from the date in the top bar as a 7-day row; the Now card becomes that day's
timetable). The attendance bubble on the Now card marks the current class with one tap (long-press = the why sheet).

### D-12 Week

| Before | After |
|---|---|
| a 7-column grid 08–16 with 40-dp tiles and 2–3 letter codes, red flags, "Due this week" list under it | a **focused day** + week strip, plus an optional grid |

| Part | Spec |
|---|---|
| Week strip | 7 day pills (Caps weekday, Subtitle date, a BubbleRow of that day's classes in miniature: 6 dp bubbles); swipe left/right pages weeks with `page` |
| Day column (default view) | the selected day's classes as **cards with real names** on a time rail (08:00–20:00, compresses empty hours to 12 dp), subject tint bar, room, teacher, component; the now-line in `now` |
| Grid view (toggle in the header) | 7 columns; cards show the subject's short name (user-editable, default first word) at 12 sp; long-press a card to **drag** it (D-23) |
| Due this week | collapsible glass card under the day: tasks grouped by day |
| Add | "+" in the island opens "Class" preselected to the focused day |

### D-13 To-do

| Before | After |
|---|---|
| search field, 3 rows of chips, sections, FAB over cards | header search icon; one control row; sections; **reorder by drag** |

| Part | Spec |
|---|---|
| Controls | `[ Open │ Done ]` Segmented · `All subjects ▾` DropChip · `⇅ Due` sort button (BUGS.md 7) |
| Sections | Overdue · Today · Tomorrow · This week · Later · No date (Caps headers with counts); sort "My order" adds a manual order |
| Task row | 64 dp: bubble (tap = done with ink-spread + "done" sound), title (Subtitle), meta (subject dot + name · due · estimate), priority as 1–3 small ticks, trailing drag handle (only in "My order") |
| Gestures | swipe right = done (bubble fills), swipe left = delete with Undo snackbar (the crumple animation goes), long-press = reorder (D-23) or open |
| Obsidian tasks | **school** tasks from Obsidian appear with a small vault glyph; non-school ones never appear here (item 4) |
| Empty | the mascot (content face) + "Nothing open. Enjoy it." |

### D-14 Grades (with course components, DATA_MODEL.md)

| Before | After |
|---|---|
| one card per subject: wide Syne name, big score, marks list, curve field, attendance grid, teacher's count stepper | one glass card per **course**, components inside |

```
┌ Database Systems                     84 %  A− ┐   Subtitle · Display S (32) · Label
│ goal 85 % · need 88 % on the remaining 30 %   │   ok/warn/bad colour on the sentence
│ ─────────────────────────────────────────────  │
│ Lecture 70 %   82 %   ●●●●●○●●●●  9/10  Nkemi │   component row: share · grade · bubbles · rate · teacher
│ Lab     30 %   90 %   ●●●◐●●●○    7/8   Abebe │
│                                     Marks ▸   │
└───────────────────────────────────────────────┘
```

Tap a component → a sheet with its marks (name, score/out of, weight, on/off) and its full attendance BubbleRow;
"Teacher's count" is a numeric field (no stepper, C8). The split editor (a segmented bar with draggable dividers and
presets) opens from the share labels. Header of the page: term average and a one-line "on track in 4 of 5".

### D-15 Stats

| Before | After |
|---|---|
| navy summary slab, "Are you showing up?" section with long bubble rows, rings, heatmaps | three glass cards that each answer one question; sections collapsible |

| Card | Content |
|---|---|
| This week | focus time (Display S) with a 7-bar sparkline, attendance %, on-time %; each with "vs last week" in ink-2 |
| Are you showing up? | per course, then per component: BubbleRow of the last 4 weeks + rate + "you can miss N more" against that component's goal |
| Are you on top of your work? | done on time, overdue now, when you work best (24-h ring as hairline arcs), focus by subject (horizontal bars, subject tints) |

### D-16 Focus

| Before | After |
|---|---|
| ambient dial screen, Jot proud, round controls | full-screen sky (dims to 40 %), Display time in the centre, the task/subject under it, round bubbles (rounds done), controls in thumb reach: Pause · Stop · +5; DND icon top-right; Live Update notification as today |

The mascot sits above the time in the *content* face while focusing, blinks slowly; it turns *happy* at the round's
end. Presets 25/45/50/90 as a Segmented under the time before start.

### D-17 Sheets (+, task, class, mark, attendance)

| Sheet | Spec |
|---|---|
| + (add) | a sheet with 6 large tiles in 2 columns (Task, Class, Mark, Note, Exam, Focus) + "Reminder" (new); a subject picker on top ("For: Database ▾") so subject-dependent tiles are enabled; tiles are glass with an icon and Label |
| Task | title, subject DropChip, due (date + time picker), estimate (numeric), priority (Segmented), reminders (chips: at due, 1 h before, evening before, custom), subtasks |
| Class | course DropChip, **component** DropChip, weekday Segmented, start/end time pickers, room |
| Mark | course + component, name, score + "out of", weight (numeric), counts toggle |
| Attendance (why) | three large bubbles: Present / Absent / Cancelled; then the why chips for the chosen state; note field |

### D-18 Settings (structure)

Search at the top of the root page (filters every row and sub-row by label, value and keywords; results show the
path "Reminders › Quiet hours"). Grouped glass cards, Caps group labels, 56-dp rows, values on the right.

| Group | Rows (→ page) |
|---|---|
| **You** | Name · Semester (dates, archive, roll over) · Courses & parts (components, splits, attendance goals) |
| **Today & time** | Clock: 12/24-hour · Week starts on · Progress style (bubble track or an instrument) · Clock face (Focus, widget) |
| **Reminders** | Reminders (rules, D-19) · Classes (heads-up, after-class prompt) · Tasks & exams · Obsidian tasks (item 4) · Quiet hours & active days · Per-course lead time · Delivery status |
| **Alarms** | Alarms list · Alarm sound (picker, D-20) · Snooze length |
| **Focus** | Presets · Breaks · Flow mode · Do Not Disturb |
| **Look & sound** | Theme (Light/Dark/Follow phone) · Sky (Live/Still/Off) · Mascot (On/Off, where) · Motion (Follow phone/Reduce/Full) · Sounds (4 sliders) · Haptics |
| **Sync & Obsidian** | Desktop (pair, status, last sync) · Vault folder · What syncs · Fast vault mode |
| **Your data** | Automatic backup (folder, weekly, keep 4) · Export (xlsx/csv/json) · Import · Restore from backup · Safety copies |
| **Help** | Introduction · Diagnostics · About & credits |
| (alone, 32 dp below) | **Erase everything** (outlined `bad`, D-9) |

The "Palette" control that silently changed the style (C9) is gone: v0.7 has one look (Question 2 in PLAN.md).

### D-19 Reminders page (item 10)

Rules read as sentences. Each rule: **when** (offset) · **relative to** (an anchor) · **on** (days) · **say** (text).

```
REMINDERS                                          + New
┌ 1 h before first class · Mon–Fri ───────── ●  ┐  "Leave the house"
├ 20 min before every Lab ─────────────────── ●  ┤  "Lab coat and goggles"
├ 8 pm the day before any exam ─────────────── ●  ┤  "Pack calculator, ID"
└ Sun 7 pm ───────────────────────────────── ○  ┘  "Plan the week"
TEMPLATES   Leave for class · Pack the night before · Before a lab · Exam eve · Weekly review · Return library book
```

| Anchor | Meaning |
|---|---|
| First class of the day | moves with the timetable and cancellations (same logic as the class alarm) |
| Every class / every class of a course / of a component (e.g. every Lab) | |
| Last class of the day | "after class: go to the library" |
| Any exam / any task due | "the evening before" style offsets |
| A time on days | plain recurring reminder |

Editor: a sentence builder: `[ 1 h ▾ ] [ before ▾ ] [ first class ▾ ] on [ M T W T F ]  say [ Leave the house ]`,
live preview "Next: tomorrow 07:00". Delivered as notifications (not alarms) through the existing planner, within the
60-reminder cap, with quiet hours respected unless "Ring even in quiet hours" is on. Stored in `settings.reminders`
like `alarms` (no SQL migration).

### D-20 Alarms + ringtone picker

| Part | Spec |
|---|---|
| Alarm row | Display S time (or "1 h before first class"), days, label, switch |
| Alarm sound | list of 7 tones (SOUND.md §4) with a bubble radio each; tapping a row plays it **inside the app** (≤ 10 s, ramping like the real alarm). While playing, the row shows a large **Stop** button; **double-tap anywhere, volume keys, or leaving the page also stop it** (owner's complaint) |
| Gentle wake | toggle (default on): starts at 15 % volume, rises to full over 45 s; vibration after 20 s |
| Test full alarm | in the ⋮ menu: rings through the real alarm service and **always opens the full-screen alarm page** (with Snooze/Dismiss) even when the phone is unlocked, so it can always be stopped |
| Full-screen alarm page (native `mg_alarm.xml`) | the sky of the hour, big time, label, "First class: Database 09:00 · L-4", the mascot's sleepy face waking to happy on dismiss; Dismiss = swipe up (or a large button), Snooze = button |

### D-21 Mascot: the face set

Twelve hand-drawn kaomoji faces (`docs/v07/ref/jot-faces.png`), no body: a face is calmer than a figure and fits the
glass UI. Named:

| # | Face | Name in code | Used for |
|---|---|---|---|
| 1 | • ͜ ʖ • smirk | `smirk` | default idle in the top bar |
| 2 | • ͜ ʖ < wink | `wink` | tips ("long-press a bubble to see the day"), share, About |
| 3 | ^ ͜ ʖ ^ happy | `happy` | task done, class marked present, sync ok |
| 4 | – ͜ ʖ – content | `content` | Focus running, evening, all done for today |
| 5 | • o • surprised | `surprised` | a new Obsidian task arrived, an import preview, "a class starts in 5 min" |
| 6 | • ω • cat | `cat` | empty states that are good news (nothing due), weekends |
| 7 | • ︵ • sad | `sad` | absent marked, a grade below goal, a failed save |
| 8 | smug (lidded) | `smug` | goal reached, streaks, "on track in 5 of 5" |
| 9 | blushing | `blush` | compliments (week fully attended), onboarding name entered |
| 10 | > D < laughing | `laugh` | round done, a long streak, alarm dismissed on the first ring |
| 11 | • D • excited + sweat | `excited` | deadline today, exam tomorrow, a lot overdue (cheerful panic) |
| 12 | sleepy (lidded, frown) | `sleepy` | late night (after 23:00), alarm ringing, no classes today |

Placement:

| Where | Size | Behaviour |
|---|---|---|
| Top bar of every tab | 28 dp | reacts to the page: Today = time-of-day face (`sleepy` at night, `smirk` by day, `content` after the last class); To-do = `excited` if anything is due today, `cat` if nothing open; Grades = `smug`/`sad` against goals; Stats = `smirk`; Week = `smirk`. Tap = a short line in Literata in a small glass bubble (tip of the day) |
| Empty states | 64 dp | the face for the news, one line of voice text |
| Onboarding | 160 dp | each page has its face; it looks toward the field you type in |
| Focus | 72 dp | `content`, slow blink; `laugh` at round end |
| Full-screen alarm | 96 dp | `sleepy` → `happy` on dismiss |
| Widgets | 24 dp | a static face per state (in class `content`, overdue `excited`, done `cat`) |
| Snackbars | 20 dp | `happy` for success, `sad` for errors |

Assets (from the PNG to vectors): auto-tracing works (an OpenCV test traced all 12 faces into 3–7 filled paths
each), but filled outlines cannot morph. So each face is **rebuilt by hand as centre-line strokes** in a 120 × 64
viewBox, stroke 5 (scaled), round caps, using the trace as the underlay:

| Part | Primitives | Notes |
|---|---|---|
| Eyes | `dot` (circle r 6), `caret` (^ path), `closed` (– line), `chevron` (< or > path), `lidded` (dot + lid line) | each eye is one `<G>` positioned at (30, 26) and (90, 26) |
| Mouth | one cubic path with the **same command structure for every face** (`M x y C … C …`, 2 segments): smirk, smile-tick, `o` (drawn as a closed 2-segment loop), ω (2 humps), frown, D (open) | same structure = Reanimated can interpolate `d` between any two |
| Extras | blush (2 × 2 short strokes, `ink-3`), sweat marks (2 strokes) | own layer, fade in/out |
| Colour | `ink` in both themes; blush `rose` at 50 % | |

File: `src/ui/mascot/faces.ts` (path data + per-face eye types), `Face.tsx` (react-native-svg + Reanimated). The old
`Jot.tsx`, `scrap-rig.ts` and the unused `assets/paper/scrap-*` bitmaps are deleted.

Animation (motionsites' timing rules translated to Reanimated; all off under reduced motion except the face change,
which becomes a cut):

| Motion | Spec |
|---|---|
| Blink | eyes `scaleY` 1 → 0.08 → 1 over 140 ms (`state` easing), every 3.5–7 s at random; double blink 1 in 5 |
| Look | pupils (dot eyes) translate up to 2.5 units toward the last touch point or the scroll direction, spring `{damping 20, stiffness 180}`; they return to centre after 1.2 s |
| Morph | face → face in 220 ms: mouth `d` interpolated point by point; eyes of different types cross-fade (80 ms out, 120 ms in) with a 0.9 → 1 scale; extras fade |
| Bounce | on a happy event: translateY 0 → −6 → 0, spring `{damping 10, stiffness 300}`; on a sad one: a 2-unit droop and back over 400 ms |
| Idle | breathing scale 1 → 1.02 → 1 over 4 s, only while the screen is visible and the face is ≥ 64 dp |
| Budget | one `useFrameCallback`-free setup: blink and breathe are `withRepeat` on the UI thread; no JS timers per frame; the face draws ≤ 6 paths |

### D-22 Onboarding (same five steps, new look)

Welcome (sky, the face at 160 dp: `smirk` → `wink`) · What Margin does (live mini Now card) · Your name (`blush`
when typed) · **Bring my data back** (restore from a backup file, DATA_MODEL.md Part 2) / import / start fresh ·
Notifications, alarms and "Never sleeping" (each with one sentence of why). Pager with `page` motion; Skip top-right.

### D-23 Drag and reorder

| Gesture | Where | Spec |
|---|---|---|
| Drag a class card | Week (grid or day view) | long-press 250 ms → lift (scale 1.03, shadow, haptic `lift`) → `Gesture.Pan` moves it; snaps to 5-min steps vertically and to day columns horizontally; a ghost shows the new time; drop → sheet "Move Database Lab to Wed 14:00? This week only / Every week / Cancel"; "this week only" writes a one-off move (new `meeting_move` override, PLAN.md U6) |
| Reorder tasks | To-do in "My order" | long-press the handle → lift; rows part with `LinearTransition` (200 ms); autoscroll at the edges; drop writes `task.ord` (migration 7) |
| Reorder components, settings sections | Course sheet | same pattern |
| Collapse cards | anywhere | tap header; `expand` spring |
| Swipe | task rows | right = done (bubble fills during the swipe past 40 %), left = delete (Undo snackbar) |

### D-24 Widgets (RemoteViews, three)

Built with **RemoteViews** in the existing Kotlin module, not Glance: Glance needs the Compose compiler plugin and
runtime (~2 MB) in a module that is never built locally, while RemoteViews already works (`BoardWidget`) and Android
12+ gives responsive layouts (`RemoteViews(Map<SizeF, RemoteViews>)`), `RemoteCollectionItems` lists and checkbox
responses on the owner's Android 13. No widget-specific skill is installed (searched the skill list); impeccable's
Android rules and the tokens above apply.

| Widget | Sizes (cells → dp) | Content | Updates | Tap |
|---|---|---|---|---|
| **Now** | 2×1 (110×40) → 4×1, 4×2 | face · class name · room · **system countdown** (`Chronometer`, counting down, so it never goes stale) · thin progress bar · at 4×2 also "Next 10:55 CP · C-4" | at each class boundary (existing `TICK` alarm) + a non-waking 5-min alarm while a class runs and the screen is on | opens Today |
| **Day** | 4×2 (250×110) → 4×4 | today's classes as rows (time, name, room) with attendance bubbles; at 4×4 + due count and the next 3 tasks | boundaries + data change | row → that class's attendance sheet; header → Today |
| **Due** | 2×2 (110×110) → 4×2 | open tasks due soonest with **checkbox bubbles** (`setOnCheckedChangeResponse`, Android 12+) and due labels; overdue in `bad` | data change + midnight | checkbox = done without opening the app; row → the task |

| State | Now | Day | Due |
|---|---|---|---|
| No data yet / app never opened | face `smirk` + "Open Margin to set up" | same | same |
| Before first class | "First class 09:00 · in 1 h 20" | all rows hollow | list |
| In class | countdown + bar | current row with `now` ring | list |
| Between classes | "Next 10:55 · in 25 min" | | |
| After classes | "Done for today" + tomorrow's first | rows with filled bubbles | |
| No classes today | "No classes today" `cat` | "Free day" | |
| Nothing due | | | `cat` + "Nothing due" |

Look: `glass-strong` background at 92 % opacity, radius `@android:dimen/system_app_widget_background_radius`
(fallback 24 dp), `values-night` for dark, Inter is not available to RemoteViews so text uses
`sans-serif-medium`/`sans-serif` (Roboto) at the same sizes, numbers with `fontFeatureSettings="tnum"`. Preview
layouts for the picker (`previewLayout`). The v0.6 `BoardWidget` provider id is kept for **Day**, so a placed widget
survives the update.

---

## 6. What each screen keeps (content check)

| Screen | Content kept |
|---|---|
| Today | greeting, current/next class, room, teacher, countdown, period position, day progress, after-this, attendance marking, week strip, notes, due (overdue, today, next 3) |
| Week | week paging, now-line, tap to mark, long-press to edit, due this week |
| To-do | subtasks, estimates, priorities, start-by nudges, reminders, swipe done/delete with undo, search, filters, sorts |
| Grades | weighted marks with on/off, curves, goals, needed average, letters, attendance with the lock, teacher's count |
| Stats | rings → kept as numbers + sparklines, heatmaps → BubbleRows, best hours, focus by subject, per-subject attendance |
| Focus | presets, flow, breaks, rounds, keep-awake, DND, session record, Live Update |
| Settings | every current setting (re-grouped) + Reminders, Backup, Sync, Courses & parts |
