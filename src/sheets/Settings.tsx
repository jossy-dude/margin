import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Linking, Pressable, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';
import { Btn, Chip, EASE, Field, HandBox, Hair, Icon, Row, Stepper, Toggle, Txt } from '../ui/kit';
import { Label, Sheet } from '../ui/Sheet';
import { Empty, Section } from '../screens/common';
import { FaceThumb } from '../ui/clock/ClockFace';
import { FACES } from '../ui/clock/faces';
import { BAR_KINDS, DayBar, type BarKind } from '../ui/DayBar';
import { isBarKind } from '../ui/instruments/legacyKinds';
import { GROUPS, INSTRUMENTS } from '../ui/instruments/catalogue';
import { previewSvg } from '../ui/instruments/svg';
import { useNow, useReduceMotion, useTheme } from '../ui/theme-context';
import { FS } from '../ui/fit';
import { act, getState, notificationAccent, refreshNotifStatus, resync, snapshotOf, toast, useStore } from '../store/store';
import { SOUND_GROUPS, TOUR_VERSION, toured } from '../domain/defaults';
import { DW, fmtDur, fmtHM, fmtTime, fmtWhen, fromMin, hm, relFire } from '../domain/time';
import { nudgeWord } from '../domain/timer';
import { logState, PERMISSION, statusHint, KIND_WORD, testTarget } from '../domain/notifActions';
import type { NotifLogRow } from '../data/repository';
import { play, type SoundName } from '../services/audio';
import { fx } from '../services/fx';
import * as notifs from '../services/notifications';
import { runExport, type ExportFormat, type ExportTarget } from '../services/exportFile';
import { crashCount, subscribeCrashes } from '../ui/crashlog';
import { DiagnosticsPage } from './Diagnostics';
import type { Settings, SoundGroup } from '../domain/types';

const TITLES: Record<string, string> = { appearance: 'Look & feel', theme: 'Theme & palette', paper: 'Paper & texture', clock: 'Clock face', bar: 'Progress bar', pen: 'Accent pen', notifications: 'Reminders', ncls: 'Classes', ntask: 'Tasks & exams', nhours: 'Hours & quiet time', ncourse: 'Per-subject lead time', nstatus: 'Delivery status', sound: 'Sound & haptics', attendance: 'Attendance & semester', focus: 'Focus & breaks', data: 'Data & export', diagnostics: 'Diagnostics', tour: 'The tour', about: 'Reset' };
const SAMPLE: Record<SoundGroup, SoundName> = { paper: 'place', stamp: 'stamp-here', done: 'done', notify: 'notify', toggle: 'toggle-on', dial: 'detent-3', clock: 'tick', break: 'tape-peel' };

/**
 * One Settings page change, as paper pushed sideways.
 *
 * This sheet is the only place in the app with a *stack* of pages, and every one of them used to replace
 * the previous one in a single commit — no motion at all, on the screen the user spends the most time
 * navigating. Android's own Settings slides, so this does too: deeper enters from the right, Android
 * Back enters from the left, 24 dp and a 0.7 degree tilt that settles flat. The tilt is the app's own
 * page-placement language (3.8 degrees there, at 200 ms and 30 dp of travel); this is the same gesture
 * at a tenth the size, because it is one control inside a sheet rather than a whole page replacing
 * another.
 *
 * **No opacity.** A1 removed it from the page placement for a measured reason — an animated opacity on a
 * wrapper keeps the whole subtree in an offscreen target and re-composites it every frame — and this
 * wrapper holds every control on the page, several of them SVG. Direction comes from the depth in the
 * store's `settingsPath`, which is a strict stack, so it never has to guess which way "back" was.
 */
function PageSwap({ depth, children }: { depth: number; children: React.ReactNode }) {
  const reduce = useReduceMotion(), k = useSharedValue(0), dir = useSharedValue(1), prev = useRef(depth);
  useEffect(() => {
    if (prev.current === depth) return;
    dir.set(depth > prev.current ? 1 : -1);
    prev.current = depth;
    if (reduce) { k.set(0); return; }
    k.set(withSequence(withTiming(1, { duration: 80, easing: EASE }), withSpring(0, { duration: 220, dampingRatio: 0.74 })));
  }, [depth, reduce, k, dir]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: dir.get() * 24 * k.get() }, { rotate: `${dir.get() * 0.7 * k.get()}deg` }] }));
  return <Animated.View style={[{ gap: 12 }, st]}>{children}</Animated.View>;
}

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

/* ───── Delivery status ───── */
/** The one honest place: every number on that page is either read off this phone or computed by the
 *  planner, and the two failure states a phone can be in — blocked, and unable to be asked — are named
 *  separately because only one of them can still be fixed from here. The wording itself lives in
 *  `domain/notifActions.ts`, next to the log rules it has to agree with, and is tested there. */
const LogRow = ({ r, now, h12 }: { r: NotifLogRow; now: number; h12: boolean }) => {
  const { c } = useTheme();
  return (
    <HandBox seed={r.id} shadow={false} fill={c.card} style={{ padding: 10, gap: 2 }}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <Txt f="bold" s={19} style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>{r.id === notifs.TEST_ACTION_ID ? 'test · ' : ''}{KIND_WORD[r.kind] ?? r.kind}</Txt>
        <Txt f="serif" s={15} c="mut">{r.dueAt ? fmtWhen(r.dueAt, now, h12) : 'time unknown'}</Txt>
      </Row>
      <Txt f="serif" s={14.5} c="mut">{logState(r, now)}</Txt>
    </HandBox>
  );
};

export function SettingsSheet() {
  const path = useStore((s) => s.settingsPath), s = useStore((s) => s.settings), notifStatus = useStore((s) => s.notifStatus), plan = useStore((s) => s.plan), courses = useStore((s) => s.courses), log = useStore((s) => s.notifLog), tasks = useStore((s) => s.tasks);
  /* `s.now` is written by `hydrate()` and by the AppState handler and by nothing else, so every
     relative stamp on the Delivery status page — "5 min ago", `fmtWhen`, `testTarget` and each log
     row — was frozen at the moment the app last came to the foreground. This page is the one place
     that reads wall time as CONTENT rather than as a tick, so it subscribes to a clock at the slow
     30 s cadence its own granularity deserves, not at the 1 s the live countdowns need. */
  const now = useNow(30_000);
  const { c } = useTheme();
  const st = { notifStatus, plan, courses };
  const page = path[path.length - 1] ?? 'root', n = s.notif;
  /* A `settings.bar` persisted by an older build can name a bar in neither `BAR_KINDS` nor
     `INSTRUMENTS`. Drawing is safe — `DayBar` falls back to Sight glass — but this sheet read the raw
     id, so the Progress bar page showed an empty hint and no selected chip: it claimed nothing was
     chosen while the app drew one. The picker resolves the id exactly the way the renderer does. */
  const bar = BAR_KINDS.some((b) => b.id === s.bar) || INSTRUMENTS.some((i) => i.id === s.bar) ? s.bar : 'glass';
  /* Read and written straight off `Settings`. It arrived through `qa/HANDOFF-A4.md` as an optional field,
   *  which needed a cast here while the shared-type patch was still pending; the patch landed, the cast and
   *  the paragraph explaining it are gone, and `toured()` still reads `undefined` as "not seen" — which is
   *  what a settings row written before the tour existed holds. */
  const onboarded = s.onboarded, replay = (v: number) => act.setSettings({ onboarded: v });
  const [busy, setBusy] = useState<string | null>(null), [sure, setSure] = useState(false);
  /* The action test really writes — that is the point of it — so it asks twice, like Reset and the
   * boot screen's reset do. The window is owned by an effect so closing the sheet cannot leave a timer
   * to fire against an unmounted component. */
  const [armed, setArmed] = useState(false);
  /* The Diagnostics hint used to call `crashCount()` twice *inside the render body*, and
     `crashCount()` is blocking disk I/O: it opens the JSONL file, reads it whole and parses each
     line. `nameDraft` is local state, so every keystroke re-rendered this sheet and re-read the
     whole log twice — on the JS thread, in a text field. The log is a file, so it is an external
     store: subscribing reads it once, and re-reads only when a crash is actually recorded or
     cleared, so the count stays live without ever polling. */
  const crashes = useSyncExternalStore(subscribeCrashes, crashCount, crashCount);
  useEffect(() => { if (!sure) return; const t = setTimeout(() => setSure(false), 4000); return () => clearTimeout(t); }, [sure]);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
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
    <Nav icon="bell" label="Reminders" hint={n.enabled ? `${n.classLeadMin} min before class · quiet ${n.quietEnabled ? fmtHM(n.quietFrom, s.hour12) + '–' + fmtHM(n.quietTo, s.hour12) : 'off'}` : 'Off'} to="notifications" />
    <Nav icon="sound" label="Sound & haptics" hint={`${s.soundOn ? 'Sound on' : 'Sound off'} · ${s.hapticsOn ? 'haptics on' : 'haptics off'}`} to="sound" />
    <Nav icon="week" label="Attendance & semester" hint={`Semester from ${s.semesterStart} · ${s.lockAttendance ? 'locked' : 'unlocked'}`} to="attendance" />
    <Nav icon="timer" label="Focus & breaks" hint={`${s.breakMin} min break · ${s.breaksPerRound} per round`} to="focus" />
    <Nav icon="export" label="Data & export" hint="XLSX, CSV, JSON" to="data" />
    <Nav icon="note" label="Diagnostics" hint={`${crashes} crash${crashes === 1 ? '' : 'es'} recorded`} to="diagnostics" />
    <Nav icon="note" label="Show the tour again" hint={`${toured(onboarded) ? 'Finished — it is replayable' : 'Not seen yet'}`} to="tour" />
    <Nav icon="trash" label="Reset" hint="Back to the demo set" to="about" />
  </>);
  if (page === 'appearance') body = (<>
    <Nav icon="palette" label="Theme & palette" hint={`${s.theme} · ${s.palette === 'refined' ? 'Refined cream' : 'Original'}`} to="theme" /><Nav icon="note" label="Paper & texture" hint={`${s.paper} · ${s.texture}`} to="paper" /><Nav icon="clock" label="Clock face" hint={FACES.find((f) => f.id === s.clock)?.n} to="clock" /><Nav icon="stats" label="Progress bar" hint={BAR_KINDS.find((b) => b.id === bar)?.n} to="bar" /><Nav icon="pencil" label="Accent pen" hint={s.pen} to="pen" />
    {/* The clock format lives here with the other display choices, and the switch is stated as the
        24-hour clock because that is what is true out of the box: it ships ON, so the app a new user
        opens is the app as built. Turning it off is the 12-hour reading — see `fmtTime`. */}
    <Toggle label="24-hour clock" hint="Off prints 8:30 AM instead of 08:30" value={!s.hour12} onChange={(v) => { set({ hour12: !v }); fx.toggle(v); }} />
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
    <Txt f="serif" s={15} c="mut">A bar that measures. The sixteen instruments count the class you are in, from the
      real clock: full when it starts, empty when the bell goes. The one at the top reads your whole day
      instead. Each keeps its own machine.</Txt>
    <Label>Your whole day</Label>
    {BAR_KINDS.map((b) => <BarPick key={b.id} id={b.id} n={b.n} d={b.d} on={bar === b.id} onPress={() => { set({ bar: b.id }); fx.select(); }} />)}
    {GROUPS.map((g) => {
      const list = INSTRUMENTS.filter((i) => i.g === g.id);
      return (
        <React.Fragment key={g.id}>
          <Label>{g.n}</Label>
          <Txt f="serif" s={13.5} c="mut">{g.hint}</Txt>
          {list.map((i) => <BarPick key={i.id} id={i.id} n={i.n} d={i.d} on={bar === i.id} onPress={() => { set({ bar: i.id }); fx.select(); }} />)}
        </React.Fragment>
      );
    })}
  </>);
  if (page === 'pen') body = <Seg value={s.pen} opts={[['warm', 'Warm sienna'], ['graphite', 'Graphite (original)'], ['red', 'Red pencil'], ['blue', 'Blue pencil']]} onChange={(v) => set({ pen: v })} />;
  if (page === 'notifications') body = (<>
    <Toggle label="Reminders" hint="The master switch for every notification" value={n.enabled} onChange={(v) => act.setNotif({ enabled: v })} />
    <Nav icon="week" label="Classes" hint={`${n.classSoon ? n.classLeadMin + ' min before' : 'no heads-up'} · ${n.classEnded ? 'ask when it ends' : 'no end prompt'}`} to="ncls" />
    <Nav icon="tasks" label="Tasks & exams" hint={`${n.taskReminders ? 'on' : 'off'} · start-by ${n.startBy ? 'on' : 'off'}`} to="ntask" />
    <Nav icon="clock" label="Hours & quiet time" hint={`${fmtHM(n.activeFrom, s.hour12)}–${fmtHM(n.activeTo, s.hour12)} · quiet ${n.quietEnabled ? fmtHM(n.quietFrom, s.hour12) + '–' + fmtHM(n.quietTo, s.hour12) : 'off'} · weekends ${n.weekend}`} to="nhours" />
    <Nav icon="grad" label="Per-subject lead time" hint="Warn earlier for the classes you tend to be late to" to="ncourse" />
    <Nav icon="bell" label="Delivery status" hint={statusHint(st.notifStatus)} to="nstatus" />
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
  if (page === 'nstatus') { const ns = st.notifStatus, pl = st.plan, target = testTarget(now, pl?.next ?? null, tasks, notifs.TEST_ACTION_ID); body = (<>
    {/* The one honest place: every number below is either read off this phone or computed by the
        planner, and the two failure states a phone can be in — blocked, and unable to be asked — are
        named separately because only one of them can still be fixed from here. */}
    <HandBox seed="ns" fill={c.card} style={{ padding: 12, gap: 5 }}>
      {ns ? <Txt f="bold" s={21} c={PERMISSION[ns.permission].tone}>{PERMISSION[ns.permission].line}</Txt> : <Txt f="bold" s={21} c="mut">Asking this phone…</Txt>}
      {ns && ns.permission === 'denied' && !ns.canAskAgain ? <Txt f="serif" s={15} c="mut">The phone has stopped asking. Only its own settings screen can turn this back on — the button below opens it.</Txt> : null}
      {ns && ns.permission === 'denied' && ns.canAskAgain ? <Txt f="serif" s={15} c="mut">The phone will still ask once, so the button below is worth a tap.</Txt> : null}
      <Txt f="bold" s={20}>{!ns ? 'Counting what is queued…' : !ns.queueRead ? 'This phone would not say what it has queued, so nothing here can be counted.' : ns.permission === 'granted' ? `${ns.scheduled} reminder${ns.scheduled === 1 ? '' : 's'} queued on this phone` : `${ns.scheduled} still queued from before, but nothing new can be queued until it is allowed.`}</Txt>
      {ns?.queueRead && ns.scheduled > 0 && ns.next !== null ? <Txt f="serif" s={16} c="mut">Next one rings {fmtWhen(ns.next, now, s.hour12)} — {relFire(ns.next, now)}.</Txt> : null}
      {ns?.queueRead && ns.scheduled > 0 && ns.next === null ? <Txt f="serif" s={16} c="mut">Queued, but the phone will not report when any of them fires.</Txt> : null}
      {ns?.queueRead && ns.scheduled === 0 && pl && pl.count > 0 && ns.permission === 'granted' ? <Txt f="serif" s={16} c="mut">The planner has {pl.count} ready, and the phone&rsquo;s queue is empty. A battery saver that stops alarms, or a phone that dropped them on reboot, is the usual reason.</Txt> : null}
      {ns?.queueRead && ns.scheduled === 0 && pl && pl.count === 0 ? <Txt f="serif" s={16} c="mut">{n.enabled ? `Nothing to send in the next 14 days${pl.dropped.length ? `: ${pl.dropped.length} blocked by your hours` : ' inside your active hours'}.` : 'Reminders are switched off above.'}</Txt> : null}
    </HandBox>
    {/* Buttons above the fold: this is a bottom sheet, so anything below them is a scroll away. */}
    <Row>
      {ns?.permission === 'denied' && !ns.canAskAgain ? <Btn small icon="gear" label="Open phone settings" a11y="Open this phone's app settings, where notifications for Marginalia can be turned back on" onPress={() => { void Linking.openSettings().catch(() => toast('This phone would not open its settings')); }} />
        : <Btn small icon="bell" label="Allow notifications" disabled={ns?.permission === 'granted' || ns?.permission === 'unavailable'} a11y={ns?.permission === 'granted' ? 'Allow notifications. Already allowed.' : 'Ask this phone for permission to send notifications'} onPress={async () => { const got = await notifs.ensurePermission(true); await refreshNotifStatus(); toast(got === 'granted' ? 'Allowed.' : got === 'denied' ? 'Blocked. Only the phone&rsquo;s settings can undo that.' : 'The phone has not answered yet.'); }} />}
      <Btn small kind="ghost" label="Rebuild queue" onPress={async () => {
        toast('Rebuilding the reminder queue…');
        // `resync` is fire-and-forget: it debounces into a timer and reports back by writing `notifStatus`, so
        // the only honest way to close the loop is to let it run, re-read the status, and say what it found.
        // Without this the toast said "Rebuilding…" and then nothing ever happened again.
        resync(0);
        await new Promise((r) => setTimeout(r, 700));
        await refreshNotifStatus();
        const nq = getState().notifStatus;
        toast(nq && nq.queueRead ? `Queue rebuilt: ${nq.scheduled} reminder${nq.scheduled === 1 ? '' : 's'} on this phone.` : 'Queue rebuilt, but the phone would not report what it holds.');
      }} />
    </Row>
    <Row>
      <Btn small kind="ghost" icon="bell" label="Test in 10 s" onPress={async () => { const ok = await notifs.sendTest(10); toast(ok ? 'Sent. Lock the phone and wait 10 seconds.' : 'Could not schedule: check permission'); }} />
      <Btn small kind={armed ? 'danger' : 'ghost'} icon="check" disabled={!target} a11y={target ? `${armed ? 'Send the action test now' : 'Arm the action test'}. It really marks ${target.title}, and the toast can undo that.` : 'Test the buttons. No class or open task with a due date to imitate yet.'} label={armed ? 'Tap again to send' : 'Test the buttons'} onPress={() => { const t = target; if (!t) return; if (!armed) { setArmed(true); toast(`Next: ${t.title}. One more tap really marks it.`); return; } setArmed(false); void notifs.sendActionTest(t, notificationAccent(), 10).then((ok) => toast(ok ? `Sent for ${t.title} — it carries the real buttons.` : 'Could not schedule: check permission')); }} />
    </Row>
    <Txt f="serif" s={14.5} c="mut">{target ? `“Test the buttons” sends a copy of “${target.title}” in 10 seconds, with the same buttons a real reminder has. Pressing one really marks it — the toast that follows can undo it.` : '“Test the buttons” needs a class in the next fortnight, or an open task with a due date, to imitate.'}</Txt>
    <Section title="The next 14 days">
      {pl ? <>
        <Txt f="serif" s={15.5} c="mut">{pl.count} reminder{pl.count === 1 ? '' : 's'} planned · {pl.shifted} moved out of the way · {pl.deferred} waiting for room in the queue{pl.dropped.length ? ` · ${pl.dropped.length} dropped` : ''}.</Txt>
        {pl.moved.map((m, i) => <Txt key={`${m.at}${i}`} f="serif" s={15} c="mut">“{m.title}” moved from {fmtTime(m.was, s.hour12)} to {fmtTime(m.at, s.hour12)} — {m.why}.</Txt>)}
        {pl.dropped.map((d, i) => <Txt key={`${d.id}${i}`} f="serif" s={15} c="mut">Dropped: {d.why}.</Txt>)}
      </> : <Txt f="serif" s={15.5} c="mut">The plan has not been worked out yet.</Txt>}
    </Section>
    <Section title="What actually arrived">
      {log.length === 0 ? <Empty icon="bell" text="Nothing has been queued on this phone yet, or the app has not been open since one was." /> : <View style={{ gap: 8 }}>{log.map((r) => <LogRow key={r.id} r={r} now={now} h12={s.hour12} />)}</View>}
      <Txt f="serif" s={14} c="mut">A reminder that rings while the app is closed is recorded as opened but never rang in the app — nothing was running to see it happen. The app will not invent a time it never witnessed.</Txt>
    </Section>
    <Hair />
    <Txt f="serif" s={15.5} c="mut">Local reminders only: they are scheduled on this phone and need no internet. Nothing is sent from a server, so a reminder cannot arrive if the phone has blocked the app, is in a battery-saver that kills alarms, or the app has not been opened for a while. Expo Go uses the system notification sound; custom sounds need a built app.</Txt>
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
    {/* The nudge sentence is generated from `nudgeStep`, the function the timer itself uses, so the page cannot
        promise a cadence the code does not deliver. It used to read "nudges you every 5 minutes", which was
        false for every length this page offers: the step is a third of the break, so the default 5-minute
        break wiggles once a minute and a 25-minute break wiggles every five. See `nudgeWord` in
        `domain/timer.ts` and the assertion in `src/test/settings-render.test.ts`. */}
    <Txt f="serif" s={15.5} c="mut">A break pauses the main clock. It unlocks after 5 minutes of focus, nudges you {nudgeWord(s.breakMin * 60_000)}, and the little taped clock falls off the page when it is over. New sessions pick these up.</Txt>
  </>);
  if (page === 'data') body = (<>
    <Txt f="serif" s={15.5} c="mut">The whole dataset: subjects, timetable, every attendance mark, tasks, steps, reminders, notes, marks, focus sessions and settings. Named from the date you export.</Txt>
    {(['xlsx', 'csv', 'json'] as ExportFormat[]).map((f) => (
      <View key={f} style={{ gap: 4 }}><Txt f="bold" s={20}>{f === 'xlsx' ? 'Excel workbook (.xlsx)' : f === 'csv' ? 'CSV, one file per table (.zip)' : 'JSON (.json)'}</Txt>
        <Row><Btn small label="Save to folder…" icon="export" disabled={!!busy} onPress={() => void doExport(f, 'folder')} /><Btn small kind="ghost" label="Share…" disabled={!!busy} onPress={() => void doExport(f, 'share')} />{busy?.startsWith(f) ? <Txt f="serif" s={15} c="mut">working…</Txt> : null}</Row></View>))}
    <Hair /><Btn kind="ghost" icon="trash" label="Clear demo history" onPress={() => void act.purgeDemo()} />
    {/* Only the *history* is flagged as demo: the subjects, timetable, notes and open tasks that ship
        with the app carry no such flag, so "your own data stays" would read as "there is no demo left"
        on a fresh install, where everything visible is still the sample set. Name what stays. */}
    <Txt f="serif" s={14.5} c="mut">Removes the sample finished tasks and focus sessions that make the Stats charts look alive on day one. Your own data stays — and so do the sample subjects, timetable, notes and open tasks, which are the app&rsquo;s starting point. Settings → Reset replaces the whole demo set.</Txt>
  </>);
  if (page === 'diagnostics') body = <DiagnosticsPage />;
  if (page === 'tour') body = (<>
    <Txt f="serif" s={16} c="mut">The five-screen tour that runs the first time this app opens. It teaches the five things a first-time user cannot guess: that everything is on this phone, that the + is the only way to add anything, that swiping left crumples and Undo brings it back, that attendance is one tap and then a hold, and that the Focus dial is a real dial.</Txt>
    <Btn kind="ghost" icon="play" label="Run it now" onPress={() => { replay(0); act.close(); }} />
    <Txt f="serif" s={14} c="mut">{toured(onboarded) ? `You finished build ${TOUR_VERSION} of it. Running it again changes nothing about your data.` : 'You have not seen it yet, so it will run the next time this app opens anyway.'}</Txt>
  </>);
  if (page === 'about') body = (<>
    <Txt f="serif" s={16} c="mut">This replaces everything with the original demo set and default settings. It cannot be undone, so export first if you care about your data.</Txt>
    <Btn kind={sure ? 'danger' : 'ghost'} icon="trash" label={sure ? 'Tap again to erase everything' : 'Reset to demo set'} onPress={armReset} />
    <Txt f="serif" s={14} c="mut">Marginalia 1.0 · local-first, no account, no network needed.</Txt>
  </>);
  return <Sheet title={path.length ? TITLES[page] ?? 'Settings' : 'Settings'} onClose={() => { act.settingsPop(); act.close(); clearSettingsPath(); }} back={back} maxH={0.62} peek><PageSwap depth={path.length}>{body}</PageSwap></Sheet>;

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
/** DEMO_NOW is 10:20 and DEMO_PERIODS[1] runs 10:00–10:50, so every instrument preview is drawn at
 *  30/50 remaining. Getting this wrong shows a state the user is never in. */
const DEMO_TOTAL = 50 * 60_000, DEMO_P = 30 / 50;

/**
 * One row of the picker. The SELECTED kind is a live `DayBar`; the other sixteen are static
 * `SvgXml` strings from the same geometry module. That is not an optimisation for its own sake: the
 * sheet mounts every kind at once and a live instrument is 20–95 react-native-svg nodes, so seventeen
 * live previews is roughly 800 nodes and seventeen Reanimated worklet subscriptions in one bottom
 * sheet. The static path draws the identical markup with the dash offset already baked in.
 *
 * **The one original kind is always live.** `previewSvg` is the *instrument* geometry module, and
 * `instrument('glass')` returns `undefined` — it would hand back an empty string and the day-wide
 * bar would show nothing at all. `isBarKind` is the app's own discriminator, so exactly one row takes
 * the live path plus whichever instrument is selected: two live previews, not seventeen.
 *
 * On ids (prompt.md R11): this page is exactly where a shared SVG id would collide, and A2's answer was
 * to remove the need — the instruments emit no gradients, no clips and no patterns, so there is nothing
 * to make unique. `bars.test.ts` asserts that across all 16 instruments.
 */
function BarPick({ id, n, d, on, onPress }: { id: string; n: string; d: string; on: boolean; onPress: () => void }) {
  const { c } = useTheme();
  /* The preview's width, derived the way every other width in the app is. It was a literal 280, which fits
     * 360/390/411/430 dp with room to spare and clips 12 dp at the 320 dp screen V20 names — the sheet's own
     *  16 dp gutters plus this card's 10 dp padding leave `width - 52`, and nothing here was measuring it.
     *  44 dp is the floor so a preview is never squeezed into a sliver on a very narrow screen. */
  const { width: winW } = useWindowDimensions(), w = Math.max(44, winW - 52);
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: on }}
      accessibilityLabel={`${n}. ${d}`} onPress={onPress}>
      <HandBox seed={id} fill={c.slab} stroke={on ? c.acc : c.slab} sw={on ? 3 : 1.6} style={{ padding: 10, gap: 2 }}>
        <Txt f="bold" s={19} c={c.slabInk}>{n}{on ? '  ✓' : ''}</Txt><Txt f="serif" s={13.5} c={c.slabMut}>{d}</Txt>
        {on || isBarKind(id)
          ? <DayBar kind={id as BarKind} periods={DEMO_PERIODS} now={DEMO_NOW} ink={c.slabInk} bg={c.slab} w={w} h={52} />
          : <View style={{ height: 44, width: w }}>
              <SvgXml xml={previewSvg(id, { p: DEMO_P, w, ink: c.slabInk, slab: c.slab, acc: c.acc, warn: c.warn, total: DEMO_TOTAL, left: DEMO_P * DEMO_TOTAL })} width={w} height={44} />
            </View>}
      </HandBox>
    </Pressable>
  );
}
