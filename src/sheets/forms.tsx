import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Btn, Chip, EASE, Field, HandBox, HStrip, Reveal, Row, STEP, Toggle, Txt, Hair } from '../ui/kit';
import { DurationField, NumberField, TimeField } from '../ui/fields';
import { Label, Sheet, useSheetClose } from '../ui/Sheet';
import { latch } from '../ui/latch';
import { useReduceMotion, useTheme } from '../ui/theme-context';
import { WhenPicker, nextHome } from './WhenPicker';
import { RoomChips, ScheduleEditor } from './ScheduleEditor';
import { draftsOf, planSchedule, type SlotDraft } from '../domain/schedule';
import { NOTE_LEVEL, noteDate } from '../ui/collage/notes';
import { act, getState, toast, useStore, type SheetSpec } from '../store/store';
import { ST, CYCLE, WHY, WHY_LABEL } from '../domain/attendance';
import { DW, fmtDur, fmtWhen, fromMin, hm, uid, startOfDay } from '../domain/time';
import { workload } from '../domain/reminders';
import type { AttStatus, AttWhy, Course, Mark, Meeting, Notice, ReminderSpec, Task, TaskKind } from '../domain/types';
import { fx } from '../services/fx';
import { hexA } from '../tokens/theme';
import { STATUS_GLYPH, statusColor } from '../screens/common';

const KINDS: { k: TaskKind; l: string; i: string }[] = [{ k: 'assignment', l: 'Assignment', i: 'tasks' }, { k: 'exam', l: 'Exam', i: 'exam' }, { k: 'deadline', l: 'Deadline', i: 'timer' }, { k: 'reading', l: 'Reading', i: 'book' }, { k: 'project', l: 'Project', i: 'flag' }, { k: 'lab', l: 'Lab', i: 'lab' }, { k: 'other', l: 'Other', i: 'pencil' }];
const PRI = ['None', 'Low', 'Medium', 'High'];

/**
 * The "Tight / Comfortable" box — the one place in the app where a *colour* changes as a direct
 * consequence of something the user just did: raising the estimate past the free time repaints it from
 * cream-and-ink to highlight-and-warning, and it did both in one frame.
 *
 * It is a cross-fade of two complete, static cards rather than a colour interpolation, and that is
 * deliberate. Interpolating would mean animated `fill` and `stroke` on two SVG paths — the class
 * `qa/RESEARCH-PERF.md` §6 measured at 30-40 fps on Android, and the reason the chips' fills are not
 * animated (`qa/MOTION-INVENTORY.md` §6.1). Opacity on two plain views is free, and for a hand-cut card
 * swapping one piece of paper for another reads better than a colour bleeding into place anyway.
 *
 * **The warning colour is on the border, not on the words.** The box is filled with `hl` and used to
 * print its sentence in `warn`; `warn`/`hl` is 4.40:1 in `original.light`, below the 4.5 this project
 * sets for body text, and `COORDINATION.md` §4 forbids re-valuing a palette to fix it. So the text is
 * `ink` — which clears 4.5 on `hl` in all four palette×theme combinations — and `warn` stays on the
 * hand-cut stroke, which is where a warning colour actually reads at 1.6 px. `src/test/ui.test.ts`
 * pins both halves of that.
 */
function Fit({ tight, needMin, freeMin, startBy }: { tight: boolean; needMin: number; freeMin: number; startBy: string }) {
  const { c } = useTheme(), reduce = useReduceMotion(), k = useSharedValue(tight ? 1 : 0);
  useEffect(() => { k.set(reduce ? (tight ? 1 : 0) : withTiming(tight ? 1 : 0, { duration: STEP, easing: EASE })); }, [tight, reduce, k]);
  const comfortable = useAnimatedStyle(() => ({ opacity: interpolate(k.get(), [0, 1], [1, 0]) })), tightStyle = useAnimatedStyle(() => ({ opacity: interpolate(k.get(), [0, 1], [0, 1]) }));
  /* v0.2 — the two crossfading boxes used to BOTH be `position:absolute`, so neither took layout
     height: the only in-flow child was the "Latest start" line, which therefore started at the top
     of the container and sat directly under the floating boxes (Jossy's screenshot). The comfortable
     box — the longer string, so it wraps at least as far — is now in NORMAL flow and reserves the
     height; only the tight box floats on top. Everything after the hint flows below it. */
  return (
    <View>
      <Animated.View pointerEvents="none" style={comfortable}>
        <HandBox seed="wl" shadow={false} fill={c.card} stroke={c.ink} style={{ padding: 10 }}><Txt f="bold" s={19}>Comfortable: needs ~{fmtDur(needMin)}, you have ~{fmtDur(freeMin)} free before it is due.</Txt></HandBox>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0 }, tightStyle]}>
        <HandBox seed="wl" shadow={false} fill={c.hl} stroke={c.warn} style={{ padding: 10 }}><Txt f="bold" s={19}>Tight: needs ~{fmtDur(needMin)}, you have ~{fmtDur(freeMin)} free before it is due.</Txt></HandBox>
      </Animated.View>
      <Txt f="serif" s={15} c="mut">Latest start: {startBy} (classes, sleep and quiet hours already excluded)</Txt>
    </View>
  );
}

export function CourseChips({ value, onChange, none = 'No subject' }: { value: string | null; onChange: (v: string | null) => void; none?: string | null }) {
  const courses = useStore((s) => s.courses), { c } = useTheme();
  return <HStrip gap={8} bg={c.card}>{none !== null && <Chip label={none} on={value === null} onPress={() => onChange(null)} />}{courses.map((c) => <Chip key={c.id} label={c.name} on={value === c.id} onPress={() => onChange(c.id)} />)}</HStrip>;
}

/* ───── Task / exam / reading / project form ───── */
const OFFS = [{ m: 0, l: 'At due time' }, { m: 30, l: '30 min before' }, { m: 60, l: '1 h before' }, { m: 120, l: '2 h before' }, { m: 1440, l: '1 day before' }];
export function TaskSheet({ id, kind, courseId }: { id?: string; kind?: TaskKind; courseId?: string | null }) {
  const tasks = useStore((s) => s.tasks), meetings = useStore((s) => s.meetings), attendance = useStore((s) => s.attendance), dayMarks = useStore((s) => s.dayMarks), nset = useStore((s) => s.settings.notif), hour12 = useStore((s) => s.settings.hour12);
  const st = { tasks, meetings, attendance, dayMarks };
  const existing = id ? st.tasks.find((t) => t.id === id) : undefined, [now] = useState(() => Date.now());
  const [title, setTitle] = useState(existing?.title ?? ''), [k, setK] = useState<TaskKind>(existing?.kind ?? kind ?? 'assignment'), [cid, setCid] = useState<string | null>(existing ? existing.courseId : courseId ?? null);
  const [due, setDue] = useState<number | null>(existing ? existing.dueAt : null), [start, setStart] = useState<number | null>(existing?.startAt ?? null), [est, setEst] = useState(existing?.estimateMin ?? 0), [pri, setPri] = useState<number>(existing?.priority ?? 0);
  const [notes, setNotes] = useState(existing?.notes ?? ''), [subs, setSubs] = useState(existing?.subtasks ?? []), [ns, setNs] = useState(''), [showStart, setShowStart] = useState(!!existing?.startAt), [custom, setCustom] = useState(60), [addAt, setAddAt] = useState(false), [atV, setAtV] = useState<number | null>(null);
  const [rem, setRem] = useState<ReminderSpec[]>(existing?.reminders ?? nset.defaultTaskMinutes.map((m) => ({ id: uid('r'), mode: 'before' as const, minutes: m, label: m ? `${fmtDur(m)} before` : 'At due time' })));
  const { closeRef, close } = useSheetClose(), { c } = useTheme(), [saveId] = useState(() => existing?.id ?? uid('t')), [submit] = useState(latch);
  /* "You touched it, it's yours": every form save writes `demo: false`, so a sample row the user edits
     stops being sample data and survives "Remove all sample data" — the flag is preserved by nothing
     except `seed.ts`. The same literal governs the four forms at the bottom of this file. */
  const draft: Task = { id: existing?.id ?? 'draft', title, courseId: cid, kind: k, dueAt: due, startAt: start, estimateMin: est || null, priority: pri as Task['priority'], notes, status: existing?.status ?? 0, createdAt: existing?.createdAt ?? now, completedAt: existing?.completedAt ?? null, reminders: rem, subtasks: subs, demo: false };
  const w = useMemo(() => workload(draft, { now, meetings: st.meetings, attendance: st.attendance, dayMarks: st.dayMarks, settings: nset }), [due, est, start]); // eslint-disable-line react-hooks/exhaustive-deps
  const has = (m: number) => rem.some((r) => r.mode === 'before' && r.minutes === m), home = due ? nextHome(now, nset.homeAt) : null, hasHome = rem.some((r) => r.mode === 'abs' && r.label === 'When I get home');
  const toggleOff = (m: number) => setRem((r) => (has(m) ? r.filter((x) => !(x.mode === 'before' && x.minutes === m)) : [...r, { id: uid('r'), mode: 'before', minutes: m, label: m ? `${fmtDur(m)} before` : 'At due time' }]));
  /** The Add button is never disabled, so it stays enabled through the sheet's 210 ms close animation
   *  and a fast double-tap lands here twice. The latch refuses the second; minting `saveId` once per
   *  form instance means even a repeat that got through re-saves this row instead of appending a
   *  second, unrecoverable one. */
  const save = () => submit(() => {
    const t = { ...draft, id: saveId, title: title.trim(), reminders: due ? rem : [] };
    act.saveTask(t); toast(existing ? 'Saved' : `${KINDS.find((x) => x.k === k)?.l ?? 'Task'} added${due ? ` · due ${fmtWhen(due, now, hour12)}` : ''}`); close();
  });
  return (
    <Sheet title={existing ? 'Edit' : KINDS.find((x) => x.k === k)?.l ?? 'Task'} onClose={act.close} maxH={0.93} closeRef={closeRef}
      footer={<Row style={{ flexWrap: 'nowrap' }}>{existing && <Btn kind="ghost" icon="trash" label="Delete" a11y="Delete" onPress={() => { act.removeTask(existing.id); close(); }} />}{existing && <Btn kind="ghost" icon="timer" a11y="Focus on this" onPress={() => close(() => act.focusOpen(existing.id))} />}<Btn flex label={existing ? 'Save' : 'Add'} icon="check" disabled={!title.trim()} onPress={save} /></Row>}>
      <Field label="What is it?" placeholder="e.g. Problem set 6" value={title} onChangeText={setTitle} autoFocus={!existing} returnKeyType="done" />
      <HStrip gap={8} bg={c.card}>{KINDS.map((x) => <Chip key={x.k} label={x.l} icon={x.i} on={k === x.k} onPress={() => setK(x.k)} />)}</HStrip>
      <Label>Subject (optional)</Label><CourseChips value={cid} onChange={setCid} />
      <Label>Due</Label><WhenPicker value={due} onChange={setDue} now={now} homeAt={nset.homeAt} optional nonePlaceholder="No due date" h12={hour12} />
      {!showStart ? <Chip label="+ Start date" icon="flag" onPress={() => setShowStart(true)} small /> : <Reveal open><Label>Starts (it shows up from then, with a nudge)</Label><WhenPicker value={start} onChange={setStart} now={now} homeAt={nset.homeAt} optional nonePlaceholder="Starts now" h12={hour12} /></Reveal>}
      <Label>How long will it take?</Label>
      <DurationField label="effort" value={est || null} onChange={(v) => setEst(v ?? 0)} presets={[15, 30, 45, 60, 90, 120]} min={0} max={720} noneLabel="unknown" />
      {w && <Fit tight={!!w.tight} needMin={w.needMin} freeMin={Math.round(w.freeMin)} startBy={fmtWhen(w.startBy, now, hour12)} />}
      {due ? <>
        <Label>Remind me</Label>
        <Row>{OFFS.map((o) => <Chip key={o.m} label={o.l} on={has(o.m)} onPress={() => toggleOff(o.m)} small />)}
          {home && home < due && <Chip label="When I get home" icon="bell" on={hasHome} small onPress={() => setRem((r) => (hasHome ? r.filter((x) => !(x.mode === 'abs' && x.label === 'When I get home')) : [...r, { id: uid('r'), mode: 'abs', at: home, label: 'When I get home' }]))} />}
          {rem.filter((r) => (r.mode === 'before' && !OFFS.some((o) => o.m === r.minutes)) || (r.mode === 'abs' && r.label !== 'When I get home')).map((r) => <Chip key={r.id} on small label={r.mode === 'abs' ? fmtWhen(r.at, now, hour12) : r.label} icon="x" onPress={() => setRem((x) => x.filter((y) => y.id !== r.id))} />)}</Row>
        <Row><DurationField label="custom lead" value={custom} onChange={(v) => { if (v !== null) setCustom(v); }} presets={[]} min={5} max={10080} /><Btn small kind="ghost" label="+ add" onPress={() => { if (!has(custom)) setRem((r) => [...r, { id: uid('r'), mode: 'before', minutes: custom, label: `${fmtDur(custom)} before` }]); }} /><Btn small kind="ghost" label="+ at a time" onPress={() => setAddAt(!addAt)} /></Row>
        {addAt && <Reveal open><WhenPicker value={atV} onChange={setAtV} now={now} homeAt={nset.homeAt} nonePlaceholder="Pick a time" h12={hour12} /><Btn small label="Add this reminder" disabled={!atV} onPress={() => { if (atV) { setRem((r) => [...r, { id: uid('r'), mode: 'abs', at: atV, label: 'At a chosen time' }]); setAtV(null); setAddAt(false); } }} /></Reveal>}
      </> : <Txt f="serif" s={15} c="mut">Set a due date to choose reminders.</Txt>}
      <Label>Priority</Label><Row>{PRI.map((p, i) => <Chip key={p} label={p} on={pri === i} onPress={() => setPri(i)} small />)}</Row>
      <Label>Steps</Label>
      {subs.map((x) => <Row key={x.id} style={{ flexWrap: 'nowrap' }}><Chip small label={x.t} icon={x.done ? 'check' : undefined} on={x.done} onPress={() => setSubs((s) => s.map((y) => (y.id === x.id ? { ...y, done: !y.done } : y)))} /><Btn small kind="ghost" icon="x" a11y={`Remove ${x.t}`} onPress={() => setSubs((s) => s.filter((y) => y.id !== x.id))} /></Row>)}
      <Row style={{ flexWrap: 'nowrap' }}><Field style={{ flex: 1 }} placeholder="Add a step" value={ns} onChangeText={setNs} onSubmitEditing={() => { if (ns.trim()) { setSubs((s) => [...s, { id: uid('s'), t: ns.trim(), done: false }]); setNs(''); } }} returnKeyType="done" /></Row>
      <Field label="Notes" multiline value={notes} onChangeText={setNotes} placeholder="Anything to remember…" />
    </Sheet>
  );
}

/* ───── class / day status ───── */
/** One of the three states, as the stamp it leaves: its glyph in a ring of its own colour, the word under it,
 *  and the chosen one inked solid. The colours are the ones every attendance cell in the app already uses. */
function StampChoice({ s, on, onPress }: { s: AttStatus; on: boolean; onPress: () => void }) {
  const { c } = useTheme(), col = statusColor(s, c);
  return (
    <Pressable testID={`stamp-${s}`} accessibilityRole="radio" accessibilityLabel={ST[s]} accessibilityState={{ selected: on, checked: on }} onPress={() => { fx.stamp(s); onPress(); }} style={{ flex: 1 }}>
      <HandBox seed={`stamp-${s}`} fill={on ? hexA(col, 0.16) : c.card} stroke={on ? col : undefined} cut="cut" shadow={!on} style={{ minHeight: 84, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, borderWidth: 2.2, borderColor: col, backgroundColor: on ? col : 'transparent', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] }}>
          <Txt f="marker" s={17} c={on ? c.card : col} maxFontSizeMultiplier={FS_STAMP}>{STATUS_GLYPH[s]}</Txt>
        </View>
        <Txt f="bold" s={16} numberOfLines={1} maxFontSizeMultiplier={FS_STAMP}>{ST[s]}</Txt>
      </HandBox>
    </Pressable>
  );
}
const FS_STAMP = 1.3;
/** What the free-text line asks, per state: a cancelled class is the one where the words matter most. */
const NOTE: Record<AttStatus, { label: string; hint: string }> = {
  p: { label: 'Note (optional)', hint: 'e.g. bus was late' },
  a: { label: 'Note (optional)', hint: 'e.g. doctor until noon' },
  c: { label: 'What happened?', hint: "e.g. teacher didn't come" },
};

/** v0.6: Present / Absent / Cancelled, then the reason. Choosing a state no longer closes the sheet — the
 *  reasons under it are the point — so the mark is written by Save. */
export function StatusSheet({ spec }: { spec: Extract<SheetSpec, { t: 'status' }> }) {
  const isDay = spec.t === 'status' && spec.mode === 'day';
  const rec = useStore((s) => (isDay ? s.dayMarks[spec.date] : s.attendance[spec.key]));
  const { closeRef, close } = useSheetClose();
  const [state, setState] = useState<AttStatus | null>(rec?.status ?? null), [why, setWhy] = useState<AttWhy>(rec?.why ?? ''), [note, setNote] = useState(rec?.reason ?? '');
  const pick = (s: AttStatus) => { setState(s); if (s !== state) setWhy(''); };
  const save = () => { if (!state) return; if (isDay) act.setDay(spec.date, state, note.trim(), why); else act.setAtt(spec.key, state, note.trim(), why); close(); };
  return (
    <Sheet title={spec.title} onClose={act.close} maxH={0.8} closeRef={closeRef}
      footer={<Row style={{ flexWrap: 'nowrap' }}>{rec && <Btn kind="ghost" icon="x" label="Automatic" a11y="Back to automatic" onPress={() => { if (isDay) act.clearDay(spec.date); else act.clearAtt(spec.key); close(); }} />}<Btn flex icon="check" label="Save" disabled={!state} onPress={save} /></Row>}>
      <Txt f="serif" s={16} c="mut">{isDay ? 'Mark the whole day' : 'How did this class go?'}</Txt>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 10 }}>
        {CYCLE.map((s) => <StampChoice key={s} s={s} on={state === s} onPress={() => pick(s)} />)}
      </View>
      {state && (
        <View style={{ gap: 8 }}>
          <Label>{state === 'c' ? 'Why was it cancelled?' : state === 'a' ? 'Why were you out?' : 'Anything off?'}</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {WHY[state].map((w) => <Chip key={w} label={WHY_LABEL[w as Exclude<AttWhy, ''>]} on={why === w} onPress={() => setWhy(why === w ? '' : w)} />)}
          </View>
          <Field label={NOTE[state].label} value={note} onChangeText={setNote} placeholder={NOTE[state].hint} />
        </View>
      )}
    </Sheet>
  );
}

/* ───── course / meeting / mark / notice ─────
   Each save below writes `demo: false` — "you touched it, it's yours" (see the task form above): a
   sample subject the user renames or fills with their own grades must not be deleted as sample data. */
export function CourseSheet({ id }: { id?: string }) {
  const c0 = useStore((s) => s.courses.find((x) => x.id === id)), count = useStore((s) => s.courses.length), { closeRef, close } = useSheetClose(), [saveId] = useState(() => c0?.id ?? uid('c')), [submit] = useState(latch);
  const meetings = useStore((s) => s.meetings), variants = useStore((s) => s.variants), hour12 = useStore((s) => s.settings.hour12);
  const [name, setName] = useState(c0?.name ?? ''), [teacher, setTeacher] = useState(c0?.teacher ?? ''), [goal, setGoal] = useState(c0?.goal ?? 0);
  /* Rooms and the weekly schedule live with the subject now (collage pass): one sheet makes a whole subject. */
  const [rooms, setRooms] = useState<string[]>(c0?.rooms ?? []), [rows, setRows] = useState<SlotDraft[]>(() => (c0 ? draftsOf(c0.id, meetings, variants) : []));
  /* A new kind (Lab, Tutorial…) gets ONE variant id per form, remembered here, so a repeated save reuses it. */
  const [vids] = useState(() => new Map<string, string>()), vid = (k: string) => { const key = k.toLocaleLowerCase(); if (!vids.has(key)) vids.set(key, `${saveId}-${key}`); return vids.get(key)!; };
  const save = () => submit(() => {
    act.saveCourse({ id: saveId, name: name.trim(), rooms, teacher: teacher.trim(), goal: goal || null, sort: c0?.sort ?? count, demo: false, bar: c0?.bar ?? null });
    const plan = planSchedule(saveId, rows, getState().meetings, getState().variants, vid);
    plan.variants.forEach((v) => act.saveVariant(v));
    plan.meetings.forEach((m) => { const was = getState().meetings.find((x) => x.id === m.id); if (!was || was.weekday !== m.weekday || was.start !== m.start || was.end !== m.end || (was.room ?? null) !== m.room || (was.variantId ?? null) !== m.variantId) act.saveMeeting(m); });
    plan.removed.forEach((mid) => act.removeMeeting(mid));
    if (plan.problems.length) toast(plan.problems[0]!);
    close();
  });
  return (
    <Sheet title={c0 ? 'Edit subject' : 'New subject'} onClose={act.close} closeRef={closeRef} maxH={0.93} footer={<Row style={{ flexWrap: 'nowrap' }}>{c0 && <Btn kind="ghost" icon="trash" label="Delete" a11y="Delete subject" onPress={() => { act.removeCourse(c0.id); close(); }} />}<Btn flex label="Save" icon="check" disabled={!name.trim()} onPress={save} /></Row>}>
      <Field label="Name" value={name} onChangeText={setName} autoFocus={!c0} placeholder="e.g. Organic Chemistry" /><Field label="Teacher" value={teacher} onChangeText={setTeacher} />
      <Label>Rooms</Label><RoomChips rooms={rooms} onChange={setRooms} />
      <Label>When it meets, every week</Label>
      <ScheduleEditor rows={rows} onChange={setRows} rooms={rooms} hour12={hour12} />
      <Label>Grade goal</Label><NumberField label="goal" value={goal || null} onChange={(v) => setGoal(v ?? 0)} min={0} max={100} decimals={1} unit="%" emptyLabel="none" />
    </Sheet>
  );
}
/** The room a class form opens with: this class's own room, else the subject's first. */
const seedRoom = (m0: Meeting | undefined, all: Course[], c: string | null) => (m0 && m0.courseId === c ? m0.room ?? '' : '') || all.find((x) => x.id === c)?.rooms[0] || '';
export function MeetingSheet({ id, courseId, weekday }: { id?: string; courseId?: string; weekday?: number }) {
  const m0 = useStore((s) => s.meetings.find((x) => x.id === id)), first = useStore((s) => s.courses[0]?.id), all = useStore((s) => s.courses), hour12 = useStore((s) => s.settings.hour12), { closeRef, close } = useSheetClose(), [saveId] = useState(() => m0?.id ?? uid('m')), [submit] = useState(latch);
  const [cid, setCid] = useState(m0?.courseId ?? courseId ?? first ?? null), [wd, setWd] = useState(m0?.weekday ?? weekday ?? 0), [a, setA] = useState(hm(m0?.start ?? '09:00')), [b, setB] = useState(hm(m0?.end ?? '09:50'));
  /* v0.2 — the room is asked here, when you schedule the class, not when you name the subject. Since
     migration 5 a subject owns a LIST of rooms and each class names its own (`meeting.room`), so the
     field seeds from this class's room, else the subject's first, and switching the subject re-seeds it
     rather than carrying the last one typed. A room the subject does not list yet is added to its list. */
  const [room, setRoom] = useState(() => seedRoom(m0, all, cid)), roomFor = useRef(cid);
  useEffect(() => { if (roomFor.current !== cid) { roomFor.current = cid; setRoom(seedRoom(m0, all, cid)); } }, [cid, all, m0]);
  const bad = !cid || b <= a;
  const save = () => submit(() => {
    const r = room.trim(), course = all.find((x) => x.id === cid);
    const ok = act.saveMeeting({ id: saveId, courseId: cid as string, weekday: wd, start: fromMin(a), end: fromMin(b), demo: false, variantId: m0 && m0.courseId === cid ? m0.variantId ?? null : null, room: r || null });
    if (!ok) return;
    if (course && r && !course.rooms.some((x) => x.toLocaleLowerCase() === r.toLocaleLowerCase())) act.saveCourse({ ...course, rooms: [...course.rooms, r], demo: false });
    close();
  });
  return (
    <Sheet title={m0 ? 'Edit class' : 'Add class'} onClose={act.close} closeRef={closeRef} footer={<Row style={{ flexWrap: 'nowrap' }}>{m0 && <Btn kind="ghost" icon="trash" label="Delete" a11y="Delete class" onPress={() => { act.removeMeeting(m0.id); close(); }} />}<Btn flex label="Save" icon="check" disabled={bad} onPress={save} /></Row>}>
      <Label>Subject</Label><CourseChips value={cid} onChange={setCid} none={null} />
      <Field label="Room" value={room} onChangeText={setRoom} placeholder="e.g. B-12" />
      <Label>Day</Label><Row>{DW.map((d, i) => <Chip key={d} label={d} on={wd === i} onPress={() => setWd(i)} small />)}</Row>
      <Label>Starts</Label><TimeField label="start" value={a} min={0} max={1435} hour12={hour12} onChange={(v) => { setA(v); if (b <= v) setB(Math.min(1435, v + 50)); }} />
      <Label>Ends</Label><TimeField label="end" value={b} min={0} max={1435} hour12={hour12} onChange={setB} />
      {b <= a && <Txt f="bold" s={17} c="bad">The class has to end after it starts.</Txt>}
    </Sheet>
  );
}
export function MarkSheet({ courseId, id }: { courseId: string; id?: string }) {
  const m0 = useStore((s) => s.marks.find((x) => x.id === id)), count = useStore((s) => s.marks.filter((m) => m.courseId === courseId).length), { closeRef, close } = useSheetClose(), [saveId] = useState(() => m0?.id ?? uid('k')), [submit] = useState(latch);
  const [cid, setCid] = useState(m0?.courseId ?? courseId), [name, setName] = useState(m0?.name ?? ''), [score, setScore] = useState(m0?.score ?? 70), [has, setHas] = useState(m0 ? m0.score !== null : true), [weight, setWeight] = useState(m0?.weight ?? 10), [on, setOn] = useState(m0?.on ?? true);
  return (
    <Sheet title={m0 ? 'Edit mark' : 'Add mark'} onClose={act.close} closeRef={closeRef} footer={<Row style={{ flexWrap: 'nowrap' }}>{m0 && <Btn kind="ghost" icon="trash" label="Delete" a11y="Delete mark" onPress={() => { act.removeMark(m0.id); close(); }} />}<Btn flex label="Save" icon="check" disabled={!name.trim() || !cid} onPress={() => submit(() => { const mk: Mark = { id: saveId, courseId: cid, name: name.trim(), score: has ? score : null, weight, on, sort: m0?.sort ?? count, demo: false, variantId: m0 && m0.courseId === cid ? m0.variantId ?? null : null }; act.saveMark(mk); close(); })} /></Row>}>
      <Label>Subject</Label><CourseChips value={cid} onChange={(v) => v && setCid(v)} none={null} />
      <Field label="What was it?" value={name} onChangeText={setName} autoFocus={!m0} placeholder="e.g. Quiz 3" />
      <Toggle label="Already marked" value={has} onChange={setHas} />
      {has && <><Label>Score</Label><NumberField label="score" value={score} onChange={(v) => setScore(v ?? 0)} min={0} max={100} decimals={1} unit="%" /></>}
      <Label>Weight in the final grade</Label><NumberField label="weight" value={weight} onChange={(v) => setWeight(v ?? 0)} min={0} max={100} decimals={1} unit="%" />
      <Toggle label="Counts toward the total" value={on} onChange={setOn} />
    </Sheet>
  );
}
export function NoticeSheet({ id }: { id?: string }) {
  const n0 = useStore((s) => s.notices.find((x) => x.id === id)), { closeRef, close } = useSheetClose(), [saveId] = useState(() => n0?.id ?? uid('n')), [submit] = useState(latch);
  const [text, setText] = useState(n0?.text ?? ''), [cid, setCid] = useState(n0?.courseId ?? null), [pri, setPri] = useState<number>(n0?.priority ?? 0);
  /* A note can be FOR a day (a notice, as the name says). A note's stored date used to be the day it was
     pinned, so only a date still ahead is treated as one the user set (`noteDate`). No date = today's midnight,
     which never shows. */
  const [now] = useState(() => Date.now()), [when, setWhen] = useState<number | null>(() => (n0 ? noteDate(n0, now) : null));
  const homeAt = useStore((s) => s.settings.notif.homeAt), hour12 = useStore((s) => s.settings.hour12);
  return (
    <Sheet title={n0 ? 'Edit note' : 'New note'} onClose={act.close} closeRef={closeRef} footer={<Row style={{ flexWrap: 'nowrap' }}>{n0 && <Btn kind="ghost" icon="trash" label="Delete" a11y="Delete note" onPress={() => { act.removeNotice(n0.id); close(); }} />}<Btn flex label="Pin it" icon="check" disabled={!text.trim()} onPress={() => submit(() => { const n: Notice = { id: saveId, courseId: cid, text: text.trim(), dueAt: when ?? startOfDay(Date.now()), priority: pri as Notice['priority'], demo: false }; act.saveNotice(n); fx.tap(); close(); })} /></Row>}>
      <Field label="Note" multiline value={text} onChangeText={setText} autoFocus={!n0} placeholder="What should you remember?" />
      <Label>About</Label><CourseChips value={cid} onChange={setCid} />
      <Label>How important?</Label><Row style={{ flexWrap: 'wrap' }}>{NOTE_LEVEL.map((p, i) => <Chip key={p.word} label={p.word} icon={p.icon} on={pri === i} onPress={() => setPri(i)} small />)}</Row>
      <Label>For when?</Label><WhenPicker value={when} onChange={setWhen} now={now} homeAt={homeAt} optional nonePlaceholder="No date" h12={hour12} />
      <Hair />
    </Sheet>
  );
}
