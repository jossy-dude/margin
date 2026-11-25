# Marrow v0.7.7 overhaul — spec, revision 2

_2026-11-25 · branch `marrow-overhaul` · for Jossy to review. Nothing here is built yet._

Base: 0.7.6.5. Revision 1 (commit `c41a0a6`) was a first read. Revision 2 adds two things:
- a **design critique** of the running app (`docs/v077/CRITIQUE.md`, written by a Sonnet agent from 24 screenshot
  sets in `docs/v077/critique/shots/`; I checked its main claims against the code and the shots)
- a **line-by-line read** of the code behind each complaint

Several rev-1 claims were wrong; they're fixed here and marked **Corrected**.

**How to read this.** Each section has **Found** (what is wrong, with evidence), **Plan** (what gets built, down to
files and numbers), **Tests** and **Done when**. Decisions you make are **D1…D14**, collected at the end. The build
order is one small release per row, as always: build it, you test it, release, stop.

## At a glance

| # | Your complaint | What's really going on | Releases |
|---|---|---|---|
| 1 | Daylight is bad; a theme should be an overlay | The glass is 88 % white over a flat two-colour gradient, so there's nothing to see through it. Daylight is wired as the "plain" look with your pen colour forced on, and 14 paper parts leak into it. | 0.7.7.5–.6 |
| 2 | Speed | Every revisit rebuilds the page's native views; each card draws twice; To-do isn't virtualised | 0.7.7.3–.4 |
| 3 | Lab and lecture on one line | Grades draws one strip per subject. Your DB Systems has a Lab part; **Computer Programming has none** (its lab is only the room LAB301) | 0.7.7.2 |
| 4 | Teacher's count number runs into the side | **Corrected:** the box has padding, but the slanted handwriting digit overhangs it, right-aligned against the wobbly edge | 0.7.7.1 |
| 5 | The widget | It's built to overflow (needs ~156 dp in a ~110 dp box), uses five fonts, and its tick doesn't stick until the app opens. Rebuild in Jetpack Glance, three widgets | 0.7.7.7–.9 |
| 6 | "Paper with a dot" at launch | The logo is drawn twice at two sizes on two different colours; Daylight shows flat grey, then the sky pops in | 0.7.7 |
| 7 | More improvements | The critique found more: touch targets far under 44 dp, an overloaded header, a 2 000 dp Today, Plain still drawing paper… Ranked, each its own release | queue |
| 8 | Sync | **Corrected:** most edge cases are already handled. Real gaps: Excalidraw files merged as text, errors without codes or buttons, clashes without a choice | 0.7.8–.8.1 |
| 9 | Obsidian reminders on the phone | Desktop-only reminders; only #school lines reach the phone; 8 round-trip bugs (6 new) | 0.7.8.2–.8.5 |

**What the critique scored** (impeccable heuristics, 0–4 each, /40):
- **Collage: 29**, the most designed.
- **Notebook (both): 25**, charming but noisy.
- **Plain: 24**, not plain.
- **Daylight: 20**, the most mixed.

The weakest heuristics overall are consistency, minimal design, error recovery and help, at 2/4 each.

---

## 0. How each release is checked

- Gate before every commit: `npm run check` (types, lint, tests, boundaries). Commits carry no AI attribution.
- **Screens:** `node tools/shot.mjs` on the web build (5 skins × 5 pages, light and dark). New `tools/skin-diff.mjs`
  (pngjs, already installed) compares two shot folders pixel by pixel and fails above a threshold. It pins the
  wobble seeds and mocks the clock (Playwright `page.clock`) so two runs are comparable. The critique's scripts
  (`docs/v077/critique/*.mjs`) are the starting point.
- **Speed:** `PERF=1 npx jest perf-profile` for JS render time (Node, for comparing builds). For the phone, a new
  `tools/phone-perf.sh` over wireless adb:
  - `am start -W` for cold start
  - `dumpsys gfxinfo <pkg> framestats` for janky frames on a scripted tab tour
  - `dumpsys meminfo` for memory
  - `screenrecord` for the launch
- **Vault lines:** a fixture file of real task lines copied from your vault (`src/test/fixtures/vault-lines.md`).
  Each line is parsed, patched and written back, and the result is compared byte for byte.
- **Touch targets:** the critique's DOM audit (`critique/audit.mjs`) becomes a check that lists every control
  under 44 dp per page.
- After each release: you test on the A51. I stop until you pick the next one.

---

## 1. Daylight: rebuilt as a real overlay skin

### Found
**It isn't glass, and there's nothing behind it.** Shots: `daylight-light-by-hour-Today.webp`,
`skin-daylight-light-5pages.webp`.
- Cards are 88 % white (`theme.ts` Daylight `card: '#FFFFFFE0'`; `tokens/v2.ts` glass 0.88 light, 0.86 dark),
  and sheets are 0.97.
- The sky (`Sky.tsx`) is a two-stop gradient with no light source, horizon or cloud. At noon it only shows in the
  16 dp gutters, and even a clear card would just show a smooth ramp.
- The six hours only change a tint. Dawn and dusk look the same, and light-mode night is brighter than morning.

**The lit-glass card is already built** (`kit.tsx:135`, since 0.7.6.3). What's missing is the ground, the fill
opacity, the deck and the type. A rebuild that only redid the surface would ship the same cards.

**It's wired as the Plain skin.** `makeTheme` (`theme.ts:190`) sets `look = 'plain'` for Daylight and forces your
pen colour on as the accent for every palette. So Daylight silently gets every Plain special case and the brown pen.

**Its type is undecided:**
- `DAY_TYPE` uses the system face (Roboto) with Newsreader italic for the "voice" lines.
- `v2.ts` says Inter + Literata.
- Rev 1 said Hanken.

**14 paper parts still show in Daylight** (critique A2). This list becomes the acceptance checklist:
1. the paper clock (cream face, pencil hands, brown rim), hung over the deck
2. italic serif for the greeting, "All done for today", "After nothing scheduled", hints
3. the brown pen accent on the + button, "Open", the selected chip and Add
4. dashed check boxes on class rows and the attendance strip
5. the dashed rule and tick ruler inside the deck
6. the deck: flat `#2B3038`, and in **dark mode a pale `#E3E6EA` slab**, the loudest thing on every dark page
   (`daylight-dark-by-hour-Today.webp`)
7. tilted sticker tags (Exam, Reading, Assignment)
8. the mascot face in every page header
9. Add-sheet tiles drawn as taped sticky notes, with the red margin line through them
10. the task sheet's black hand-cut input with a brown underline
11. Week's day labels in italic serif
12. Week's grid: pastel paper tints, flags and graph-paper lines
13. Settings, GPA, Notices and Subjects pages with no glass at all, text straight on the sky
14. overdue cards with a full red outline

**More defects:**
- **The task sheet shows the page behind it.** "Reading response — Ch. 7" is readable through the "New task" title
  (`sheet-daylight-task-bleed-through.webp`). The scrim is flat grey over a pastel sky.
- **There are two glass systems** (`ui/Glass.tsx` + `Island.tsx`, and HandBox's `sky` branch) and **two sky
  tables** (`theme.ts` with 4 keys, `v2.ts` with 6). The nav island uses 97 % glass, so it's a white pill.
- **Special cases are wider than rev 1 counted:** 25 sites in 12 files. Many are written `look !== 'plain'` or
  `look !== 'ink'`, not `look ===`.

### Plan, release A (0.7.7.5): Daylight you can see, on a new Skin object
This release changes what you see, so you can test it. It introduces the Skin object, but only Daylight uses it so
far.

**The Skin object**
```ts
// src/tokens/skins/types.ts
export interface Skin {
  id: 'collage' | 'refined' | 'original' | 'plain' | 'daylight';
  ground: { kind: 'paper' | 'flat' | 'sky'; ruling: 'lines' | 'dots' | 'grid' | 'none'; margin: boolean; grain: boolean };
  surface: { edge: 'torn' | 'hand' | 'hairline' | 'glass'; radius: number; fill: string; fillStrong: string;
             ring: string; rim: string | null; lift: { y: number; blur: number; alpha: number } | null; scrim: string };
  type: { display: Face; title: Face; body: Face; label: Face; num: Face; voice: Face };
  ink: { ink: string; ink2: string; ink3: string; accent: string; onAccent: string; now: string;
         deck: string; deckInk: string; deckMut: string; deckRim: string | null; ok: string; warn: string; bad: string };
  instruments: { clock: 'paper' | 'ring'; bar: 'hatch' | 'capsule'; check: 'dashed' | 'round';
                 tag: 'sticker' | 'capsule'; field: 'hand' | 'box'; addTile: 'note' | 'pane'; mascot: boolean };
  motion: { pressMs: number; pressScale: number; sheet: 'paper' | 'glass' };
}
```
One file per skin in `src/tokens/skins/`. `useSkin()` returns it. Every one of the 14 parts above becomes a field
here (clock, voice, check, tag, addTile, mascot, deck…), not a branch in a component.

**The ground:** six baked sky images per mode (`assets/sky/{light,dark}-{dawn,morning,noon,afternoon,dusk,night}.webp`,
412×915, ≤ 150 KB each), made by a script (`tools/sky.mjs`, SVG → WebP). Each has:
- the vertical gradient
- a sun or moon glow at x = 70 %, its height following the hour (12 % from the top at noon, 40 % at dawn and dusk)
- one haze band
- 2–3 soft cloud shapes at 8–15 %
- stars at night

Light-mode night becomes a dusky blue (not paler than morning); dawn is warm and dusk is violet, so they differ.
The images keep the existing 60 s cross-fade (`nextSkyChange`). With reduce motion, it's a cut. One sky table
(`v2.ts`); the 4-key copy in `theme.ts` is deleted.

**The panes** (critique direction (a), checked against `v2.ts`):
| Token | Light | Dark |
|---|---|---|
| Card fill | `rgba(255,255,255,0.58)` | `rgba(16,20,27,0.42)` |
| Strong fill (sheets, nav island) | `rgba(255,255,255,0.94)` | `rgba(20,24,31,0.94)` |
| Rim | 1 dp top `rgba(255,255,255,0.70)`, other sides `rgba(17,24,33,0.08)` | top `0.22` white, sides `0.06` white |
| Scrim behind a sheet | `rgba(10,16,28,0.38)` | `rgba(0,0,0,0.50)` |
| Deck | dark glass `rgba(12,20,36,0.72)` tinted 25 % toward the sky's top colour; ink `#F4F7FB`, muted `#C3CBD7` | `rgba(255,255,255,0.10)` + rim 0.22; never inverted |
| Shadow | none on cards; sheets only `0 −8 32 rgba(10,16,28,0.20)` | same |
| Radius | card 20, control 14, chip 999, sheet top 28 | same |
| Spacing | card padding 16 (dense 12), gap 12, gutter 16 | same |

- **No blur.** Android blur in RN is a render pass per pane and too slow on the A51. The baked sky is already
  soft, so a pane at 0.58 reads as frosted.
- **Contrast is tested on pixels.** `tokens-v2.test.ts` composites the pane over the lightest and darkest pixel of
  each baked sky, not over two hex stops. Ink, ink2, ink3 and the accent must pass 4.5:1. If one sky fails, that
  sky's pane alpha rises, never the text's.

**Type:** Hanken Grotesk (already shipped for Plain), weights 400/500/600/700, for every role. No italic anywhere.
| Role | Size / line | Weight |
|---|---|---|
| Date title | 34/38, track −0.3 | 600 |
| Title | 20/26 | 600 |
| Body | 16/22 | 400 |
| Secondary | 14/20 | 400, `ink2` |
| Label | 12/16, not caps | 500 |
| Countdown | 44/48, tabular | 500 |
| Voice lines (greeting, empty states) | 14/20 | 400, `ink2` |

The Inter/Literata note in `v2.ts` is deleted.

**Colour roles:**
- `now` amber (`#E8961E` / `#F4B04A`) is **only** for the live class and its countdown.
- The accent follows the sky (D1), never amber, and stays at least 30° of hue away from `now`, enforced by the
  test:
  | Sky | Accent |
  |---|---|
  | dawn | `#B24A5E` |
  | morning | `#2F6DB5` |
  | noon | `#2563A8` |
  | afternoon | `#3D62A0` |
  | dusk | `#8E4FA8` |
  | night | `#8FA9E8` (dark) |
- Your pen colour stays for the paper skins only.

**Instruments (Daylight):**
- **Clock:** a 56 dp ring (1.5 dp stroke) with two hands, **inside** the deck at its right. No face, and it no
  longer hangs over the deck edge.
- **Progress:** a 6 dp capsule with an accent fill. No tick ruler, no dashed rule.
- **Check box:** 24 dp rounded square (radius 7), 1.5 dp stroke; done = accent fill + white check; 48 dp hit area.
- **Tags:** capsule, 12 sp, the subject tint at 14 %, no tilt.
- **Add-sheet tiles:** panes with an icon, not sticky notes.
- **Nav:** glass pill 64 dp high; the selected tab is a 52×30 capsule.
- **Mascot:** off in Daylight's page headers (it can stay in empty states).
- **Overdue:** a 3 dp red bar on the left, not a full red outline.

**Every page gets panes:** Settings, GPA, Notices and Subjects use the same `Surface` as Today.

**Motion:** press 0.97 over 120 ms; page change stays a cut; sheets rise with a spring (damping 24, stiffness 300).
Nothing loops.

### Plan, release B (0.7.7.6): every skin on the Skin object, plus the paper-skin fixes
- Collage, refined, original and Plain move onto `Skin`, file by file, one commit per file.
- `HandBox` becomes `<Surface>` with one renderer per edge:
  - `TornEdge`: collage
  - `HandEdge`: notebook
  - `HairlineEdge`: plain, a plain `View`
  - `GlassEdge`: daylight
- The two glass systems become one.
- New test `skin-cases.test.ts` greps `src/` (outside `src/tokens/skins/`) for `look\s*[!=]==` and `\bsky\b` and
  fails on any hit.
- **No visual change** for the paper skins (`skin-diff` ≤ 1 %, seeds pinned, clock mocked), except these fixes so
  you have something to test:
  - **Plain is plain:** no ruling and no red margin line (B1). `PaperBg` currently draws them unless a separate
    `paper` setting is "plain".
  - **The margin line** stops at the content gutter in every skin; it no longer runs through headings and the
    search field (`PaperBg.tsx:55`).
  - **Notebook Week keeps subject colours** (B2): `Week.tsx:113` paints every block one pink because of
    `look !== 'ink'`. Blocks become the subject tint at 35 % with the hand frame.
  - **The Notebook deck headline fits one line** ("3 classes, all present", `adjustsFontSizeToFit`, B4).

### Tests
- `skin-cases.test.ts`: no special cases outside the skins.
- `tokens-v2.test.ts`: composited contrast on the baked skies, 6 skies × 2 modes, plus the hue gap from `now`.
- `skin-diff`: paper skins ≤ 1 %, apart from the four listed fixes.

### Done when
- Each skin is one file, and the grep finds nothing.
- **All 14 items on the borrow list are gone** in Daylight, checked by shot: 5 pages, the task sheet, the Add sheet,
  Settings, GPA, Notices and Subjects. Light and dark, at 07:00, 12:00, 18:00 and 22:00.
- You can see the sky's glow and clouds through every card.
- Dark Daylight has no pale slab.
- The task sheet hides what's behind it.

---

## 2. Speed: as close to native as React Native gets

### Found (Node profile, 0.7.6.5)
| What you do | JS render | What still costs |
|---|---|---|
| First visit to a tab | 60–120 ms | the page mounts; every card renders twice |
| Revisit a tab | 5–11 ms JS | **native**: `display:'none'` drops the page's layout, so Android rebuilds 286–756 views (Week 286, Today 639, To-do 658, Stats 727, Grades 756, measured on web) |
| Change skin | 32–42 ms | every visible card and inline style is rebuilt |
| Tick a task | 11–20 ms | fine |
| Cold start | unknown | needs the phone (`[margin-boot]` marks exist) |

- `Book.tsx` explains why pages are hidden with `display:'none'`: six stacked full-screen pages would cost about
  20 full-screen fills per frame. The trade was never measured on the A51.
- **Every card draws twice.** `HandBox` measures itself (`onLayout` → `setSz`), then draws its SVG edge at that
  size. Today alone has 48 cards (92 uses in the code), so 96 renders, and the first frame shows cards with no
  edges. In Daylight the measured size is only used to decide whether the card gets a shadow
  (`Math.min(w, h) >= 64`), so glass cards render twice for nothing.
- **To-do** maps up to 60 rows, all mounted.
- **The deck clock** re-renders the whole deck card every second while Today is visible.
- `metro.config.js` doesn't turn on `inlineRequires`, so every screen's module runs at start.
- 643 inline `style={{…}}` objects; 59 inline `hexA(…)` colours.

### Plan: measure, then one fix at a time
| # | Change | Expected gain | Risk |
|---|---|---|---|
| E1 | Hidden pages stay laid out: `opacity: 0` + `pointerEvents: 'none'` instead of `display: 'none'`. Android's renderer skips drawing a node with alpha 0, so this should keep the views without the overdraw. A/B behind a dev setting. | a revisit stops rebuilding up to 756 views | memory: maybe +20–40 MB. Ship only if PSS < +40 MB. |
| E2 | `Surface` for Plain and Daylight is a plain `View` (border, radius, rim): no SVG, no measure. Shadow is a `lift` prop from the caller. | half the card renders on those skins; edges on the first frame | none |
| E3 | Paper edges, D2: (a) cache the SVG path by `seed + rounded size`, and pre-size cards with a fixed height, or (b) a native `HandEdgeView` in Kotlin drawing the same wobble on a Canvas | (a) fewer re-draws; (b) no JS edge at all | (b) is more work and a new native view |
| E4 | `@shopify/flash-list` (in Expo 57's list) for To-do, Stats lists and Grades marks | To-do mounts ~12 rows, not 60 | row height estimates |
| E5 | Deck clock: digits in their own leaf component with the 1 Hz state; the card doesn't re-render | 1 render a second instead of ~40 | none |
| E6 | Styles for the hot parts (`Surface`, task row, class row, `Txt`, `Chip`) made once per skin with `StyleSheet.create` | less garbage on skin change and scroll | the other ~600 inline styles stay for now |
| E7 | Cold start: `inlineRequires: true` in Metro; Stats, Grades, Focus and Onboarding load on first visit; Today's data first, the rest after the first frame | fewer modules run before Today | order bugs if a module has side effects at import |
| E8 | Measure the + button and the overlay layer (critique): they sit over every page | known cost | — |

- **Every fix ships with before and after numbers from the A51** (`tools/phone-perf.sh`), not just Node.
- E1 and E2 are 0.7.7.3; E4, E5, E6 and E8 are 0.7.7.4; E7 rides with 0.7.7 (splash) because it's the same
  launch path; E3 comes after D2.

### Budgets (to adjust after the first measurement)
- **Tab revisit:** no frame over 16 ms (90th percentile, `framestats`).
- **First visit to a tab:** under 120 ms to the first frame.
- **Skin change:** under 150 ms.
- **Cold start to Today:** under 1.2 s (`am start -W` + `[margin-boot] frame`).

### Done when
Each budget is met on the A51, or the measurement shows why not and what it would take.

---

## 3. Lab classes: their own attendance line

### Found
- The data can hold parts: `SubjectVariant` has `kind` (lecture, lab, …), `attGoal` and a grade `weight`. Each
  `Meeting` points at one part (`variantId`), and the attendance key carries it (`date|start|courseId~variantId`,
  `domain/attendance.ts:44`). Stats can already work out attendance per part (`attendanceByPart`).
- **Grades ignores parts.** `screens/Grades.tsx` draws one strip with every class of the subject in time order,
  one percentage and one teacher's count (`settings.teacherAbsent[courseId]`).
- **The critique reproduced it** by adding a Lab part to Database Systems (`grades-lab-mock-*.webp`):
  - The card prints "Lecture · 60 % / Lab · 40 %" as grey italic lines above **one** strip.
  - The cells don't say which class is a lab.
  - The demo seed has no parts at all, so nothing exercises this.
- **Your real data** (`Margin/Subjects.md`, `Margin/Timetable.md`):
  - **Database Systems** has a **Lab** part (LAB201) beside its lectures (LR601, LR303).
  - **Computer Programming has no parts at all.** Its lab is only the room name LAB301 (older rooms LB302 and
    LAB302). Splitting the UI alone would change nothing for it.
- **The trap:** attendance is keyed by part. Moving LAB301's classes into a Lab part without re-keying would orphan
  every mark already taken on them.
- **Space:** a Grades card is already ~560 dp tall per subject (critique C6). Two full attendance blocks per card
  would make it worse.

### Plan
1. **`partsOf(course)`**, one domain function used by Grades, Stats, Today and Week: the explicit parts plus the
   base part, named "Lecture", for meetings without a `variantId`.
2. **On Grades, a segmented switch inside the Attendance section**, shown only when a subject has two parts or
   more:
   ```
   Attendance                                              [Lock]
   ┌ Lecture 92 % ─┬─ Lab 75 % ┐      ← both % always visible
   ▮▮▮▮▯▮▮▮▮▮▮▮                          ← strip of the selected part
   goal 80 % · can miss 2 more       teacher's count [ 3 ]
   ```
   - Both percentages always show. The strip, goal line and teacher's count are those of the selected part.
   - The switch is 40 dp tall, with each half at least 48 dp wide.
   - The subject's grade stays one number, made of the parts' weights (unchanged).
3. **Lab cells are marked** with a 6 dp tinted dot in the corner. The long-press title reads "Lab · Thu 20 · 09:45 ·
   present".
4. **"Mark day"** still marks every class that day. Its sheet says "marks Lecture and Lab" when both are on that
   day.
5. **"Split the lab classes" offer** (D11), for subjects like Computer Programming. When a subject has no parts
   and some classes are in rooms matching `^(LAB|LB)\s?\d` (or a class row is named "lab"), Grades shows one line:
   _"LAB301 looks like a lab. Track it separately?"_ with **Split** and **No**.
   - Split makes a Lab part (kind `lab`, goal = the subject's) and moves those meetings into it.
   - It **re-keys their attendance** (`…|courseId` → `…|courseId~labId`), and their day marks too.
   - It shows an Undo toast for 10 s, and the undo restores the keys byte for byte.
   - "No" is remembered per subject. Nothing is split without your tap.
6. **Teacher's count per part:** the key becomes `courseId~variantId`. The old `courseId` value stays on the
   Lecture part, so no count is lost and no migration is needed.
7. **Labels everywhere:** Today, Week and the widgets say "Lab" on a lab class ("DS · Lab", "Computer Programming ·
   Lab · LAB301").
8. **Stats "By subject"** opens into parts (the numbers already exist).
9. **Edge states:**
   - one part: no switch
   - a part with no classes this semester: hidden from the switch
   - a part with classes but no marks: "nothing marked yet"
10. **The demo seed gets "Database Systems: Lecture + Lab"** so screenshots and tests see parts.

### Tests
- `parts-of.test.ts` covers: no parts, base + lab, a lab with no base row.
- `split-lab.test.ts` covers: meetings moved, attendance and day marks re-keyed, undo restores them byte for byte.
- A fixture of your real timetable runs through both.
- A render test: marking a lab cell leaves the lecture percentage unchanged.

### Done when
- DB Systems shows `Lecture | Lab` with both percentages.
- After **Split**, Computer Programming does too, and every LAB301 mark you'd already taken is still there.
- Ticking a lab cell never moves the lecture percentage.
- Old teacher counts are still there.

---

## 4. Notebook skins: the teacher's count runs into the side

### Found (**Corrected**)
- The box (`Box`, `ui/fields.tsx:34`) **does** have `paddingHorizontal: 10`. Rev 1 was wrong about that.
- The text input inside it has no padding of its own and is right-aligned with `flex: 1` (`fields.tsx:81`).
- In both Notebook skins the digits use the handwriting face (Caveat). Its glyphs lean right and overhang their own
  width. Right-aligned against a box whose hand-drawn edge wobbles inward, the digit lands on the line.
- The critique measured about 6 dp of space on the right at 1.3× in refined, against 30 dp on the left
  (`teacher-count-field-1x-vs-1.3x.webp`). It couldn't reproduce the crossing itself on web, because web doesn't use
  Android's Caveat metrics. The phone will show it; the app allows text up to 1.4× (`ui/fit.ts`).
- The row is a kit `Row`, which wraps by default (`flexWrap: 'wrap'`, `kit.tsx:408`). The teacher row
  (`Grades.tsx:53`) doesn't override it, so at large text the field drops under the label.
- The same field is used for the curve, credit hours (GPA, 64 dp with "cr"), sound settings and the schedule
  editor.

### Plan
- `NumberField`:
  - the input gets `paddingHorizontal: 12`
  - centred when there's no unit; right-aligned with `paddingRight: 4` when there is one
  - `includeFontPadding: false` on Android
  - an extra 3 dp on the right when the skin's numeral face slants
- Digits use the skin's `type.num`, a printed numeral face, never the hand face:
  - Notebook: DM Mono (loaded)
  - Daylight and Plain: Hanken Grotesk tabular
  - Collage: keeps Special Elite
- Width comes from the content: `minWidth: 64`, no fixed 88.
- The teacher row: `flexWrap: 'nowrap'`, the label `flexShrink: 1` with `numberOfLines={2}`, the field
  `flexShrink: 0`.
- The − / + steppers stay 44 × 44 dp touch targets.

### Tests
- A render test checks the input's padding and alignment.
- A shot set covers 5 skins × values 0, 7, 12 and 99, in every place `NumberField` is used.

### Done when
On the A51 at the default and the largest font size (1.4×), in every skin and every place the field is used, the
digits sit inside the box with visible space on both sides.

---

## 5. Widgets: the old one deleted, three new ones in Jetpack Glance

### Found
**Why the current widget is so bad** (critique §G, from `mg_widget_card.xml`, `Surfaces.kt:119–219`, `Gauge.kt`):
1. **It doesn't fit its own size.** The 4×2 is declared 110 dp tall (resizable to 180), but its content adds up to
   about 156 dp:
   - padding 21, state row 24, title 27, gauge 16, sub-line 18
   - rule 9, one task 26, "more" 15
   
   Rows are picked from `OPTION_APPWIDGET_MAX_HEIGHT` thresholds (110/140) that are guesses, so it clips.
2. **Five fonts and four decorations in a 110 dp box:**
   - fonts: Permanent Marker, a typewriter face, italic serif, a grotesque
   - decorations: a hatch, a dashed rule, a drawn gauge with a pointer, a pill
   
   Nothing is the one thing you see in two seconds.
3. **No single focus.** The 21 sp countdown and 20 sp title compete; the room is 14 sp marker.
4. **Tick rows are 26 dp** (the box scaled to 0.8, ~21 dp visible).
5. **The tick doesn't stick.** It is kept in shared prefs, and the task is only done, and its vault line only
   changed, **when Marrow's JS next starts** (`Surfaces.kt:210`).
6. **The picker preview lies:** a 260×300 abstract shape that isn't 4×2.
7. **Empty state:** "Open Marrow once to fill this in." A never-opened install shows the notebook default.

**Toolkit options:**
- `expo-widgets` is iOS only on SDK 57.
- `react-native-android-widget` starts the JS engine for every update and still renders to RemoteViews.
- **Jetpack Glance 1.2.0** (Compose-style Kotlin) gives size buckets, real corners (Android 12+; the A51 runs 13),
  lazy lists, check boxes, theming and actions. Recommended.

**What good widgets do** (principles, not anyone's look):
- one job, readable in two seconds
- a layout per size, not one squeezed layout
- the system's corner radius and padding
- a tick completes the thing at once and shows it
- 12 sp minimum, survives 1.3× text and dark mode
- empty and error states are real layouts

### Plan
**Build (0.7.7.7, proves the toolchain and removes the old widget):**
- `modules/margin-native/android/build.gradle` gets:
  - the `org.jetbrains.kotlin.plugin.compose` plugin (same version as the project's Kotlin)
  - `buildFeatures { compose true }`
  - `androidx.glance:glance-appwidget:1.2.0` and `glance-material3:1.2.0`
  
  CI (`native.yml`) must compile it. Fallback if CI fights it: `react-native-android-widget` with the same designs.
- Every old widget file is deleted: `Widgets` in `Surfaces.kt`, `Gauge.kt`, `mg_widget_card*.xml`,
  `mg_row_tick.xml`, `mg_widget_preview.xml`, `mg_hatch*`, `mg_pill`, `mg_dash`, the widget fonts, the
  `BoardWidget` receiver and its provider XML.
- D4 decides whether a placed old widget gets a one-release stub: "Replaced, long-press to add the new one."
- One empty `NowWidget` that says "Marrow" proves the build. Nothing else ships in this release.

**Data (no JS on the update path):**
- The widgets read the agenda JSON the app already writes (`Agenda.kt`: classes, todos with urgency) and `Look`
  (the skin's colours).
- JS only calls `MarginNative.refreshWidgets()` after a task, timetable or skin change.
- A never-opened install shows a real empty state ("Open Marrow to set up your week", tap opens it), in neutral
  Material colours.

**Shared design (all three):**
- **Corners:** the outer radius is `system_app_widget_background_radius`; inner radius = outer − padding.
- **Padding:** 12 dp (2×1), 14 dp (4×2 and up).
- **Type:** the system sans (Glance can't load custom fonts); numbers monospace; nothing under 12 sp; one line per
  label with an ellipsis; tested at 1.3× text.
- **Colour:** one accent (the `now` colour on the bar and on "late"). Nothing else decorates: no hatch, no dashed
  rule, no marker or typewriter font.
- **Surfaces:**
  - Paper skins: the deck colour as the fill.
  - Daylight: a static 3-stop gradient of the current sky keyframe, fully opaque.
  - "Match my phone" (D3): Material You `surface` and `primary`.
- **Taps:** anywhere opens Today (or To-do), except a tick or "+".

**The three widgets** (sizes in dp; Android cells on the A51 are about 60×70 dp)
| Widget | Size | Layout | States |
|---|---|---|---|
| **Now** | 2×1, ~110×50 | line 1: class name 16 sp 600; line 2: countdown 22 sp 500 tabular; a 4 dp bar below | next ("Next · 10:00 · in 2 h"), none ("No class today"), empty |
| **Class** 4×1 | ~250×50 | state 12 sp (Now/Next), class 18 sp 600, countdown 22 sp on the right, 4 dp bar | as Now |
| **Class** 4×2 | ~250×110 | left: state 12 sp, class 20 sp 600, room · part 14 sp; right: countdown 28 sp; 6 dp bar; footer "Then Economics 10:55 · B-12" 14 sp | + "Last class of the day" |
| **Class** 4×3+ | ≥ 250×160 | 4×2 plus **one** urgent task row (48 dp, with tick) | |
| **Tasks** 4×2 | ~250×110 | header 32 dp ("To do" 16 sp 600, "+" 40 dp round); 1 row + "+N more" | empty: "Nothing due. Enjoy it." |
| **Tasks** 4×3 | ~250×180 | header + 2 rows | |
| **Tasks** 4×4 | ~250×250 | header + 4 rows (32 + 4×48 + 28 padding = 252) | |

- **Task rows:** 48 dp; a 24 dp check box; title 16 sp, one line; due 12 sp (red tint when late); most urgent first
  (late, due today, then priority).
- **Sizes:** `SizeMode.Responsive` with those buckets. Each bucket has its own layout; nothing is squeezed. The
  4×2 Class widget doesn't show a task, because it doesn't fit (14 + 24 + 28 + 6 + 10 + 20 + 48 ≈ 150 dp).
- **Time:** labels use absolute times ("until 10:55"), which never go stale.
  - The countdown is an embedded `Chronometer` (`AndroidRemoteViews`; Glance has no chronometer of its own),
    counting down and ticked by the system with no battery cost.
  - Bars are redrawn at class boundaries (the existing `Ticker` alarms) and every 5 minutes during a class (inexact
    alarm).
- **Tick from the widget:** a Glance `ActionCallback`:
  1. records the tick for JS (`WidgetTicks`, as now)
  2. marks the task done in Marrow's database natively, so the app is right even before JS runs
  3. for a task that lives in a note, patches the line natively (`TaskTick.kt`: `[ ]` → `[x]` + `✅ date`, the
     same rule as JS, shared fixtures; see §9)
  4. shows the row struck through for 1.5 s, then removes it
- **Previews:** the A51 is Android 13, and Glance's generated previews need Android 15. So each widget gets a
  static `previewImage` PNG at its real default size, rendered from the real layout by a script, and the
  generated one for newer phones.

### Tests
- Kotlin unit tests (CI) for urgency order, bucket choice and empty states.
- `TaskTick.kt` against the shared line fixtures.
- Preview PNGs checked into `docs/v077/widgets/`.

### Done when
- Now (2×1), Class (4×1, 4×2, 4×3) and Tasks (4×2, 4×3, 4×4) render on the A51's launcher grid without clipping, in
  each skin, light and dark, at default and 1.3× text.
- A tick marks the task done in Marrow and in the note with the app closed.
- No old widget file is left in the repo.

---

## 6. "Paper with a dot" at launch

### Found
Launch has **three stages**, and each draws its own way:
1. **System splash** (Android 12+, manifest theme `Theme.App.SplashScreen`):
   - background is `splashscreen_background`, always `#FAF4E6` (dark `#3C352C`), whatever your skin
   - icon is `splashscreen_logo`, a 1152 px PNG: the M card at 44 % of a 288 dp canvas
   - the system masks the icon to a circle and draws it at its own icon size
2. **Window background**: `MainActivity.onCreate` switches to `AppTheme` and paints
   `LayerDrawable(paper of the last skin, the same PNG)` (`MainActivity.kt:29–39`).
   - The logo is drawn at the full 288 dp with no mask, so it **jumps in size and loses its circle**.
   - The colour switches to the last skin's paper.
   - For Daylight that's `paperLight` `#F4F5F7`, flat grey, because the sky is drawn later by JS.
3. **JS**: nothing until Today is ready (`App.tsx` `Splash`), then Today. For Daylight, the sky pops in here.

There's no `installSplashScreen()`, so stage 1 ends at the first frame and stage 2 stays up for the whole JS load.

**Best explanation** (critique and code agree, medium confidence): a small, circle-masked logo on cream, then a
bigger logo on a different paper colour, then content. That reads as "a paper with a dot". The recording will
confirm it.

**Rename leftover:** first-run onboarding still says "MARGIN" in the corner (`Onboarding.tsx:267`) under "Hi, I'm
Marrow."

### Plan
1. **Record first** (5 minutes with wireless adb, D10): `screenrecord` at 20 Mbit/s, cold start; `ffmpeg … fps=60`;
   check the frames. Do it with the last skin as Collage and as Daylight, light and dark. This is the "before".
2. **One splash from tap to Today:**
   - `installSplashScreen()` (androidx core-splashscreen, already pulled in by expo-splash-screen) with
     `setKeepOnScreenCondition { !jsReady }`.
   - JS calls `MarginNative.splashDone()` from the existing `mark('frame')` effect.
   - A 2 s failsafe releases the splash; the window behind it is plain paper with **no logo**, so nothing jumps
     even then.
   - `setOnExitAnimationListener` fades the splash out over 180 ms onto Today.
3. **The splash follows your skin.** Android 13 (the A51) lets the app set the splash theme for the **next** launch
   (`SplashScreen.setSplashScreenTheme`, API 33).
   - Marrow gets one splash style per skin (`Theme.Splash.Collage`, `.Notebook`, `.Plain`, `.Daylight`, each with
     a `values-night` twin), chosen whenever you change skin.
   - Daylight's splash is a mid sky colour (`#DCE8F5` light, `#141B2E` dark), and Today fades the live sky in over
     200 ms.
   - Below Android 13 it stays paper.
4. **A vector splash icon** (`ic_splash_m.xml`): the M and its tape, no card, no PNG, transparent background,
   filling ~65 % of the 192 dp circle. A vector scales cleanly whatever icon size One UI picks. The 288 dp PNG is
   deleted.
5. The onboarding corner says "MARROW".

### Done when
The "after" recording shows the skin's colour + M, then a fade to Today, with no second logo, no size jump and no
grey-then-sky, in all four cases.

---

## 7. Other improvements (ranked; each its own release, after you pick)

The critique found these; I checked each against the shots. None is in the build order until you pick it.
1. **Touch targets** (P0). On Grades, 256 of 270 controls are under 44 dp:
   - attendance cells 28×28
   - mark rows 40
   - the curve field 31 high
   
   Elsewhere: Week's "due" rows are 22 dp; chips and Open/Done are 34.
   
   Fix: a `minHit` of 48 dp on every pressable via `hitSlop` or `minHeight`. Cells stay 28 dp to the eye, with
   10 dp of `hitSlop`; chips are 40 dp with slop to 48.
2. **Undo for attendance taps.** With 28 dp cells, mis-taps are certain. Tasks already have undo.
3. **The page header** (`screens/common.tsx:52–62`) packs title, mascot, actions and gear into one row, so the
   subtitle wraps on Week, To-do and Grades.
   
   Fix:
   - row 1: title on the left, 48 dp gear on the right
   - the subtitle on its own line at 14 sp
   - page actions in a 40 dp second row
   - the mascot moves into the deck or the empty states
4. **Today is ~2 000 dp long and repeats To-do's list** (D13). Proposal: deck + today's classes + **at most 3**
   "Needs you" tasks + an "All tasks (9)" row. More than 3 overdue collapse to one line. This matters before §9
   brings in your Life tasks.
5. **The clock overlaps the deck** in every skin, and "Day complete" truncates to "Day co…". The clock moves fully
   into its own row, or into the deck as a 56 dp dial (Daylight already does this in §1).
6. **The + button covers content** (the curve field and Lock on Grades, the last check box on Today). Fix: 80 dp
   bottom padding on every scroll view, and no + button on Grades and Stats (their add lives in the header).
7. **The disabled Add button looks active-but-weak** (brown, pale) in every skin. Fix: 40 % fill, 60 % text, and a
   hint "Give it a name".
8. **Empty states with no action:** Notice board and Subjects open blank with one italic line; GPA shows "— cr" six
   times. Each gets an icon and one action ("Pin a notice", "Add a subject", "Add credit hours to see your GPA").
9. **Settings group headers** are 12 sp italic grey and nearly invisible. Make them 13 sp, 600, `ink2`.
10. **Stats "By subject"** dots are all grey when you were present. Use present = ink dot, absent = ring, so the
    pattern shows.
11. **Refined and original Notebook are the same skin** with different colours (D14): merge them, or make them
    differ in one structural way.
12. **A readable error log** (with §8), **backup before any database migration**, **Today's now card shows the
    part and room**, and **search across tasks, notices and subjects**: carried from rev 1.

---

## 8. Sync: the real gaps

### Found (**Corrected**: rev 1 said several cases were unhandled; the code shows they are)
**Already handled** (`vault-sync/daemon/hub.js`, `SyncEngine.kt`, `SyncFiles.kt`, `SyncVault.kt`, `SyncLocal.kt`):
| Case | What happens today |
|---|---|
| Delete on one side, edit on the other | the edit wins: the hub refuses the delete (`edited`) and sends the file back |
| Many deletes at once | the big-delete guard holds them past `DEL_LIMIT` a minute until you approve |
| App killed mid-write | phone and hub both write `.name.sync.tmp` and then rename |
| Phone offline for days | resumes from its cursor; a reset hub triggers a full compare |
| Big uploads | chunked, and resumed by parts |
| Files over 20 MB | the phone says "too big to sync from the phone" |
| Hub down, PC asleep | backoff 1 → 60 s, with a sentence ("Is bone-syncd running and the computer awake?") |
| Phone Obsidian typing in a note | the change waits for "saved", or 30 s |
| Rename or move | `mv` frames both ways |
| Phone history | an `events` table in the phone's sync DB |

**The real gaps:**
- **G1. Excalidraw drawings are merged as text.** `*.excalidraw.md` matches the `note` class
  (`core/src/classes.js`, `NOTE_RE`), so a drawing edited on both sides gets a diff3 merge of compressed data.
  `Conflicts/2026-11-23.md` is **286 KB** of `N4KAkAR…` blocks from `Clipping plan.excalidraw`. Those are the
  "From the phone, not applied" boxes.
- **G2. A clash is a sentence, not a choice.** The phone logs "clash in X: the other version is in Conflicts/…",
  and you have to find it in Obsidian.
- **G3. Errors have no codes and no buttons.** The sentences are good but scattered (`E.fail(…)` in several
  files), and nothing says what to do next.
- **G4. I can't read the phone's history from the PC.** The events stay in the phone's database.
- **G5. Held deletes:** not confirmed that Marrow shows them with an Approve button. To check in 0.7.8.

### Plan
- **G1 (0.7.8):**
  - Add `file **/*.excalidraw.md` to `DEFAULT_CLASSES` in `classes.js`, the same in `FileClasses.kt`, and a case in
    `fixtures/classes.json`, which both ports already run.
  - A clash then keeps both: the incoming copy is saved as `Name (phone 2026-11-23).excalidraw.md` (existing `file`
    behaviour), with no Conflicts entry.
  - D8: I clear the 286 KB conflict note after the fix ships.
- **G2:** Marrow's sync page gets a **Clashes** list, from the hub's `conflict` frames. Each row shows the note, the
  time, **Open in Obsidian** (`obsidian://open?…&file=Conflicts/…`) and **Done** (hides it). "Keep phone / keep
  desktop" needs a hub `resolve` frame and comes later.
- **G3:** one table of codes in `SyncEngine.kt` (`fail(code, args)`), each with a sentence and one action:
  | Code | Sentence | Action |
  |---|---|---|
  | E-AWAY | The desktop isn't reachable (since 14:02). | Try now |
  | E-PAIR | This phone isn't paired with the desktop. | Pair |
  | E-VERSION | The desktop's bone-syncd is a different version. | How to update |
  | E-SEAL | The link failed its security check. | Pair again |
  | E-PERM | Marrow lost access to the vault folder. | Pick folder |
  | E-BIG | X is over 20 MB and stays on this phone. | Show file |
  | E-HELD | 23 deletes are waiting for you. | Review |
  | E-CLASH | A note changed on both sides. | Open |
  | E-WRITE | Couldn't write X (storage full?). | Retry |
- **The "What went wrong" page** (critique §8):
  - one card per problem: code, sentence, one 48 dp button, time
  - grouped by device (phone, desktop)
  - newest first; a fixed problem greys out with "Fixed 14:20"
  - empty state: "Nothing wrong" with the last good sync time
- **G4:** the phone writes its last 200 events to `.margin/sync-log.phone.json`, at most once a minute and only when
  changed. The existing `single:phone **/*.phone.json` rule already syncs it one way, so I can read it on the PC.
  The hub's own log stays in journald (`journalctl --user -u bone-syncd`).
- **Clock skew** over 2 minutes shows in the sync page's details (cheap, from the hello frame).

### Tests
- Hub tests (`daemon/test`) for an Excalidraw clash → copy and no Conflicts entry.
- Kotlin fixtures for the new class.
- A phone-side check: each error code renders its card.

### Done when
- A drawing edited on both sides gives a dated copy and no conflict box.
- Every sync error has a card with a code, a sentence and a button.
- `.margin/sync-log.phone.json` appears on the PC.

---

## 9. Obsidian reminders on the phone; tasks and events done properly

### Found
**Why the phone stays quiet**
- bone-tasks rings from **inside desktop Obsidian** (`reminderTick` every 30 s). It only rings tasks **due today**
  with a `⏰` time, only while Obsidian is open, and only on the PC (`!Platform.isMobile`).
- Marrow reads a line only if it carries a tracked tag (`#school` or a subject tag; `store/obsidian.ts` `ingest`).
  Your day-plan lines (`- [ ] Plan and execute … 📅 2026-11-25 ⏰ 15:15-16:45`) never reach the phone.

**Calendar "events" are task lines.** bone-calendar's day blocks are bone-tasks lines with a date and `⏰ HH:MM`
(`bone-calendar/src/20_plan.js`). Their state is the checkbox character: `x` finished, `~` failed, `-` cancelled,
`»` forwarded (with `→ date time`). So once Marrow reads every dated task, the blocks arrive with nothing extra to
sync.

**Round-trip bugs**
| # | Bug | Where |
|---|---|---|
| B1 | `⏰ 15:15-16:45`: Marrow keeps only the start, and re-dating leaves `-16:45` dangling | `vaultTasks.ts` `setField(…'⏰'…)` |
| B2 | **Reminders freeze at the first read.** `taskFromLine` keeps `prev.reminders`, so a `⏰` added, moved or removed in Obsidian never changes what rings on the phone | `vaultMap.ts`, reminders line |
| B3 | **Recurring tasks lose their next date.** bone-tasks' tick writes the next occurrence by copying the line, **block id included**, so two lines share `^id`. Marrow keeps whichever it reads last (the done one), and the next occurrence never reaches the phone. A tick from Marrow on a `🔁` line marks it done and creates no next one. | bone-tasks `toggle()`; `vaultTasks.ts` `patchLine` |
| B4 | `~` failed and `»` forwarded blocks show as **open** in Marrow (only `x` and `-` count as closed) | `vaultMap.ts` `done` |
| B5 | A task with only `⏳ scheduled` shows as due that day. Re-dating it adds a `📅` and leaves the `⏳`, so the line has two dates. | `vaultMap.ts` `t.due ?? t.scheduled`, `diff()` |
| B6 | Marrow finds its line with `l.endsWith('^id')`, so a line with a trailing space can't be patched, and the change retries forever | `store/obsidian.ts` `pushOut` |
| B7 | `Margin/Tasks.md` lost its `margin: tasks` front matter; it works by luck | the note |
| B8 | A reminder set in Marrow has no form in the note: Obsidian can't show it, and a re-read can't restore it | grammar |

### Plan
**1. What reaches the phone (D5).** Every open task line with a `📅`, `⏳`, `⏰` or `🔔`, anywhere except
`Conflicts/`, `Templates/`, `.trash/` and `Archive/`.
- `#school` and subject tags still decide **School**: subjects, Grades, Stats.
- Everything else is **Life**. It shows in To-do and Today, and it can ring.
- Lines inside callouts and quotes stay skipped (the `> [!conflict]` lesson, S7).
- Today's task cap (§7.4, D13) should land before this, or Today grows by every Life task.

**2. No block-id spam.** Today Marrow writes a `^id` into every tracked line it reads. Done for every dated line in
the vault, that would touch hundreds of notes.
- New rule: a Life line is known by `path + a hash of its text without fields` (read-only identity).
- Marrow writes a `^id` **only when it first changes that line**: a tick, a re-date, a reminder.
- A line that moves (bone-calendar's forward, or cut and paste) is found again by the same hash.

**3. One reminder grammar, read by both apps (B8):**
```
- [ ] Lab report #Database-Systems 📅 2026-11-27 ⏰ 15:15-16:45 🔔 -1h, -10m, 07:30 ^m1a2b
```
- `⏰` is the time, or a range `HH:MM-HH:MM`, kept whole (B1).
- `🔔` is a comma list of extra rings. Each item is one of:
  - `-Nm`, `-Nh` or `-Nd`: before `⏰` (or before the due day at 09:00 when there's no time)
  - `HH:MM` on the due day
  - `YYYY-MM-DD HH:MM`
- With no `🔔`, a `⏰` rings once at that time (as today).
- `🔔` is parsed and written by `vaultTasks.ts` and by bone-tasks (its field regex and `parse`), both tested on the
  same fixture lines.
- In Marrow, the task sheet's reminder chips (0.7.6.5) write `🔔`.

**4. Re-read reminders from the line (B2).** The line wins: Marrow's reminders for a vault task always come from
`⏰` + `🔔`. A reminder edited in Marrow is written to `🔔` first, so the two can't drift.

**5. Recurrence (B3, D12):**
- bone-tasks `toggle()`: the new open occurrence gets **no** `^id` (Marrow gives it one if needed); the done line
  keeps the old one.
- Marrow ticking a `🔁` line does what bone-tasks does: a TS port of `nextRecurrence` (every day, weekday, week,
  month, year, every N units), and the next occurrence written above the done line.

**6. Statuses (B4, B5).**
- `~`, `»` and any other non-open character from `PLAN_STATUS` count as closed.
- Forwarded lines show on their new day (`→ date`).
- `⏳`-only tasks show as "planned for", not "due". Re-dating changes the `⏳` and doesn't add a `📅`.

**7. Line lookup (B6):** use `ID_RE` (trailing spaces allowed), the same regex the parser uses.

**8. `Margin/Tasks.md` (B7):** Marrow restores the `margin: tasks` front matter on its next write, keeping any
other front matter.

**9. Notifications:**
- Marrow plans every reminder (the existing `domain/reminders.ts` planner and Android exact alarms).
- Each notification has **Done** and **Snooze 10 min** as full-width 48 dp actions.
- **Done** runs natively, with no JS: `TaskTick.kt` marks the task in Marrow's database and patches the line
  (status + `✅ date`, shared fixtures with JS), then writes it through the sync engine. It reaches the PC within
  seconds when the hub is up, or on the next link otherwise.

**10. No double rings (D6).** bone-tasks reads `.margin/margin.json`. When it's fresh (< 1 day) and says
`phoneRings: true`, the desktop skips pop-ups for tasks the phone will ring. Digests stay.

**11. Calendar blocks on Today (D7).** Timed lines with a range draw as blocks in Today's timeline, between
classes, with their status. Read-only first; tapping one opens it in Obsidian. Finish and Cancel from the phone
come later if you want them.

**12. To-do gets All / School / Life (D9)** as a three-way chip in the existing filter row (the critique's point:
a second row of tabs would crowd To-do). The Tasks widget shows both, School first.

### Tests
`src/test/fixtures/vault-lines.md`: about 40 real lines from your vault, covering a range, `🔁` every week, `✅` done,
`❌` cancelled, `~` failed, `»` forwarded with `→`, `⏳` only, nested sub-tasks, a callout task, trailing spaces and
emoji variation selectors. For each line:
- parse
- patch every field
- the result is byte-identical outside the patched field
- the reminders come out as expected

Run by Jest (Marrow), by a Node test for bone-tasks, and by Kotlin (`TaskTick.kt`).

### Done when
- `- [ ] Test 📅 tomorrow ⏰ 09:00 🔔 -10m`, written on the PC, rings on the phone at 08:50 with the PC asleep.
- **Done** on the notification ticks the line on the PC within seconds while the hub is up, with Marrow closed.
- A `⏰ 15:15-16:45` line survives a re-date from the phone.
- A `🔁 every week` line ticked on either side has its next occurrence on the phone.
- Your day plan's blocks show on Today, with failed and forwarded ones not shown as open.

---

## Build order (one thing per release)

| Release | One thing | Proof |
|---|---|---|
| 0.7.7 | Splash: recording, `installSplashScreen` + `splashDone`, splash per skin, vector M, "MARROW" kicker; Metro `inlineRequires` (§6, §2 E7) | before and after recordings |
| 0.7.7.1 | Teacher's count field in all skins and every place it's used (§4) | shot set; phone at 1.4× |
| 0.7.7.2 | Lab parts: `Lecture \| Lab` switch on Grades, "Split the lab classes" with re-keyed attendance, demo seed with a lab (§3) | your real timetable fixture; DB and CP on the phone |
| 0.7.7.3 | Speed: hidden pages stay laid out (A/B) + plain `Surface` for Plain and Daylight (§2 E1–E2) | `phone-perf.sh` before and after |
| 0.7.7.4 | Speed: FlashList, deck digits leaf, styles once for hot parts, overlay cost (§2 E4–E6, E8) | same |
| 0.7.7.5 | Daylight you can see: baked skies, 0.58 panes, dark deck, Hanken, the 14 borrowings gone, on the new Skin object (§1 A) | the 14-item checklist, 4 hours × 2 modes |
| 0.7.7.6 | Every skin on the Skin object + Plain without paper, margin line, Notebook Week colours, deck headline (§1 B) | `skin-diff` + the four fixes |
| 0.7.7.7 | Glance toolchain + old widget deleted + empty widget (§5) | CI green; the widget appears in the picker |
| 0.7.7.8 | Now + Class widgets (§5) | every size on the A51 grid |
| 0.7.7.9 | Tasks widget with native tick (`TaskTick.kt`) (§5, §9.9) | a tick with the app closed changes Marrow and the note |
| 0.7.8 | Sync: Excalidraw class (G1) + error codes and the "What went wrong" page (G3) | hub test; error cards |
| 0.7.8.1 | Sync: clashes list (G2) + phone log to the vault (G4) + skew | the log file on the PC |
| 0.7.8.2 | Task lines: B1, B4, B5, B6, B7 + the fixture suite (§9) | fixtures pass in Jest and Node |
| 0.7.8.3 | All dated tasks reach the phone; All / School / Life; no block-id spam (§9.1, 9.2, 9.12) | a Life task from a daily note shows |
| 0.7.8.4 | `🔔` grammar in both apps; reminders follow the line; notification Done / Snooze native; no double rings (§9.3, 9.4, 9.9, 9.10, B2, B8) | the 08:50 test |
| 0.7.8.5 | Recurrence both ways (B3) + calendar blocks on Today (§9.5, 9.11) | `🔁` test; day plan on Today |

E3 (paper edges, D2) slots in after 0.7.7.6, once you've picked. The §7 items are a queue you pick from; I'd put
**touch targets** and **attendance undo** first, and the **Today cap** before 0.7.8.3.

## Risks
- **Glance needs the Compose compiler in Gradle** (CI only). If CI fights it: `react-native-android-widget` with the
  same designs.
- **E1 costs memory.** Shipped only if the A51 shows < +40 MB PSS.
- **Baked skies add ~1.8 MB** (12 × 150 KB) to the app. They can be dropped to 6 (light only, darkened in code) if
  that matters.
- **Every dated task reaching the phone** may mean many rings. D5 and D6 decide the filter; Life tasks without `⏰`
  or `🔔` never ring.
- **Native `TaskTick.kt` and JS `patchLine` must agree.** Shared fixtures in CI are the guard.
- **The splash "dot" isn't confirmed.** The fix in §6 removes every candidate anyway.
- **Splitting lab classes rewrites attendance keys.** It has its own test and an undo, and it never runs without
  your tap.
- **The critique was done on web, not the A51.** Font metrics, shadows and the splash can differ. Each release is
  checked on the phone.

## Decisions for you
- **D1** Daylight's accent follows the sky (my pick; never amber, which stays for "now"), or uses your pen colour?
- **D2** Paper skins' hand-cut edges: (a) cached SVG (simpler; my pick for now) or (b) native Kotlin drawing
  (fastest, more work)?
- **D3** Widgets in your app skin (my pick), with a "Match my phone (Material You)" option, or skin only?
- **D4** Keep a "Replaced" stub of the old widget for one release (my pick), or delete it outright?
- **D5** Which Obsidian tasks reach the phone: every open task with a date, time or `🔔` (my pick), only ones with
  `⏰`/`🔔`, or only tracked tags as today?
- **D6** When the phone rings a task, should the desktop stay quiet for it (my pick), or ring too?
- **D7** Calendar blocks on the phone: read-only (my pick) or Finish/Cancel from the phone?
- **D8** Clear the 286 KB `Conflicts/2026-11-23.md` once the Excalidraw fix ships?
- **D9** To-do filter: All / School / Life as a chip in the existing row (my pick), or tabs?
- **D10** Wireless debugging on when I start 0.7.7 (splash) and 0.7.7.3 (speed)? Both need the A51.
- **D11** "Split the lab classes": offer it (my pick), or should I just split Computer Programming's LAB301 classes
  for you (with the attendance re-keyed)?
- **D12** Ticking a `🔁` task from the phone creates the next occurrence (my pick), or leave recurrence to Obsidian?
- **D13** Today: cap at 3 tasks + "All tasks (n)" (my pick), or keep the full list?
- **D14** Notebook refined and original: merge into one skin (my pick), or keep both and make them differ in shape?
