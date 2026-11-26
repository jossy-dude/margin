import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, View, type ScrollViewInstance } from 'react-native';
import { Btn, HandBox, HStrip, Icon, Row, Txt } from '../ui/kit';
import { NumberField } from '../ui/fields';
import { useTheme } from '../ui/theme-context';
import { useLiveNow } from '../ui/live';
import { act, getState, useStore } from '../store/store';
import { attNews } from './faceNews';
import { AttCell, Empty, Page, Section, spokenStatus } from './common';
import { fx } from '../services/fx';
import { courseGrade, courseNeeded, letter, partGrades } from '../domain/grades';
import { cumulative, termGpa } from '../domain/gpa';
import { roomsLabel } from '../domain/rooms';
import { inPart, labSplitOffer, partsOf, teacherKey } from '../domain/parts';
import { canMiss } from '../domain/analytics';
import { FS } from '../ui/fit';
import { effective, nextStatus, occKey, occurrencesBetween, attendanceRate } from '../domain/attendance';
import { DW, atTime, startOfDay, ymd, fmtDay, fmtTime } from '../domain/time';
import { semesterFirstDay, semesterLabel } from '../domain/semester';
import type { Course } from '../domain/types';
import { subjectTint } from '../ui/collage/tint';
import { hexA } from '../tokens/theme';
import { emptyFace, faceEvent, pageFace } from '../ui/mascot/moments';

/** v0.7.7.2 (SPEC §3): `Lecture 92 % | Lab 75 %`. Both percentages always show; the strip, the goal line and the
 *  teacher's count below are the selected part's. 40 dp tall, each half at least 48 dp wide. */
function PartSwitch({ items, sel, onSel }: { items: { id: string; name: string; pct: number | null }[]; sel: string; onSel: (id: string) => void }) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', alignSelf: 'flex-start', height: 40, borderRadius: 12, borderWidth: 1.2, borderColor: hexA(c.ink, 0.25), overflow: 'hidden' }}>
      {items.map((x, i) => {
        const on = x.id === sel;
        return (
          <Pressable key={x.id} testID={`part-${x.name.toLowerCase()}`} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${x.name}, ${x.pct === null ? 'nothing marked yet' : `${x.pct} percent`}`}
            onPress={() => { if (!on) { fx.select(); onSel(x.id); } }}
            style={{ minWidth: 48, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: on ? c.ink : 'transparent', borderLeftWidth: i ? 1.2 : 0, borderLeftColor: hexA(c.ink, 0.25) }}>
            <Txt f="bold" s={15} maxFontSizeMultiplier={FS} style={{ color: on ? c.paper : c.ink }} numberOfLines={1}>{`${x.name} ${x.pct === null ? '–' : `${x.pct} %`}`}</Txt>
          </Pressable>);
      })}
    </View>
  );
}

function AttendanceGrid({ course }: { course: Course }) {
  const locked = useStore((s) => s.settings.lockAttendance), moves = useStore((s) => s.settings.moves), semesterStart = useStore((s) => s.settings.semesterStart), teacherAbsent = useStore((s) => s.settings.teacherAbsent), hour12 = useStore((s) => s.settings.hour12), meetings = useStore((s) => s.meetings), attendance = useStore((s) => s.attendance), dayMarks = useStore((s) => s.dayMarks), variants = useStore((s) => s.variants);
  /* The grid's own clock, frozen while this page is not the one on screen (audit M5) — an inferred
     "Here" only appears once a class has ended, so the tick is only useful under the finger. */
  const { c, tints } = useTheme(), now = useLiveNow(60_000), sem = semesterFirstDay({ semesterStart }, now);
  const mine = useMemo(() => meetings.filter((m) => m.courseId === course.id), [meetings, course.id]);
  const allOcc = useMemo(() => occurrencesBetween(sem, startOfDay(now) + 7 * 86_400_000, mine, moves ?? []), [sem, now, mine, moves]);
  /* v0.7.7.2: one strip per part. A part with no classes this semester is left out of the switch. */
  const parts = useMemo(() => partsOf(course.id, variants ?? [], mine).map((part) => ({ part, occ: allOcc.filter((o) => inPart(part, o.meeting)) })).filter((x) => x.occ.length > 0), [course.id, variants, mine, allOcc]);
  const [selId, setSel] = useState<string | null>(null);
  const multi = parts.length >= 2, cur = parts.find((x) => x.part.id === selId) ?? parts[0];
  const occ = cur?.occ ?? allOcc, part = cur?.part ?? null;
  const rateOf = (o: typeof allOcc) => attendanceRate(o, attendance, dayMarks, now);
  const rate = rateOf(occ), pulseKey = Object.keys(attendance).length, pct = (r: ReturnType<typeof rateOf>) => (r.rate === null ? null : Math.round(r.rate * 100));
  const tKey = part ? teacherKey(course.id, part) : course.id, teacher = teacherAbsent?.[tKey];
  const setTeacher = (n: number) => { fx.select(); act.setSettings({ teacherAbsent: { ...teacherAbsent, [tKey]: Math.max(0, Math.min(99, n)) } }); };
  const goal = part?.goal ?? 80, spare = canMiss(rate.here, rate.held, goal / 100);
  /* Scroll to the newest cell when the grid's content grows (new class weeks coming into range).
     An inline `ref` callback used to call scrollToEnd on EVERY render of this grid — the ref was
     detached and re-attached each time — which made every store write force a scroll here. */
  const gridRef = useRef<ScrollViewInstance>(null);
  const toEnd = useCallback(() => { gridRef.current?.scrollToEnd({ animated: false }); }, []);
  const tint = subjectTint(course.id, tints), lab = multi && part && !part.isBase ? part.name : null;
  return (
    <View style={{ gap: 6 }}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Txt f="bold" s={19}>Attendance {multi || rate.rate === null ? '' : `· ${pct(rate)}%`}</Txt>
        <Btn small kind={locked ? 'ink' : 'ghost'} icon={locked ? 'lock' : 'unlock'} label={locked ? 'Locked' : 'Lock'} a11y={locked ? 'Unlock attendance grid' : 'Lock attendance grid'} onPress={() => { act.setSettings({ lockAttendance: !locked }); fx.toggle(!locked); }} quiet />
      </Row>
      {multi && cur ? <PartSwitch items={parts.map((x) => ({ id: x.part.id, name: x.part.name, pct: pct(rateOf(x.occ)) }))} sel={cur.part.id} onSel={setSel} /> : null}
      <Txt f="serif" s={14} c="mut">{locked ? 'Locked against accidents.' : 'Tap an empty cell to mark. Long-press to change.'}</Txt>
      {occ.length === 0 ? <Txt f="serif" s={16} c="mut">No classes scheduled yet.</Txt> : (
        <HStrip ref={gridRef} gap={3} bg={c.card} contentStyle={{ paddingVertical: 6 }} accessibilityLabel={`${course.name}${lab ? ` ${lab}` : ''} attendance, ${occ.length} classes`} onContentSizeChange={toEnd}>
          {occ.map(({ date, meeting }) => {
            const e = effective(date, meeting, attendance, dayMarks, now), key = occKey(ymd(date), meeting), label = `${lab ? `${lab} · ` : ''}${DW[(date.getDay() + 6) % 7]} ${date.getDate()}, ${fmtTime(atTime(date.getTime(), meeting.start), hour12)}, ${spokenStatus(e)}`;
            return <AttCell key={key} testID={`att-cell-${key}`} status={e.status} why={e.why} inferred={e.inferred} future={!e.status} locked={locked} label={label} pulse={pulseKey} dot={lab ? tint : undefined}
              onTap={() => { const s = e.status && e.inferred ? nextStatus(e.status) : 'p', news = attNews(key, s, { ...getState(), now: Date.now(), moves: getState().settings.moves }); act.setAtt(key, s); if (news) faceEvent(news); }} onHold={() => act.open({ t: 'status', mode: 'class', key, title: `${course.name}${multi && part ? ` · ${part.name}` : ''} · ${fmtDay(date.getTime(), now)}`, date: ymd(date) })} />;
          })}
        </HStrip>)}
      <Row style={{ gap: 12 }}>{[['✓', 'present', c.ink], ['L', 'late entry', c.warn], ['✕', 'absent', c.bad], ['S', 'sick', c.bad], ['–', 'cancelled', c.mut]].map(([g, l, col]) => <Txt key={l} f="serif" s={13.5} c="mut"><Txt f="marker" s={14} c={col}>{g}</Txt> {l}</Txt>)}</Row>
      {occ.length > 0 ? <Txt f="serif" s={14} c="mut" testID="att-goal-line">{rate.held === 0 ? 'Nothing marked yet' : `Goal ${goal} % · ${spare === 0 ? 'no more to miss' : `can miss ${spare} more`}`}</Txt> : null}
      {/* The teacher's own count, typed in: it can differ from the marks above, and it is the one that counts. */}
      <Row style={{ gap: 10, marginTop: 4, flexWrap: 'nowrap' }}>
        <View style={{ flex: 1, flexShrink: 1, minWidth: 0 }}>
          <Txt f="bold" s={16}>Teacher&apos;s count{multi && part ? ` · ${part.name}` : ''}</Txt>
          <Txt f="serif" s={13.5} c="mut" numberOfLines={2}>{teacher === undefined ? `Not set · marked here: ${rate.absent}` : `${teacher} absent · marked here: ${rate.absent}`}</Txt>
        </View>
        {/* typed, not stepped (C8, R7): empty = not set, so the rate marked here is used */}
        <NumberField label={`Teacher's absence count for ${course.name}${multi && part ? ` ${part.name}` : ''}`} value={teacher ?? null} min={0} max={99} emptyLabel="–"
          onChange={(v) => { if (v === null) { act.setSettings({ teacherAbsent: Object.fromEntries(Object.entries(teacherAbsent ?? {}).filter(([k]) => k !== tKey)) }); } else setTeacher(v); }} />
      </Row>
    </View>
  );
}
/** v0.7.7.2 (D11): "LAB301 looks like a lab. Track it separately?" for a subject with no parts whose classes
 *  sit, some of them, in a lab room. Nothing is split without the tap; "No" is remembered per subject. */
function LabSplitOffer({ course }: { course: Course }) {
  const meetings = useStore((s) => s.meetings), variants = useStore((s) => s.variants), no = useStore((s) => s.settings.labSplitNo);
  const offer = useMemo(() => labSplitOffer(course, meetings, variants ?? []), [course, meetings, variants]);
  if (!offer || no?.includes(course.id)) return null;
  return (
    <View testID="lab-split-offer" style={{ gap: 6 }}>
      <Txt f="serif" s={15} c="mut">{`${offer.rooms.join(', ')} ${offer.rooms.length > 1 ? 'look like labs' : 'looks like a lab'}. Track it separately?`}</Txt>
      <Row style={{ flexWrap: 'nowrap', gap: 8 }}>
        <Btn small kind="ghost" label="Split" testID={`lab-split-${course.id}`} a11y={`Track ${course.name}'s lab classes separately`} onPress={() => act.splitLab(course.id)} />
        <Btn small kind="ghost" label="No" testID={`lab-split-no-${course.id}`} a11y="Keep them together" onPress={() => act.declineLabSplit(course.id)} />
      </Row>
    </View>
  );
}
/** The total as a strip of ink across the card, with the goal as a notch: how far there is still to go reads at a glance. */
function GoalBar({ total, goal }: { total: number; goal: number | null }) {
  const { c } = useTheme(), t = Math.max(0, Math.min(100, total)), g = goal === null ? null : Math.max(0, Math.min(100, goal));
  return (
    <View accessible accessibilityLabel={`Total ${Math.round(total)}${g !== null ? `, goal ${g}` : ''}`} style={{ height: 12, justifyContent: 'center' }}>
      <View style={{ height: 8, borderRadius: 2, backgroundColor: hexA(c.ink, 0.08), overflow: 'hidden' }}><View style={{ width: `${t}%`, height: 8, backgroundColor: g !== null && t < g ? c.warn : c.acc }} /></View>
      {g !== null ? <View style={{ position: 'absolute', left: `${g}%`, top: 0, width: 2.5, height: 12, marginLeft: -1.25, borderRadius: 1, backgroundColor: c.ink }} /> : null}
    </View>
  );
}

/** v0.7.6.4: the GPA at a glance; the page behind it takes credit hours and earlier terms. */
function GpaCard({ rows }: { rows: { id: string; name: string; pct: number | null }[] }) {
  const { c } = useTheme(), credits = useStore((s) => s.settings.credits) ?? {}, past = useStore((s) => s.settings.pastGrades) ?? [];
  const t = termGpa(rows, credits), all = cumulative(past, t.rows), set = t.rows.length > 0 || past.length > 0;
  return (
    <Pressable testID="open-gpa" accessibilityRole="button" accessibilityLabel={set ? `GPA ${t.gpa?.toFixed(2) ?? 'not yet'} this term, ${all.gpa?.toFixed(2) ?? 'not yet'} overall. Open` : 'Set credit hours to see your GPA'} onPress={() => act.openPage({ t: 'gpa' })}>
      <HandBox seed="gpa-card" fill={c.deck} style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {set ? (<>
          <View><Txt f="type" s={28} c="deckInk">{t.gpa?.toFixed(2) ?? '—'}</Txt><Txt f="bold" s={13.5} c="deckMut">GPA this term</Txt></View>
          <View><Txt f="type" s={28} c="deckInk">{all.gpa?.toFixed(2) ?? '—'}</Txt><Txt f="bold" s={13.5} c="deckMut">overall · {all.credits} cr</Txt></View>
        </>) : <Txt f="bold" s={16} c="deckInk" style={{ flex: 1 }}>Set credit hours to see your GPA</Txt>}
        <View style={{ flex: 1 }} />
        <Icon name="chevron" size={20} color={c.deckInk} />
      </HandBox>
    </Pressable>
  );
}

export function GradesScreen() {
  const courses = useStore((s) => s.courses), marks = useStore((s) => s.marks), adjusts = useStore((s) => s.adjusts), semesterStart = useStore((s) => s.settings.semesterStart), semesterEnd = useStore((s) => s.settings.semesterEnd), variants = useStore((s) => s.variants);
  const st = { courses, marks, adjusts };
  const { c, tints, skin } = useTheme(), tab = skin.instruments.subjectMark === 'tab';
  const rows = st.courses.map((course) => { const marks = st.marks.filter((m) => m.courseId === course.id).sort((a, b) => a.sort - b.sort), adj = st.adjusts[course.id] ?? 0, parts = (variants ?? []).filter((v) => v.subjectId === course.id).sort((a, b) => a.ord - b.ord), tot = courseGrade(marks, parts, adj);
    /* R4: with shares set, the course % comes from its parts (D-14); without, the v0.6 pooled maths, unchanged */
    return { course, marks, adj, tot, parts, rowsP: partGrades(marks, parts), need: course.goal ? courseNeeded(marks, parts, course.goal, adj) : null }; });
  const scored = rows.filter((r) => r.tot !== null), avg = scored.length ? scored.reduce((a, r) => a + (r.tot as number), 0) / scored.length : null;
  /* the top bar's face (D-21): smug when every course with a goal is on it, sad when most are under */
  const goals = rows.filter((r) => r.course.goal && r.tot !== null);
  const face = rows.length === 0 ? null : pageFace('Grades', { hour: new Date().getHours(), atGoal: goals.filter((r) => (r.tot as number) >= (r.course.goal as number)).length, belowGoal: goals.filter((r) => (r.tot as number) < (r.course.goal as number)).length });
  return (
    <Page face={face} title="Grades" sub={avg === null ? 'Add marks to see your average' : `Average ${avg.toFixed(1)}% · ${letter(avg)}`} right={<Row style={{ flexWrap: 'nowrap', gap: 4 }}><Btn small kind="ghost" label="Subjects" testID="open-subjects" a11y="Open the subjects pages" onPress={() => act.openPage({ t: 'subjects' })} /><Btn small kind="ghost" icon="plus" a11y="Add subject" onPress={() => act.open({ t: 'course' })} /></Row>}>
      {rows.length > 0 && <GpaCard rows={rows.map((r) => ({ id: r.course.id, name: r.course.name, pct: r.tot })).filter((_, i) => !rows[i]!.course.archived)} />}
      {rows.length === 0 && <Empty icon="grad" face={emptyFace('gradesNoSubjects')} text="No subjects yet. Add one to start." />}
      {rows.map(({ course, marks, adj, tot, need, parts, rowsP }) => (
        <HandBox key={course.id} seed={course.id} style={{ padding: 14, gap: 10, marginTop: 8 }}>
          {/* the subject's own paper, as a tab on the card — the colour it has on Week, the + desk and Focus */}
          {tab && <View pointerEvents="none" style={{ position: 'absolute', top: -9, left: 16, transform: [{ rotate: '-2deg' }] }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <HandBox seed={`gtab-${course.id}`} fill={subjectTint(course.id, tints)} cut="cut" style={{ width: 54, height: 20 }} />
          </View>}
          <Pressable onPress={() => act.open({ t: 'course', id: course.id })} accessibilityRole="button" accessibilityLabel={`${course.name}. Edit subject.`} onLongPress={() => act.open({ t: 'meeting', courseId: course.id })}>
            <Row style={{ flexWrap: 'nowrap' }}>
              {!tab && <View style={{ width: 12, height: 12, borderRadius: 6, marginTop: 9, marginRight: 10, alignSelf: 'flex-start', backgroundColor: subjectTint(course.id, tints), borderWidth: 1, borderColor: hexA(c.ink, 0.2) }} />}
              <View style={{ flex: 1 }}><Txt f="marker" s={24} numberOfLines={2}>{course.name}</Txt><Txt f="serif" s={15} c="mut">{[roomsLabel(course), course.teacher].filter(Boolean).join(' · ') || 'Add a class to set its room'}</Txt></View>
              <View style={{ alignItems: 'center', minWidth: 74 }}><Txt f="marker" s={34} c={tot !== null && course.goal && tot < course.goal ? 'warn' : 'ink'}>{tot === null ? '—' : Math.round(tot)}</Txt><Txt f="bold" s={17} c="mut">{letter(tot)}</Txt></View>
            </Row>
          </Pressable>
          {tot !== null ? <GoalBar total={tot} goal={course.goal} /> : null}
          {course.goal ? <Txt f="bold" s={17} c={need && !need.feasible ? 'bad' : need?.reached ? 'ok' : 'mut'}>{need === null ? `Goal ${course.goal}% ${tot !== null && tot >= course.goal ? 'reached' : '— everything is marked'}` : need.reached ? `Goal ${course.goal}% already safe` : need.feasible ? `For ${course.goal}%: average ${Math.ceil(need.need)}% on the remaining ${need.weightLeft}%` : `Goal ${course.goal}% is out of reach (${Math.round(need.need)}% needed)`}</Txt> : null}
          {rowsP.length ? <View style={{ gap: 2 }}>{rowsP.map((p) => (
            <Txt key={p.id} f="serif" s={15.5} c="mut">{`${parts.find((x) => x.id === p.id)?.name ?? 'Part'} · ${Math.round(p.share)} % · ${p.grade === null ? 'nothing marked' : `${Math.round(p.grade)} %`}`}</Txt>))}</View> : null}
          <View style={{ gap: 8 }}>
            {marks.map((m) => (
              <Pressable key={m.id} accessibilityRole="button" accessibilityLabel={`${m.name}, ${m.score === null ? 'not marked' : m.score + ' percent'}, weight ${m.weight}${m.on ? '' : ', not counted'}. Edit.`} onPress={() => act.open({ t: 'mark', courseId: course.id, id: m.id })} android_ripple={{ color: c.rule }}>
                <Row style={{ flexWrap: 'nowrap', minHeight: 40 }}><Txt f="bold" s={20} style={{ flex: 1, textDecorationLine: m.on ? 'none' : 'line-through', color: m.on ? c.ink : c.mut }}>{m.name}</Txt><Txt f="serif" s={15} c="mut">{m.weight}%</Txt>
                  <View style={{ minWidth: 62, alignItems: 'flex-end' }}>{m.score === null ? <Txt f="serif" s={16} c="mut">to do</Txt> : <Txt f="marker" s={20}>{m.score}</Txt>}</View></Row>
              </Pressable>))}
            <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><Btn small kind="ghost" icon="plus" label="Mark" onPress={() => act.open({ t: 'mark', courseId: course.id })} /><Row style={{ flexWrap: 'nowrap', gap: 6 }}><Txt f="serif" s={14} c="mut">curve</Txt><NumberField label={`${course.name} curve`} value={adj} min={-20} max={20} decimals={1} unit="pts" width={112} onChange={(v) => act.setAdjust(course.id, v ?? 0)} /></Row></Row>
          </View>
          <LabSplitOffer course={course} />
          <AttendanceGrid course={course} />
        </HandBox>))}
      {rows.length > 0 && <Section title="Semester"><Row><Icon name="clock" size={18} color={c.mut} /><Txt f="serif" s={16} c="mut">Attendance: {semesterLabel({ semesterStart, semesterEnd })}. Change in Settings.</Txt></Row></Section>}
    </Page>
  );
}
