import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Btn, Chip, Field, HandBox, HStrip, Icon, Row, Stepper, Toggle, Txt, Hair } from '../ui/kit';
import { Label, Sheet, useSheet } from '../ui/Sheet';
import { latch } from '../ui/latch';
import { useTheme } from '../ui/theme-context';
import { FS } from '../ui/fit';
import { WhenPicker, nextHome } from './WhenPicker';
import { act, toast, useStore, type SheetSpec } from '../store/store';
import { ST, CYCLE } from '../domain/attendance';
import { DW, fmtDur, fmtWhen, fromMin, hm, uid, startOfDay } from '../domain/time';
import { workload } from '../domain/reminders';
import type { AttStatus, DayStatus, Mark, Notice, ReminderSpec, Task, TaskKind } from '../domain/types';
import { fx } from '../services/fx';

const KINDS: { k: TaskKind; l: string; i: string }[] = [{ k: 'assignment', l: 'Assignment', i: 'tasks' }, { k: 'exam', l: 'Exam', i: 'exam' }, { k: 'reading', l: 'Reading', i: 'book' }, { k: 'project', l: 'Project', i: 'flag' }, { k: 'lab', l: 'Lab', i: 'lab' }, { k: 'other', l: 'Other', i: 'pencil' }];
const PRI = ['None', 'Low', 'Medium', 'High'];

export function CourseChips({ value, onChange, none = 'No subject' }: { value: string | null; onChange: (v: string | null) => void; none?: string | null }) {
  const courses = useStore((s) => s.courses), { c } = useTheme();
  return <HStrip gap={8} bg={c.card}>{none !== null && <Chip label={none} on={value === null} onPress={() => onChange(null)} />}{courses.map((c) => <Chip key={c.id} label={c.name} on={value === c.id} onPress={() => onChange(c.id)} />)}</HStrip>;
}

/* ───── Add: eight big tiles in the thumb zone ───── */
export function AddSheet() {
  const { close } = useSheet(), { c } = useTheme();
  const tiles: { l: string; i: string; to: SheetSpec }[] = [
    { l: 'Assignment', i: 'tasks', to: { t: 'task', kind: 'assignment' } }, { l: 'Exam', i: 'exam', to: { t: 'task', kind: 'exam' } }, { l: 'Reading', i: 'book', to: { t: 'task', kind: 'reading' } }, { l: 'Project', i: 'flag', to: { t: 'task', kind: 'project' } },
    { l: 'Class', i: 'week', to: { t: 'meeting' } }, { l: 'Mark', i: 'grades', to: { t: 'mark', courseId: '' } }, { l: 'Note', i: 'note', to: { t: 'notice' } }, { l: 'Subject', i: 'grad', to: { t: 'course' } },
  ];
  const courses = useStore((s) => s.courses);
  return (
    <Sheet title="Add" onClose={act.close} maxH={0.6}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {tiles.map((t, i) => (
          <View key={t.l} style={{ width: '23%', flexGrow: 1 }}>
            <Btn kind="ghost" a11y={`Add ${t.l}`} onPress={() => act.open(t.to.t === 'mark' ? { t: 'mark', courseId: courses[0]?.id ?? '' } : t.to)} style={{ minHeight: 86 }} label="" />
            {/* `pointerEvents="none"` only stops touches — the icon and label here were still a second,
                separate node for TalkBack on top of the button's own label. Hidden from accessibility so each
                tile announces once, as "Add <thing>" (V14: every button announces a label). */}
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
  const tasks = useStore((s) => s.tasks), meetings = useStore((s) => s.meetings), attendance = useStore((s) => s.attendance), dayMarks = useStore((s) => s.dayMarks), nset = useStore((s) => s.settings.notif);
  const st = { tasks, meetings, attendance, dayMarks };
  const existing = id ? st.tasks.find((t) => t.id === id) : undefined, [now] = useState(() => Date.now());
  const [title, setTitle] = useState(existing?.title ?? ''), [k, setK] = useState<TaskKind>(existing?.kind ?? kind ?? 'assignment'), [cid, setCid] = useState<string | null>(existing ? existing.courseId : courseId ?? null);
  const [due, setDue] = useState<number | null>(existing ? existing.dueAt : null), [start, setStart] = useState<number | null>(existing?.startAt ?? null), [est, setEst] = useState(existing?.estimateMin ?? 0), [pri, setPri] = useState<number>(existing?.priority ?? 0);
  const [notes, setNotes] = useState(existing?.notes ?? ''), [subs, setSubs] = useState(existing?.subtasks ?? []), [ns, setNs] = useState(''), [showStart, setShowStart] = useState(!!existing?.startAt), [custom, setCustom] = useState(60), [addAt, setAddAt] = useState(false), [atV, setAtV] = useState<number | null>(null);
  const [rem, setRem] = useState<ReminderSpec[]>(existing?.reminders ?? nset.defaultTaskMinutes.map((m) => ({ id: uid('r'), mode: 'before' as const, minutes: m, label: m ? `${fmtDur(m)} before` : 'At due time' })));
  const { close } = useSheet(), { c } = useTheme(), [saveId] = useState(() => existing?.id ?? uid('t')), [submit] = useState(latch);
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
    act.saveTask(t); toast(existing ? 'Saved' : `${KINDS.find((x) => x.k === k)?.l ?? 'Task'} added${due ? ` · due ${fmtWhen(due, now)}` : ''}`); close();
  });
  return (
    <Sheet title={existing ? 'Edit' : KINDS.find((x) => x.k === k)?.l ?? 'Task'} onClose={act.close} maxH={0.93}
      footer={<Row style={{ flexWrap: 'nowrap' }}>{existing && <Btn kind="ghost" icon="trash" a11y="Delete" onPress={() => { act.removeTask(existing.id); close(); }} />}{existing && <Btn kind="ghost" icon="timer" a11y="Focus on this" onPress={() => close(() => act.focusOpen(existing.id))} />}<Btn flex label={existing ? 'Save' : 'Add'} icon="check" disabled={!title.trim()} onPress={save} /></Row>}>
      <Field label="What is it?" placeholder="e.g. Problem set 6" value={title} onChangeText={setTitle} autoFocus={!existing} returnKeyType="done" />
      <HStrip gap={8} bg={c.card}>{KINDS.map((x) => <Chip key={x.k} label={x.l} icon={x.i} on={k === x.k} onPress={() => setK(x.k)} />)}</HStrip>
      <Label>Subject (optional)</Label><CourseChips value={cid} onChange={setCid} />
      <Label>Due</Label><WhenPicker value={due} onChange={setDue} now={now} homeAt={nset.homeAt} optional nonePlaceholder="No due date" />
      {!showStart ? <Chip label="+ Start date" icon="flag" onPress={() => setShowStart(true)} small /> : <><Label>Starts (it shows up from then, with a nudge)</Label><WhenPicker value={start} onChange={setStart} now={now} homeAt={nset.homeAt} optional nonePlaceholder="Starts now" /></>}
      <Label>How long will it take?</Label>
      <Stepper label="effort" value={est} min={0} max={720} step={15} fmt={(v) => (v ? fmtDur(v) : 'unknown')} onChange={setEst} />
      {w && <HandBox seed="wl" shadow={false} fill={w.tight ? c.hl : c.card} stroke={w.tight ? c.warn : c.ink} style={{ padding: 10 }}><Txt f="bold" s={19} c={w.tight ? 'warn' : 'ink'}>{w.tight ? 'Tight: ' : 'Comfortable: '}needs ~{fmtDur(w.needMin)}, you have ~{fmtDur(Math.round(w.freeMin))} free before it is due.</Txt><Txt f="serif" s={15} c="mut">Latest start: {fmtWhen(w.startBy, now)} (classes, sleep and quiet hours already excluded)</Txt></HandBox>}
      {due ? <>
        <Label>Remind me</Label>
        <Row>{OFFS.map((o) => <Chip key={o.m} label={o.l} on={has(o.m)} onPress={() => toggleOff(o.m)} small />)}
          {home && home < due && <Chip label="When I get home" icon="bell" on={hasHome} small onPress={() => setRem((r) => (hasHome ? r.filter((x) => !(x.mode === 'abs' && x.label === 'When I get home')) : [...r, { id: uid('r'), mode: 'abs', at: home, label: 'When I get home' }]))} />}
          {rem.filter((r) => (r.mode === 'before' && !OFFS.some((o) => o.m === r.minutes)) || (r.mode === 'abs' && r.label !== 'When I get home')).map((r) => <Chip key={r.id} on small label={r.mode === 'abs' ? fmtWhen(r.at, now) : r.label} icon="x" onPress={() => setRem((x) => x.filter((y) => y.id !== r.id))} />)}</Row>
        <Row><Stepper label="custom lead" value={custom} min={5} max={10080} step={5} fmt={fmtDur} onChange={setCustom} /><Btn small kind="ghost" label="+ add" onPress={() => { if (!has(custom)) setRem((r) => [...r, { id: uid('r'), mode: 'before', minutes: custom, label: `${fmtDur(custom)} before` }]); }} /><Btn small kind="ghost" label="+ at a time" onPress={() => setAddAt(!addAt)} /></Row>
        {addAt && <><WhenPicker value={atV} onChange={setAtV} now={now} homeAt={nset.homeAt} nonePlaceholder="Pick a time" /><Btn small label="Add this reminder" disabled={!atV} onPress={() => { if (atV) { setRem((r) => [...r, { id: uid('r'), mode: 'abs', at: atV, label: 'At a chosen time' }]); setAtV(null); setAddAt(false); } }} /></>}
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
export function StatusSheet({ spec }: { spec: Extract<SheetSpec, { t: 'status' | 'slip' }> }) {
  const dayMarks = useStore((s) => s.dayMarks), attendance = useStore((s) => s.attendance);
  const st = { dayMarks, attendance };
  const { close } = useSheet(), isDay = spec.t === 'status' && spec.mode === 'day';
  const cur = isDay ? st.dayMarks[spec.date]?.status : st.attendance[spec.key]?.status, [why, setWhy] = useState(isDay ? st.dayMarks[spec.date]?.reason ?? '' : st.attendance[spec.key]?.reason ?? '');
  const opts: AttStatus[] = isDay ? ['p', 'a', 's', 'c'] : [...CYCLE, 'n', 't'].filter((x, i, a) => a.indexOf(x) === i) as AttStatus[];
  return (
    <Sheet title={spec.title} onClose={act.close} maxH={0.7}>
      <Txt f="serif" s={16} c="mut">{isDay ? 'Mark the whole day' : 'How did this class go?'}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {/* `Btn` has no selected state of its own, so the current mark is spelled out in the label: without
            it TalkBack says "Here", "Late", ... seven times and never says which one is already set (V14). */}
        {opts.map((s) => <View key={s} style={{ width: '47%', flexGrow: 1 }}><Btn kind={cur === s ? 'primary' : 'ghost'} label={ST[s]} a11y={`${ST[s]}${cur === s ? ', currently set' : ''}`} onPress={() => { if (isDay) act.setDay(spec.date, s as DayStatus, why); else act.setAtt(spec.key, s, why); close(); }} /></View>)}
      </View>
      <Field label="Reason (optional)" value={why} onChangeText={setWhy} placeholder="e.g. bus broke down" />
      {(isDay ? st.dayMarks[spec.date] : st.attendance[spec.key]) && <Btn kind="ghost" icon="x" label="Back to automatic" onPress={() => { if (isDay) act.clearDay(spec.date); else act.clearAtt(spec.key); close(); }} />}
    </Sheet>
  );
}

/* ───── course / meeting / mark / notice ───── */
export function CourseSheet({ id }: { id?: string }) {
  const c0 = useStore((s) => s.courses.find((x) => x.id === id)), count = useStore((s) => s.courses.length), { close } = useSheet(), [saveId] = useState(() => c0?.id ?? uid('c')), [submit] = useState(latch);
  const [name, setName] = useState(c0?.name ?? ''), [room, setRoom] = useState(c0?.room ?? ''), [teacher, setTeacher] = useState(c0?.teacher ?? ''), [goal, setGoal] = useState(c0?.goal ?? 0);
  return (
    <Sheet title={c0 ? 'Edit subject' : 'New subject'} onClose={act.close} footer={<Row style={{ flexWrap: 'nowrap' }}>{c0 && <Btn kind="ghost" icon="trash" a11y="Delete subject" onPress={() => { act.removeCourse(c0.id); close(); }} />}<Btn flex label="Save" icon="check" disabled={!name.trim()} onPress={() => submit(() => { act.saveCourse({ id: saveId, name: name.trim(), room: room.trim(), teacher: teacher.trim(), goal: goal || null, sort: c0?.sort ?? count }); close(); })} /></Row>}>
      <Field label="Name" value={name} onChangeText={setName} autoFocus={!c0} placeholder="e.g. Organic Chemistry" /><Field label="Room" value={room} onChangeText={setRoom} /><Field label="Teacher" value={teacher} onChangeText={setTeacher} />
      <Label>Grade goal</Label><Stepper label="goal" value={goal} min={0} max={100} fmt={(v) => (v ? `${v}%` : 'none')} onChange={setGoal} />
    </Sheet>
  );
}
export function MeetingSheet({ id, courseId, weekday }: { id?: string; courseId?: string; weekday?: number }) {
  const m0 = useStore((s) => s.meetings.find((x) => x.id === id)), first = useStore((s) => s.courses[0]?.id), { close } = useSheet(), [saveId] = useState(() => m0?.id ?? uid('m')), [submit] = useState(latch);
  const [cid, setCid] = useState(m0?.courseId ?? courseId ?? first ?? null), [wd, setWd] = useState(m0?.weekday ?? weekday ?? 0), [a, setA] = useState(hm(m0?.start ?? '09:00')), [b, setB] = useState(hm(m0?.end ?? '09:50'));
  const bad = !cid || b <= a;
  return (
    <Sheet title={m0 ? 'Edit class' : 'Add class'} onClose={act.close} footer={<Row style={{ flexWrap: 'nowrap' }}>{m0 && <Btn kind="ghost" icon="trash" a11y="Delete class" onPress={() => { act.removeMeeting(m0.id); close(); }} />}<Btn flex label="Save" icon="check" disabled={bad} onPress={() => submit(() => { act.saveMeeting({ id: saveId, courseId: cid as string, weekday: wd, start: fromMin(a), end: fromMin(b) }); close(); })} /></Row>}>
      <Label>Subject</Label><CourseChips value={cid} onChange={setCid} none={null} />
      <Label>Day</Label><Row>{DW.map((d, i) => <Chip key={d} label={d} on={wd === i} onPress={() => setWd(i)} small />)}</Row>
      <Label>Starts</Label><Stepper label="start" value={a} min={360} max={1320} step={5} fmt={fromMin} onChange={(v) => { setA(v); if (b <= v) setB(v + 50); }} />
      <Label>Ends</Label><Stepper label="end" value={b} min={a + 5} max={1380} step={5} fmt={fromMin} onChange={setB} />
      {b <= a && <Txt f="bold" s={17} c="bad">The class has to end after it starts.</Txt>}
    </Sheet>
  );
}
export function MarkSheet({ courseId, id }: { courseId: string; id?: string }) {
  const m0 = useStore((s) => s.marks.find((x) => x.id === id)), count = useStore((s) => s.marks.filter((m) => m.courseId === courseId).length), { close } = useSheet(), [saveId] = useState(() => m0?.id ?? uid('k')), [submit] = useState(latch);
  const [cid, setCid] = useState(m0?.courseId ?? courseId), [name, setName] = useState(m0?.name ?? ''), [score, setScore] = useState(m0?.score ?? 70), [has, setHas] = useState(m0 ? m0.score !== null : true), [weight, setWeight] = useState(m0?.weight ?? 10), [on, setOn] = useState(m0?.on ?? true);
  return (
    <Sheet title={m0 ? 'Edit mark' : 'Add mark'} onClose={act.close} footer={<Row style={{ flexWrap: 'nowrap' }}>{m0 && <Btn kind="ghost" icon="trash" a11y="Delete mark" onPress={() => { act.removeMark(m0.id); close(); }} />}<Btn flex label="Save" icon="check" disabled={!name.trim() || !cid} onPress={() => submit(() => { const mk: Mark = { id: saveId, courseId: cid, name: name.trim(), score: has ? score : null, weight, on, sort: m0?.sort ?? count }; act.saveMark(mk); close(); })} /></Row>}>
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
  const n0 = useStore((s) => s.notices.find((x) => x.id === id)), { close } = useSheet(), [saveId] = useState(() => n0?.id ?? uid('n')), [submit] = useState(latch);
  const [text, setText] = useState(n0?.text ?? ''), [cid, setCid] = useState(n0?.courseId ?? null), [pri, setPri] = useState<number>(n0?.priority ?? 0);
  return (
    <Sheet title={n0 ? 'Edit note' : 'New note'} onClose={act.close} footer={<Row style={{ flexWrap: 'nowrap' }}>{n0 && <Btn kind="ghost" icon="trash" a11y="Delete note" onPress={() => { act.removeNotice(n0.id); close(); }} />}<Btn flex label="Pin it" icon="check" disabled={!text.trim()} onPress={() => submit(() => { const n: Notice = { id: saveId, courseId: cid, text: text.trim(), dueAt: n0?.dueAt ?? startOfDay(Date.now()), read: false, priority: pri as Notice['priority'] }; act.saveNotice(n); fx.tap(); close(); })} /></Row>}>
      <Field label="Note" multiline value={text} onChangeText={setText} autoFocus={!n0} placeholder="What should you remember?" />
      <Label>About</Label><CourseChips value={cid} onChange={setCid} />
      <Label>How important?</Label><Row>{['Note', 'Heads-up', 'Important', 'Urgent'].map((p, i) => <Chip key={p} label={p} on={pri === i} onPress={() => setPri(i)} small />)}</Row>
      <Hair />
    </Sheet>
  );
}
