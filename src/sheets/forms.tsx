import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Btn, Chip, EASE, Field, HandBox, HStrip, Icon, Reveal, Row, STEP, Stepper, Toggle, Txt, Hair } from '../ui/kit';
import { Label, Sheet, useSheetClose } from '../ui/Sheet';
import { latch } from '../ui/latch';
import { useReduceMotion, useTheme } from '../ui/theme-context';
import { FS } from '../ui/fit';
import { WhenPicker, nextHome } from './WhenPicker';
import { act, toast, useStore, type SheetSpec } from '../store/store';
import { ST, CYCLE } from '../domain/attendance';
import { DW, fmtDur, fmtWhen, fromMin, hm, uid, startOfDay } from '../domain/time';
import { workload } from '../domain/reminders';
import type { AttStatus, DayStatus, Mark, Notice, ReminderSpec, Task, TaskKind } from '../domain/types';
import { fx } from '../services/fx';

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
  return (
    <View>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0 }, comfortable]}>
        <HandBox seed="wl" shadow={false} fill={c.card} stroke={c.ink} style={{ padding: 10 }}><Txt f="bold" s={19}>Comfortable: needs ~{fmtDur(needMin)}, you have ~{fmtDur(freeMin)} free before it is due.</Txt></HandBox>
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0 }, tightStyle]}>
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

/* ───── Add: big tiles in the thumb zone ───── */
export function AddSheet() {
  const { closeRef, close } = useSheetClose(), { c } = useTheme();
  const courses = useStore((s) => s.courses);
  /* A mark belongs to a subject, so its tile only leads anywhere once one exists. Hidden rather than
     disabled: a greyed tile that cannot say why is worse than a sheet that lists what can be added.
     Typed on the array itself: `SheetSpec`'s literal `t` would widen to `string` through `.filter`. */
  const all: { l: string; i: string; to: SheetSpec }[] = [
    { l: 'Assignment', i: 'tasks', to: { t: 'task', kind: 'assignment' } }, { l: 'Exam', i: 'exam', to: { t: 'task', kind: 'exam' } }, { l: 'Reading', i: 'book', to: { t: 'task', kind: 'reading' } }, { l: 'Project', i: 'flag', to: { t: 'task', kind: 'project' } },
    { l: 'Class', i: 'week', to: { t: 'meeting' } }, { l: 'Mark', i: 'grades', to: { t: 'mark', courseId: '' } }, { l: 'Note', i: 'note', to: { t: 'notice' } }, { l: 'Subject', i: 'grad', to: { t: 'course' } },
  ];
  const tiles = all.filter((t) => t.l !== 'Mark' || courses.length > 0);
  return (
    <Sheet title="Add" onClose={act.close} maxH={0.6} closeRef={closeRef}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map((t, i) => (
          <View key={t.l} style={{ width: '23%', flexGrow: 1 }}>
            <Btn kind="ghost" a11y={`Add ${t.l}`} onPress={() => act.open(t.to.t === 'mark' ? { t: 'mark', courseId: courses[0]?.id ?? '' } : t.to)} style={{ minHeight: 86 }} label="" />
            {/* `pointerEvents="none"` only stops touches — the icon and label here were still a second,
                separate node for TalkBack on top of the button's own label. Hidden from accessibility so each
                tile announces once, as "Add <thing>" (every button announces one label). */}
            <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 4, transform: [{ rotate: `${(i % 3 - 1) * 1.2}deg` }] }}><Icon name={t.i} size={28} color={c.acc} /><Txt f="bold" s={17} maxFontSizeMultiplier={FS}>{t.l}</Txt></View>
          </View>
        ))}
      </View>
      <Btn label="Start a focus session" icon="timer" kind="ink" onPress={() => close(() => act.focusOpen(null))} />
    </Sheet>
  );
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
      footer={<Row style={{ flexWrap: 'nowrap' }}>{existing && <Btn kind="ghost" icon="trash" a11y="Delete" onPress={() => { act.removeTask(existing.id); close(); }} />}{existing && <Btn kind="ghost" icon="timer" a11y="Focus on this" onPress={() => close(() => act.focusOpen(existing.id))} />}<Btn flex label={existing ? 'Save' : 'Add'} icon="check" disabled={!title.trim()} onPress={save} /></Row>}>
      <Field label="What is it?" placeholder="e.g. Problem set 6" value={title} onChangeText={setTitle} autoFocus={!existing} returnKeyType="done" />
      <HStrip gap={8} bg={c.card}>{KINDS.map((x) => <Chip key={x.k} label={x.l} icon={x.i} on={k === x.k} onPress={() => setK(x.k)} />)}</HStrip>
      <Label>Subject (optional)</Label><CourseChips value={cid} onChange={setCid} />
      <Label>Due</Label><WhenPicker value={due} onChange={setDue} now={now} homeAt={nset.homeAt} optional nonePlaceholder="No due date" h12={hour12} />
      {!showStart ? <Chip label="+ Start date" icon="flag" onPress={() => setShowStart(true)} small /> : <Reveal open><Label>Starts (it shows up from then, with a nudge)</Label><WhenPicker value={start} onChange={setStart} now={now} homeAt={nset.homeAt} optional nonePlaceholder="Starts now" h12={hour12} /></Reveal>}
      <Label>How long will it take?</Label>
      <Stepper label="effort" value={est} min={0} max={720} step={15} fmt={(v) => (v ? fmtDur(v) : 'unknown')} onChange={setEst} />
      {w && <Fit tight={!!w.tight} needMin={w.needMin} freeMin={Math.round(w.freeMin)} startBy={fmtWhen(w.startBy, now, hour12)} />}
      {due ? <>
        <Label>Remind me</Label>
        <Row>{OFFS.map((o) => <Chip key={o.m} label={o.l} on={has(o.m)} onPress={() => toggleOff(o.m)} small />)}
          {home && home < due && <Chip label="When I get home" icon="bell" on={hasHome} small onPress={() => setRem((r) => (hasHome ? r.filter((x) => !(x.mode === 'abs' && x.label === 'When I get home')) : [...r, { id: uid('r'), mode: 'abs', at: home, label: 'When I get home' }]))} />}
          {rem.filter((r) => (r.mode === 'before' && !OFFS.some((o) => o.m === r.minutes)) || (r.mode === 'abs' && r.label !== 'When I get home')).map((r) => <Chip key={r.id} on small label={r.mode === 'abs' ? fmtWhen(r.at, now, hour12) : r.label} icon="x" onPress={() => setRem((x) => x.filter((y) => y.id !== r.id))} />)}</Row>
        <Row><Stepper label="custom lead" value={custom} min={5} max={10080} step={5} fmt={fmtDur} onChange={setCustom} /><Btn small kind="ghost" label="+ add" onPress={() => { if (!has(custom)) setRem((r) => [...r, { id: uid('r'), mode: 'before', minutes: custom, label: `${fmtDur(custom)} before` }]); }} /><Btn small kind="ghost" label="+ at a time" onPress={() => setAddAt(!addAt)} /></Row>
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
export function StatusSheet({ spec }: { spec: Extract<SheetSpec, { t: 'status' }> }) {
  const dayMarks = useStore((s) => s.dayMarks), attendance = useStore((s) => s.attendance);
  const st = { dayMarks, attendance };
  const { closeRef, close } = useSheetClose(), isDay = spec.t === 'status' && spec.mode === 'day';
  const cur = isDay ? st.dayMarks[spec.date]?.status : st.attendance[spec.key]?.status, [why, setWhy] = useState(isDay ? st.dayMarks[spec.date]?.reason ?? '' : st.attendance[spec.key]?.reason ?? '');
  const opts: AttStatus[] = isDay ? ['p', 'a', 's', 'c'] : [...CYCLE, 'n', 't'].filter((x, i, a) => a.indexOf(x) === i) as AttStatus[];
  return (
    <Sheet title={spec.title} onClose={act.close} maxH={0.7} closeRef={closeRef}>
      <Txt f="serif" s={16} c="mut">{isDay ? 'Mark the whole day' : 'How did this class go?'}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {/* `Btn` has no selected state of its own, so the current mark is spelled out in the label: without
            it TalkBack says "Here", "Late", ... seven times and never says which one is already set. */}
        {opts.map((s) => <View key={s} style={{ width: '47%', flexGrow: 1 }}><Btn kind={cur === s ? 'primary' : 'ghost'} label={ST[s]} a11y={`${ST[s]}${cur === s ? ', currently set' : ''}`} onPress={() => { if (isDay) act.setDay(spec.date, s as DayStatus, why); else act.setAtt(spec.key, s, why); close(); }} /></View>)}
      </View>
      <Field label="Reason (optional)" value={why} onChangeText={setWhy} placeholder="e.g. bus broke down" />
      {(isDay ? st.dayMarks[spec.date] : st.attendance[spec.key]) && <Btn kind="ghost" icon="x" label="Back to automatic" onPress={() => { if (isDay) act.clearDay(spec.date); else act.clearAtt(spec.key); close(); }} />}
    </Sheet>
  );
}

/* ───── course / meeting / mark / notice ─────
   Each save below writes `demo: false` — "you touched it, it's yours" (see the task form above): a
   sample subject the user renames or fills with their own grades must not be deleted as sample data. */
export function CourseSheet({ id }: { id?: string }) {
  const c0 = useStore((s) => s.courses.find((x) => x.id === id)), count = useStore((s) => s.courses.length), { closeRef, close } = useSheetClose(), [saveId] = useState(() => c0?.id ?? uid('c')), [submit] = useState(latch);
  const [name, setName] = useState(c0?.name ?? ''), [room, setRoom] = useState(c0?.room ?? ''), [teacher, setTeacher] = useState(c0?.teacher ?? ''), [goal, setGoal] = useState(c0?.goal ?? 0);
  return (
    <Sheet title={c0 ? 'Edit subject' : 'New subject'} onClose={act.close} closeRef={closeRef} footer={<Row style={{ flexWrap: 'nowrap' }}>{c0 && <Btn kind="ghost" icon="trash" a11y="Delete subject" onPress={() => { act.removeCourse(c0.id); close(); }} />}<Btn flex label="Save" icon="check" disabled={!name.trim()} onPress={() => submit(() => { act.saveCourse({ id: saveId, name: name.trim(), room: room.trim(), teacher: teacher.trim(), goal: goal || null, sort: c0?.sort ?? count, demo: false }); close(); })} /></Row>}>
      <Field label="Name" value={name} onChangeText={setName} autoFocus={!c0} placeholder="e.g. Organic Chemistry" /><Field label="Room" value={room} onChangeText={setRoom} /><Field label="Teacher" value={teacher} onChangeText={setTeacher} />
      <Label>Grade goal</Label><Stepper label="goal" value={goal} min={0} max={100} fmt={(v) => (v ? `${v}%` : 'none')} onChange={setGoal} />
    </Sheet>
  );
}
export function MeetingSheet({ id, courseId, weekday }: { id?: string; courseId?: string; weekday?: number }) {
  const m0 = useStore((s) => s.meetings.find((x) => x.id === id)), first = useStore((s) => s.courses[0]?.id), { closeRef, close } = useSheetClose(), [saveId] = useState(() => m0?.id ?? uid('m')), [submit] = useState(latch);
  const [cid, setCid] = useState(m0?.courseId ?? courseId ?? first ?? null), [wd, setWd] = useState(m0?.weekday ?? weekday ?? 0), [a, setA] = useState(hm(m0?.start ?? '09:00')), [b, setB] = useState(hm(m0?.end ?? '09:50'));
  const bad = !cid || b <= a;
  return (
    <Sheet title={m0 ? 'Edit class' : 'Add class'} onClose={act.close} closeRef={closeRef} footer={<Row style={{ flexWrap: 'nowrap' }}>{m0 && <Btn kind="ghost" icon="trash" a11y="Delete class" onPress={() => { act.removeMeeting(m0.id); close(); }} />}<Btn flex label="Save" icon="check" disabled={bad} onPress={() => submit(() => { act.saveMeeting({ id: saveId, courseId: cid as string, weekday: wd, start: fromMin(a), end: fromMin(b), demo: false }); close(); })} /></Row>}>
      <Label>Subject</Label><CourseChips value={cid} onChange={setCid} none={null} />
      <Label>Day</Label><Row>{DW.map((d, i) => <Chip key={d} label={d} on={wd === i} onPress={() => setWd(i)} small />)}</Row>
      <Label>Starts</Label><Stepper label="start" value={a} min={360} max={1320} step={5} fmt={fromMin} onChange={(v) => { setA(v); if (b <= v) setB(v + 50); }} />
      <Label>Ends</Label><Stepper label="end" value={b} min={a + 5} max={1380} step={5} fmt={fromMin} onChange={setB} />
      {b <= a && <Txt f="bold" s={17} c="bad">The class has to end after it starts.</Txt>}
    </Sheet>
  );
}
export function MarkSheet({ courseId, id }: { courseId: string; id?: string }) {
  const m0 = useStore((s) => s.marks.find((x) => x.id === id)), count = useStore((s) => s.marks.filter((m) => m.courseId === courseId).length), { closeRef, close } = useSheetClose(), [saveId] = useState(() => m0?.id ?? uid('k')), [submit] = useState(latch);
  const [cid, setCid] = useState(m0?.courseId ?? courseId), [name, setName] = useState(m0?.name ?? ''), [score, setScore] = useState(m0?.score ?? 70), [has, setHas] = useState(m0 ? m0.score !== null : true), [weight, setWeight] = useState(m0?.weight ?? 10), [on, setOn] = useState(m0?.on ?? true);
  return (
    <Sheet title={m0 ? 'Edit mark' : 'Add mark'} onClose={act.close} closeRef={closeRef} footer={<Row style={{ flexWrap: 'nowrap' }}>{m0 && <Btn kind="ghost" icon="trash" a11y="Delete mark" onPress={() => { act.removeMark(m0.id); close(); }} />}<Btn flex label="Save" icon="check" disabled={!name.trim() || !cid} onPress={() => submit(() => { const mk: Mark = { id: saveId, courseId: cid, name: name.trim(), score: has ? score : null, weight, on, sort: m0?.sort ?? count, demo: false }; act.saveMark(mk); close(); })} /></Row>}>
      <Label>Subject</Label><CourseChips value={cid} onChange={(v) => v && setCid(v)} none={null} />
      <Field label="What was it?" value={name} onChangeText={setName} autoFocus={!m0} placeholder="e.g. Quiz 3" />
      <Toggle label="Already marked" value={has} onChange={setHas} />
      {has && <><Label>Score</Label><Stepper label="score" value={score} min={0} max={100} fmt={(v) => `${v}%`} onChange={setScore} /></>}
      <Label>Weight in the final grade</Label><Stepper label="weight" value={weight} min={0} max={100} step={5} fmt={(v) => `${v}%`} onChange={setWeight} />
      <Toggle label="Counts toward the total" value={on} onChange={setOn} />
    </Sheet>
  );
}
export function NoticeSheet({ id }: { id?: string }) {
  const n0 = useStore((s) => s.notices.find((x) => x.id === id)), { closeRef, close } = useSheetClose(), [saveId] = useState(() => n0?.id ?? uid('n')), [submit] = useState(latch);
  const [text, setText] = useState(n0?.text ?? ''), [cid, setCid] = useState(n0?.courseId ?? null), [pri, setPri] = useState<number>(n0?.priority ?? 0);
  return (
    <Sheet title={n0 ? 'Edit note' : 'New note'} onClose={act.close} closeRef={closeRef} footer={<Row style={{ flexWrap: 'nowrap' }}>{n0 && <Btn kind="ghost" icon="trash" a11y="Delete note" onPress={() => { act.removeNotice(n0.id); close(); }} />}<Btn flex label="Pin it" icon="check" disabled={!text.trim()} onPress={() => submit(() => { const n: Notice = { id: saveId, courseId: cid, text: text.trim(), dueAt: n0?.dueAt ?? startOfDay(Date.now()), priority: pri as Notice['priority'], demo: false }; act.saveNotice(n); fx.tap(); close(); })} /></Row>}>
      <Field label="Note" multiline value={text} onChangeText={setText} autoFocus={!n0} placeholder="What should you remember?" />
      <Label>About</Label><CourseChips value={cid} onChange={setCid} />
      <Label>How important?</Label><Row>{['Note', 'Heads-up', 'Important', 'Urgent'].map((p, i) => <Chip key={p} label={p} on={pri === i} onPress={() => setPri(i)} small />)}</Row>
      <Hair />
    </Sheet>
  );
}
