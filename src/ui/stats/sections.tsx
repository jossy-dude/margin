/**
 * v0.6 Stats: the two questions a student asks first, answered rather than charted.
 *
 *  - Are you showing up?  The rate as the one big number, what the classes were made of (one bar), why the
 *    missed and cancelled ones happened (the v0.6 reasons), and each subject worst-first with a dot per class
 *    and the number that matters for planning: how many more can be missed before 80%.
 *  - Are you on top of your work?  What needs you right now, whether you beat due dates, and the last eight
 *    weeks of finished tasks as weekly bars.
 *
 * Pure presentation: every number arrives computed (domain/analytics, tested).
 */
import React from 'react';
import { View } from 'react-native';
import { Btn, Txt } from '../kit';
import { useTheme } from '../theme-context';
import { hexA } from '../../tokens/theme';
import { WHY_LABEL, statusLabel } from '../../domain/attendance';
import type { AttBreakdown } from '../../domain/analytics';
import type { AttStatus, AttWhy, Course } from '../../domain/types';

const FS = 1.4;
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
/** "Sick 3 · Kicked out 1 · no reason given 2": the reasons by count, then whatever had none. */
const whyList = (m: Partial<Record<AttWhy, number>>, total: number) => {
  const named = (Object.entries(m) as [Exclude<AttWhy, ''>, number][]).sort((a, b) => b[1] - a[1]);
  const rest = total - named.reduce((a, [, n]) => a + n, 0);
  return [...named.map(([k, n]) => `${WHY_LABEL[k]} ${n}`), ...(rest > 0 ? [`no reason given ${rest}`] : [])].join(' · ');
};

/** A thin bar split into parts, each its own colour; parts of zero take no room. */
function SplitBar({ parts, label }: { parts: { n: number; col: string }[]; label: string }) {
  const total = parts.reduce((a, p) => a + p.n, 0);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
      {total === 0 ? <View style={{ flex: 1 }} /> : parts.filter((p) => p.n > 0).map((p, i) => <View key={i} style={{ flex: p.n, backgroundColor: p.col }} />)}
    </View>
  );
}
function Key({ col, n, label, hollow }: { col: string; n: number; label: string; hollow?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: hollow ? 'transparent' : col, borderWidth: hollow ? 1.6 : 0, borderColor: col }} />
      <Txt f="type" s={15} maxFontSizeMultiplier={FS}>{n}</Txt><Txt f="serif" s={14} c="mut" maxFontSizeMultiplier={FS}>{label}</Txt>
    </View>
  );
}

export interface SubjectAtt { course: Course; rate: number | null; here: number; held: number; canMiss: number; dots: { date: string; status: AttStatus; why?: AttWhy; inferred: boolean }[] }
export function ShowingUp({ b, rows, tint, floor = 0.8 }: { b: AttBreakdown; rows: SubjectAtt[]; tint: (id: string) => string; floor?: number }) {
  const { c } = useTheme(), rate = b.held ? b.present / b.held : null;
  const onTime = b.present - b.late;
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }} accessible accessibilityLabel={`${pct(rate)} present: ${b.present} of ${b.held} classes held`}>
        <Txt f="type" s={46} c={rate !== null && rate < floor ? 'bad' : 'ink'} maxFontSizeMultiplier={1.2} style={{ lineHeight: 52 }}>{pct(rate)}</Txt>
        <View style={{ paddingBottom: 6, flexShrink: 1 }}>
          <Txt f="bold" s={17} maxFontSizeMultiplier={FS}>present</Txt>
          <Txt f="serif" s={14.5} c="mut" maxFontSizeMultiplier={FS}>{b.present} of {b.held} classes held{b.cancelled ? `, ${b.cancelled} cancelled` : ''}</Txt>
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <SplitBar label={`${onTime} present on time, ${b.late} late entry, ${b.absent} absent, ${b.cancelled} cancelled`} parts={[{ n: onTime, col: c.ink }, { n: b.late, col: c.warn }, { n: b.absent, col: c.bad }, { n: b.cancelled, col: hexA(c.mut, 0.45) }]} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 }}>
          <Key col={c.ink} n={onTime} label="on time" />
          {b.late ? <Key col={c.warn} n={b.late} label="late entry" /> : null}
          {b.absent ? <Key col={c.bad} n={b.absent} label="absent" /> : null}
          {b.cancelled ? <Key col={c.mut} n={b.cancelled} label="cancelled" hollow /> : null}
        </View>
      </View>
      {(b.absent > 0 || b.cancelled > 0) && (
        <View style={{ gap: 4 }}>
          <Txt f="bold" s={16} maxFontSizeMultiplier={FS}>Missed, and why</Txt>
          {b.absent > 0 && <Txt f="hand" s={15.5} maxFontSizeMultiplier={FS}><Txt f="bold" s={15.5} c="bad">Absent </Txt>{whyList(b.why.a, b.absent)}</Txt>}
          {b.cancelled > 0 && <Txt f="hand" s={15.5} maxFontSizeMultiplier={FS}><Txt f="bold" s={15.5} c="mut">Cancelled </Txt>{whyList(b.why.c, b.cancelled)}</Txt>}
        </View>
      )}
      <View style={{ gap: 12 }}>
        <Txt f="bold" s={16} maxFontSizeMultiplier={FS}>By subject, lowest first</Txt>
        {rows.map((r) => {
          const low = r.rate !== null && r.rate < floor;
          return (
            <View key={r.course.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: tint(r.course.id), borderWidth: 1, borderColor: hexA(c.ink, 0.25) }} />
                <Txt f="hand" s={17} numberOfLines={1} style={{ flex: 1 }} maxFontSizeMultiplier={FS}>{r.course.name}</Txt>
                <Txt f="type" s={17} c={low ? 'bad' : 'ink'} maxFontSizeMultiplier={FS}>{pct(r.rate)}</Txt>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingLeft: 20 }} accessible accessibilityLabel={`${r.course.name}, each class: ${r.dots.map((d) => (d.inferred ? 'present, not marked' : statusLabel(d.status, d.why))).join(', ') || 'none held yet'}`}>
                {r.dots.map((d) => {
                  const col = d.status === 'a' ? c.bad : d.status === 'c' ? c.mut : d.why === 'late' ? c.warn : c.ink;
                  const hollow = d.status === 'c';
                  return <View key={d.date} style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: hollow ? 'transparent' : d.inferred ? hexA(col, 0.28) : col, borderWidth: hollow ? 1.5 : 0, borderColor: col }} />;
                })}
              </View>
              {r.held > 0 && (
                <Txt f="serif" s={14} c={low ? 'bad' : 'mut'} style={{ paddingLeft: 20 }} maxFontSizeMultiplier={FS}>
                  {low ? `Under ${Math.round(floor * 100)}% — every class from here counts.` : r.canMiss === 0 ? `At the line: missing the next class takes it under ${Math.round(floor * 100)}%.` : `You can miss ${r.canMiss} more before ${Math.round(floor * 100)}%.`}
                </Txt>
              )}
            </View>
          );
        })}
        <Txt f="serif" s={13} c="mut" maxFontSizeMultiplier={FS}>A faint dot is a class that ended without a mark, counted as present; a hollow one was cancelled.</Txt>
      </View>
    </View>
  );
}

export function OnTop({ now, ot, weeks, weekLabels, streak, onOpen }: {
  now: { overdue: number; dueSoon: number; doneWeek: number };
  ot: { onTime: number; late: number; total: number; avgLeadHours: number | null };
  weeks: number[]; weekLabels: string[]; streak: number; onOpen: () => void;
}) {
  const { c } = useTheme(), max = Math.max(1, ...weeks), H = 72;
  const tile = (n: number, label: string, tone: 'bad' | 'ink' | 'ok') => (
    <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${n} ${label}`}>
      <Txt f="type" s={32} c={n === 0 ? 'mut' : tone} maxFontSizeMultiplier={1.2}>{n}</Txt>
      <Txt f="serif" s={14} c="mut" numberOfLines={2} maxFontSizeMultiplier={FS}>{label}</Txt>
    </View>
  );
  const lead = ot.avgLeadHours === null ? null : ot.avgLeadHours < 1 ? 'under an hour' : ot.avgLeadHours < 36 ? `${Math.round(ot.avgLeadHours)} h` : `${Math.round(ot.avgLeadHours / 24)} days`;
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {tile(now.overdue, 'overdue', 'bad')}{tile(now.dueSoon, 'due in the next 7 days', 'ink')}{tile(now.doneWeek, 'done this week', 'ok')}
        </View>
        {now.overdue + now.dueSoon > 0 && <View style={{ alignSelf: 'flex-start' }}><Btn small kind="ghost" icon="tasks" label="Open To-do" onPress={onOpen} /></View>}
      </View>
      {ot.total > 0 && (
        <View style={{ gap: 8 }}>
          <Txt f="bold" s={16} maxFontSizeMultiplier={FS}>Beating due dates</Txt>
          <SplitBar label={`${ot.onTime} on time, ${ot.late} late`} parts={[{ n: ot.onTime, col: c.ok }, { n: ot.late, col: c.bad }]} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 }}>
            <Key col={c.ok} n={ot.onTime} label="on time" />{ot.late ? <Key col={c.bad} n={ot.late} label="late" /> : null}
            {lead ? <Txt f="serif" s={14} c="mut" maxFontSizeMultiplier={FS}>finished {lead} early on average</Txt> : null}
          </View>
        </View>
      )}
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Txt f="bold" s={16} maxFontSizeMultiplier={FS}>Finished each week</Txt>
          {streak > 1 ? <Txt f="serif" s={14} c="mut" maxFontSizeMultiplier={FS}>{streak}-day streak</Txt> : null}
        </View>
        <View accessible accessibilityRole="image" accessibilityLabel={`Tasks finished per week, oldest first: ${weeks.join(', ')}`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: H + 18 }}>
          {weeks.map((v, i) => {
            const cur = i === weeks.length - 1;
            return (
              <View key={i} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
                {v > 0 ? <Txt f="type" s={12.5} c={cur ? 'acc' : 'mut'} maxFontSizeMultiplier={1.2}>{v}</Txt> : null}
                <View style={{ width: '100%', height: Math.max(3, (H * v) / max), borderRadius: 4, backgroundColor: v === 0 ? hexA(c.ink, 0.1) : cur ? c.acc : hexA(c.ok, 0.8) }} />
              </View>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {weekLabels.map((l, i) => <Txt key={i} f="serif" s={11.5} c="mut" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }} maxFontSizeMultiplier={1.2}>{i === weekLabels.length - 1 ? 'now' : i % 2 === weekLabels.length % 2 ? '' : l}</Txt>)}
        </View>
      </View>
    </View>
  );
}
