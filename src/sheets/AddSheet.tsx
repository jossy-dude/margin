import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { HandBox, HStrip, Icon, Tape, Txt, usePressIn } from '../ui/kit';
import { Sheet, useSheetClose } from '../ui/Sheet';
import { useReduceMotion, useTheme } from '../ui/theme-context';
import { subjectTint } from '../ui/collage/tint';
import { FS } from '../ui/fit';
import { act, useStore, type SheetSpec } from '../store/store';
import { hm, weekdayOf } from '../domain/time';
import { hexA } from '../tokens/theme';
import { fx } from '../services/fx';

/* ──────────────────────────────────────────────────────────────────────────────────────────────────────
 * The "+" sheet: a desk, not a menu.
 *
 * Subject first. Almost everything a student adds belongs to a subject, so the sheet opens by asking which
 * one — preselected to the class you are sitting in, if any — and every slip below files itself there.
 *
 * Then the things you can pick up, each its own kind of paper: an assignment slip, an exam card, a reading
 * list, a project sheet, a timetable index card, a mark slip, a sticky note and a blank for a new subject.
 * They are dealt onto the sheet when it opens and lift when touched. A slip that needs a subject when none
 * exists stays on the desk, dimmed and saying why; touching it shakes it and offers "New subject" instead
 * of opening a form that cannot be saved.
 * ────────────────────────────────────────────────────────────────────────────────────────────────────── */

type Tint = 'sky' | 'blush' | 'sand' | 'sage' | 'cream' | 'hl' | 'denim';
interface Slip { id: string; label: string; line: string; icon: string; tint: Tint; needs?: boolean; to: (cid: string | null) => SheetSpec; tape?: boolean }
const SLIPS: Slip[] = [
  { id: 'assignment', label: 'Assignment', line: 'Due date and reminders', icon: 'tasks', tint: 'sky', to: (cid) => ({ t: 'task', kind: 'assignment', courseId: cid }), tape: true },
  { id: 'exam', label: 'Exam', line: 'A date to revise for', icon: 'exam', tint: 'blush', needs: true, to: (cid) => ({ t: 'task', kind: 'exam', courseId: cid }) },
  { id: 'reading', label: 'Reading', line: 'Pages, chapters, a book', icon: 'book', tint: 'sand', to: (cid) => ({ t: 'task', kind: 'reading', courseId: cid }) },
  { id: 'project', label: 'Project', line: 'Bigger, with steps', icon: 'flag', tint: 'sage', to: (cid) => ({ t: 'task', kind: 'project', courseId: cid }), tape: true },
  { id: 'class', label: 'Class', line: 'A weekly slot in the timetable', icon: 'week', tint: 'cream', needs: true, to: (cid) => ({ t: 'meeting', courseId: cid ?? undefined }), tape: true },
  { id: 'mark', label: 'Mark', line: 'A score and its weight', icon: 'grades', tint: 'sand', needs: true, to: (cid) => ({ t: 'mark', courseId: cid ?? '' }) },
  { id: 'note', label: 'Note', line: 'A sticky for later', icon: 'note', tint: 'hl', to: () => ({ t: 'notice' }) },
  { id: 'subject', label: 'Subject', line: 'Start here: name, rooms, goal', icon: 'grad', tint: 'denim', to: () => ({ t: 'course' }) },
];

export function AddSheet() {
  const { closeRef, close } = useSheetClose(), { c, tints } = useTheme();
  const courses = useStore((s) => s.courses), meetings = useStore((s) => s.meetings), now = useStore((s) => s.now);
  /* The class you are in (or about to be in, within ten minutes) decides the preselected subject. */
  const inClass = useMemo(() => {
    const d = new Date(now), wd = weekdayOf(d), m = d.getHours() * 60 + d.getMinutes();
    return meetings.find((x) => x.weekday === wd && hm(x.start) - 10 <= m && m <= hm(x.end))?.courseId ?? null;
  }, [meetings, now]);
  const [cid, setCid] = useState<string | null>(() => inClass ?? (courses.length === 1 ? courses[0]!.id : null));
  const [why, setWhy] = useState<string | null>(null);
  const none = courses.length === 0, course = courses.find((x) => x.id === cid);
  const here = courses.find((x) => x.id === inClass), tabs = here ? [here, null, ...courses.filter((x) => x !== here)] : [null, ...courses];
  const fill = (t: Tint) => (t === 'hl' ? c.hl : t === 'denim' ? c.deck : tints[t]);
  const pick = (s: Slip) => {
    if (s.needs && none) { fx.denied(); setWhy(s.label); return; }
    fx.page();
    const spec = s.to(s.needs ? cid ?? courses[0]!.id : cid);
    close(() => act.open(spec));
  };
  return (
    <Sheet title="Add" onClose={act.close} maxH={0.86} closeRef={closeRef}>
      {/* ── the subject, first ── */}
      <View style={{ gap: 6 }}>
        <Txt f="type" s={12} c="mut" maxFontSizeMultiplier={FS} style={{ letterSpacing: 2.2 }}>FOR</Txt>
        {none ? (
          <HandBox seed="add-none" fill={hexA(c.acc, 0.1)} stroke={c.acc} sw={1.6} style={{ padding: 12, gap: 4 }}>
            <Txt f="bold" s={17}>No subjects yet</Txt>
            <Txt f="serif" s={14.5} c="mut">Classes, marks and exams each belong to one. Start with the denim card below.</Txt>
          </HandBox>
        ) : (
          <HStrip gap={7}>
            {/* The class you are in leads, so the preselected tab is never scrolled out of sight. */}
            {tabs.map((x) => (x === null
              ? <SubjectTab key="_none" label="No subject" on={cid === null} tint={c.card} onPress={() => setCid(null)} />
              : <SubjectTab key={x.id} label={x.name} on={cid === x.id} tint={subjectTint(x.id, tints)} now={x.id === inClass} onPress={() => setCid(x.id)} />))}
          </HStrip>
        )}
      </View>

      {why && (
        <HandBox seed="add-why" fill={c.card} stroke={c.bad} sw={1.6} style={{ padding: 12, gap: 8 }} >
          <Txt f="bold" s={17} accessibilityLiveRegion="polite">{why === 'Class' ? 'A class' : why === 'Mark' ? 'A mark' : 'An exam'} needs a subject first</Txt>
          <Txt f="serif" s={14.5} c="mut">Make the subject, then come back to the + and it will be waiting here.</Txt>
          <Pressable accessibilityRole="button" accessibilityLabel="New subject" onPress={() => { fx.page(); close(() => act.open({ t: 'course' })); }} style={{ alignSelf: 'flex-start' }}>
            <HandBox seed="add-why-go" fill={c.deck} cut="cut" style={{ minHeight: 40, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="plus" size={16} color={c.deckInk} /><Txt f="bold" s={17} c="deckInk">New subject</Txt></HandBox>
          </Pressable>
        </HandBox>
      )}

      {/* ── the desk ── */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 }}>
        {SLIPS.map((s, i) => <SlipCard key={s.id} slip={s} i={i} bg={fill(s.tint)} ink={s.tint === 'denim' ? 'deckInk' : 'ink'} sub={s.tint === 'denim' ? 'deckMut' : 'mut'} locked={!!s.needs && none} pulse={why === s.label} onPress={() => pick(s)} />)}
      </View>

      {/* ── the one thing that is not a form ── */}
      <FocusStrip label={course ? `Focus on ${course.name}` : 'Start a focus session'} onPress={() => { fx.page(); close(() => act.focusOpen(null, cid)); }} />
    </Sheet>
  );
}

function SubjectTab({ label, on, tint, now, onPress }: { label: string; on: boolean; tint: string; now?: boolean; onPress: () => void }) {
  const { c } = useTheme(), [aIn, aLift] = usePressIn(() => { fx.select(); onPress(); });
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={now ? `${label}, the class you are in` : label} onPressIn={aIn} onPress={aLift} hitSlop={4}>
      <HandBox seed={`tab-${label}`} fill={on ? c.ink : tint} cut="cut" shadow={on} style={{ minHeight: 38, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 220 }}>
        {now ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: on ? c.paper : c.bad }} /> : null}
        <Txt f="bold" s={16.5} c={on ? 'paper' : 'ink'} numberOfLines={1} maxFontSizeMultiplier={FS}>{label}</Txt>
      </HandBox>
    </Pressable>
  );
}

/** One slip on the desk: dealt in when the sheet opens, lifted when touched, shaken when it cannot go yet. */
function SlipCard({ slip, i, bg, ink, sub, locked, pulse, onPress }: { slip: Slip; i: number; bg: string; ink: string; sub: string; locked: boolean; pulse: boolean; onPress: () => void }) {
  const { c, tints } = useTheme(), reduce = useReduceMotion(), deal = useSharedValue(reduce ? 1 : 0), lift = useSharedValue(0), shake = useSharedValue(0);
  const rot = (i % 2 ? 1 : -1) * (0.8 + (i % 3) * 0.5);
  useEffect(() => { if (!reduce) deal.set(withDelay(40 + i * 38, withSpring(1, { duration: 460, dampingRatio: 0.74 }))); }, [reduce, i, deal]);
  useEffect(() => { if (pulse && !reduce) shake.set(withSequence(withTiming(1, { duration: 60 }), withTiming(-1, { duration: 90 }), withTiming(0.6, { duration: 80 }), withSpring(0, { duration: 220 }))); }, [pulse, reduce, shake]);
  const st = useAnimatedStyle(() => ({ transform: [
    { translateY: (1 - deal.get()) * 46 - lift.get() * 4 }, { translateX: shake.get() * 6 },
    { rotate: `${rot * (1 - lift.get()) + (1 - deal.get()) * rot * 5 + shake.get() * 2}deg` }, { scale: 1 + lift.get() * 0.035 },
  ] }));
  const [aIn, aLift] = usePressIn(onPress);
  return (
    <Animated.View style={[{ width: '48%', flexGrow: 1 }, st]}>
      <Pressable testID={`add-${slip.id}`} accessibilityRole="button" accessibilityLabel={locked ? `Add ${slip.label}: needs a subject first` : `Add ${slip.label}`} accessibilityState={{ disabled: locked }}
        onPressIn={() => { aIn(); lift.set(reduce ? 0 : withTiming(1, { duration: 110, easing: Easing.out(Easing.quad) })); }} onPress={aLift}
        onPressOut={() => lift.set(reduce ? 0 : withSpring(0, { duration: 260, dampingRatio: 0.6 }))}>
        <HandBox seed={`slip-${slip.id}`} fill={bg} cut="torn" style={{ minHeight: 96, padding: 12, gap: 3, opacity: locked ? 0.5 : 1 }}>
          {slip.tape ? <Tape w={46} rot={i % 2 ? 8 : -7} style={{ top: -9, right: 14 }} /> : null}
          {/* An index card: one red rule under its heading line. */}
          {slip.id === 'class' ? <View pointerEvents="none" style={{ position: 'absolute', left: 8, right: 8, top: 41, height: 1.2, backgroundColor: hexA(tints.tomato, 0.55) }} /> : null}
          <Icon name={slip.icon} size={24} color={ink === 'deckInk' ? c.deckInk : c.ink} />
          <Txt f="bold" s={19} c={ink} maxFontSizeMultiplier={FS}>{slip.label}</Txt>
          <Txt f="serif" s={13.5} c={sub} numberOfLines={2} maxFontSizeMultiplier={FS}>{locked ? 'Needs a subject first' : slip.line}</Txt>
        </HandBox>
      </Pressable>
    </Animated.View>
  );
}

/** Focus is not a form: a strip of kraft across the bottom of the desk. */
function FocusStrip({ label, onPress }: { label: string; onPress: () => void }) {
  const { c, tints } = useTheme(), [aIn, aLift] = usePressIn(onPress);
  return (
    <Pressable testID="add-focus" accessibilityRole="button" accessibilityLabel="Start a focus session" accessibilityHint={label} onPressIn={aIn} onPress={aLift} style={{ marginTop: 4 }}>
      <HandBox seed="add-focus" fill={tints.kraft} cut="torn" style={{ minHeight: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}><Icon name="timer" size={21} color={c.paper} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt f="bold" s={19} numberOfLines={1} maxFontSizeMultiplier={FS}>{label}</Txt>
          <Txt f="serif" s={13.5} c="ink" style={{ opacity: 0.75 }} maxFontSizeMultiplier={FS}>A quiet timer that logs what you study</Txt>
        </View>
        <Icon name="chevron" size={20} />
      </HandBox>
    </Pressable>
  );
}
