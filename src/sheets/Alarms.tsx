import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Btn, Chip, Field, HandBox, Row, Toggle, Txt } from '../ui/kit';
import { NumberField, TimeField } from '../ui/fields';
import { Label } from '../ui/Sheet';
import { useNow, useTheme } from '../ui/theme-context';
import { FS } from '../ui/fit';
import { act, toast, useStore } from '../store/store';
import { newAlarm, nextRing, type AgendaInput } from '../domain/agenda';
import { DW, fmtDur, fmtTime, fmtWhen, relFire, uid } from '../domain/time';
import type { AlarmRule } from '../domain/types';
import { fx } from '../services/fx';
import * as native from '../services/native';

/** "Mon–Fri", "Every day", "Weekends", "Mon, Wed" — the days an alarm rings, the way a person would say them. */
export function daysLabel(days: readonly boolean[]): string {
  const on = days.map((d, i) => (d ? i : -1)).filter((i) => i >= 0);
  if (on.length === 0) return 'Once';
  if (on.length === 7) return 'Every day';
  if (on.join() === '0,1,2,3,4') return 'Mon–Fri';
  if (on.join() === '5,6') return 'Weekends';
  return on.map((i) => DW[i]).join(', ');
}
/** The alarm's own line: its time, or how long before the first class it rings. */
export const alarmTitle = (r: AlarmRule, h12: boolean) => (r.kind === 'class' ? `${fmtDur(r.lead)} before first class` : fmtTime(new Date(2000, 0, 1, r.h, r.m).getTime(), h12));

/**
 * Settings → Alarms. The list, and one editor that replaces it while an alarm is being made or changed.
 *
 * Two kinds, because a student's alarm is rarely "07:00 for ever": an ordinary clock alarm on chosen days, and
 * one that follows the timetable — so many minutes before the first class of the day, moving by itself when a
 * class is cancelled or the day starts later. The phone rings them from its own alarm clock; the app does not
 * need to be open.
 */
export function AlarmsPage() {
  const { c } = useTheme(), now = useNow(30_000);
  const settings = useStore((s) => s.settings), courses = useStore((s) => s.courses), meetings = useStore((s) => s.meetings), variants = useStore((s) => s.variants), attendance = useStore((s) => s.attendance), dayMarks = useStore((s) => s.dayMarks);
  const alarms = settings.alarms ?? [], h12 = settings.hour12;
  const [draft, setDraft] = useState<AlarmRule | null>(null), [sure, setSure] = useState(false);
  const input: AgendaInput = useMemo(() => ({ now, courses, meetings, variants, attendance, dayMarks, tasks: [], settings }), [now, courses, meetings, variants, attendance, dayMarks, settings]);
  const has = native.nativeAvailable();
  /* Read on every render of this page on purpose: the person may have just come back from the phone's settings. */
  const exact = !has || native.canExactAlarm(), full = !has || native.canFullScreen();

  if (draft) {
    const isNew = !alarms.some((a) => a.id === draft.id), patch = (p: Partial<AlarmRule>) => setDraft({ ...draft, ...p });
    const rings = nextRing({ ...draft, on: true, once: undefined }, input);
    const once = draft.kind === 'clock' && !draft.days.some(Boolean);
    return (
      <View style={{ gap: 14 }}>
        <Row>
          <Chip small label="At a time" on={draft.kind === 'clock'} onPress={() => { patch({ kind: 'clock' }); fx.select(); }} />
          <Chip small label="Before my first class" on={draft.kind === 'class'} onPress={() => { patch({ kind: 'class', days: draft.days.some(Boolean) ? draft.days : [true, true, true, true, true, true, true] }); fx.select(); }} />
        </Row>
        {draft.kind === 'clock'
          ? <View style={{ gap: 4 }}><Txt f="bold" s={20} maxFontSizeMultiplier={FS}>Rings at</Txt><TimeField label="Alarm time" value={draft.h * 60 + draft.m} hour12={h12} onChange={(v) => patch({ h: Math.floor(v / 60), m: v % 60 })} /></View>
          : <>
            <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><Txt f="bold" s={20} maxFontSizeMultiplier={FS} style={{ flex: 1, minWidth: 0 }}>Before the first class</Txt><NumberField label="Minutes before the first class" value={draft.lead} min={5} max={240} unit="min" onChange={(v) => patch({ lead: v ?? 60 })} /></Row>
            <Txt f="serif" s={15} c="mut">Follows your timetable. Class changes move it.</Txt>
          </>}
        <View style={{ gap: 6 }}>
          <Label>{draft.kind === 'class' ? 'On these days' : 'Repeat'}</Label>
          <Row>{DW.map((d, i) => <Chip key={d} small label={d} on={!!draft.days[i]} onPress={() => { patch({ days: draft.days.map((x, j) => (j === i ? !x : x)) }); fx.select(); }} />)}</Row>
          <Txt f="serif" s={15} c="mut">
            {draft.kind === 'class' && !draft.days.some(Boolean) ? 'Pick at least one day.' : rings ? `${once ? 'Rings once' : 'Next'}: ${fmtWhen(rings, now, h12)} · ${relFire(rings, now)}` : draft.kind === 'class' ? 'No class on those days soon.' : 'Pick a time.'}
          </Txt>
        </View>
        <Field label="Label" placeholder={draft.kind === 'class' ? 'Wake up for class' : 'Wake up'} value={draft.label} onChangeText={(v) => patch({ label: v })} maxLength={40} returnKeyType="done" />
        <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><Txt f="bold" s={20} maxFontSizeMultiplier={FS} style={{ flex: 1, minWidth: 0 }}>Snooze</Txt><NumberField label="Snooze length" value={draft.snooze} min={1} max={30} unit="min" onChange={(v) => patch({ snooze: v ?? 10 })} /></Row>
        <Toggle label="Vibrate" value={draft.vib} onChange={(v) => patch({ vib: v })} />
        <Row style={{ gap: 10 }}>
          <Btn flex label={isNew ? 'Add alarm' : 'Save'} icon="check" disabled={draft.kind === 'class' && !draft.days.some(Boolean)} onPress={() => { act.saveAlarm({ ...draft, on: true }); fx.done(); setDraft(null); setSure(false); }} />
          <Btn kind="ghost" label="Cancel" onPress={() => { setDraft(null); setSure(false); }} />
        </Row>
        {!isNew && <Btn kind={sure ? 'danger' : 'ghost'} icon="trash" label={sure ? 'Tap again to delete' : 'Delete this alarm'} onPress={() => { if (!sure) { setSure(true); return; } act.removeAlarm(draft.id); toast('Alarm deleted'); setDraft(null); setSure(false); }} />}
      </View>
    );
  }

  const soonest = alarms.map((a) => nextRing(a, input)).filter((x): x is number => x !== null).sort((a, b) => a - b)[0];
  return (
    <View style={{ gap: 12 }}>
      {!has && <Txt f="serif" s={15.5} c="warn">Alarms ring on the Android app only.</Txt>}
      {has && !exact && <Note text="Battery saving may delay alarms by minutes." action="Allow exact alarms" onPress={() => native.openAlarmSettings('exact')} />}
      {has && !full && <Note text="Alarms cannot show on the lock screen yet." action="Allow full screen" onPress={() => native.openAlarmSettings('fullscreen')} />}
      {alarms.length === 0
        ? <Txt f="serif" s={16} c="mut">No alarms yet. Add one for a set time or before class.</Txt>
        : <Txt f="serif" s={15.5} c="mut">{soonest ? `Next alarm ${fmtWhen(soonest, now, h12)} · ${relFire(soonest, now)}` : 'Every alarm is off.'}</Txt>}
      {alarms.map((a) => {
        const at = nextRing(a, input);
        return (
          <HandBox key={a.id} seed={`al-${a.id}`} fill={c.card} style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 6, paddingVertical: 8, gap: 8 }}>
            <Pressable style={{ flex: 1, minWidth: 0 }} accessibilityRole="button" accessibilityLabel={`${alarmTitle(a, h12)}, ${a.label || 'alarm'}, ${daysLabel(a.days)}. Edit.`} onPress={() => { setDraft(a); fx.tap(); }}>
              <Txt f="bold" s={a.kind === 'class' ? 21 : 30} c={a.on ? 'ink' : 'mut'} numberOfLines={1}>{alarmTitle(a, h12)}</Txt>
              <Txt f="serif" s={14.5} c="mut" numberOfLines={2}>{[a.label.trim(), daysLabel(a.days), a.on && at && a.kind === 'class' ? fmtWhen(at, now, h12) : ''].filter(Boolean).join(' · ')}</Txt>
            </Pressable>
            <View style={{ width: 76 }}><Toggle label="" value={a.on} onChange={(v) => { act.toggleAlarm(a.id, v); if (v && !nextRing({ ...a, on: true, once: undefined }, input)) toast('On, but no class is coming up on its days'); }} /></View>
          </HandBox>
        );
      })}
      <Row style={{ gap: 10 }}>
        <Btn flex icon="plus" label="New alarm" onPress={() => { setDraft(newAlarm(uid('al'), now)); fx.tap(); }} />
        <Btn kind="ghost" label="Before class" onPress={() => { setDraft({ ...newAlarm(uid('al'), now), kind: 'class', lead: 60, label: '' }); fx.tap(); }} />
      </Row>
      {has && <Btn kind="ghost" icon="bell" label="Ring a test alarm" onPress={() => { if (!native.ringNow('Test alarm')) toast('The alarm could not start. Check that notifications are allowed for Margin.'); }} />}
      <Txt f="serif" s={14.5} c="mut">Rings at full volume, even on silent. Stops after five minutes.</Txt>
    </View>
  );
}

function Note({ text, action, onPress }: { text: string; action: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <HandBox seed={`note-${action}`} fill={c.hl} shadow={false} style={{ padding: 12, gap: 8 }}>
      <Txt f="serif" s={15.5}>{text}</Txt>
      <Btn small kind="ink" label={action} onPress={onPress} />
    </HandBox>
  );
}

const WIDGETS: { kind: native.WidgetKind; name: string; line: string }[] = [
  { kind: 'board', name: 'Margin', line: 'Next class, today’s timetable and what is due, on one card.' },
];
/** Settings → Widgets: the one widget, what it shows, and a button that asks the launcher to place it. */
export function WidgetsPage() {
  const { c } = useTheme(), has = native.nativeAvailable();
  return (
    <View style={{ gap: 12 }}>
      <Txt f="serif" s={16} c="mut">{has ? 'One home screen widget. It updates when Margin is closed.' : 'Widgets need the Android app.'}</Txt>
      {WIDGETS.map((w) => (
        <HandBox key={w.kind} seed={`wd-${w.kind}`} fill={c.card} style={{ padding: 14, gap: 8 }}>
          <Txt f="bold" s={21}>{w.name}</Txt>
          <Txt f="serif" s={15} c="mut">{w.line}</Txt>
          {has && <Btn small kind="ink" icon="plus" label="Add to home screen" a11y={`Add the ${w.name} widget to the home screen`} onPress={() => { if (!native.pinWidget(w.kind)) toast('Long-press your home screen, choose Widgets, then Margin.'); }} />}
        </HandBox>
      ))}
      <Txt f="serif" s={14.5} c="mut">Or long-press the home screen, then Widgets.</Txt>
    </View>
  );
}
