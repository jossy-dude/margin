# v0.1 slice plan — approved design (Option A + 25% clock shrink)

Approved in chat 2026-10-18. One shippable slice: exactly the five complaints + compile. No extra features.

## S1 — Reset erases everything (no demo re-seed)
- RED: rev.test.ts — resetAll leaves planner EMPTY (no demo re-seed), re-opens via openRepository, toast says erased; wipe() contract on both adapters. ✅ `caca4cc`
- GREEN: `Repository.wipe()` (rows gone; sqlite also deletes db file + WAL/SHM via closeAsync + deleteDatabaseAsync), store.resetAll uses it, Fatal screen + Settings copy. ✅

## S2 — Demo session lives in memory, never in the real DB
- ✅ `43d280a` — boot() seeds a MemoryRepository on a true first run; adopt writes only user-made rows to the real DB on either exit ("Get started" also drops the samples on screen); OS notifications never planned while the session is demo-only. Coach finale: "Get started" primary + "Keep exploring" ghost. Spec: `src/test/demo-session.test.ts` (7 tests); full check 871 green.

## S3 — Focus dial: 25% smaller + dark-mode grain fix
- ✅ `e098d28` — SHRINK=0.75, dial re-hung from (217,491); pointer drawn in the 282-unit frame, scaled by viewBox. Dark scrim 0.9, lift 0.05, faceOp 0.95 dark / 0.86 light. Spec: `src/test/dial-shrink.test.ts`; suppressions verdicts re-pointed at the surviving directives.

## S4 — Version + full check
- ✅ `060242e` — app.json + android versionName → 0.1.0; npm run check green.

## S5 — Compile (v0.1)
- ✅ Builds happen IN GITHUB, not locally (Jossy's instruction, 2026-10-18: "never locally"). Branch v2-improvements + tag v0.1 pushed; workflow run 39166911292 **success** — but the v0.1 APK was an `assembleDebug` build, i.e. a **dev client**: it booted Expo's "start a server" screen. Re-tagged `v0.1` on `0f69520` (workflow switched to `assembleRelease`, JS bundled in the APK) — the release APK is the deliverable, not the dev client. README corrected.
