# v0.7.6 and the v0.7.6.x run (overnight 2026-11-25)

Owner's ask (2026-11-25, asleep, "auto ask and implement"): speed, the widget, the Nov 24 / Margin-note list, rename,
then keep iterating in v0.7.6.x steps, one thing per step, until it is good enough to ship.

Wireless adb was off all night (it resets on reboot), so nothing here was seen on the phone. Speed was measured in
Node with the real shell (`PERF=1 npx jest perf-profile`); Kotlin was compiled in CI only.

## 0.7.6 (version code 12)
- **Speed.** Hidden pages no longer re-render. A tab switch re-rendered both whole pages (the "is this page on screen"
  flag was a context value), a skin change re-skinned all five mounted pages, and every store write re-rendered every
  page reading that slice. Now: focus is a stable store flipped after paint (`ui/live.ts`: `useScreenLive`,
  `useLiveNow`), a hidden page holds its skin (`ThemeHold`) and its data (`StoreHold` in `useStore`) until shown.

  | JS render, Node | before | after |
  |---|---|---|
  | revisit a tab | 70–100 ms | 5–11 ms |
  | change skin | 165–320 ms | 32–42 ms |
  | tick a task | 48–100 ms | 11–20 ms |
- **Widget.** Today's class card: the deck slab in the skin's colours and hatch, state pill, room, typewriter countdown,
  marker title, a drawn gauge (`Gauge.kt`), at most two tasks (late first, then due time pulled earlier by priority).
  4×2 default, 4×1 = class only, capped at about two rows. Plain skin: one grotesque (`tools/widget-layouts.py`).
- **Reminders.** A class marked ahead of time or by a whole-day mark gets no reminders; reminders already in the
  shade for a done task or a marked class are dismissed on the next plan.

### Check on the phone (0.7.6)
1. Switch tabs fast for 10 s: no hitch; Grades/Stats show at once. Change skin in Settings: under ~0.3 s.
2. Tick a task on To-do, go to Today: Today already shows it done.
3. Widget: remove and re-add it (new size rules). 4×2 shows class + 2 tasks; shrink to 4×1. Switch skin/dark: the
   widget follows. Plain skin: one font. Tap a tick box: task done after opening the app.
4. Mark a whole day absent before class: no "in 10 min" / "just ended". Finish a task whose reminder is in the
   shade: it disappears within a second or two.

## Next steps, one per release (v0.7.6.x)
1. Rename the app (display name only; vault paths stay) → **Marrow** (inside the Bone vault, keeps the M icon).
2. Stats page: fewer words.
3. Daylight cards refined.
4. Old grades with credit hours → GPA.
5. Several reminders per task, any offset (1 h before, 10 min left…).
6. Lab/tutorial parts as their own attendance/stats under one subject.
7. Add-task sheet decluttered.
8. Mascot used more, and usefully.

Not tonight (needs the owner or the phone): cold start after reboot (native), desktop daemon autostart, the
"from phone" merge box, Obsidian ⇄ Margin school folder linking.
