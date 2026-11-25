# v0.7.7 build progress

Branch `marrow` (from `marrow-overhaul`). Owner's call 2026-11-25: build the whole spec in order, take every pick in
D1–D14, Marrow is its own app (`app.marrow`). Kotlin compiles in CI only; phone checks are listed per release for
the owner (no phone was on adb during the build).

| Release | State | Phone check for the owner |
|---|---|---|
| rename | done: `app.marrow`, `marrow://` | installs beside the old Margin; import an export to move data |
| 0.7.7 | done: splash held to first frame (2 s failsafe), one splash per skin (API 33), vector M, MARROW, inlineRequires, lazy pages | `tools/phone-perf.sh record before/after` with Collage and Daylight, light and dark |
