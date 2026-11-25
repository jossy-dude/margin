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
