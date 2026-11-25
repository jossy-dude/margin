# Marrow v0.7.7: design critique

_2026-11-25 · branch `marrow-overhaul` · written against `docs/v077/SPEC.md` · 24 shots in `docs/v077/critique/shots/`_

**Method and limits.** I read the spec, the code, the four memory notes, and shot every skin and page on the Expo web build (412×915 @2x). I mocked the clock to see Daylight at six hours, and injected a Lab part into Database Systems (the seed has none). The impeccable launcher and its `reference/` folder were not present in the skill directory, so I used its heuristic scoring from the skill text. Web is not the phone. Native shadows, font metrics (Caveat on Android) and the splash cannot be seen here. I say so where it matters. The widget is judged from Kotlin and XML only.

Past lessons applied: Jossy rejected five rounds of "cool UI demo" looks because layouts felt like websites and nothing felt like him. So I do not propose new aesthetics. I propose to finish what Daylight already says it is, and to fix craft.

---

## Verdict: the five biggest problems, ranked

1. **Daylight is a white-card theme on a tinted background, not glass over a sky.** The sky is a flat two-stop gradient and the glass is 88 % white. You cannot see through it, so nothing reads as an overlay. Meanwhile the paper clock, italic serif, dashed boxes, brown pen accent, ruled lines and mascot face are all still there. (P0)
2. **Touch targets fail on the screen where you tap most.** Grades has about 256 controls under 44 dp. The attendance cells are 28×28 dp. Week's "due" rows are 22 dp tall. Chips are 34 dp. (P0)
3. **The widget is built to overflow.** A 4×2 card needs roughly 150 dp of content in about 110–130 dp. It uses a marker font, a typewriter font, a hatch, a dashed rule and a bitmap gauge. Ticking a task on it does not complete the task until the app next starts. (P0)
4. **Skins are one design wearing five coats, and the coats leak.** Today and To-do show the same task list. Notebook skins paint every Week block the same pink. The page header packs title, mascot, actions and gear into one row, so subtitles wrap on four pages. The "plain" skin still has ruled paper and a red margin line. (P1)
5. **The launch is three different looks.** The system splash is always cream `#FAF4E6`. The window then paints the skin's own paper plus the same 288 dp logo at a different size. Daylight users get flat grey `#F4F5F7`, then the sky pops in. That is a better explanation of "paper with a dot" than the spec's. (P1)

---

## Scores (impeccable heuristic table, 0–4)

Overall scores are for the app as it stands. The last column notes the worst skin.

| # | Heuristic | Score | Reason | Worst skin |
|---|---|---|---|---|
| 1 | Visibility of system status | 3 | Deck, countdown and attendance strips are clear. Widget tick shows no result. Sync errors are short lines. | Daylight (no sky/time cue beyond tint) |
| 2 | Match with the real world | 3 | Class, deck, notebook language fits a student. "Teacher's count" and "Mark day" need a tooltip. Onboarding still says MARGIN. | Notebook |
| 3 | User control and freedom | 3 | Undo for tasks exists. No undo for attendance taps (spec §7.4). Locked grid helps. | Grades |
| 4 | Consistency and standards | 2 | Four different header/title faces, three check-box styles, two glass systems (`Glass.tsx` and the HandBox sky branch), two sky tables. | Daylight |
| 5 | Error prevention | 3 | Clamped number fields, lock toggle. Teacher's count and marked count can disagree with no hint. | Grades |
| 6 | Recognition over recall | 3 | Labels are present. Nine-plus controls on To-do header area need reading. | To-do |
| 7 | Flexibility and efficiency | 3 | Swipe, long-press, tab on press-in. Long-press is the only way to change a cell. | Grades |
| 8 | Aesthetic and minimal design | 2 | Strong identity in Collage. Daylight is a mix. Today scrolls 2000 dp and repeats To-do. | Daylight |
| 9 | Error recovery | 2 | Empty states are text plus dashed box, with no action in several places (Notice board, Subjects, GPA "—"). | Daylight |
| 10 | Help and documentation | 2 | Hints are tiny italic grey (13.5 sp). No first-run help for attendance gestures beyond one line. | Notebook |

**Per skin, one line each.**
- **Collage: 29/40.** The most designed skin. Torn edges, denim deck and kraft nav hold together. Long cards and the FAB over content are the cost.
- **Notebook refined / original: 25/40.** Hand font plus wobble frames are charming but noisy at 14+ items. Week blocks lose subject colour. Refined and original differ only by palette values (`theme.ts`).
- **Plain: 24/40.** Not plain. Ruled lines, margin line and a wide display face (Syne) are still on. Digit strips use that wide face, which is hard to scan.
- **Daylight: 20/40.** Most mixed. See below.

---

## Findings

### A. Daylight

**A1 (P0). The glass is not see-through, and there is nothing behind it to see.**
Evidence: `shots/daylight-light-by-hour-Today.webp`, `shots/daylight-light-Tasks-evening.webp`. Cards are `rgba(255,255,255,0.88)` (`tokens/v2.ts:21`, `theme.ts` DAYLIGHT `card: '#FFFFFFE0'` = 88 %). The sky is `Sky.tsx`: two stops, `preserveAspectRatio="none"`. At noon the sky shows only in the 16 dp gutters. There is no sun, no horizon, no cloud, so even a fully transparent card would show a smooth ramp. A blur would show nothing.
Why: "overlay" needs something to overlay. Frosted glass is read from what is behind it.
Fix: (1) bake a sky layer per keyframe with a light source (sun or moon glow, a haze band, 2–3 soft cloud shapes at 8–15 % opacity, stars at night), as one 412×915 WebP per key at ~150 KB. Keep the 60 s cross-fade. (2) Drop fills to 0.58 (light) and 0.42 (dark) with a 1 dp top rim. (3) Keep text contrast by testing ink on glass over the lightest and darkest pixel of each baked sky, not over two hex stops. Android has no cheap backdrop blur on an A51, so fake it with the baked shapes already soft.

**A2 (P0). Daylight borrows from paper in at least 14 places.** Each is a shot-backed item:
1. Paper clock (cream face, pencil hands, brown rim). `daylight-light-Today-evening.webp`. Hung over the deck's top edge.
2. Italic serif for greeting, "All done for today", "After nothing scheduled", sub-lines, hints. `DAY_TYPE` still maps `serif` to Newsreader italic (`theme.ts:174`).
3. Brown pen accent (`PENS.warm`) on FAB, "Open" chip, selected "None", Add button, notice "+". `theme.ts:191` overrides `acc` with the pen for every palette, including Daylight.
4. Dashed check boxes on class rows and on the attendance strip.
5. Dashed rule inside the deck, tick ruler on the bar.
6. Deck slab is flat `#2B3038`, and in dark mode it inverts to a pale `#E3E6EA` block (`daylight-dark-Today-noon.webp`).
7. Sticker tags (Exam, Reading, Assignment) are tilted and tinted like paper scraps.
8. The mascot face in every page header (`• ‿ •`).
9. Add sheet tiles are pastel sticky notes with "tape" and a red margin line crossing the Class tile (`sheets-daylight-light.webp`).
10. Task sheet input uses a black hand-cut outline with a brown underline.
11. Week day strip labels in italic serif.
12. Week grid blocks keep pastel paper tints, flag icons, and 1 dp grid lines like graph paper.
13. Settings, GPA, Notices and Subjects pages have no glass at all, just text on sky (`sheets-daylight-light.webp`, panels 2, 4–6).
14. Overdue cards have a full red outline all round in every skin (`today-full-length-collage-vs-daylight.webp`).
Why it matters: each one reminds him it is the paper app in a blue coat.
Fix: the skin object in spec §1 covers this only if each item is a skin role, not a component branch. Add a checklist of these 14 as the acceptance test.

**A3 (P1). The accent plan collides with the "now" colour.** Spec §1 makes the accent follow the sky (dawn amber, noon blue, dusk rose, night indigo). `v2.ts` already reserves one amber (`now: #E8961E`) to mean "this is happening now". At dawn the accent and "now" would be the same hue.
Fix: keep `now` amber for the live class and the countdown only. Accents: dawn `#B4532A`, morning `#2F6DB5`, noon `#2563A8`, afternoon `#3D62A0`, dusk `#B04A6A`, night `#8FA9E8` (dark). Check each at 4.5:1 on its glass. Never amber for an accent.

**A4 (P1). The task sheet leaks the page behind it.** `shots/sheet-daylight-task-bleed-through.webp`: "Reading response — Ch. 7" is readable behind the "New task" title. The token comment claims 0.97, but the sheet shows through. Likely the sheet and its title bar use different fills, or `card` (0.88) is used. The scrim is flat grey over pastel sky, which looks dirty.
Fix: sheet fill `rgba(255,255,255,0.94)` light and `rgba(20,24,31,0.94)` dark (opaque enough for forms); scrim `rgba(10,16,28,0.38)` tinted to the sky; test by screenshot with a busy page behind.

**A5 (P1). Dark Daylight is a night sky with a white deck.** `daylight-dark-by-hour-Today.webp`. The deck and the GPA card are pale grey slabs at 12:1 against the page, the loudest thing on every dark page. It looks like a bug.
Fix: dark deck = glass `rgba(255,255,255,0.10)` over the sky with a 1 dp `rgba(255,255,255,0.22)` rim, ink `#ECEEF1`.

**A6 (P2). The type face is undecided.** The spec says Hanken Grotesk. `v2.ts` says Inter + Literata. `theme.ts` uses the system face (Roboto on the A51) with weight hints. Web screenshots show the system face. Pick Hanken (already shipped for Plain), ship the weights 400/500/600/700, and delete the other two.

**A7 (P2). Two glass systems.** `ui/Glass.tsx` and `ui/Island.tsx` draw the v2 glass. HandBox draws another in its `sky` branch (`kit.tsx:135–142`). The nav island uses `glassStrong` (97 % opaque, `Book.tsx:141`), so the nav is a white pill, not glass. Collapse to one `Surface`.

**Daylight by hour.** The six keyframes only change a two-colour tint (`daylight-light-by-hour-Today.webp`). Dawn is salmon, morning and noon are light blue, afternoon is grey-blue, dusk is salmon again, night is grey-blue. Dawn and dusk look the same, and light-mode night (`#BFD0E6`) is brighter than morning. Night in light mode should still be dark-ish; if "light mode = bright UI" is the rule, night needs stars on a dusky blue, not a pale one.

### B. Paper skins

**B1 (P1). "Plain" still has paper.** `skin-plain-light-5pages.webp`, `plain-light-Today.webp`. `PaperBg` draws ruled lines and the red margin rule unless `paper === 'plain'` (a separate setting). The skin called Plain defaults to ruled. The red line also runs through headings and the "Search tasks" text on every skin (`PaperBg.tsx:55`).
Fix: Plain forces no ruling. Margin line stops at the content gutter or is drawn behind cards only.

**B2 (P1). Notebook Week loses subject colour.** `Week.tsx:113` uses `look !== 'ink'` to pick subject tints, so both notebook skins paint all blocks one pink (`skin-refined-light-5pages.webp`). With 5 subjects and 17 blocks, the user cannot tell DM from DS except by two letters.
Fix: use the subject tint at 35 % over card in all skins; keep the hand frame.

**B3 (P1). Refined and original are the same skin.** The shots differ by a few colours (`theme.ts` REFINED vs ORIGINAL; same `look: 'ink'`). In original dark the deck is paper-bright. Two names, one layout. Either differentiate by one structural thing (rule weight, wobble amp) or merge them.

**B4 (P2). Notebook deck headline wraps.** "3 CLASSES · ALL PRESENT" breaks onto two lines in caps display type (`skin-refined-light-5pages.webp`, Today). Collage, Plain and Daylight fit it on one line. Cap it at one line with `adjustsFontSizeToFit`, or shorten to "3 classes, all present".

**B5 (P2). All-caps hand headings in Notebook** ("INTRO TO ECONOMICS", "ATTENDANCE") at 24–32 sp read slow. Keep caps for page titles only.

### C. Pages

**C1 (P1). The header row is overloaded.** `screens/common.tsx:52–62`: title (marker 32), mascot face, right actions, 46 dp gear, all on one row. On Week, To-do and Grades the subtitle wraps to two lines and the mascot floats in the middle (`skin-*-light-5pages.webp`). On Stats there is no subtitle, so the title baseline sits ~9 dp lower than other pages.
Fix: title row = title left, gear right (48×48). Subtitle on its own full-width line, 14 sp. Mascot moves into the deck or the empty state. Page actions ("Subjects", "+", prev/next week) go in a second row at 40 dp. Fix the title baseline with a fixed 40 dp row.

**C2 (P1). Today is 2000 dp long and repeats To-do.** `today-full-length-collage-vs-daylight.webp`. Clock, deck, week strip, today's classes, notice board, then the full overdue/due/coming-up task list with the same cards as To-do. Spec §9 will add "Life" tasks, which grows it further.
Fix: Today = deck + today's classes + max 3 tasks "Needs you" + "All tasks (9)" row. Overdue items beyond 3 collapse to one "6 overdue" line.

**C3 (P1). The clock overlaps the deck.** In all skins the clock face (about 92 dp) hangs 28 dp onto the deck top edge and the "Done for today" bubble crowds the rim; "Day complete" truncates to "Day co…" (`skin-collage-light-5pages.webp`). On a 412 dp screen that is a layout accident, not a layering choice.
Fix: clock sits fully in its own row, or moves into the deck as a 56 dp dial at the right.

**C4 (P1). FAB covers content.** 56 dp FAB at the bottom right hides the "curve" field and "Lock" on Grades (`grades-lab-mock-daylight-light.webp`) and the last class check box on Today. Fix: reserve 80 dp bottom padding on every scroll view and hide the FAB on Grades and Stats (its action, add, already lives in the header).

**C5 (P1). Week.** The grid is 6 columns at ~48 dp, blocks carry 2 letters ("DM", "ItE") at ~11 sp. Fine for glance, but "Due this week" rows are 22 dp high (audit). Prev/next buttons are 48×40.
Fix: 44 dp rows with 8 dp gaps, spell the subject at ≥ 12 sp when the block is ≥ 56 dp tall.

**C6 (P2). Grades card is 560 dp tall per subject and repeats the same unit.** `skin-collage-light-5pages.webp`. A card holds title, bar, goal text, up to 4 mark rows (40 dp each), Mark and curve, attendance, legend, teacher's count. Five subjects means ~2 800 dp of scroll. The grade shows two dashes when nothing is marked ("—" at 34 sp over "–" at 17 sp, `grades-lab-mock-collage-light.webp`).
Fix: collapse attendance into a section that opens on tap. One dash and a hint "No marks yet".

**C7 (P2). Stats "By subject".** Every row is a row of identical grey dots when all are present (`skin-daylight-light-5pages.webp`). With 100 % across the seed it shows nothing. Use present = ink dot, absent = ring, so the pattern appears, and colour only absences.

### D. Grades attendance with a Lab part (spec §3)

Reproduced by adding two variants to Database Systems and assigning the 14:15 meetings to the Lab (`grades-lab-mock-collage-light.webp`, `grades-lab-mock-daylight-light.webp`). Result today: the card prints "Lecture · 60 % · nothing marked / Lab · 40 %" as grey italic lines, but **one** attendance block: one percentage, one strip of 8 cells in time order, one teacher's count. The cells do not say which are Lab. The seed has no variants at all, so no fixture exercises this.
Fix (see Spec gaps §3 for the layout): a two-segment control inside Attendance, one strip visible at a time, a percentage chip per part always visible, and Lab cells carry a 6 dp tinted dot or an "L" corner mark.

### E. Teacher's count field (spec §4)

`shots/teacher-count-field-1x-vs-1.3x.webp` (left: 1×, right: 1.3× by forcing the input to 31 px; rows are Collage, Refined, Daylight).
What I can confirm: in Refined the "12" sits against the right edge with about 6 dp of space at 1.3× versus 30 dp on the left, and the slanted Caveat "2" overhangs its own advance. In Collage and Daylight the digit is clear of the edge. What I cannot confirm: the digit crossing the border. Web does not use Android's Caveat metrics, and the spec's claim is from the phone.
Correction to the spec: `Box` already has `paddingHorizontal: 10` (`fields.tsx:34`). The text input has none of its own and is right-aligned with `flex: 1` (`fields.tsx:81`), so what touches the edge is the hand font's overhang plus the wobble of the box path. The wrap claim is correct: `Row` is `flexWrap: 'wrap'` (`kit.tsx:408`), and the teacher row (`Grades.tsx:53`) does not override it.
Fix: input `paddingHorizontal: 12`, `textAlign: 'center'` when there is no unit; when there is a unit, `textAlign: 'right'` with `paddingRight: 4`, `includeFontPadding: false` on Android, and an extra 3 dp right pad when the face is slanted. Teacher row `flexWrap: 'nowrap'`, label `flexShrink: 1`, field `flexShrink: 0`. Test on the phone at font scale 1.0 and 1.4 (the app caps at 1.4, `fit.ts:99`).

### F. Sheets

**F1 (P1). Sheets still speak paper in Daylight.** Task sheet: italic labels, hand-cut black input, sticker chips. Add sheet: taped sticky notes. See A2. `sheets-daylight-light.webp`.
**F2 (P1). The disabled "Add" button is brown and pale in every skin** and looks active-but-weak. Use the skin's disabled style: 40 % fill, 60 % text, plus a helper line "Give it a name".
**F3 (P2). Settings is a long flat list** with a search field at top, 12 rows, 13.5 sp italic captions. Group headers ("You", "Look & feel") are italic grey at ~12 sp and almost invisible. Use 13 sp 600 ink2, not italic.
**F4 (P2). GPA page empties to "— cr" in six boxes** with no explanation until you read the small line under the list. Top card shows "—" twice. Put one line in the deck: "Add credit hours to see your GPA" and focus the first field.
**F5 (P2). Notice board and Subjects pages open on a blank screen** with a single italic line. Both need an action ("Pin a notice", "Add a subject") and an icon, as the Notice board on Today already has.

### G. Widget (spec §5)

Why it reads as "the worst widget ever" (`mg_widget_card.xml`, `Surfaces.kt:119–219`, `Gauge.kt`):
1. **It does not fit its own size.** 4×2 is declared `minHeight 110 dp`, resizable to 180. Content: padding 21 + state row ~24 + title (20 sp) ~27 + gauge 16 + sub-line ~18 + rule 9 + one task 26 + "more" ~15 = about 156 dp. On two rows it clips. `rows` is picked from `OPTION_APPWIDGET_MAX_HEIGHT` thresholds 110/140 (`Surfaces.kt:130`), which are guesses.
2. **Five fonts and four decorations in a 110 dp box.** Permanent Marker, a typewriter, an italic serif, a grotesque, plus hatch, a dashed rule, a drawn ticked gauge with a pointer, and a pill. A widget gets glanced at for under two seconds. Nothing is the one thing.
3. **No hierarchy of one.** The countdown (21 sp typewriter) and the title (20 sp marker) compete. The room is 14 sp marker.
4. **Tick rows are 26 dp tall** with a check box scaled to 0.8 (about 21 dp visible). Below any touch guidance (48 dp). The tick records into SharedPreferences and "Margin's JS marks the task done on its next start" (`Surfaces.kt:210`). So the task is not done, and not in the vault, until the app runs. A tick that does not stick destroys trust.
5. **A 300 dp-tall abstract preview** (`mg_widget_preview.xml`, 260×300) shows a shape that is not 4×2, so the picker lies.
6. **State is invisible:** "NOW/NEXT" is a pill in 11 sp caps; the empty text is "Open Marrow once to fill this in."
7. **Colour depends on the app skin** read from prefs; a never-opened install shows the notebook default.

What a great Android widget does (principles, not brands):
- **One job per widget, readable in two seconds.** Google Calendar's agenda widget and Things' Today widget lead with the single next item at 16–18 sp and let everything else be quiet. Structured's timeline widget shows "now" as one bar. Nothing Phone widgets use one numeral, one label, and flat shapes.
- **Respond to size, don't squeeze.** Define explicit size classes and make each a layout, not a scaled version of the big one.
- **Use the system's rounding and padding.** Outer radius from `system_app_widget_background_radius`, inner radius = outer − padding, 12–16 dp padding. A custom radius next to home-screen icons looks foreign.
- **Interactive and honest.** A tick completes the thing immediately, shows the result, and offers no state the data does not have.
- **Survive font scale and dark mode.** 12 sp is the floor. No text clipping at 1.3×.
- **Empty and error states are layouts.** "No classes today" with the next class date; "Open Marrow to sync" with a tap target.

### H. Launch (spec §6)

`shots/launch-web-frames.webp` (web, fresh store: white at 0 ms, cream paper at ~175 ms, then the onboarding). The web has no native splash, so it only shows the JS side: the first ~270 ms is blank white and then paper. It also shows the first-run onboarding says "MARGIN" in the corner while the heading says "Hi, I'm Marrow." (a rename leftover, P2). The web store does not persist, so I could not capture the post-onboarding cold start; the rest comes from the code.
Native path:
- System splash (Android 12+): colour is `splashscreen_background` `#FAF4E6` for every skin (only a dark variant exists, `values-night/colors.xml`), icon is `splashscreen_logo` as a bitmap, masked to a circle by the system (`values-v31/styles.xml`).
- Then `MainActivity.splashLayer()` (`MainActivity.kt:29–39`) paints the skin's paper and the **same 288 dp PNG** at full size. The system draws it at 192 or 240 dp inside a mask; the window draws it at 288 dp. The icon visibly jumps size and loses its circle.
- Daylight stores `paperLight` `#F4F5F7`, flat grey, because the sky is drawn by JS later.
So the user sees: cream circle-masked small logo, then paper and larger logo in a skin colour, then content. A small centred logo on paper is "a paper with a dot." Confidence: medium; spec's recording step (D10) is still right.
Fix (add to §6): (1) a vector splash icon with transparent background and `windowSplashScreenIconBackgroundColor` unset; (2) `androidx.core:core-splashscreen` with `setKeepOnScreenCondition` until Today's first commit, so there is no gap; (3) the splash colour per skin via a theme alias chosen at launch from `margin_look` (dynamic splash colour needs two or three style variants, or `windowSplashScreenBackground` set at runtime on 13+); (4) for Daylight use the last-hour sky's top colour, then a 200 ms fade into the live sky; (5) window background without logo; (6) cap the hold at 1 s.

### I. Engineering smells that hurt the UI

- **Skin leaks are wider than the spec's grep.** There are 25 `look === / !== / sky ?` sites in 12 files outside tests, and the real leaks use other spellings: `look !== 'plain'` (`Today.tsx:318`, `Grades.tsx:112,117`, `kit.tsx:490`) and `look !== 'ink'` (`Week.tsx:113`). `theme.ts:191` maps Daylight to `look: 'plain'`, so Daylight inherits every Plain special case silently. The test must grep `look\s*[!=]==` and `\bsky\b`, not just `look ===`.
- **643 inline `style={{` objects** (spec says 622; it moved). Fine for correctness, bad for diffing skins.
- **HandBox measure-then-draw.** `kit.tsx:116` keeps `sz` state set from `onLayout` (`:126`). In the Daylight branch `sz` is only used to decide `lift` (`:135`: `Math.min(sz.w, sz.h) >= 64`), so every glass card renders twice just to pick a shadow. Fix: a `lift` prop from the caller, no measure.
- **Touch targets** (web DOM audit, daylight-light, CSS px = dp): Today: Mark day 99×40, notice buttons 40 high, "All tasks" 40, focus timer 29×46. Week: prev/next 48×40, Class 99×40, 8 due rows 380×22. To-do: Open/Done 34, subject chip 34, sort 40. Grades: **256 of 270** controls under 44: attendance cells 28×28, mark rows 40, curve field 31 high, Lock 40. Stats: subject rows 34.
  Fix: a `minHit` of 48 on every `Pressable` via `hitSlop` or `minHeight`, cells 28 dp visible with 10 dp `hitSlop`, chips 40 dp visible with `hitSlop` to 48.
- **Accessibility labels are good** (0 unnamed controls on five pages, 116 labels). The gaps are role and state, not names: the attendance strip gives each cell a label but one `HStrip` has no "n of m" summary action; the FAB label is not announced on pages where it hides content.
- **Text:** hint text is 13.5–14 sp italic grey on glass (`ink3` `#5F6773` on 0.88 white is fine, on 0.58 white over a bright sky it will not be). Re-run the contrast test after A1.
- **Two sky tables** (`theme.ts:120` four keys, `v2.ts:37` six keys). Delete one.
- **`display:none` rebuild** (spec §2) interacts with the fix for A4: a sheet over a hidden page is fine; over a page being rebuilt it flickers.

---

## Spec gaps (by section)

**§1 Daylight and skin object.**
- Right: one `Skin` object, no component branches, `look` leaks gone, accent checked at 4.5:1.
- Wrong: the Surface plan (lit glass, radius 20) is already shipped (`kit.tsx:135`). The missing pieces are the ground and the fill opacity. As written the rebuild would ship the same cards with a new clock.
- Wrong: "accent follows the sky" collides with the reserved `now` amber (A3).
- Vague: "Hanken Grotesk" vs `Inter` vs the system face. Pick one.
- Vague: "no pixel change beyond 1 %". The paper skins use seeded wobble and grain; say how the test pins the seed and clock, and run it in light and dark.
- Missing: dark deck (A5), sky art with a light source (A1), the 14-item borrow list (A2) as the acceptance checklist, a Daylight splash colour (§6), Week blocks in notebook skins (B2), a `Skin` field for `deckInverted`.
- Missing: size, type and colour tokens (see direction (a) below).
- Build order: 0.7.7.5 (skin object, no visible change) is a release he cannot test. Offer one visible Daylight release first (ground + fills + deck + font), then the refactor.

**§2 Speed.** Fine. Add: measure FAB/overlay cost; HandBox double render is also a Daylight issue (§I).

**§3 Lab parts.**
- Right: data already has parts; per-part teacher's count with a migration.
- Wrong: "one block per part" doubles an already 560 dp card. Use a segmented control `[ Lecture 92 % | Lab 60 % ]` inside Attendance: both percentages always visible, one strip at a time, one teacher's count per selected part.
- Missing: a fixture (seed has no variants; add "Database Systems: Lecture + Lab" to the demo seed); the Lab cell mark (tinted corner dot, `L` in the long-press title); what the part's goal line looks like (`attGoal` per part); what happens with "Mark day" (it hits every part, show "marks both"); Week and Today labels ("DS · Lab").
- Missing: empty and edge states: a part with zero classes this semester; a variant with no meetings; only one part (hide the control).
- Done-when must test the mixed strip: marking a lab cell leaves the lecture percentage unchanged and the cell reads "Lab".

**§4 Teacher's count.**
- Partly wrong: `Box` has 10 dp padding (E). The cause is the hand font overhang, not missing padding. Keep the plan (12 dp, centred, `nowrap`) and add `includeFontPadding: false`, slant compensation, and a device check.
- Missing: font scale 1.4 as the test (the app caps at 1.4), `NumberField` use in Settings, GPA (width 64 with "cr"), the Schedule editor.

**§5 Widget.**
- Right: Glance; one design language; three widgets; Material You option.
- Missing: **where a tick writes.** "Works without opening the app" needs a Kotlin write path (SQLite and the vault note), or the widget must show a pending state. Today's pref-only tick fails the done-when.
- Missing: Chronometer is a `RemoteViews` view, not a Glance composable; say you use `AndroidRemoteViews` for it, or recompute on a 1-minute alarm.
- Missing: "generated preview" (`providePreview`) is for newer Android; the A51 needs a static `previewImage` or `previewLayout` fallback. Check the A51's OS version.
- Missing: sizes in dp and cells, type scale, radius, padding, states (empty, error, loading, "Replaced"), dark mode, font scale 1.3, 48 dp rows.
- Missing: the "Done when" should name the three sizes by dp and test the A51 launcher grid.
- D4 (keep a placeholder one release) is right.

**§6 Launch.**
- Right: remove the logo from the window; vector icon at icon size; one look.
- Wrong or incomplete: the "dot" is probably two logos at two sizes plus a static cream splash, not only the system mask. Add per-skin colour, splash hold until Today, Daylight sky colour, and the 288 dp PNG removal. Also the onboarding "MARGIN" kicker.
- Missing: dark splash colour per skin (only one dark variant exists), cold-start timing budget, and a frame-by-frame recording on the A51 as a before/after.

**§7 Other improvements.** Attendance undo (7.4) should come before more features: with 28 dp cells, mis-taps are certain.

**§8 Sync errors.** Design the "What went wrong" page: a card per error (code, sentence, one button, time), grouped by device, with empty state "Nothing wrong". Not in the spec.

**§9 Obsidian tasks.** School/Life tabs (D9) would put a second control row on To-do, which already has Open/Done, subject and sort. Prefer a three-way chip (All, School, Life) in the existing row. Notification buttons need the same 48 dp rule. Today must cap tasks (C2) before Life tasks arrive.

---

## Design direction proposals

### (a) Daylight as glass over a sky

**Direction.** The sky is the product; every card is a thin tinted pane over it. Remove everything that says "paper": no italics, no dashes, no tilt, no pen. The page has one light source (the sun or moon position for the hour), and the panes catch it on their top edge. Quiet, flat shapes, one grotesque, one accent per sky.

**Ground.** Six baked WebPs (≤ 150 KB each) per scheme: vertical gradient + sun/moon glow (at x = 70 %, y from 12 % at noon to 40 % at dawn/dusk) + one haze band + 2–3 cloud shapes at 10 % + stars at night. Cross-fade 60 s (existing). Reduce motion: cut.

**Tokens (dp / sp / roles).**
- Pane: radius 20 (cards), 14 (controls), 999 (chips), 28 (top of sheets). Padding 16 card, 12 dense. Gap 12. Gutter 16.
- Fill light: `rgba(255,255,255,0.58)`; dark: `rgba(16,20,27,0.42)`. Strong (sheets, nav): 0.94 both. Rim: 1 dp `rgba(255,255,255,0.7)` top / `rgba(17,24,33,0.08)` other sides (dark: 0.22 / 0.06). No shadow on cards. Sheets only: `0 -8 32 rgba(10,16,28,0.2)`.
- Deck: dark glass `rgba(12,20,36,0.72)` tinted toward the sky's top colour at 25 %; ink `#F4F7FB`; mut `#C3CBD7`. Dark mode: `rgba(255,255,255,0.10)` with rim 0.22, never inverted.
- Type (Hanken Grotesk): date 34/38 600 −0.3; title 20/26 600; body 16/22 400; secondary 14/20 400 `ink2`; label 12/16 500 (not caps); countdown 44/48 500 tabular. No italic anywhere. "Voice" lines are 14 regular `ink2`.
- Colour roles: `ink #1A1E24`, `ink2 #48505B`, `now` amber (live class only), `accent` by sky (A3), `ok/bad` from v2. Tags: tinted capsule, 12 sp, no tilt.
- Instruments: clock = 56 dp ring (1.5 dp stroke) with two hands, inside the deck, no face; progress = 6 dp capsule, accent fill (no outer glow); check box = 24 dp rounded square (radius 7), 1.5 dp stroke, filled with accent when done, 48 dp hit area; nav = glass pill 64 dp high, selected tab a 52×30 capsule at `fill`.
- Motion: press 0.97 / 120 ms; page cut; sheet spring (24/300). Nothing loops.

### (b) The three widgets (Glance)

Shared: outer radius from `system_app_widget_background_radius`, inner = outer − 12; padding 12 (2×1) or 14 (4×2 and larger); type floor 12 sp; one accent; no hatch, no dashed rules, no marker or typewriter font. Surfaces: Notebook/Collage skins use deck colour fill; Daylight uses a 3-stop static gradient from the current keyframe (no blur) at 100 % opacity; "Match my phone" uses Material You `surface` and `primary`. Tap anywhere opens Today (or To-do), except the tick and "+".

**Now (2×1, about 110×50 dp).** One sentence: what is happening now and how long is left. Class name 16 sp 600 (1 line, ellipsis), countdown 22 sp 500 tabular on the second line, a 4 dp bar under it. States: next class ("Next · 10:00 · in 2 h"), none ("No class today"), empty ("Open Marrow").

**Class (4×2, about 250×110 dp; 4×1 drops to the class line).** Left column: state label 12 sp (Now / Next), class 20 sp 600, room and teacher 14 sp, countdown 28 sp tabular on the right; bar 6 dp full width. Footer at ≥ 4×2: "Then Economics 10:55 · B-12" 14 sp and **one** urgent task at 48 dp with a tick. Nothing else; the 4×2 fits 14+24+28+6+10+20+48 ≈ 150 only if you drop the task, so the task shows from 4×3 (≥ 160 dp) and 4×2 keeps the "then" line only. State it in the spec.

**Tasks (4×2 → 4×4, about 250×110 → 250×250 dp).** Header 32 dp: "To do" 16 sp 600 on the left, "+" 40 dp round on the right. Rows 48 dp: 24 dp check box, title 16 sp (1 line), due 12 sp (red-tint "late"). 4×2 shows one row + "+N more"; 4×3 two rows; 4×4 four rows (header 32 + 4×48 = 224 + padding 28 = 252). A tick writes to the data immediately, shows the row struck for 1.5 s, then removes it. Empty: "Nothing due. Enjoy it." with a 20 dp check icon.

---

## Shots index (24)

`skin-{collage,refined,original,plain,daylight}-light-5pages.webp` (Today, Week, To-do, Grades, Stats) · `skin-{collage,refined,daylight}-dark-5pages.webp` · `daylight-light-by-hour-Today.webp`, `daylight-dark-by-hour-Today.webp` (06:30, 09:30, 12:30, 15:30, 18:30, 23:00) · `daylight-light-Today-evening.webp`, `daylight-light-Tasks-evening.webp`, `daylight-dark-Today-noon.webp`, `plain-light-Today.webp` · `today-full-length-collage-vs-daylight.webp` · `grades-lab-mock-collage-light.webp`, `grades-lab-mock-daylight-light.webp` · `teacher-count-field-1x-vs-1.3x.webp` · `sheets-{collage-light,daylight-light,daylight-dark,refined-light}.png` (task, settings, add, GPA, notices, subjects) · `sheet-daylight-task-bleed-through.webp` · `launch-web-frames.webp`.
Scripts used are in `docs/v077/critique/` (`grab.mjs`, `hours.mjs`, `more.mjs`, `lab2.mjs`, `tall.mjs`, `audit.mjs`); raw frames are in `raw/`.
