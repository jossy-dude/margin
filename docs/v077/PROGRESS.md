# v0.7.7 build progress

Branch `marrow` (from `marrow-overhaul`). Owner's call 2026-11-25: build the whole spec in order, take every pick in
D1–D14, Marrow is its own app (`app.marrow`). Kotlin compiles in CI only; phone checks are listed per release for
the owner (no phone was on adb during the build).

| Release | State | Phone check for the owner |
|---|---|---|
| rename | done: `app.marrow`, `marrow://` | installs beside the old Margin; import an export to move data |
| 0.7.7 | done: splash held to first frame (2 s failsafe), one splash per skin (API 33), vector M, MARROW, inlineRequires, lazy pages | `tools/phone-perf.sh record before/after` with Collage and Daylight, light and dark |
| 0.7.7.1 | done: `num` numeral face per look, 12 dp inside, centred or against the unit, width from the longest value, teacher row never wraps | Grades teacher's count, GPA credits, curve, Settings lead times at default and 1.4× text |
| 0.7.7.2 | done: `partsOf`, `Lecture \| Lab` switch with both %, lab dots, per-part goal line and teacher's count, "LAB301 looks like a lab" Split/No with re-keyed attendance and 10 s undo, Lab labels on Today/Week/widget, Mark day says "marks Lecture and Lab", demo DB has a lab; import now keeps a part's kind/share/goal | DB shows Lecture \| Lab; tap Split on Computer Programming, check every LAB301 mark is still there; tick a lab cell, the Lecture % stays |
| 0.7.7.3 | done: E1 Diagnostics → "Speed test: hidden pages" (Rebuild on visit = default / Keep laid out = opacity 0), E2 Daylight glass cards no longer measure themselves (one render, edge on the first frame; lift only where the caller asks) | run `tools/phone-perf.sh all drop`, switch to Keep laid out, restart, `tools/phone-perf.sh all keep`; keep it on only if TOTAL PSS grows < 40 MB |
| 0.7.7.4 | done: E4 To-do virtualised (RN FlatList, not FlashList: no new dependency, ~12 rows mounted, Show more grows the data), E5 deck card follows the minute and only `TickingCountdown`/`StartCircle` tick at 1 Hz, E6 Txt styles cached per skin+size, E8 profile shows a tab switch re-renders neither the + button nor the overlay | `tools/phone-perf.sh tour after-0774`: janky frames on the tab tour vs 0.7.7.2; scroll To-do with many tasks |
| 0.7.7.5 | done: Skin object (`tokens/skins`), Daylight skin; 12 baked skies (`tools/sky.mjs`, 5–7 KB each); panes 0.62–0.84 light / 0.42–0.58 dark per sky (the lowest that holds 4.5:1 on pixels), accent per sky, Hanken everywhere; ring clock in the deck, capsule bar, round checks, capsule tags, no header mascot, pane Add tiles, box fields, overdue bar, Week panes, Settings/Notices/Subjects on glass with actions, opaque glass sheet + tinted scrim + spring | the 14-item list on the A51 in light and dark at 07, 12, 18, 22 |

## Owner's new asks (2026-11-26), queued after the spec's build order, each its own release
1. **Alarm as a real alarm**: only Volume Down stops it (Volume Up must not); a touch-first alarm setup page.
2. **Touch-first UI overhaul** (/impeccable, UI engineering, frontend design): every sheet (task, subject, mark, Add, alarm) rebuilt mobile-native for big fingers: fewer fields per screen, 48 dp targets, no crowding; less text, more icons and compact layout everywhere.
3. **Settings long pages** (Data & export) open at the top, not scrolled to the bottom; pages compact and less wordy.
4. **App icon**: a better icon, plus Settings → icon choice (or follow the skin) via Android activity-aliases.
5. **Mascot everywhere**: more places, reactions and animations so the app feels alive (research mascot patterns first).
6. **Widget previews inside the app**: see each widget before adding it (with the Glance widgets, 0.7.7.7–.9).
7. **Onboarding rebuilt**: the theme picker gives every skin its own proper scene, not just Collage.
8. **Roman numerals on the clock faces**: short, compact, minimal.
9. **Notice board ↔ Obsidian calendar**: Marrow's notices on bone-calendar's month view as a board; active classes and notifications sent to Obsidian too.
10. Lab/lecture split attendance and grades: done in 0.7.7.2 (Lecture | Lab switch, per-part teacher's count; grades already weight parts).
