import React, { useState } from 'react';
import { View } from 'react-native';
import { Row, Stepper, Toggle, Txt } from './kit';
import { Label } from './Sheet';
import { daysInMonth, isYmd, semesterLabel, suggestEnd, validRange } from '../domain/semester';
import { pad } from '../domain/time';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** One part of a `YYYY-MM-DD` value replaced outright, with the day clamped to the month it lands in.
 *  `stepYmd` moves a part by a delta; the steppers here set it, and a value read off a stepper is
 *  already in range, so this is the honest primitive for them. */
function atPart(v: string, part: 'y' | 'm' | 'd', value: number): string {
  const base = isYmd(v) ? v : '1970-01-01';
  const [y, m, d] = base.split('-').map(Number) as [number, number, number];
  if (part === 'y') return `${String(value).padStart(4, '0')}-${pad(m)}-${pad(Math.min(d, daysInMonth(value, m)))}`;
  if (part === 'm') return `${String(y).padStart(4, '0')}-${pad(value)}-${pad(Math.min(d, daysInMonth(y, value)))}`;
  return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(value)}`;
}

export interface SemesterRangeProps {
  start: string;
  end: string;
  /** Called only with a pair `validRange` accepts. An end before the start is shown as a hint and never
   *  written, so a half-finished edit cannot hide a term's attendance by being clamped behind the user's
   *  back. */
  onChange: (patch: { semesterStart: string; semesterEnd: string }) => void;
}

/**
 * The semester's two dates: year, month and day for each, plus the "No end date" switch.
 *
 * This is one control rather than two copies because it is asked for in two places — Settings →
 * Attendance & semester and the tour's hand-over — and the rule that matters (an end before the start
 * is not saved) has to be the same rule in both. The draft is local: a stepper press re-renders the
 * three numbers at once, and committing only when the pair is valid is what keeps the stored setting
 * from ever holding a range the UI would refuse to show.
 */
export function SemesterRange({ start, end, onChange }: SemesterRangeProps) {
  const [startDraft, setStartDraft] = useState(start);
  const [endDraft, setEndDraft] = useState(end);
  const [noEnd, setNoEnd] = useState(!end);

  const commit = (s: string, e: string) => { if (validRange(s, e)) onChange({ semesterStart: s, semesterEnd: e }); };
  const edit = (which: 'start' | 'end', part: 'y' | 'm' | 'd', value: number) => {
    if (which === 'start') {
      const next = atPart(startDraft, part, value);
      setStartDraft(next);
      commit(next, noEnd ? '' : endDraft);
    } else {
      const next = atPart(endDraft || startDraft, part, value);
      setEndDraft(next);
      commit(startDraft, next);
    }
  };
  const setNoEndDate = (v: boolean) => {
    setNoEnd(v);
    if (v) { setEndDraft(''); commit(startDraft, ''); return; }
    // Turning the end back on needs a day to stand on. Seeding it with the start made a one-day
    // semester that read as a term; 15 weeks does not. An end the user already set is never replaced.
    const e = endDraft && validRange(startDraft, endDraft) ? endDraft : suggestEnd(startDraft);
    setEndDraft(e);
    commit(startDraft, e);
  };
  const part = (v: string, which: 'start' | 'end', p: 'y' | 'm' | 'd') => {
    const base = isYmd(v) ? v : startDraft;
    const [y, m, d] = (isYmd(base) ? base : '1970-01-01').split('-').map(Number) as [number, number, number];
    const word = which === 'start' ? 'start' : 'end';
    if (p === 'y') return <Stepper compact label={`${word} year`} value={y} min={2000} max={2100} fmt={(n) => String(n)} onChange={(n) => edit(which, 'y', n)} />;
    if (p === 'm') return <Stepper compact label={`${word} month`} value={m} min={1} max={12} fmt={(n) => MONTHS[n - 1] ?? ''} onChange={(n) => edit(which, 'm', n)} />;
    return <Stepper compact label={`${word} day`} value={Math.min(d, daysInMonth(y, m))} min={1} max={daysInMonth(y, m)} fmt={pad} onChange={(n) => edit(which, 'd', n)} />;
  };
  /* Three steppers cannot share a 360 dp row without either 34 dp buttons or a 13 pt year — the year
     alone is 40 px wide at the app's 22 pt numerals, and two 46 dp buttons plus the value box are 156.
     So the wrap is made intentional instead of ragged: the year gets its own labelled line, and the
     month and day share the next one (2 × 156 + 6 = 318, inside the 328 dp a 360 dp page leaves). */
  const field = (label: string, control: React.ReactNode) => (
    <View style={{ gap: 2 }}>
      <Txt f="serif" s={14} c="mut">{label}</Txt>
      {control}
    </View>
  );
  const dates = (v: string, which: 'start' | 'end') => (
    <View style={{ gap: 6 }}>
      {field('Year', part(v, which, 'y'))}
      <Row gap={6}>{field('Month', part(v, which, 'm'))}{field('Day', part(v, which, 'd'))}</Row>
    </View>
  );

  return (
    <View style={{ gap: 8 }}>
      <Label>Semester starts</Label>
      {dates(startDraft, 'start')}
      <Toggle label="No end date" hint="The term is open-ended until you set its last day" value={noEnd} onChange={setNoEndDate} />
      {!noEnd && <>
        <Label>Semester ends</Label>
        {dates(endDraft, 'end')}
        {!validRange(startDraft, endDraft) ? <Txt f="serif" s={14.5} c="warn">The end date is before the start, so nothing is saved yet.</Txt> : null}
      </>}
      <Txt f="serif" s={14.5} c="mut">{semesterLabel({ semesterStart: startDraft, semesterEnd: noEnd ? '' : endDraft })}</Txt>
    </View>
  );
}
