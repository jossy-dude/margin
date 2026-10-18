import React, { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { ClockFace } from '../ui/clock/ClockFace';
import { DayBar, type AnyBarKind } from '../ui/DayBar';
import { Btn, HandBox, HStrip, Icon, Tape, Txt } from '../ui/kit';
import { handPath } from '../ui/hand';
import { RunningTimer } from '../ui/RunningTimer';
import { useNow, useTheme } from '../ui/theme-context';
import { useScreenLive } from '../ui/live';
import { act, useStore } from '../store/store';
import { Empty, Page, Section, STATUS_GLYPH, TaskCard, statusColor, nextWhen, spokenStatus } from './common';
import { DW, MO, addDays, atTime, fmtClock, fmtDay, fmtTime, mondayOf, startOfDay, weekdayOf, ymd } from '../domain/time';
import { effective, dayBlock, isCancelled, occEnd, occKey, occurrencesOn, ST, type Occurrence, type Period } from '../domain/attendance';
import { hexA, RS } from '../tokens/theme';
import { hatch } from '../ui/instruments/hatch';
import { FS } from '../ui/fit';
import type { Course } from '../domain/types';

/* ── the command deck ─────────────────────────────────────────────────────
   `deck()` in the design of record (`marginalia-v10(1).html`, line 236),
   rebuilt on this app's own primitives. Every row below is one of its rows, in its order: state
   word and room, subject, countdown, progress bar, what is next. Nothing added, nothing reordered,
   nothing moved out of the slab the app already had. `qa/CARD-GAP.md` carries the line-by-line
   comparison, and the three things the reference does that are deliberately NOT copied: the 2.5px ink
   rim, which is invisible against its own fill in the reference too (checked at 500%) and would be a
   divergence here; the 16%-opacity tape, which this app's solid `Tape` cannot be without becoming
   louder than the reference's; and the title's `1.05` leading, which `Txt`'s own `1.25` replaces
   because a fixed tighter leading collides with itself at the 1.3x font scale the layout has to survive.

   The reference's `.dk` re-points its own tokens so the card inverts against the page — near-black
   with cream text in light, cream with near-black text in dark. `c.deck` is this app's command-deck
   token (`c.deck`/`c.deckInk`/`c.deckMut`, see `tokens/theme.ts`) and `DayBar` already draws `ink`
   on `bg` for exactly this surface, so that is the card. */

/** The reference's `.dk{padding:15px 16px 14px}`, and `.bar{height:48px}`. Both are named so the bar's
 *  width is derived from the padding instead of repeating `28` and drifting a pixel away from it. */
const DECK_PAD_X = 16;
const DECK_BAR_H = 48;
/* The masthead clock. It used to be 124 and sit alone above the deck; it is now taped to the card's
 *  top-left corner, so its size is a named constant the card's `headPad` is derived from.
 *  92 was too small to read at a glance — squinting at a masthead clock is a failed size — so it grew
 *  (92 → 115). Everything the face draws is generated at `size` (`k = size / 200` in `ClockFace.tsx`),
 *  so this scales strokes and numerals too, not just the box; `headPad` below follows it. */
const CLOCK = 115;

/* An overnight class (23:30–00:30) has both ends stamped on the day it occurs, so it arrives here with
 *  `end <= start` and disappears — `activePeriod` drops any period whose end is not after its start, and
 *  the card would show no class at all in the one hour it is genuinely running. `periodsOn` now pushes
 *  the end into the next day, once, in the domain, so nothing in this file re-opens the period and the
 *  other two views that read a Period stop being wrong separately. */

export type DeckState = 'live' | 'soon' | 'first' | 'rest';

export interface Deck {
  state: DeckState;
  /** the class the card is about, or null when the selected day has nothing ahead on it */
  period: Period | null;
  /** the word on the pill */
  word: string;
  /** what the digits say */
  countdown: string;
  /** the unit beside the digits */
  unit: string;
  /** where in the day this class sits, in the words the app already used here */
  position: string;
  /** index into the `periods`/`occ` pair `dayBlock` returns, or -1 */
  at: number;
  /** how many classes the day is counting, cancelled ones excluded */
  total: number;
}

/**
 * The card's whole derivation, from real clock time. Pure, and the four states are the reference's:
 * inside a class, in the gap before one, a day that is not today, and a day with nothing on it.
 *
 * `isToday` is what separates them: the reference only ever runs its clock for the day it is showing
 * (`it = sel == tdi`), and on any other day it falls back to naming the first class and printing its
 * *window* — `start–end` — instead of a countdown. A day you are only looking at has no "now" to count
 * down to, so the two things worth knowing are when the class runs and how long it is; the bare start
 * time it used to print threw away the second one.
 *
 * `h12` is the user's 12/24-hour choice, passed in so this stays a pure function (`domain/` owns no
 * store) and pinned by `src/test/time-format.test.ts`.
 */
export function deckOf(periods: Period[], t: number, isToday: boolean, h12 = false): Deck {
  // `Period.end` is already correct for an overnight class (see `periodsOn`), so this is index-for-index
  // with the `occ` list `dayBlock` builds, which is what lets the card find the same class in both.
  const ps = periods.map((p, i) => ({ p, i })).filter((x) => !x.p.cancelled);
  const cur = isToday ? ps.find((x) => t >= x.p.start && t < x.p.end) : undefined;
  const next = isToday ? ps.find((x) => x.p.start > t) : ps[0];
  const hit = cur ?? next;
  const period = hit ? hit.p : null;
  const target = cur ? cur.p.end : next ? next.p.start : null;
  const state: DeckState = cur ? 'live' : next ? (isToday ? 'soon' : 'first') : 'rest';
  const at = hit ? hit.i : -1;
  return {
    state, period, at, total: ps.length,
    word: cur ? 'Now' : next ? (isToday ? 'Next up' : 'First class') : 'Rest day',
    countdown: target === null || !period ? '--:--' : isToday ? fmtClock((target - t) / 1000) : `${fmtTime(period.start, h12)}–${fmtTime(period.end, h12)}`,
    /* The reference's `lb` is only ever overwritten when there is a class to point at: with nothing
       on, `cn` and `lb` keep their opening values and it reads `--:--  nothing on`, not a countdown
       with a unit borrowed from a state that is not happening. */
    unit: cur ? 'min left' : next ? (isToday ? 'until it starts' : 'first bell') : 'nothing on',
    position: !period ? (ps.length ? 'Day complete' : 'No classes')
      : state === 'soon' ? `${ps.length - at} of ${ps.length} left` : `Period ${at + 1} of ${ps.length}`,
  };
}

/** The reference's `.dk::before` texture: a 45° hatch at 8% ink, drawn as clipped geometry with A2's
 *  own `hatch()` rather than an SVG `<Pattern>`, so two cards in one tree cannot collide on an
 *  element name (the reason `Spines` was redrawn the same way).
 *
 *  `7`, not `5`: `hatch()` advances `d` along x while the line itself runs corner to corner at 45°,
 *  so the pitch you SEE is `step / √2`. The reference's gradient is `1px` lines every `5px` measured
 *  across the lines, which is `7.07` here. At `5` the pitch comes out at 3.5 px and the slab reads as
 *  corduroy rather than as tooth — caught by rendering it beside the reference, not by reading it. */
const HATCH_STEP = 7;

function SlabHatch({ ink }: { ink: string }) {
  const [sz, setSz] = useState({ w: 0, h: 0 });
  return (
    <View pointerEvents="none" onLayout={(e) => { const { width, height } = e.nativeEvent.layout; if (Math.abs(width - sz.w) > 0.5 || Math.abs(height - sz.h) > 0.5) setSz({ w: width, h: height }); }} style={StyleSheet.absoluteFill}>
      {sz.w > 0 && <Svg width={sz.w} height={sz.h} style={StyleSheet.absoluteFill}>
        {hatch(0, 0, sz.w, sz.h, HATCH_STEP).map((g, i) => <Line key={i} {...g} stroke={ink} strokeWidth={1} strokeOpacity={0.09} />)}
      </Svg>}
    </View>
  );
}

/** Both countdown presentations live in one 96-high slot: the disc while the class is coming, the
 *  digits once it is here — so the bell never changes the card's height and never walks the day
 *  strip or the list under it. The disc is the break sticker's own geometry (Focus.tsx BreakSticker):
 *  hand-cut paper, a ring that fills across the wait, the time inside. */
/* The countdown's reserved height. It has to be a fixed slot, not the digits' own height: these
 *  digits change every second, so letting the row size itself would reflow the card once a minute. It
 *  was reserved at 96 for the disc that used to live in this slot; now that the disc is a badge on
 *  the card's right edge, the only thing in here is a 42 pt numeral, and 96 left ~85 px of dead
 *  paper between the readout and the "After" rule. 68 holds the digits with room for the largest
 *  form and no void. */
const COUNT_H = 68;
/* The countdown's per-glyph advance, in px at `s={42}`, measured in the built page (`tools/w4-assert.mjs`
 *  prints them back). Special Elite is NOT tabular: its digits advance 22.6–25.7 px, and `font-variant:
 *  tabular-nums` does nothing because the face carries no `tnum` feature — measured with and without it,
 *  byte-for-byte the same, so `42:23` renders 111.7 px, `10:00` 115.3 and `11:11` 110.2. At 1 Hz that
 *  walked the "min left" label back and forth by up to 5 px, which is exactly what the card used to
 *  claim `tabular-nums` prevented. Each glyph therefore gets its own fixed advance: the widest digit
 *  (25.72) plus a hair sets the digit cell and the colon keeps its own (14.42 → 15). Any same-length
 *  countdown is then the same width, and `tools/w4-assert.mjs` asserts it across real digit changes. */
const COUNT_DIGIT_W = 26;
const COUNT_COLON_W = 15;
/* A day you are only looking at prints a class WINDOW, not a countdown, and a window is up to 16
 *  characters wide in 12-hour mode ("11:45 AM–12:35 PM"). 30 is the largest size at which the longest
 *  range this app can print — 282.9 px at 32, so 265.2 here — plus its "first bell" label (63.3) clears
 *  the card's 348 px of content width with air to spare (337.5). 42, the tick size, overflows it in both
 *  clocks (252.4 + 63.3 = 315.7 in 24h; 356 in 12h). The window reading a size below the ticking clock
 *  is the point: it is the schedule, not a time remaining. */
const RANGE_S = 30;
/* The day list's time column. It used to stack start (bold 20) over end (serif 14) in 54 px; it is now one
 *  line, `start–end`, and the two clocks are not the same width: 24-hour prints 11 characters
 *  ("08:30–10:00") and 12-hour 16 ("11:45 AM–12:35 PM"). So the column AND its size follow the clock —
 *  20 pt in the app's own clock, 15 pt in 12-hour. The 12-hour size is chosen so BOTH ends hold at once:
 *  the widest 12h range measures ~112 px inside the 114 px column (at 17 it was 127 px in 128, no air),
 *  AND the course name keeps 178 px, enough for `Computer Programming` (174 px) — at 17 the name column
 *  was squeezed to 164 px and clipped to `Computer Program…`. `tools/w4-assert.mjs` measures the real
 *  string rather than this arithmetic. */
const RANGE_COL_24 = 92, RANGE_COL_12 = 114, RANGE_SIZE_24 = 20, RANGE_SIZE_12 = 15;
/* The disc was 96 square and sat in the card's own column flow, where it pushed the subject down and
 *  hollowed out the left half of the slab. It is now a small badge taped to the card's right edge —
 *  a sticker on the paper, not a hole in it — so it reads as an annotation of the countdown rather
 *  than as the countdown's frame. */
const DISC = { h: [28, 28, 28, 28], v: [28, 28, 28, 28] } as const;

/** A ticking clock, laid out one fixed advance per glyph so the same-length neighbour can never move —
 *  see `COUNT_DIGIT_W`. The digits are the card's readout, so they stay the `type` face at 42; the
 *  letterSpacing the reference used (−.04em, resolved to −1.7) is gone, because at 42 it closed the
 *  gaps the review read as the "2" and "3" running together. Only a real clock goes through here: a
 *  window or the `--:--` placeholder is set as ordinary text, where per-glyph cells would mis-space
 *  the en dash and the dashes. */
const TICKING = /^[\d:]+$/;
function Countdown({ text, color }: { text: string; color: string }) {
  return (
    <>
      {text.split('').map((ch, i) => (
        <Txt key={i} f="type" s={42} style={{ color, width: ch === ':' ? COUNT_COLON_W : COUNT_DIGIT_W, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{ch}</Txt>
      ))}
    </>
  );
}

function StartCircle({ leftMs, gapMs }: { leftMs: number; gapMs: number }) {
  const { c } = useTheme(), size = 56, R = 22, circ = 2 * Math.PI * R;
  const prog = gapMs > 0 ? Math.max(0, Math.min(1, 1 - leftMs / gapMs)) : 0;
  const d = React.useMemo(() => handPath(size, size, DISC, 77, 1.6), []);
  return (
    <View accessible accessibilityRole="timer" accessibilityLabel={`Class starts in ${fmtClock(leftMs / 1000)}`}
      style={{ width: size, height: size }}>
      <Svg width={size + 8} height={size + 8} style={{ position: 'absolute', left: -2, top: -2 }} viewBox={`-2 -2 ${size + 8} ${size + 8}`}>
        <Path d={d} transform="translate(3 4)" fill={hexA(c.shadow, 0.28)} />
        <Path d={d} fill={c.card} stroke={c.ink} strokeWidth={1.8} />
        <Circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={hexA(c.ink, 0.18)} strokeWidth={4} />
        <Circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke={c.acc} strokeWidth={4} strokeLinecap="round"
          strokeDasharray={`${circ * prog} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <Txt f="type" s={14} maxFontSizeMultiplier={FS} accessibilityLiveRegion="none" style={{ fontVariant: ['tabular-nums'] }}>{fmtClock(leftMs / 1000)}</Txt>
      </View>
    </View>
  );
}

/**
 * The card.
 *
 * It owns its own 1 Hz clock rather than borrowing the page's 30 s one, so the digits can count
 * without re-rendering the class list, the notes strip and everything else below them. `live` is the
 * same off-screen gate the page applies to its own `useNow` — a hidden
 * screen must not tick fast — so off Today the card drops to the same 60 s the page uses.
 */
export const ActiveCard = React.memo(function ActiveCard({ periods, occ, courses, isToday, bar, w, live, hour12, headPad = 0 }: {
  periods: Period[]; occ: Occurrence[]; courses: Course[]; isToday: boolean; bar: AnyBarKind; w: number; live: boolean;
  /** The user's 12/24-hour choice, for the non-today window the card prints. */
  hour12?: boolean;
  /** Extra left padding on the header row, for when the clock is taped over the card's top-left
   *  corner and the state pill has to start clear of it. */
  headPad?: number;
}) {
  const { c } = useTheme();
  const t = useNow(live ? 1000 : 60_000);
  const d = deckOf(periods, t, isToday, hour12);
  /* `occ[i]` is the meeting behind `periods[i]` — `periodsOn` maps one array to the other in order.
     `at` is -1 when the card has no class, and `at + 1` would then be the FIRST class of the day:
     the reference guards this the same way (`a = p && pl[pl.indexOf(p)+1]`), because "after the last
     class" and "after nothing" are different sentences. */
  const courseAt = (i: number) => { const o = i >= 0 ? occ[i] : undefined; return o ? courses.find((x) => x.id === o.meeting.courseId) ?? null : null; };
  const mine = courseAt(d.at), after = d.at >= 0 ? courseAt(d.at + 1) : null;
  const room = mine?.room?.trim() ?? '';
  const afterText = after ? [after.name, after.room.trim()].filter(Boolean).join(' · ') : d.period ? 'last class of the day' : 'nothing scheduled';
  /* The disc fills across the gap the card is actually in: from the previous non-cancelled class's end
     (or midnight when this is the first class), floored at a minute so a same-minute back-to-back swap
     can never divide by zero or render a backwards ring. */
  const soon = d.state === 'soon' && d.period !== null;
  const prevEnd = soon ? periods.slice(0, d.at).filter((p) => !p.cancelled).pop()?.end ?? startOfDay(t) : 0;
  const gapMs = soon ? Math.max(60_000, d.period!.start - prevEnd) : 0;
  return (
    <HandBox seed="deck" fill={c.deck} stroke={c.deck} sw={2} amp={1.1} style={{ paddingTop: 15, paddingBottom: 14, paddingHorizontal: DECK_PAD_X }}>
      <SlabHatch ink={c.deckInk} />
      {/* `.tg` — the state word is the card's own ink inverted back out, as the reference's `.tg b` is:
          the one place inside the slab that is lighter than the slab, so it reads first. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingLeft: headPad }}>
        {/* `flex: 1` makes this group absorb whatever free space the row has. In its widest state there
            is none, so the subtitle's budget is real: measured at 412 px, the row content is 258 and the
            group gets exactly the remainder after the room tag, 170, of which the state pill takes ~101.
            `Period 1 of 4` needed 81 in the 62 left and clipped to `Period 1 o…`; each px of the fix is
            bought above with its own comment — the pill-to-subtitle gap (6), the subtitle's size (14),
            the room's R-badge padding (4), and the clock bearing left of the pill (8, not 14).
            `minWidth: 0` and the subtitle's own `flexShrink: 1` stay, so a larger system font still
            truncates gracefully instead of pushing the room tag off the card. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          <View style={{ transform: [{ rotate: '-2deg' }] }}>
            <HandBox seed={`deck-pill-${d.word}`} fill={c.deckInk} stroke={c.deckInk} corners={RS} shadow={false} sw={1.6} amp={0.8}>
              <Txt f="bold" s={22} c={c.deck} maxFontSizeMultiplier={FS} style={{ paddingHorizontal: 10, paddingVertical: 1 }}>{d.word}</Txt>
            </HandBox>
          </View>
          <Txt f="serif" s={14} c={c.deckMut} maxFontSizeMultiplier={FS} numberOfLines={1} style={{ flexShrink: 1 }}>{d.position}</Txt>
        </View>
        {/* `.tg span > .R` … and the room code beside it. */}
        {room !== '' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: 999, borderWidth: 2.2, borderColor: c.deckInk, transform: [{ rotate: '-7deg' }] }}>
              <Txt f="marker" s={15} maxFontSizeMultiplier={FS} style={{ color: c.deckInk }}>R</Txt>
            </View>
            <Txt f="marker" s={22} maxFontSizeMultiplier={FS} numberOfLines={1} style={{ color: c.deckInk }}>{room}</Txt>
          </View>
        )}
      </View>
      {/* `h2` — uncapped, so it grows with the system font like every other heading in the app. The
          reference's tighter `1.05` leading is not reproduced: `Txt` sets `1.25` for the marker face so
          scaled glyphs still have their line box, and a fixed 1.05 would overlap them past 1.3x. The
          card is therefore about 20 px taller than the reference's, all of it in this row. */}
      <Txt f="marker" s={32} numberOfLines={2} style={{ color: c.deckInk, marginTop: 8, marginBottom: 6 }}>{d.period ? d.period.label : 'Free day'}</Txt>
      {/* `.cnt` — the readout. The digits change every second, so they are set one fixed advance per
          glyph (`Countdown`) rather than trusting the face to be tabular, which Special Elite is not
          (see `COUNT_DIGIT_W`). A day that is not today has no countdown to run, so it prints the
          class WINDOW instead, at `RANGE_S`; the `gap` is on the unit's `marginLeft` because a
          per-glyph row cannot have a gap between its own cells. */}
      <View style={{ height: COUNT_H, justifyContent: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          {d.state === 'first'
            ? <Txt f="type" s={RANGE_S} style={{ color: c.deckInk }}>{d.countdown}</Txt>
            : TICKING.test(d.countdown)
              ? <Countdown text={d.countdown} color={c.deckInk} />
              : <Txt f="type" s={42} style={{ color: c.deckInk }}>{d.countdown}</Txt>}
          <Txt f="bold" s={22} maxFontSizeMultiplier={FS} style={{ color: c.deckInk, marginLeft: 9 }}>{d.unit}</Txt>
        </View>
      </View>
      {/* The ring-progress badge. It used to BE the countdown's presentation — 96 square, pushed the
          subject down and hollowed the slab's left half. It is now a small sticker taped over the
          card's right edge, tilted the way the state pill and the room tag already are, so it reads
          as the same kind of annotation. The digits above stay the thing actually read. */}
      {soon && (
        <View pointerEvents="none" style={{ position: 'absolute', right: DECK_PAD_X - 10, top: 86, transform: [{ rotate: '-8deg' }] }}>
          <StartCircle leftMs={Math.max(0, d.period!.start - t)} gapMs={gapMs} />
        </View>
      )}
      <DayBar kind={bar} periods={periods} now={t} ink={c.deckInk} bg={c.deck} w={w} h={DECK_BAR_H} live={live} />
      {/* `.aft` — a dashed rule, then what the day does next. */}
      <View style={{ marginTop: 10, borderTopWidth: 2.5, borderStyle: 'dashed', borderTopColor: c.deckMut, paddingTop: 8, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6 }}>
        <Txt f="bold" s={20} maxFontSizeMultiplier={FS} style={{ color: c.deckInk }}>After</Txt>
        <Txt f="serif" s={17} maxFontSizeMultiplier={FS} style={{ color: c.deckMut, flexShrink: 1 }}>{afterText}</Txt>
      </View>
    </HandBox>
  );
});

/** The header clock subscribes to its own face, in the pattern `Focus`'s `Dial` already uses: writing a
 *  clock face re-renders this 200-unit SVG leaf and nothing else. Today's body — dayBlock, ActiveCard,
 *  the week strip, the notices — used to ride along on every clock select (RC-1). */
const HeaderClock = React.memo(function HeaderClock({ live, size }: { live: boolean; size: number }) {
  const id = useStore((s) => s.settings.clock);
  return <ClockFace id={id} size={size} live={live} />;
});

export function TodayScreen() {
  /* Narrow selectors: each slice subscribes on its own, so toast/timer/sheet/plan writes no longer
     re-render this whole page — only the slices it actually reads. Settings are read field by field
     (`name`, `bar`); `clock` lives in `HeaderClock` above. `st` is rebuilt locally each render. */
  const name = useStore((s) => s.settings.name), bar = useStore((s) => s.settings.bar), hour12 = useStore((s) => s.settings.hour12), meetings = useStore((s) => s.meetings), courses = useStore((s) => s.courses), attendance = useStore((s) => s.attendance), dayMarks = useStore((s) => s.dayMarks), tasks = useStore((s) => s.tasks), notices = useStore((s) => s.notices);
  const st = { meetings, courses, attendance, dayMarks, tasks, notices };
  /* `live` for this page comes from the navigator context, not `s.route`: every page stays mounted now,
     so a store subscription here would re-render the whole of Today on every tap anywhere in the app —
     including the taps that have nothing to do with it. */
  const focused = useScreenLive();
  const { c } = useTheme(), { width } = useWindowDimensions(), now = useNow(focused ? 30_000 : 60_000), today = startOfDay(now);
  /* The day block — strip, class list, "Mark day" — is ONE day, chosen by the user and otherwise the
     live today; the title, clock and "in class / next up" line above it stay about now, so they read
     the live day instead. Both come from `dayBlock`, so they cannot drift apart. */
  const [picked, setPicked] = useState<number | null>(null);
  const { day: sel, date: selDate, occ: selOcc, periods } = dayBlock(now, st.meetings, st.courses, st.attendance, st.dayMarks, picked);
  const { cur, next, periods: todayPeriods } = dayBlock(now, st.meetings, st.courses, st.attendance, st.dayMarks, null);
  const week = mondayOf(sel);
  const hour = new Date(now).getHours(), hello = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  /** The name is user-editable now, so it may be blank: drop the whole ", name" rather than greet nobody. */
  const who = name.trim();
  const open = st.tasks.filter((t) => t.status !== 2 && t.dueAt !== null).sort((a, b) => (a.dueAt as number) - (b.dueAt as number)).slice(0, 5);
  const dayMark = st.dayMarks[selDate];
  const nDone = open.length;
  return (
    <Page title={fmtDay(today, now) === 'Today' ? `${DW[weekdayOf(new Date(now))]} ${new Date(now).getDate()} ${MO[new Date(now).getMonth()]?.slice(0, 3)}` : ''} sub={who ? `${hello}, ${who}` : hello}
      right={<RunningTimer />}>
      {/* The clock and the deck read as ONE artifact: the clock is taped to the card's top-left corner
          and overlaps it, rather than floating above a separate slab. `headPad` is the clock's width
          plus a gap, so the state pill starts clear of the bezel — the gap is 8, trimmed from 14 when
          the header's widest state (`First class · Period 1 of 4 · B-12`) clipped without it. On a day
          with nothing on it there is no card to attach to, so the clock stands alone with its status line. */}
      {periods.length > 0 ? (
        <View style={{ marginTop: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: -26, position: 'relative', zIndex: 2 }}>
            <Pressable testID="clock-face" accessibilityRole="button" accessibilityLabel="Change clock face" onPressIn={() => act.openSettingsAt('clock')}><HeaderClock size={CLOCK} live={focused} /></Pressable>
            {/* `paddingBottom` equals the overlap, so the status line's second row clears the card's top
                edge instead of grazing it. */}
            <View style={{ flex: 1, gap: 4, paddingBottom: 26 }}>
              <Txt f="serif" s={15} c="mut">{cur ? 'In class' : next ? 'Next up' : todayPeriods.length ? 'All done for today' : 'No classes today'}</Txt>
              {(cur ?? next) && <Txt f="bold" s={19} c="mut">{cur ? `until ${fmtTime(cur.end, hour12)}` : nextWhen(next!.start, now, hour12)}</Txt>}
            </View>
          </View>
          <ActiveCard periods={periods} occ={selOcc} courses={st.courses} isToday={sel === today} bar={bar as AnyBarKind} w={width - 32 - DECK_PAD_X * 2} live={focused} hour12={hour12} headPad={CLOCK + 8 - DECK_PAD_X} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <Pressable testID="clock-face" accessibilityRole="button" accessibilityLabel="Change clock face" onPressIn={() => act.openSettingsAt('clock')}><HeaderClock size={CLOCK} live={focused} /></Pressable>
          <View style={{ flex: 1, gap: 4 }}>
            <Txt f="serif" s={15} c="mut">{cur ? 'In class' : next ? 'Next up' : todayPeriods.length ? 'All done for today' : 'No classes today'}</Txt>
            {(cur ?? next) && <Txt f="bold" s={19} c="mut">{cur ? `until ${fmtTime(cur.end, hour12)}` : nextWhen(next!.start, now, hour12)}</Txt>}
          </View>
        </View>
      )}
      <Section title="This week" right={<Btn small kind="ghost" label={dayMark ? ST[dayMark.status] : 'Mark day'} onPress={() => act.open({ t: 'status', mode: 'day', key: selDate, title: fmtDay(sel, now), date: selDate })} />}>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          {Array.from({ length: 7 }, (_, i) => { const d = addDays(week, i), on = d === sel, n = occurrencesOn(new Date(d), st.meetings).length, isToday = d === today;
            return (
              <Pressable key={d} style={{ flex: 1 }} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${DW[i]} ${new Date(d).getDate()}, ${n} classes${isToday ? ', today' : ''}`} onPress={() => setPicked(d)}>
                <HandBox seed={`dy${i}`} fill={on ? c.ink : c.card} shadow={false} style={{ height: 66, alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                  <Txt f="serif" s={13} maxFontSizeMultiplier={FS} c={on ? 'paper' : 'mut'}>{DW[i]}</Txt><Txt f="marker" s={21} maxFontSizeMultiplier={FS} c={on ? 'paper' : 'ink'}>{new Date(d).getDate()}</Txt>
                  <View style={{ flexDirection: 'row', gap: 2, height: 6 }}>{Array.from({ length: Math.min(n, 5) }, (_, k) => <View key={k} style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: on ? c.paper : c.mut }} />)}</View>
                  {isToday && !on && <View style={{ position: 'absolute', bottom: 3, width: 16, height: 2, backgroundColor: c.acc }} />}
                </HandBox>
              </Pressable>);
          })}
        </View>
      </Section>
      <Section title={fmtDay(sel, now)}>
        {selOcc.length === 0 ? <Empty icon="today" text="No classes. Add one from the + button." /> : selOcc.map(({ date, meeting }) => {
          const course = st.courses.find((x) => x.id === meeting.courseId), e = effective(date, meeting, st.attendance, st.dayMarks, now), a = atTime(date.getTime(), meeting.start), b = occEnd(date.getTime(), meeting), live = now >= a && now < b && !isCancelled(e), key = occKey(ymd(date), meeting), col = statusColor(e.status, c), range = `${fmtTime(a, hour12)}–${fmtTime(b, hour12)}`;
          return (
            <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${course?.name}, ${fmtTime(a, hour12)} to ${fmtTime(b, hour12)}, ${spokenStatus(e)}. Opens attendance.`} onPress={() => act.open({ t: 'status', mode: 'class', key, title: course?.name ?? 'Class', date: ymd(date) })} onLongPress={() => act.open({ t: 'meeting', id: meeting.id })}>
              <HandBox seed={key} stroke={live ? c.acc : c.ink} sw={live ? 2.4 : 1.6} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, gap: 12, opacity: isCancelled(e) ? 0.7 : 1 }}>
                <View style={{ width: hour12 ? RANGE_COL_12 : RANGE_COL_24 }}><Txt f="bold" s={hour12 ? RANGE_SIZE_12 : RANGE_SIZE_24} numberOfLines={1}>{range}</Txt></View>
                <View style={{ flex: 1, minWidth: 0 }}><Txt f="bold" s={22} style={isCancelled(e) ? { textDecorationLine: 'line-through' } : undefined} numberOfLines={1}>{course?.name}</Txt><Txt f="serif" s={15} c="mut">{[course?.room, course?.teacher].filter(Boolean).join(' · ')}</Txt></View>
                <View style={{ width: 40, height: 40, borderRadius: 10, borderWidth: e.inferred || !e.status ? 1.4 : 2, borderStyle: e.inferred || !e.status ? 'dashed' : 'solid', borderColor: e.status ? col : hexA(c.ink, 0.3), alignItems: 'center', justifyContent: 'center' }}>{e.status ? <Txt f="marker" s={20} maxFontSizeMultiplier={FS} style={{ color: col, opacity: e.inferred ? 0.55 : 1 }}>{STATUS_GLYPH[e.status]}</Txt> : <Icon name="plus" size={18} color={c.mut} />}</View>
              </HandBox>
            </Pressable>);
        })}
      </Section>
      <Section title="Notes" right={<Btn small kind="ghost" icon="plus" a11y="New note" onPress={() => act.open({ t: 'notice' })} />}>
        {/* `hl` is a surface, and `ink` is the only text token that clears 4.5:1 on it in all four
            palette×theme combinations — `mut`/`hl` is 4.02 in `original.dark`. COORDINATION.md §4 forbids
            re-valuing a palette, so an important note prints in ink on its highlight and the ordinary card
            keeps `mut`. Pinned by `src/test/color-drift.test.ts` and the table in `src/test/ui.test.ts`. */}
        {st.notices.length === 0 ? <Empty text="Nothing pinned. Add a reminder to yourself." /> : (
          <HStrip gap={12} contentStyle={{ paddingTop: 8 }}>
            {st.notices.map((n, i) => (
              <Pressable key={n.id} accessibilityRole="button" accessibilityLabel={`Note: ${n.text}`} onPress={() => act.open({ t: 'notice', id: n.id })} style={{ transform: [{ rotate: `${(i % 3 - 1) * 1.6}deg` }] }}>
                <HandBox seed={n.id} fill={n.priority >= 2 ? c.hl : c.card} style={{ width: 220, minHeight: 110, padding: 12, paddingTop: 16 }}>
                  <Tape w={46} rot={-6} style={{ top: -9, left: 90 }} />
                  <Txt f="serif" s={13.5} c={n.priority >= 2 ? c.ink : 'mut'}>{st.courses.find((x) => x.id === n.courseId)?.name ?? 'Reminder'}{n.priority >= 2 ? ' · important' : ''}</Txt>
                  <Txt f="hand" s={19} numberOfLines={5}>{n.text}</Txt>
                </HandBox>
              </Pressable>))}
          </HStrip>)}
      </Section>
      <Section title="Due soon" right={<Btn small kind="ghost" label="All tasks" onPress={() => act.go('Tasks')} />}>
        {nDone === 0 ? <Empty icon="tasks" text="Nothing due. Tap + to add an assignment." /> : open.map((t) => <TaskCard key={t.id} t={t} now={now} />)}
      </Section>
    </Page>
  );
}
