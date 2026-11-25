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
