import React, { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Row, Toggle, Txt, faceOf } from './kit';
import { Label } from './Sheet';
import { isYmd, semesterLabel, suggestEnd, validRange } from '../domain/semester';
import { useTheme } from './theme-context';

type Part = 'y' | 'm' | 'd';
type DateDraft = Record<Part, string>;

/** A stored `YYYY-MM-DD` as the three boxes it is edited in; an absent or damaged value is three empty
 *  boxes, not 1970 — the user is typing a real date, so there is nothing to fabricate. */
function split(v: string): DateDraft {
  if (!isYmd(v)) return { y: '', m: '', d: '' };
  const [y, m, d] = v.split('-') as [string, string, string];
  return { y, m, d };
}

/** Is this a real calendar day, not just the right shape? `isYmd` is a strict pattern, but
 *  `2026-02-31` is well-shaped and impossible; `Date` rolls it over, so the round-trip is the test. */
function real(v: string): boolean {
  if (!isYmd(v)) return false;
  const [y, m, d] = v.split('-').map(Number) as [number, number, number];
  const at = new Date(y, m - 1, d);
  return at.getFullYear() === y && at.getMonth() === m - 1 && at.getDate() === d;
}

/** The boxes as a `YYYY-MM-DD`, or `''` until every box is filled: a half-typed year must not be
 *  turned into a date by padding, because the UI then has a value the user never entered. */
const joined = (p: DateDraft): string =>
  /^\d{4}$/.test(p.y) && /^\d{1,2}$/.test(p.m) && /^\d{1,2}$/.test(p.d)
    ? `${p.y}-${p.m.padStart(2, '0')}-${p.d.padStart(2, '0')}`
    : '';

const draftOf = (start: string, end: string) => ({
  start: split(start),
  // With no end, the end boxes wait on the `suggestEnd` seed rather than on an empty date, so turning
  // "No end date" off lands on a day to edit instead of on three blank boxes.
  end: split(end || suggestEnd(start)),
  noEnd: !end,
});

export interface SemesterRangeProps {
  start: string;
  end: string;
  /** Called only with a pair `validRange` accepts. An end before the start is shown as a hint and never
   *  written, so a half-finished edit cannot hide a term's attendance by being clamped behind the user's
   *  back. */
  onChange: (patch: { semesterStart: string; semesterEnd: string }) => void;
}

/**
 * The semester's two dates: year, month and day for each, as numeric keypad fields.
 *
 * These were steppers. A term date is not a quantity: reaching 2027 from 2026 was one press, but the way
 * to a term that starts on 14 September was eleven month-steps and a day-step, every year. A date is
 * typed, so the fields are three small `TextInput`s per date and the keypad opens on the part the user
 * touches. The pair is still committed only when it is a real range (`validRange`), which is what keeps a
 * half-typed date out of the setting every screen reads.
 *
 * This is one control rather than two copies because it is asked for in three places — Settings →
 * Attendance, the Semesters page, and the tour's last step — and each writes through a different door:
 * the first two commit and let the store write the active row and its settings mirror (`setActiveRange`,
 * `setSemesterRange`), while the tour keeps its answer in a ref and writes nothing until the tour ends.
 * The store reconciles a settings-only write back to the row on the next term read, so a writer that
 * touches the mirror alone cannot leave the two disagreeing.
 * The draft is local so a keystroke does not re-render the page; it resyncs from the props whenever the
 * stored range changes while no field has focus (a roll-over, an import, another page's edit).
 */
export function SemesterRange({ start, end, onChange }: SemesterRangeProps) {
  const [draft, setDraft] = useState(() => draftOf(start, end));
  const focused = useRef(0);

  useEffect(() => {
    if (focused.current > 0) return; // never rewrite the box under the cursor
    setDraft(draftOf(start, end));
  }, [start, end]);

  const s = joined(draft.start), e = joined(draft.end);
  const noEnd = draft.noEnd;

  const commit = (nextStart: string, nextEnd: string) => {
    if (!real(nextStart)) return;
    if (nextEnd !== '' && !real(nextEnd)) return;
    if (!validRange(nextStart, nextEnd)) return;
    if (nextStart === start && nextEnd === end) return;
    onChange({ semesterStart: nextStart, semesterEnd: nextEnd });
  };
  const onPart = (which: 'start' | 'end', part: Part, text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, part === 'y' ? 4 : 2);
    const next = { ...draft, [which]: { ...draft[which], [part]: digits } };
    setDraft(next);
    if (which === 'start') commit(joined(next.start), next.noEnd ? '' : joined(next.end));
    else if (!next.noEnd) commit(joined(next.start), joined(next.end));
  };
  const setNoEndDate = (v: boolean) => {
    const nextStart = joined(draft.start);
    if (v) {
      setDraft({ ...draft, noEnd: true });
      commit(nextStart, '');
      return;
    }
    // Turning the end back on needs a day to stand on. An end the user already set and can still keep
    // is never replaced; otherwise 15 weeks, the same seed the domain uses everywhere.
    const kept = real(joined(draft.end)) && validRange(nextStart, joined(draft.end)) ? joined(draft.end) : suggestEnd(nextStart);
    setDraft({ ...draft, noEnd: false, end: split(kept) });
    commit(nextStart, kept);
  };

  const part = (which: 'start' | 'end', p: Part) => (
    <DatePart
      key={`${which}-${p}`}
      which={which}
      part={p}
      value={draft[which][p]}
      width={p === 'y' ? 78 : 50}
      maxLength={p === 'y' ? 4 : 2}
      onChangeText={(v) => onPart(which, p, v)}
      onFocus={() => { focused.current += 1; }}
      onBlur={() => { focused.current = Math.max(0, focused.current - 1); }}
    />
  );
  const dates = (which: 'start' | 'end') => (
    <Row gap={6}>{part(which, 'y')}{part(which, 'm')}{part(which, 'd')}</Row>
  );
  const hint = !real(s)
    ? 'A start date is saved once the year, month and day make a real day.'
    : !noEnd && !real(e)
      ? 'The end date is incomplete, so nothing is saved yet.'
      : !noEnd && !validRange(s, e)
        ? 'The end date is before the start, so nothing is saved yet.'
        : null;

  return (
    <View style={{ gap: 8 }}>
      <Label>Semester starts</Label>
      {dates('start')}
      <Toggle label="No end date" hint="The term is open-ended until you set its last day" value={noEnd} onChange={setNoEndDate} />
      {!noEnd && <>
        <Label>Semester ends</Label>
        {dates('end')}
        {hint ? <Txt f="serif" s={14.5} c="warn">{hint}</Txt> : null}
      </>}
      <Txt f="serif" s={14.5} c="mut">{semesterLabel({ semesterStart: s, semesterEnd: noEnd ? '' : e })}</Txt>
    </View>
  );
}

/** One box of a date. The visible label is the word ("Year"), the spoken one names which date it is
 *  ("semester start year"), because six boxes with the same label would be six identical stops. */
function DatePart({ which, part, value, width, maxLength, onChangeText, onFocus, onBlur }: {
  which: 'start' | 'end'; part: Part; value: string; width: number; maxLength: number;
  onChangeText: (v: string) => void; onFocus: () => void; onBlur: () => void;
}) {
  const th = useTheme(), { c } = th;
  const word = part === 'y' ? 'Year' : part === 'm' ? 'Month' : 'Day';
  return (
    <View style={{ gap: 2 }}>
      <Txt f="serif" s={14} c="mut">{word}</Txt>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        onBlur={onBlur}
        keyboardType="numeric"
        returnKeyType="done"
        maxLength={maxLength}
        placeholder={part === 'y' ? '2026' : part === 'm' ? '09' : '07'}
        testID={`semester-${which}-${part === 'y' ? 'year' : part === 'm' ? 'month' : 'day'}`}
        accessibilityLabel={`semester ${which} ${part === 'y' ? 'year' : part === 'm' ? 'month' : 'day'}`}
        style={{ width, textAlign: 'center', ...faceOf(th, 'bold', 22), color: c.ink, paddingVertical: 4, paddingHorizontal: 0, borderBottomWidth: 1.4, borderBottomColor: c.ink }}
      />
    </View>
  );
}
