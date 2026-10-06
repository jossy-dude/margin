# HANDOFF — A5 (CARD): two shared-file changes I could not make

`src/tokens/theme.ts`, `src/domain/attendance.ts`, `src/screens/Focus.tsx`, `src/ui/DayBar.tsx` and
`src/ui/instruments/**` are not mine (`qa/COORDINATION.md` §2). Both patches below are written out in
full so the orchestrator can apply them serially. Nothing here is required for my work to compile or
pass — the card ships and `npm run check` is green without either. They are the two gaps that cannot be
closed from inside the files I own.

---

## BLOCKED ON SHARED FILE: `src/tokens/theme.ts` — the deck does not invert in dark

### Why

The reference re-points its own tokens so the card inverts against the page
(`/home/jossy/Downloads/marginalia-v10(1).html`, `.dk`):

```css
.dk{--ink:var(--p0);--paper:var(--i0);--card:var(--i0);color:var(--p0)}
```

`--i0` is its ink token and `--p0` its paper token, so the deck's fill is **ink** and its text is
**paper** — in light that is a near-black slab with cream text, in dark a cream slip with near-black
text. The card is always the highest-contrast object on the page. Measured:

| | deck vs. the page behind it |
|---|---|
| reference, light | black on cream — maximal |
| reference, dark | `#F2EAD8` on `#2B2620` = **12.52:1** |
| app today, light | `#2F2920` on `#FAF4E6` = **13.12:1** ✓ |
| app today, dark | `#1F1B16` on `#2B2620` = **1.14:1** ✗ |

Light is right. In dark, `c.slab` (`#1F1B16`) is *darker* than the page it sits on, so the card stops
being an object at all and only its content describes it. That is the one visible way the card is
still short of the design of record.

### Why I did not simply fix `slab`

`c.slab` / `c.slabInk` are not only mine:

- `src/screens/Focus.tsx:118` — `const bed = dark ? c.slab : c.desk` (A3's bed)
- `src/sheets/Settings.tsx:351-356` — the bar-kind picker chips and their live previews (A6's sheet)
- `src/test/bars.test.ts:373-383` — contrast assertions *measured on the command-deck slab*

Changing `slab` would move Focus's bed and re-base another agent's contrast tests. It also edits an
existing palette's values, which `COORDINATION.md` §4 forbids me from doing. So: a new token pair, and
`slab` left exactly as it is.

### The patch

`src/tokens/theme.ts`, in `interface Colors`, immediately after `slabMut: string;`:

```ts
  /**
   * The command deck's own surface. `slab` is the ink bed Focus and the bar picker's chips sit on; this
   * is the one card that INVERTS against the page — `marginalia-v10(1).html`'s `.dk` re-points `--card`
   * and `--ink` at each other, so the deck is the theme's INK in light and its PAPER-bright in dark.
   * In light these are the values `slab`/`slabInk` already carry, so the light card does not move at
   * all; only dark does, from a 1.14:1 surface to 12.52:1.
   */
  deck: string; deckInk: string; deckMut: string;
```

Then three values per palette object, next to the existing `slab` values:

```ts
// REFINED.light  — identical to today's slab pair, so the light card is unchanged
deck: '#2A241C', deckInk: '#FAF4E6', deckMut: '#D9CDB4',
// REFINED.dark   — the inversion
deck: '#F2EAD8', deckInk: '#2B2620', deckMut: '#665B4B',
// ORIGINAL.light — identical to today's slab pair
deck: '#26201C', deckInk: '#FAF5EB', deckMut: '#C9C3BA',
// ORIGINAL.dark  — the inversion
deck: '#E7E4DC', deckInk: '#10141A', deckMut: '#57514C',
```

Contrast, all four combinations, every one over the 4.5:1 body floor:

| palette | `deckInk` on `deck` | `deckMut` on `deck` |
|---|---|---|
| refined light | 14.00:1 | 9.76:1 |
| refined dark | 12.52:1 | 5.54:1 |
| original light | 14.80:1 | 9.19:1 |
| original dark | 14.54:1 | 6.15:1 |

Note for whoever applies this: this **adds** a token, it does not add a palette, so
`android/app/src/main/res/values-night/colors.xml` does not need touching (`COORDINATION.md` §4 only
calls for that when the dark palette itself changes).

### Then, in `src/screens/Today.tsx` (my file — I can do this the moment the token exists)

In `ActiveCard`, replace the six `c.slab` / `c.slabInk` / `c.slabMut` reads with `c.deck` /
`c.deckInk` / `c.deckMut`, and the two source assertions in `src/test/card.test.ts` that pin them:

```diff
-    <HandBox seed="deck" fill={c.slab} stroke={c.slab} sw={2} amp={1.1}
+    <HandBox seed="deck" fill={c.deck} stroke={c.deck} sw={2} amp={1.1}
-      <SlabHatch ink={c.slabInk} />
+      <SlabHatch ink={c.deckInk} />
-            <HandBox seed={`deck-pill-${d.word}`} fill={c.slabInk} stroke={c.slabInk} …
+            <HandBox seed={`deck-pill-${d.word}`} fill={c.deckInk} stroke={c.deckInk} …
-          <Txt f="bold" s={22} c={c.slab} …
+          <Txt f="bold" s={22} c={c.deck} …
```
…plus the pill, room ring, room code, title, countdown, unit, `DayBar ink`/`bg` and the `After` row's
two colours, and in the test `expect(src).toContain('ink={c.slabInk} bg={c.slab}')` →
`expect(src).toContain('ink={c.deckInk} bg={c.deck}')`.

**Alternative, if the orchestrator would rather not add tokens:** re-point `REFINED.dark.slab` to
`'#F2EAD8'` and `slabInk` to `'#2B2620'` (and the same for ORIGINAL). That is a two-value edit and it
is exactly what the reference does — but it moves Focus's bed and re-bases `bars.test.ts`, so it is a
decision for the orchestrator, not for me.

---

## BLOCKED ON SHARED FILE: `src/domain/attendance.ts` — an overnight class is not a class

### Why

`atTime(day, t)` stamps a time on the day it is given, so a meeting stored `23:30`–`00:30` comes out of
`periodsOn` with `end < start`. Every consumer downstream assumes otherwise:

- `dayBlock` — `cur` is `now >= start && now < end`, which is never true, and `next` is
  `start > now`, which is false from 23:30 onward. Both are `undefined`.
- `activePeriod` (`src/ui/instruments/time.ts:41`) — `live()` filters `p.end > p.start`, so the class is
  dropped from the card and from all 22 instruments.
- `Week.tsx:64` — `h = (hm(meeting.end) - hm(meeting.start)) * PX` goes negative and is caught by
  `Math.max(20, h - 2)` on line 67, so the week grid draws a 20 dp stub.

`Today.tsx` defends itself with a card-local `overMidnight`, and `src/test/card.test.ts` asserts both
that the defect is real (`periodsOn` really does hand back `end < start`) and that the guard fixes it.
That guard is a patch over a hole in the domain, and it only protects the card. The fix belongs here.

### The patch

Add `DAY_MS` to the existing import on line 2, then replace the body of `periodsOn`:

```diff
-import { atTime, hm, selectedDay, startOfDay, weekdayOf, ymd } from './time';
+import { DAY_MS, atTime, hm, selectedDay, startOfDay, weekdayOf, ymd } from './time';
```

```diff
 export function periodsOn(occ: Occurrence[], courses: Course[], att: Record<string, AttRecord>, days: Record<string, DayMark>, now = Date.now()): Period[] {
-  return occ.map(({ date, meeting }) => ({ start: atTime(date.getTime(), meeting.start), end: atTime(date.getTime(), meeting.end), label: courses.find((c) => c.id === meeting.courseId)?.name ?? '?', cancelled: isCancelled(effective(date, meeting, att, days, now)) }));
+  return occ.map(({ date, meeting }) => {
+    const start = atTime(date.getTime(), meeting.start), end = atTime(date.getTime(), meeting.end);
+    return {
+      start,
+      /* A class stored 23:30–00:30 has BOTH ends stamped on the day it occurs, by `atTime`, so it comes
+         out with `end <= start` — and every consumer assumes `start < end`: `dayBlock`'s `cur`/`next` can
+         never match it, `activePeriod` filters it out of the card and all twenty-two instruments, and
+         Week clamps it to a 20 dp stub. An overnight class ends on the NEXT day; say so here, once,
+         rather than patching it in every view that reads a period. */
+      end: end > start ? end : end + DAY_MS,
+      label: courses.find((c) => c.id === meeting.courseId)?.name ?? '?',
+      cancelled: isCancelled(effective(date, meeting, att, days, now)),
+    };
+  });
 }
```

Then `src/screens/Today.tsx` can drop its local guard:

```diff
-const overMidnight = (p: Period): Period => (p.end > p.start ? p : { ...p, end: p.end + DAY_MS });
```
…replacing `{ p: overMidnight(p), i }` with `{ p, i }` in `deckOf`, and `src/test/card.test.ts` should
be repointed at `periodsOn` for that assertion instead of asserting the guard's text.

### What this patch does NOT fix

`Week.tsx:64` computes its block height from the raw `hm()` strings rather than from `Period`, so the
`periodsOn` patch above does not reach it: the week grid still needs the same treatment in its own
minutes arithmetic. `Week.tsx` is A-week's or the orchestrator's file, not mine, and I have not
touched it.

---

## BLOCKED ON SHARED FILE: `src/screens/Week.tsx` — the overnight stub (same root cause)

Not a patch, just the finding, so it is not re-derived: `h = (hm(meeting.end) - hm(meeting.start)) * PX`
is negative for an overnight class and `Math.max(20, h - 2)` hides it as a 20 dp block sitting at the
top of the column instead of one that runs over the bottom. It needs the same `end > start ? … : +DAY`
treatment, in `Week`'s own minutes arithmetic.

---

## Found, not mine, not fixed

1. **`DayBar`'s `Spines` — the class letter is drawn in the colour of the fill it may be sitting on.**
   `DayBar.tsx:100` fills the letter `ink` whenever the period is under half done
   (`f > 0.5 ? bg : ink`), and `DayBar.tsx:98` fills the lower part of that spine with the same `ink` at
   0.9 opacity. So for the whole first half of a class the initial is pure `ink` drawn over 90% `ink` —
   the two differ only by the 10% of slab showing through, which is not a difference you can read.
   Caught in `/tmp/render/a5/A5-after-live.png` at 09:24 of a 50-minute class. A2's file; one-token fix
   (`fill={f > 0.5 ? bg : hexA(ink, 1)}` does not help — it wants the letter knocked out of the fill, or
   the fill lightened under the letter).

2. **`DayBar` on a day that is in the past draws an empty bar.** `activePeriod` returns `phase: 'over'`,
   `p: 0` for every period of a past day, so picking a past day in the strip empties the bar under a card
   that is simultaneously saying "First class · 09:00". Pre-existing, unchanged by me, A2's semantics.

3. **`prompt.md` V10h and this work disagree, mildly.** V10h actually reads "the Today header shows
   nothing about it: record whether the user needs a running-timer indicator", and R4 records the
   indicator as unbuilt. The brief for A5 and audit A7 both ask for it, and `Tasks.tsx` already mounts
   it as the first child of `Page`, so Today now does the same. If the orchestrator reads V10h
   literally, this is the line to change — it is one line in `Today.tsx` plus one import.

4. **The class name now appears twice on Today, about 120 px apart** — once in the masthead
   (`Today.tsx:212-214`, "In class / <name> / until 09:50") and once on the card, which is where the
   reference puts it. The reference has no such duplication because its masthead carries only the
   greeting, the date and the clock. This is the one visible consequence of adding the card, and it is
   not mine to resolve: trimming the masthead is existing copy and information architecture, which
   `COORDINATION.md` §3 puts off limits. The owner's call, and if they want it gone it is this, in
   `Today.tsx`:

   ```diff
   -          <Txt f="serif" s={15} c="mut">{cur ? 'In class' : next ? 'Next up' : todayPeriods.length ? 'All done for today' : 'No classes today'}</Txt>
   -          <Txt f="marker" s={23} numberOfLines={2}>{cur?.label ?? next?.label ?? (todayPeriods.length ? 'Nice work' : 'Free day')}</Txt>
   -          {(cur ?? next) && <Txt f="bold" s={19} c="mut">{cur ? `until ${fmtTime(cur.end)}` : `at ${fmtTime(next!.start)} · ${relDue(next!.start, now)}`}</Txt>}
   ```
   …leaving the clock and its `flex: 1` column. I would not do it unasked: it removes the app's own
   words and changes what the first screen says.
