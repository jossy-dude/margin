import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, View, type ImageSourcePropType } from 'react-native';
import { Btn, Chip, DayRow, Field, HandBox, Row, Toggle, Txt } from '../ui/kit';
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
import * as notifs from '../services/notifications';

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
/* v0.7.8.9: one-tap answers on the setup page */
const QUICK_TIMES: readonly (readonly [number, number])[] = [[6, 0], [6, 30], [7, 0], [7, 30], [8, 0]];
const LEADS = [30, 45, 60, 90, 120] as const;
const SNOOZES = [5, 10, 15] as const;
const DAY_SETS: readonly (readonly [string, readonly boolean[]])[] = [['Weekdays', [true, true, true, true, true, false, false]], ['Every day', [true, true, true, true, true, true, true]], ['Weekend', [false, false, false, false, false, true, true]]];
const fmtClockHM = (h: number, m: number, h12: boolean) => (h12 ? `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}` : `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);

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
        {/* v0.7.8.9 (owner's ask 1): touch first. The common answers are one tap (a time, a lead, the days, the snooze);
            the exact field stays for anything else. */}
        {draft.kind === 'clock'
          ? <View style={{ gap: 8 }}>
            <Txt f="bold" s={20} maxFontSizeMultiplier={FS}>Rings at</Txt>
            <Row style={{ flexWrap: 'nowrap', gap: 10, alignItems: 'center' }}>
              <Btn kind="ghost" label="−5" a11y="Five minutes earlier" onPress={() => { const v = (draft.h * 60 + draft.m + 1435) % 1440; patch({ h: Math.floor(v / 60), m: v % 60 }); fx.select(); }} />
              <View style={{ flex: 1, alignItems: 'center' }}><TimeField label="Alarm time" value={draft.h * 60 + draft.m} hour12={h12} onChange={(v) => patch({ h: Math.floor(v / 60), m: v % 60 })} /></View>
              <Btn kind="ghost" label="+5" a11y="Five minutes later" onPress={() => { const v = (draft.h * 60 + draft.m + 5) % 1440; patch({ h: Math.floor(v / 60), m: v % 60 }); fx.select(); }} />
            </Row>
            <Row>{QUICK_TIMES.map(([h, m]) => <Chip key={`${h}${m}`} small label={fmtClockHM(h, m, h12)} on={draft.h === h && draft.m === m} onPress={() => { patch({ h, m }); fx.select(); }} />)}</Row>
          </View>
          : <View style={{ gap: 8 }}>
            <Txt f="bold" s={20} maxFontSizeMultiplier={FS}>Before the first class</Txt>
            <Row>{LEADS.map((n) => <Chip key={n} small label={n < 60 ? `${n} min` : n % 60 ? `${Math.floor(n / 60)} h ${n % 60}` : `${n / 60} h`} on={draft.lead === n} onPress={() => { patch({ lead: n }); fx.select(); }} />)}</Row>
            <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}><Txt f="serif" s={15} c="mut" style={{ flex: 1, minWidth: 0 }}>Or exactly</Txt><NumberField label="Minutes before the first class" value={draft.lead} min={5} max={240} unit="min" onChange={(v) => patch({ lead: v ?? 60 })} /></Row>
            <Txt f="serif" s={15} c="mut">Follows your timetable. Class changes move it.</Txt>
          </View>}
        <View style={{ gap: 6 }}>
          <Label>{draft.kind === 'class' ? 'On these days' : 'Repeat'}</Label>
          <Row>{DAY_SETS.map(([label, set]) => <Chip key={label} small label={label} on={draft.days.every((x, i) => !!x === set[i])} onPress={() => { patch({ days: [...set] }); fx.select(); }} />)}</Row>
          <DayRow label="Repeat on" on={draft.days} onPress={(i) => patch({ days: draft.days.map((x, j) => (j === i ? !x : x)) })} />
          <Txt f="serif" s={15} c="mut">
            {draft.kind === 'class' && !draft.days.some(Boolean) ? 'Pick at least one day.' : rings ? `${once ? 'Rings once' : 'Next'}: ${fmtWhen(rings, now, h12)} · ${relFire(rings, now)}` : draft.kind === 'class' ? 'No class on those days soon.' : 'Pick a time.'}
          </Txt>
        </View>
        <Field label="Label" placeholder={draft.kind === 'class' ? 'Wake up for class' : 'Wake up'} value={draft.label} onChangeText={(v) => patch({ label: v })} maxLength={40} returnKeyType="done" />
        <View style={{ gap: 6 }}><Label>Snooze</Label><Row>{SNOOZES.map((n) => <Chip key={n} small label={`${n} min`} on={draft.snooze === n} onPress={() => { patch({ snooze: n }); fx.select(); }} />)}</Row></View>
        <Toggle label="Vibrate" value={draft.vib} onChange={(v) => patch({ vib: v })} />
        <Row style={{ gap: 10 }}>
          <Btn flex label={isNew ? 'Add alarm' : 'Save'} icon="check" disabled={draft.kind === 'class' && !draft.days.some(Boolean)} onPress={() => {
            act.saveAlarm({ ...draft, on: true }); fx.done(); setDraft(null); setSure(false);
            /* test report #1: without notifications a ringing alarm had no screen and could not be stopped */
            void notifs.ensurePermission(true).then((p) => { if (p !== 'granted' && p !== 'unavailable') toast('Allow notifications so a ringing alarm shows its Stop screen.'); });
          }} />
          <Btn kind="ghost" label="Cancel" onPress={() => { setDraft(null); setSure(false); }} />
        </Row>
        {!isNew && <Btn kind={sure ? 'danger' : 'ghost'} icon="trash" label={sure ? 'Tap again to delete' : 'Delete this alarm'} onPress={() => { if (!sure) { setSure(true); return; } act.removeAlarm(draft.id); toast('Alarm deleted'); setDraft(null); setSure(false); }} />}
      </View>
    );
  }

  const soonest = alarms.map((a) => nextRing(a, input)).filter((x): x is number => x !== null).sort((a, b) => a - b)[0];
  return (
    <View style={{ gap: 12 }}>
      <Ringing />
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
            <View style={{ width: 76 }}><Toggle label="" value={a.on} onChange={(v) => { act.toggleAlarm(a.id, v); if (!v && native.alarmRinging() === a.id) native.stopAlarm(); if (v && !nextRing({ ...a, on: true, once: undefined }, input)) toast('On, but no class is coming up on its days'); }} /></View>
          </HandBox>
        );
      })}
      <Row style={{ gap: 10 }}>
        <Btn flex icon="plus" label="New alarm" onPress={() => { setDraft(newAlarm(uid('al'), now)); fx.tap(); }} />
        <Btn kind="ghost" label="Before class" onPress={() => { setDraft({ ...newAlarm(uid('al'), now), kind: 'class', lead: 60, label: '' }); fx.tap(); }} />
      </Row>
      {has && <AlarmSound />}
      {has && <Btn kind="ghost" icon="bell" label="Ring a test alarm" onPress={() => { if (!native.ringNow('Test alarm')) toast('The alarm could not start. Check that notifications are allowed for Marrow.'); }} />}
      <Txt f="serif" s={14.5} c="mut">A real alarm: it starts soft and rises to full volume over 45 seconds, even on silent. Only Volume Down stops it; Volume Up and taps do nothing. Snooze is the big button. It gives up by itself after five minutes.</Txt>
    </View>
  );
}

/** N6/R10 — which tone the alarm plays. Tapping a tone plays it here for up to 10 s; a large Stop button shows
 *  while it plays, and leaving the page stops it (the owner could not find a way to stop the sound). */
function AlarmSound() {
  const { c } = useTheme();
  const tones = useMemo(() => native.alarmTones(), []);
  const [chosen, setChosen] = useState(() => native.alarmTone());
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => () => { native.stopPreview(); }, []);
  useEffect(() => { if (!playing) return; const t = setTimeout(() => setPlaying(null), 10_000); return () => clearTimeout(t); }, [playing]);
  if (tones.length === 0) return null;
  const stop = () => { native.stopPreview(); setPlaying(null); };
  return (
    <View style={{ gap: 6 }}>
      <Label>Alarm sound</Label>
      {playing ? <Btn icon="pause" label="Stop" testID="tone-stop" onPress={stop} /> : null}
      {[['margin', 'Marrow tones'], ['phone', "Phone's tones"]].map(([kind, title]) => {
        const list = tones.filter((t) => (t.kind ?? 'phone') === kind).slice(0, 12);
        return list.length === 0 ? null : (
          <View key={kind} style={{ gap: 6 }}>
            <Txt f="serif" s={13} c="mut">{title}</Txt>
            {list.map((t) => (
              <Pressable key={t.id} accessibilityRole="radio" accessibilityState={{ checked: chosen === t.id }} accessibilityLabel={`${t.title}. Tap to hear it and choose it`}
                onPress={() => { native.chooseAlarmTone(t.id); setChosen(t.id); if (native.previewTone(t.id)) setPlaying(t.id); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 8, borderRadius: 10, backgroundColor: chosen === t.id ? c.hl : 'transparent' }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
                  {chosen === t.id ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.ink }} /> : null}
                </View>
                <Txt f="serif" s={16} style={{ flex: 1 }} numberOfLines={1}>{t.title}</Txt>
                {playing === t.id ? <Txt f="serif" s={13} c="mut">playing</Txt> : null}
              </Pressable>
            ))}
          </View>
        );
      })}
    </View>
  );
}

/** Test report #1: when an alarm (or a test ring) is ringing, the page says so and has a Stop button,
 *  whatever the notification permission is. Polled every second while the page is open. */
function Ringing() {
  const [id, setId] = useState(() => native.alarmRinging());
  useEffect(() => { const t = setInterval(() => setId(native.alarmRinging()), 1000); return () => clearInterval(t); }, []);
  if (!id) return null;
  return <Btn icon="pause" label={id === 'preview' ? 'Stop the test ring' : 'An alarm is ringing: stop it'} testID="alarm-stop" onPress={() => { native.stopAlarm(); setId(''); }} />;
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
  { kind: 'now', name: 'Now', line: 'The class on now or next, counting down. 2×1.' },
  { kind: 'class', name: 'Class', line: 'Adds the room and what comes after; at 4×3, the task that most needs you. 4×1 to 4×3.' },
  { kind: 'tasks', name: 'Tasks', line: 'What is due, most urgent first. Tick it there, even with Marrow closed. 4×2 to 4×4.' },
];
/** Settings → Widgets (v0.7.7.8): each widget with a button that asks the launcher to place it, and D3's colours. */
/** The picker's previews (tools/widget-previews.mjs draws them from the layout numbers). Metro needs literal requires. */
const PREVIEW: Record<native.WidgetKind, ImageSourcePropType> = {
  now: require('../../assets/widgets/now.png'),
  class: require('../../assets/widgets/class.png'),
  tasks: require('../../assets/widgets/tasks.png'),
};
export function WidgetsPage() {
  const { c } = useTheme(), has = native.nativeAvailable(), colors = useStore((s) => s.settings.widgetColors) ?? 'skin';
  return (
    <View style={{ gap: 12 }}>
      {!has && <Txt f="serif" s={16} c="mut">Widgets need the Android app.</Txt>}
      {WIDGETS.map((w) => (
        <HandBox key={w.kind} seed={`wd-${w.kind}`} fill={c.card} style={{ padding: 14, gap: 8 }}>
          <Txt f="bold" s={21}>{w.name}</Txt>
          {/* v0.7.8.11 (owner's ask 6): see it before adding it: the same picture the launcher's picker shows */}
          <Image testID={`widget-preview-${w.kind}`} fadeDuration={0} source={PREVIEW[w.kind]} accessibilityLabel={`Preview of the ${w.name} widget`} resizeMode="contain"
            style={{ width: '100%', height: w.kind === 'now' ? 72 : 120, alignSelf: 'center' }} />
          <Txt f="serif" s={15} c="mut">{w.line}</Txt>
          {has && <Btn small kind="ink" icon="plus" label="Add to home screen" a11y={`Add the ${w.name} widget to the home screen`} onPress={() => { if (!native.pinWidget(w.kind)) toast('Long-press your home screen, choose Widgets, then Marrow.'); }} />}
        </HandBox>
      ))}
      <View style={{ gap: 6 }}>
        <Label>Colours</Label>
        <Row>
          <Chip label="My skin" on={colors === 'skin'} onPress={() => act.setSettings({ widgetColors: 'skin' })} />
          <Chip label="My phone" on={colors === 'phone'} onPress={() => act.setSettings({ widgetColors: 'phone' })} />
        </Row>
      </View>
    </View>
  );
}
