import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Btn, Chip, Field, HandBox, Hair, Icon, Row, Stepper, Toggle, Txt } from '../ui/kit';
import { Label, Sheet } from '../ui/Sheet';
import { Empty } from '../screens/common';
import { FaceThumb } from '../ui/clock/ClockFace';
import { FACES } from '../ui/clock/faces';
import { BAR_KINDS, DayBar, type BarKind } from '../ui/DayBar';
import { useTheme } from '../ui/theme-context';
import { FS } from '../ui/fit';
import { act, getState, refreshNotifStatus, resync, snapshotOf, toast, useStore } from '../store/store';
import { SOUND_GROUPS } from '../domain/defaults';
import { DW, fmtDur, fmtTime, fmtWhen, fromMin, hm } from '../domain/time';
import { play, type SoundName } from '../services/audio';
import { fx } from '../services/fx';
import * as notifs from '../services/notifications';
import { runExport, type ExportFormat, type ExportTarget } from '../services/exportFile';
import { crashCount } from '../ui/crashlog';
import { DiagnosticsPage } from './Diagnostics';
import type { Settings, SoundGroup } from '../domain/types';

const TITLES: Record<string, string> = { appearance: 'Look & feel', theme: 'Theme & palette', paper: 'Paper & texture', clock: 'Clock face', bar: 'Progress bar', pen: 'Accent pen', notifications: 'Reminders', ncls: 'Classes', ntask: 'Tasks & exams', nhours: 'Hours & quiet time', ncourse: 'Per-subject lead time', nstatus: 'Delivery status', sound: 'Sound & haptics', attendance: 'Attendance & semester', focus: 'Focus & breaks', data: 'Data & export', diagnostics: 'Diagnostics', about: 'Reset' };
const SAMPLE: Record<SoundGroup, SoundName> = { paper: 'place', stamp: 'stamp-here', done: 'done', notify: 'notify', toggle: 'toggle-on', dial: 'detent-3', clock: 'tick', break: 'tape-peel' };
const Nav = ({ label, hint, icon, to }: { label: string; hint?: string; icon: string; to: string }) => {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}. ${hint ?? ''}`} onPress={() => act.settingsPush(to)} android_ripple={{ color: c.rule }} style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderColor: c.rule }}>
      <Icon name={icon} size={24} color={c.acc} /><View style={{ flex: 1, minWidth: 0 }}><Txt f="bold" s={22} numberOfLines={2}>{label}</Txt>{hint ? <Txt f="serif" s={14.5} c="mut" numberOfLines={2}>{hint}</Txt> : null}</View><Icon name="chevron" size={20} color={c.mut} />
    </Pressable>
  );
};
const Seg = <T extends string>({ value, opts, onChange }: { value: T; opts: [T, string][]; onChange: (v: T) => void }) => <Row>{opts.map(([v, l]) => <Chip key={v} label={l} on={value === v} onPress={() => onChange(v)} small />)}</Row>;
/** A caption and a stepper on one non-wrapping row. The caption gets `flex: 1` + `minWidth: 0` so it takes the
 *  space the fixed-width stepper leaves and wraps to a second line instead of pushing the stepper off the edge
 *  — a 166 dp stepper plus an unshrinkable "“When I get home”" overflowed a 320 dp sheet by ~30 dp (V2, V20). */
const Labelled = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
    <Txt f="bold" s={20} maxFontSizeMultiplier={FS} style={{ flex: 1, minWidth: 0 }} numberOfLines={2}>{label}</Txt>
    {children}
  </Row>
);
const MinStep = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => <Labelled label={label}><Stepper label={label} value={hm(value)} min={0} max={1425} step={15} fmt={fromMin} onChange={(m) => onChange(fromMin(m))} /></Labelled>;

export function SettingsSheet() {
  const path = useStore((s) => s.settingsPath), s = useStore((s) => s.settings), notifStatus = useStore((s) => s.notifStatus), plan = useStore((s) => s.plan), courses = useStore((s) => s.courses), { c } = useTheme();
  const st = { notifStatus, plan, courses };
  const page = path[path.length - 1] ?? 'root', n = s.notif;
  const [busy, setBusy] = useState<string | null>(null), [sure, setSure] = useState(false);
  useEffect(() => { if (!sure) return; const t = setTimeout(() => setSure(false), 4000); return () => clearTimeout(t); }, [sure]);
  /* The greeting field used to `set({name})` on EVERY keystroke — a whole-store write that re-rendered every
     screen while you typed. It now edits locally and commits after 400 ms of quiet (and on unmount, so closing
     the sheet mid-word never drops letters). */
  const [nameDraft, setNameDraft] = useState(s.name), nameRef = useRef(s.name), draftRef = useRef(s.name), nameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitName = (v: string) => { if (nameTimer.current) { clearTimeout(nameTimer.current); nameTimer.current = null; } if (v !== nameRef.current) { nameRef.current = v; act.setSettings({ name: v }); } };
  const onNameChange = (v: string) => { draftRef.current = v; setNameDraft(v); if (nameTimer.current) clearTimeout(nameTimer.current); nameTimer.current = setTimeout(() => { nameTimer.current = null; commitName(draftRef.current); }, 400); };
  useEffect(() => () => { if (nameTimer.current) commitName(draftRef.current); }, []);
  const set = (p: Partial<Settings>) => act.setSettings(p), back = path.length ? act.settingsPop : null;
  const doExport = async (f: ExportFormat, tg: ExportTarget) => { setBusy(`${f}${tg}`); try { const r = await runExport(f, tg, snapshotOf(getState())); toast(r.ok ? `Exported ${r.name}` : 'Sharing is not available on this device'); } catch (e) { const m = String((e as Error)?.message ?? e); if (!/cancel/i.test(m)) toast(`Export failed: ${m.slice(0, 70)}`); } setBusy(null); };
  let body: React.ReactNode = null;
  if (page === 'root') body = (<>
    {/* `settings.name` is what Today greets the user with. It ships as the developer's own first name in
        domain/defaults.ts (not editable from here), so without this field the app would greet every user by
        that name forever. Blank is allowed: Today drops the name and just says "Good morning". */}
    <Field label="What should the app call you?" placeholder="Your name" value={nameDraft} onChangeText={onNameChange} autoCapitalize="words" maxLength={24} returnKeyType="done" />
    <Nav icon="palette" label="Look & feel" hint={`${s.theme} · ${s.palette} · ${FACES.find((f) => f.id === s.clock)?.n}`} to="appearance" />
    <Nav icon="bell" label="Reminders" hint={n.enabled ? `${n.classLeadMin} min before class · quiet ${n.quietEnabled ? n.quietFrom + '–' + n.quietTo : 'off'}` : 'Off'} to="notifications" />
    <Nav icon="sound" label="Sound & haptics" hint={`${s.soundOn ? 'Sound on' : 'Sound off'} · ${s.hapticsOn ? 'haptics on' : 'haptics off'}`} to="sound" />
    <Nav icon="week" label="Attendance & semester" hint={`Semester from ${s.semesterStart} · ${s.lockAttendance ? 'locked' : 'unlocked'}`} to="attendance" />
    <Nav icon="timer" label="Focus & breaks" hint={`${s.breakMin} min break · ${s.breaksPerRound} per round`} to="focus" />
    <Nav icon="export" label="Data & export" hint="XLSX, CSV, JSON" to="data" />
    <Nav icon="note" label="Diagnostics" hint={`${crashCount()} crash${crashCount() === 1 ? '' : 'es'} recorded`} to="diagnostics" />
    <Nav icon="trash" label="Reset" hint="Back to the demo set" to="about" />
  </>);
  if (page === 'appearance') body = (<>
    <Nav icon="palette" label="Theme & palette" hint={`${s.theme} · ${s.palette === 'refined' ? 'Refined cream' : 'Original'}`} to="theme" /><Nav icon="note" label="Paper & texture" hint={`${s.paper} · ${s.texture}`} to="paper" /><Nav icon="clock" label="Clock face" hint={FACES.find((f) => f.id === s.clock)?.n} to="clock" /><Nav icon="stats" label="Progress bar" hint={BAR_KINDS.find((b) => b.id === s.bar)?.n} to="bar" /><Nav icon="pencil" label="Accent pen" hint={s.pen} to="pen" />
  </>);
  if (page === 'theme') body = (<>
    <Label>Theme</Label><Seg value={s.theme} opts={[['light', 'Cream'], ['dark', 'Dark'], ['auto', 'Follow phone']]} onChange={(v) => set({ theme: v })} />
    <Label>Palette</Label><Seg value={s.palette} opts={[['refined', 'Refined (lighter cream)'], ['original', 'Original']]} onChange={(v) => set({ palette: v })} />
    <Txt f="serif" s={15} c="mut">Original is the first version of the look: the cooler gray desk and the near-black night mode. Everything behind this sheet changes as you tap.</Txt>
    <Label>Motion</Label><Seg value={s.reduceMotion} opts={[['system', 'Follow phone'], ['on', 'Reduce'], ['off', 'Full']]} onChange={(v) => set({ reduceMotion: v })} />
  </>);
  if (page === 'paper') body = (<>
    <Label>Ruling</Label><Seg value={s.paper} opts={[['dots', 'Dots'], ['grid', 'Grid'], ['ruled', 'Ruled'], ['plain', 'Plain']]} onChange={(v) => set({ paper: v })} />
    <Label>Texture</Label><Seg value={s.texture} opts={[['grain', 'Grain (new)'], ['photo', 'Original photo'], ['none', 'None']]} onChange={(v) => set({ texture: v })} />
  </>);
  if (page === 'clock') body = (<>
    <Txt f="serif" s={15} c="mut">Five faces, each different at a glance. Every one works on cream and dark.</Txt>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{FACES.map((f) => (
      <Pressable key={f.id} accessibilityRole="radio" accessibilityState={{ selected: s.clock === f.id }} accessibilityLabel={f.n} onPress={() => { set({ clock: f.id }); fx.select(); }} style={{ width: '31%', flexGrow: 1 }}>
        <HandBox seed={f.id} fill={s.clock === f.id ? c.hl : c.card} stroke={s.clock === f.id ? c.acc : c.ink} sw={s.clock === f.id ? 2.6 : 1.6} style={{ alignItems: 'center', padding: 8, gap: 4 }}><FaceThumb id={f.id} size={96} /><Txt f="bold" s={15} style={{ textAlign: 'center' }}>{f.n}</Txt></HandBox>
      </Pressable>))}</View>
  </>);
  if (page === 'bar') body = (<>
    {BAR_KINDS.map((b) => (
      <Pressable key={b.id} accessibilityRole="radio" accessibilityState={{ selected: s.bar === b.id }} accessibilityLabel={`${b.n}. ${b.d}`} onPress={() => { set({ bar: b.id }); fx.select(); }}>
        <HandBox seed={b.id} fill={c.slab} stroke={s.bar === b.id ? c.acc : c.slab} sw={s.bar === b.id ? 3 : 1.6} style={{ padding: 10, gap: 2 }}>
          <Txt f="bold" s={19} c={c.slabInk}>{b.n}{s.bar === b.id ? '  ✓' : ''}</Txt><Txt f="serif" s={13.5} c={c.slabMut}>{b.d}</Txt>
          <DayBar kind={b.id as BarKind} periods={DEMO_PERIODS} now={DEMO_NOW} ink={c.slabInk} bg={c.slab} w={280} h={52} />
        </HandBox></Pressable>))}
  </>);
  if (page === 'pen') body = <Seg value={s.pen} opts={[['warm', 'Warm sienna'], ['graphite', 'Graphite (original)'], ['red', 'Red pencil'], ['blue', 'Blue pencil']]} onChange={(v) => set({ pen: v })} />;
  if (page === 'notifications') body = (<>
    <Toggle label="Reminders" hint="The master switch for every notification" value={n.enabled} onChange={(v) => act.setNotif({ enabled: v })} />
    <Nav icon="week" label="Classes" hint={`${n.classSoon ? n.classLeadMin + ' min before' : 'no heads-up'} · ${n.classEnded ? 'ask when it ends' : 'no end prompt'}`} to="ncls" />
    <Nav icon="tasks" label="Tasks & exams" hint={`${n.taskReminders ? 'on' : 'off'} · start-by ${n.startBy ? 'on' : 'off'}`} to="ntask" />
    <Nav icon="clock" label="Hours & quiet time" hint={`${n.activeFrom}–${n.activeTo} · quiet ${n.quietEnabled ? n.quietFrom + '–' + n.quietTo : 'off'} · weekends ${n.weekend}`} to="nhours" />
    <Nav icon="grad" label="Per-subject lead time" hint="Warn earlier for the classes you tend to be late to" to="ncourse" />
    <Nav icon="bell" label="Delivery status" hint={st.notifStatus ? `${st.notifStatus.permission} · ${st.notifStatus.scheduled} scheduled` : 'Check what is actually scheduled'} to="nstatus" />
  </>);
  if (page === 'ncls') body = (<>
    <Toggle label="Class starting soon" value={n.classSoon} onChange={(v) => act.setNotif({ classSoon: v })} />
    <Labelled label="Lead time"><Stepper label="lead" value={n.classLeadMin} min={0} max={60} step={5} fmt={(v) => `${v} min`} onChange={(v) => act.setNotif({ classLeadMin: v })} /></Labelled>
    <Toggle label="Ask me when a class ends" hint="Here, late or missed, one tap to mark" value={n.classEnded} onChange={(v) => act.setNotif({ classEnded: v })} />
  </>);
  if (page === 'ntask') body = (<>
    <Toggle label="Task reminders" value={n.taskReminders} onChange={(v) => act.setNotif({ taskReminders: v })} />
    <Toggle label="Exam reminders" value={n.examReminders} onChange={(v) => act.setNotif({ examReminders: v })} />
    <Toggle label="Start-by nudges" hint="If a task needs more time than the free hours you have, the app tells you when to begin" value={n.startBy} onChange={(v) => act.setNotif({ startBy: v })} />
    <Labelled label="Effort buffer"><Stepper label="buffer" value={Math.round(n.effortBuffer * 100)} min={0} max={100} step={5} fmt={(v) => `+${v}%`} onChange={(v) => act.setNotif({ effortBuffer: v / 100 })} /></Labelled>
    <MinStep label="“When I get home”" value={n.homeAt} onChange={(v) => act.setNotif({ homeAt: v })} />
    <Label>Default reminder for new tasks</Label><Row>{[0, 30, 60, 120, 1440].map((m) => <Chip key={m} small label={m ? `${fmtDur(m)} before` : 'At due'} on={n.defaultTaskMinutes.includes(m)} onPress={() => act.setNotif({ defaultTaskMinutes: n.defaultTaskMinutes.includes(m) ? n.defaultTaskMinutes.filter((x) => x !== m) : [...n.defaultTaskMinutes, m] })} />)}</Row>
  </>);
  if (page === 'nhours') body = (<>
    <Label>Active days</Label><Row>{DW.map((d, i) => <Chip key={d} label={d} small on={n.activeDays[i]} onPress={() => act.setNotif({ activeDays: n.activeDays.map((x, j) => (j === i ? !x : x)) })} />)}</Row>
    <MinStep label="Active from" value={n.activeFrom} onChange={(v) => act.setNotif({ activeFrom: v })} /><MinStep label="Active until" value={n.activeTo} onChange={(v) => act.setNotif({ activeTo: v })} />
    <Toggle label="Quiet hours" hint="Nothing rings; deadline reminders move earlier instead of later" value={n.quietEnabled} onChange={(v) => act.setNotif({ quietEnabled: v })} />
    {n.quietEnabled && <><MinStep label="Quiet from" value={n.quietFrom} onChange={(v) => act.setNotif({ quietFrom: v })} /><MinStep label="Quiet until" value={n.quietTo} onChange={(v) => act.setNotif({ quietTo: v })} /></>}
    <Label>Weekends</Label><Seg value={n.weekend} opts={[['normal', 'Like weekdays'], ['quiet', 'Quiet'], ['off', 'Off']]} onChange={(v) => act.setNotif({ weekend: v })} />
    <Toggle label="Hold reminders until class ends" hint="A reminder that would ring in the middle of a lecture waits for the break" value={n.duringClass === 'defer'} onChange={(v) => act.setNotif({ duringClass: v ? 'defer' : 'allow' })} />
  </>);
  if (page === 'ncourse') body = st.courses.length === 0
    ? <Empty icon="grad" text="No subjects yet. Add one and it gets its own lead time here." />
    : <>{st.courses.map((co) => <Labelled key={co.id} label={co.name}><Stepper label={co.name} value={n.courseLead[co.id] ?? n.classLeadMin} min={0} max={60} step={5} fmt={(v) => `${v} min`} onChange={(v) => act.setNotif({ courseLead: { ...n.courseLead, [co.id]: v } })} /></Labelled>)}</>;
  if (page === 'nstatus') { const ns = st.notifStatus, pl = st.plan; body = (<>
    <HandBox seed="ns" fill={c.card} style={{ padding: 12, gap: 4 }}>
      <Txt f="bold" s={20}>Permission: {ns?.permission ?? 'checking…'}</Txt>
      <Txt f="bold" s={20}>{ns ? `${ns.scheduled} reminder${ns.scheduled === 1 ? '' : 's'} queued on this phone` : 'Counting what is queued…'}</Txt>
      {ns?.next ? <Txt f="serif" s={16} c="mut">Next one rings {fmtWhen(ns.next)}</Txt> : null}
      {pl ? <Txt f="serif" s={16} c="mut">Plan: {pl.count} in the next 14 days · {pl.shifted} moved to avoid class or quiet hours · {pl.deferred} waiting for room in the queue{pl.next ? ` · next: ${pl.next.title} at ${fmtTime(pl.next.at)}` : ''}</Txt> : null}
    </HandBox>
    <Txt f="serif" s={15.5} c="mut">Local reminders only: they are scheduled on this phone and need no internet. Nothing is sent from a server, so a reminder cannot arrive if the phone has blocked the app, is in a battery-saver that kills alarms, or the app has not been opened for a while. Expo Go uses the system notification sound; custom sounds need a built app.</Txt>
    <Row><Btn small label="Allow notifications" icon="bell" onPress={async () => { await notifs.ensurePermission(true); await refreshNotifStatus(); }} /><Btn small kind="ghost" label="Rebuild queue" onPress={async () => {
      toast('Rebuilding the reminder queue…');
      // `resync` is fire-and-forget: it debounces into a timer and reports back by writing `notifStatus`, so
      // the only honest way to close the loop is to let it run, re-read the status, and say what it found.
      // Without this the toast said "Rebuilding…" and then nothing ever happened again.
      resync(0);
      await new Promise((r) => setTimeout(r, 700));
      await refreshNotifStatus();
      const nq = getState().notifStatus;
      toast(nq ? `Queue rebuilt: ${nq.scheduled} reminder${nq.scheduled === 1 ? '' : 's'} on this phone.` : 'Queue rebuilt.');
    }} /><Btn small kind="ghost" label="Test in 10 s" onPress={async () => { const ok = await notifs.sendTest(10); toast(ok ? 'Sent. Lock the phone and wait 10 seconds.' : 'Could not schedule: check permission'); }} /></Row>
  </>); }
  if (page === 'sound') body = (<>
    <Toggle label="Sound" hint="Paper, stamps, dial and chimes" value={s.soundOn} onChange={(v) => set({ soundOn: v })} />
    <Toggle label="Haptics" hint="A distinct feel for each kind of change" value={s.hapticsOn} onChange={(v) => { set({ hapticsOn: v }); if (v) fx.stamp('p'); }} />
    <Toggle label="Old-clock tick while focusing" value={s.tickOn} onChange={(v) => set({ tickOn: v })} />
    <Hair />
    {SOUND_GROUPS.map((g) => (
      <View key={g.id} style={{ gap: 2 }}><Txt f="bold" s={20}>{g.label}</Txt><Txt f="serif" s={14} c="mut">{g.hint}</Txt>
        <Row style={{ flexWrap: 'nowrap', justifyContent: 'space-between' }}><Stepper label={g.label} value={Math.round(s.soundVol[g.id] * 100)} min={0} max={100} step={10} fmt={(v) => `${v}%`} onChange={(v) => set({ soundVol: { ...s.soundVol, [g.id]: v / 100 } })} /><Btn small kind="ghost" icon="play" label="Play" quiet onPress={() => play(SAMPLE[g.id])} /></Row></View>))}
  </>);
  if (page === 'attendance') body = (<>
    <Toggle label="Lock attendance grid" hint="Nothing can change until you unlock it" value={s.lockAttendance} onChange={(v) => set({ lockAttendance: v })} />
    <Txt f="serif" s={15.5} c="mut">When unlocked: tap an empty cell once to mark it. After that, long-press to change it.</Txt>
    <Label>Semester starts</Label><Row><Stepper label="semester month" value={Number(s.semesterStart.slice(5, 7))} min={1} max={12} fmt={(v) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][v - 1] ?? ''} onChange={(v) => set({ semesterStart: `${s.semesterStart.slice(0, 5)}${String(v).padStart(2, '0')}-${s.semesterStart.slice(8)}` })} /><Stepper label="semester day" value={Number(s.semesterStart.slice(8))} min={1} max={28} fmt={(v) => String(v)} onChange={(v) => set({ semesterStart: `${s.semesterStart.slice(0, 8)}${String(v).padStart(2, '0')}` })} /></Row>
    <Row><Btn small kind="ghost" icon="plus" label="Add class" onPress={() => act.open({ t: 'meeting' })} /><Btn small kind="ghost" icon="plus" label="Add subject" onPress={() => act.open({ t: 'course' })} /></Row>
  </>);
  if (page === 'focus') body = (<>
    <Labelled label="Break length"><Stepper label="break" value={s.breakMin} min={1} max={30} fmt={(v) => `${v} min`} onChange={(v) => set({ breakMin: v })} /></Labelled>
    <Labelled label="Breaks per round"><Stepper label="breaks" value={s.breaksPerRound} min={0} max={4} fmt={(v) => String(v)} onChange={(v) => set({ breaksPerRound: v })} /></Labelled>
    <Toggle label="Flow mode by default" hint="Keep counting after the round ends" value={s.focusFlow} onChange={(v) => set({ focusFlow: v })} />
    <Txt f="serif" s={15.5} c="mut">A break pauses the main clock. It unlocks after 5 minutes of focus, nudges you every 5 minutes, and the little taped clock falls off the page when it is over. New sessions pick these up.</Txt>
  </>);
  if (page === 'data') body = (<>
    <Txt f="serif" s={15.5} c="mut">The whole dataset: subjects, timetable, every attendance mark, tasks, steps, reminders, notes, marks, focus sessions and settings. Named from the date you export.</Txt>
    {(['xlsx', 'csv', 'json'] as ExportFormat[]).map((f) => (
      <View key={f} style={{ gap: 4 }}><Txt f="bold" s={20}>{f === 'xlsx' ? 'Excel workbook (.xlsx)' : f === 'csv' ? 'CSV, one file per table (.zip)' : 'JSON (.json)'}</Txt>
        <Row><Btn small label="Save to folder…" icon="export" disabled={!!busy} onPress={() => void doExport(f, 'folder')} /><Btn small kind="ghost" label="Share…" disabled={!!busy} onPress={() => void doExport(f, 'share')} />{busy?.startsWith(f) ? <Txt f="serif" s={15} c="mut">working…</Txt> : null}</Row></View>))}
    <Hair /><Btn kind="ghost" icon="trash" label="Clear demo history" onPress={() => void act.purgeDemo()} />
    <Txt f="serif" s={14.5} c="mut">Removes the sample finished tasks and focus sessions that make the Stats charts look alive on day one. Your own data stays.</Txt>
  </>);
  if (page === 'diagnostics') body = <DiagnosticsPage />;
  if (page === 'about') body = (<>
    <Txt f="serif" s={16} c="mut">This replaces everything with the original demo set and default settings. It cannot be undone, so export first if you care about your data.</Txt>
    <Btn kind={sure ? 'danger' : 'ghost'} icon="trash" label={sure ? 'Tap again to erase everything' : 'Reset to demo set'} onPress={armReset} />
    <Txt f="serif" s={14} c="mut">Marginalia 1.0 · local-first, no account, no network needed.</Txt>
  </>);
  return <Sheet title={path.length ? TITLES[page] ?? 'Settings' : 'Settings'} onClose={() => { act.settingsPop(); act.close(); clearSettingsPath(); }} back={back} maxH={0.62} peek>{body}</Sheet>;

  /** The one irreversible action, guarded by the same double tap the boot-failure screen uses: the first tap
   *  arms it and the second one, within the window, does it. The timer is owned by an effect so closing the
   *  sheet mid-countdown cannot leave it to fire against an unmounted component. */
  function armReset() {
    if (!sure) { setSure(true); return; }
    setSure(false);
    void act.resetAll();
    act.settingsPop();
  }
}
const clearSettingsPath = () => { while (getState().settingsPath.length) act.settingsPop(); };
const DEMO_NOW = new Date(2026, 9, 5, 10, 20).getTime(), at = (h: number, m: number) => new Date(2026, 9, 5, h, m).getTime();
const DEMO_PERIODS = [{ start: at(8, 30), end: at(9, 20), label: 'Economics' }, { start: at(10, 0), end: at(10, 50), label: 'Discrete' }, { start: at(11, 45), end: at(12, 35), label: 'Tech', cancelled: true }, { start: at(14, 0), end: at(14, 50), label: 'Code' }];
export { ScrollView };
