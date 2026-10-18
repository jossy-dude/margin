# v0.2 plan — five fixes from Jossy's device session (2026-10-19)

> Scope rule honoured: v0.2 = these five fixes, nothing else. The touches, v2 features and visual
> polish below are PLANS ONLY — explicitly not to be built in this slice.

## U1 — Steppers that hold big numbers become tap-to-type
- **Problem:** grade goal/score/weight are `Stepper` 0–100 step 1; the custom reminder lead is 5–10080
  step 5 (~2000 taps for a week). "Using + icon above 10 is a crime."
- **Fix:** `src/ui/kit.tsx` `Stepper` — the centre value becomes a Pressable; tapping swaps the `Txt`
  for a `TextInput` (`keyboardType="numeric"`), commit on submit/blur: parse, clamp to [min,max],
  `onChange`. −/+ buttons stay for ±1 nudges. One change fixes goal, score, weight, lead, effort,
  meeting start/end — every stepper in the app.
- **Test:** `instant-actions.test.ts` pattern — mount Stepper, press value, type "85", submit →
  onChange(85); "500" with max 120 → onChange(120); blur commits too; empty/garbage reverts to old value.

## U2 — Room is asked when adding a class, not a subject
- **Problem:** `CourseSheet` asks Room; room belongs to the schedule (same subject can run in
  different rooms).
- **Fix:** drop Room from `CourseSheet`; `Meeting` gains `room?: string` (`types.ts`), spec field +
  `ALTER TABLE meeting ADD COLUMN room TEXT` migration (`specs.ts`); `MeetingSheet` gains
  `Field label="Room"`. Displays prefer the meeting's room, fall back to `course.room` (old data):
  Today (current + next class lines), Week cell, `reminders.ts` class notification, `export.ts`
  timetable column. Grades sub-line keeps `course.room` (course-level view).
- **Test:** source contracts on specs/forms; a render test that MeetingSheet saves `room` through
  `act.saveMeeting`.

## U3 — Delete is findable, and every entity has one
- **Problem:** course delete EXISTS (trash in the edit footer) but reads as missing — icon-only ghost
  button next to Save. "I wrote 'economic' instead of 'introduction to economic' and can't delete it."
  Audit: focus sessions have no delete at all.
- **Fix:** footer trash becomes labelled `Btn kind="ghost" icon="trash" label="Delete"`.
  Store gains `removeFocus(id)` (undo toast, same shape as `removeMark`).
- **Test:** render assert the course footer carries a labelled Delete; removeFocus undo test.

## U4 — The Fit hint stops overlapping the fields below it
- **Problem (his screenshot):** `Fit` renders two crossfading `HandBox`es `position:absolute` (zero
  layout height), so "Latest start" and "Remind me" flow underneath them.
- **Fix:** keep the absolute crossfade; add an in-flow invisible twin of the comfortable box
  (`opacity: 0`, `pointerEvents="none"`, `importantForAccessibility="no-hide-descendants"`) that
  reserves the height. Content below flows after the box.
- **Test:** source contract — Fit carries the reserving twin and the absolute pair sits inside the
  same wrapper.

## U5 — Ship
- `npm run check` green; commit per fix; app.json + build.gradle version → 0.2.0; push; tag `v0.2`
  → GitHub builds the release APK (never locally — standing rule).

---

## PLANNED, NOT BUILT (v0.3 candidates)

### Minor voice touches ("still up ✌️😑")
- `src/domain/voice.ts`: pure `(hour, context) → { line, hint }` table-driven module; contexts:
  open-Today late night (23:30–04:30), very early morning, post-round-done, empty-Today-on-Sunday.
  Each line is fun AND helpful (points at a real action: "the reminder's set for 7:00 — go"). Shows
  once per open in the Today sub-line slot; never blocks, never toasts, respects quiet hours.
- Testable with a table: 24 rows, snapshot the strings.

### v2 research (plan only)
- **Transport tracker:** commute times feed the "latest start" calculation (`workload`/`Fit`) —
  "it takes ~35 min to campus" moves `startBy` automatically. Research: manual per-trip log vs
  geofence auto-log; storage (new `trip` entity already exists in the schema!); battery/permission cost.
- **Desktop view:** expo web build exists for dev; a real responsive layout (two-pane Today/Week)
  is a layout pass, not a rewrite. Research: which screens survive at 1200px first.

### If asked to run `impeccable` for visual polish — the plan
1. Capture every screen, light + dark, on a 390px viewport (user-tester/vision-critic).
2. Audit against the aesthetic spine: paper/ink hierarchy, spacing rhythm, type scale collisions,
   contrast fails, empty states, motion restraint.
3. Fix per screen, one `loop+` slice at a time, screenshot-verified, full check gate each step.
4. Deliver a diff report: what changed and why, per screen.
