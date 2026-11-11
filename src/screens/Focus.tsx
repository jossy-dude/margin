import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StatusBar, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { HandBox, HStrip, Icon, Toggle, Txt, usePressIn } from '../ui/kit';
import { NumberField } from '../ui/fields';
import { PaperBg } from '../ui/PaperBg';
import { Jot } from '../ui/mascot/Jot';
import { subjectTint } from '../ui/collage/tint';
import { useNow, useReduceMotion, useTheme } from '../ui/theme-context';
import { useScreenLive } from '../ui/live';
import { FS } from '../ui/fit';
import { act, getState, toast, useStore } from '../store/store';
import { canBreak, view, MIN_BREAK_AFTER_MS, FLOW_OVER_CAP_MS, type Summary } from '../domain/timer';
import { fmtClock, fmtDur, fmtTime } from '../domain/time';
import { focusSummary, type FocusSummary } from '../domain/analytics';
import { AMBIENT, hexA } from '../tokens/theme';
import { fx } from '../services/fx';

/* ──────────────────────────────────────────────────────────────────────────────────────────────────────
 * Focus, redesigned (v0.5 collage): a timer that gets out of the way.
 *
 * Before a round it is a quiet sheet: what you are studying (a subject, chosen first), how long, and what you
 * have studied this week. During a round it is just the time, very large, and the controls under your thumb.
 * Leave it alone for a few seconds and it dims like a phone's resting screen: near-black, only the numbers,
 * drifting a little so nothing burns in. A touch wakes it.
 *
 * The engine is unchanged (domain/timer.ts: presets, flow overrun, breaks after five minutes, rounds), and so
 * are keep-awake and the session row written on finish (`act.timerFinish`). Every session is filed under the
 * subject it was started for, which is what the study log below and Stats count.
 * ────────────────────────────────────────────────────────────────────────────────────────────────────── */

const PRESETS = [25, 45, 50, 90], AWAKE_MS = 9000;

export function FocusScreen() {
  /* Whether this page is the one on screen comes from the navigator's context, never a store-route
     subscription (every page stays mounted; watching `s.route` would re-render all of them on every tap). */
  const focused = useScreenLive();
  const { c, tints } = useTheme(), ins = useSafeAreaInsets(), { width: W } = useWindowDimensions(), reduce = useReduceMotion();
  const t = useStore((s) => s.timer), fev = useStore((s) => s.fev), soundOn = useStore((s) => s.settings.soundOn), tickOn = useStore((s) => s.settings.tickOn);
  const courses = useStore((s) => s.courses), tasks = useStore((s) => s.tasks), sessions = useStore((s) => s.focus), brkMin = useStore((s) => s.settings.breakMin), brkN = useStore((s) => s.settings.breaksPerRound);
  const now = useNow(focused ? 1000 : 30_000), v = view(t, now), g = v.state;
  const course = courses.find((x) => x.id === t.courseId), task = tasks.find((x) => x.id === t.taskId);
  const live = t.phase !== 'set';
  const [saved, setSaved] = useState<null | { s: Summary; sum: FocusSummary }>(null), minute = Math.floor(now / 60_000);
  const lastSec = useRef(0), stamp = useSharedValue(0);

  useEffect(() => { act.timerPump(now); }, [now]);
  /* Keep the screen on while a round runs (unchanged). */
  useEffect(() => {
    if (!focused) return;
    if (t.running) void activateKeepAwakeAsync('focus').catch(() => undefined);
    else void Promise.resolve(deactivateKeepAwake('focus')).catch(() => undefined);
    return () => { void Promise.resolve(deactivateKeepAwake('focus')).catch(() => undefined); };
  }, [t.running, focused]);
  useEffect(() => { const h = BackHandler.addEventListener('hardwareBackPress', () => { if (focused && !getState().sheet) { act.go('Today'); return true; } return false; }); return () => h.remove(); }, [focused]);
  /* The old clock's tick, only while a focus round counts down and only if wanted. */
  const frozen = t.running && t.phase === 'focus' && v.leftMs === 0 && v.overMs >= FLOW_OVER_CAP_MS;
  useEffect(() => {
    if (!focused || !t.running || t.phase !== 'focus' || !tickOn || frozen) return;
    const sec = Math.floor(now / 1000); if (sec !== lastSec.current) { lastSec.current = sec; fx.tick(sec % 2 === 0); }
  }, [now, t.running, t.phase, tickOn, focused, frozen]);
  /* Timer events: the round-done stamp is inked; what a screen reader hears is derived from the event. */
  const said = fev && now - fev.at < 6000 ? (fev.k === 'roundDone' ? `Round ${t.rounds} done` : fev.k === 'warn10' ? '10 seconds left' : fev.k === 'breakDone' ? 'Break over' : '') : '';
  useEffect(() => {
    if (!fev || Date.now() - fev.at > 1500) return;
    if (fev.k === 'roundDone') {
      stamp.set(0); stamp.set(reduce ? withSequence(withTiming(1, { duration: 1 }), withTiming(1, { duration: 1600 }), withTiming(0, { duration: 200 })) : withSequence(withTiming(1, { duration: 420, easing: Easing.bezier(0.2, 1.5, 0.3, 1) }), withTiming(1, { duration: 1500 }), withTiming(0, { duration: 380 })));
    }
  }, [fev, reduce, stamp]);

  /* ── the resting screen ──
     While a round or a break is running, nine seconds without a touch dims the page to the ambient face. */
  const [awake, setAwake] = useState(true), sleepT = useRef<ReturnType<typeof setTimeout> | null>(null), dim = useSharedValue(0);
  const canRest = live && (t.running || t.phase === 'break') && focused && !saved;
  /* A touch (or starting) wakes the page and re-arms the dim; the timer is armed again whenever resting
     becomes possible (a round starts, a break ends) without anyone touching anything. */
  const wake = useCallback(() => {
    if (sleepT.current) clearTimeout(sleepT.current);
    setAwake(true);
    if (canRest) sleepT.current = setTimeout(() => setAwake(false), AWAKE_MS);
  }, [canRest]);
  useEffect(() => {
    if (!canRest) return;
    const id = setTimeout(() => setAwake(false), AWAKE_MS);
    sleepT.current = id;
    return () => clearTimeout(id);
  }, [canRest]);
  const ambient = canRest && !awake;
  useEffect(() => { dim.set(reduce ? (ambient ? 1 : 0) : withTiming(ambient ? 1 : 0, { duration: ambient ? 1400 : 260, easing: Easing.inOut(Easing.quad) })); }, [ambient, reduce, dim]);
  /* Where the resting numbers sit: a few dp somewhere else every minute, so nothing stays lit on one spot. */
  const drift = useMemo(() => ({ x: ((minute * 37) % 41) - 20, y: ((minute * 53) % 61) - 30 }), [minute]);
  const onTouch = (_e: GestureResponderEvent) => { if (!awake) fx.select(); wake(); };

  /* ── what the big number says ── */
  const big = t.phase === 'set' ? fmtClock(t.planMin * 60) : t.phase === 'break' ? fmtClock(v.breakLeftMs / 1000) : v.roundDone && v.overMs > 0 ? `+${fmtClock(v.overMs / 1000)}` : fmtClock(v.leftMs / 1000);
  const over = t.phase === 'focus' && v.roundDone && v.overMs > 0;
  const status = t.phase === 'break' ? `Break · back at ${fmtTime(now + v.breakLeftMs)}`
    : frozen ? `Flow capped at ${Math.round(FLOW_OVER_CAP_MS / 60_000)} min — end when you are ready`
    : over ? 'Flow — the round is done, you kept going'
    : v.roundDone && !t.running ? `Round ${t.rounds} done`
    : t.running ? `Until ${fmtTime(now + v.leftMs)} · ${t.flow ? 'flow on' : 'stops at zero'}`
    : live ? 'Paused' : '';
  const breakGate = canBreak(g) ? '' : g.phase === 'break' ? 'Already on a break.' : g.phase !== 'focus' ? 'Start a round first.' : !g.running ? 'Resume the round to take a break.' : g.breaksUsed >= g.breaksAllowed ? 'No breaks left this round.' : `Breaks open after ${Math.round(MIN_BREAK_AFTER_MS / 60_000)} min of focus.`;
  const left = Math.max(0, t.breaksAllowed - g.breaksUsed);

  const start = () => { const n = act.timerToggle(); if (n.running) fx.start(); else fx.clack(); wake(); };
  const end = () => {
    const s = act.timerFinish(true, true); fx.clack();
    if (s) setSaved({ s, sum: focusSummary([...getState().focus], getState().courses, Date.now()) });
  };
  const summary = useMemo(() => focusSummary(sessions, courses, minute * 60_000), [sessions, courses, minute]);

  const stampS = useAnimatedStyle(() => ({ opacity: stamp.get(), transform: [{ rotate: '-8deg' }, { scale: interpolate(stamp.get(), [0, 1], [1.5, 1]) }] }));
  const dimS = useAnimatedStyle(() => ({ opacity: dim.get() * 0.97 }));
  const restS = useAnimatedStyle(() => ({ opacity: dim.get() }));
  const awakeS = useAnimatedStyle(() => ({ opacity: 1 - dim.get() * 0.9 }));

  return (
    <View style={{ flex: 1, backgroundColor: c.paper }} onTouchStart={onTouch}>
      <PaperBg />
      {ambient && <StatusBar hidden animated />}
      <Animated.View style={[{ flex: 1 }, awakeS]}>
        {/* ── header ── */}
        <View style={{ paddingTop: ins.top + 6, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }}>
          <RoundBtn icon="back" label="Back to Today" onPress={() => act.go('Today')} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Txt f="type" s={12} c="mut" maxFontSizeMultiplier={FS} style={{ letterSpacing: 2.4 }} accessibilityLiveRegion="polite">
              {t.phase === 'set' ? 'FOCUS' : t.phase === 'break' ? 'BREAK' : `ROUND ${Math.max(1, t.rounds + (v.roundDone ? 0 : 1))}`}
            </Txt>
          </View>
          <RoundBtn icon="sound" label="App sounds" on={soundOn} onPress={() => { act.setSettings({ soundOn: !soundOn }); }} />
        </View>

        {t.phase === 'set' ? (
          <SetUp W={W} courses={courses} cid={t.courseId} taskTitle={task?.title ?? null} planMin={t.planMin} flow={t.flow} brk={{ min: brkMin, n: brkN }} summary={summary} tints={tints} />
        ) : (
          <View style={{ flex: 1, paddingHorizontal: 24 }}>
            <View style={{ alignItems: 'center', marginTop: 18 }}>
              <SubjectTag name={course?.name ?? 'Something else'} tint={course ? subjectTint(course.id, tints) : c.card} />
              {task ? <Txt f="serif" s={16} c="mut" numberOfLines={1} style={{ marginTop: 6 }}>{task.title}</Txt> : null}
            </View>
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Txt f="type" s={big.length > 5 ? 84 : 104} c={over ? 'acc' : t.phase === 'break' ? 'ok' : 'ink'} maxFontSizeMultiplier={1.15} adjustsFontSizeToFit numberOfLines={1}
                style={{ lineHeight: big.length > 5 ? 96 : 118, letterSpacing: -2 }} accessibilityRole="timer" accessibilityLabel={`${t.phase === 'break' ? 'Break' : over ? 'Over by' : 'Remaining'} ${big}`}>{big}</Txt>
              <Ticks total={t.phase === 'break' ? Math.round(t.breakTotalMs / 60_000) : t.planMin} p={t.phase === 'break' ? v.breakProgress : v.progress} tone={t.phase === 'break' ? c.ok : c.ink} width={Math.min(W - 48, 380)} />
              <Txt f="serif" s={17} c="mut" style={{ marginTop: 16, textAlign: 'center' }} accessibilityLiveRegion="polite">{status}</Txt>
            </View>
            {/* ── the thumb row ── */}
            <View style={{ paddingBottom: ins.bottom + 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly' }}>
              {t.phase === 'break'
                ? <SideBtn icon="x" label="End" sub="save" onPress={end} />
                : <SideBtn icon="coffee" label="Break" sub={canBreak(g) ? `${left} left` : left ? 'not yet' : 'none left'} dim={!canBreak(g)} onPress={() => { if (canBreak(g)) { act.timerBreak(); wake(); } else { fx.denied(); toast(breakGate); } }} />}
              {t.phase === 'break'
                ? <MainBtn icon="play" label="Back to it" onPress={() => { act.timerBackNow(); wake(); }} />
                : <MainBtn icon={t.running && !v.roundDone ? 'pause' : 'play'} label={t.running && !v.roundDone ? 'Pause' : v.roundDone ? 'Next round' : 'Resume'} onPress={start} />}
              {t.phase === 'break' ? <View style={{ width: 64 }} /> : <SideBtn icon="check" label="End" sub="save" onPress={end} />}
            </View>
          </View>
        )}
        {t.phase === 'set' && (
          <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: ins.bottom + 18 }}>
            <StartBtn label={course ? `Start · ${course.name}` : 'Start'} onPress={start} />
          </View>
        )}
      </Animated.View>

      {/* the round-done stamp, inked onto the page and lifted off again */}
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: W / 2 - 120, top: '30%', width: 240, paddingVertical: 14, alignItems: 'center', borderWidth: 3, borderColor: c.bad, borderRadius: 12 }, stampS]}>
        <Txt f="marker" s={30} c="bad" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>Round done</Txt>
        <Txt f="type" s={16} c="bad">{`No. ${t.rounds}`}</Txt>
      </Animated.View>

      {/* ── the resting face ── */}
      <Animated.View pointerEvents={ambient ? 'auto' : 'none'} style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: AMBIENT.ground }, dimS]} accessibilityElementsHidden={!ambient} importantForAccessibility={ambient ? 'yes' : 'no-hide-descendants'}>
        <Animated.View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', transform: [{ translateX: drift.x }, { translateY: drift.y }] }, restS]}>
          <Txt f="type" s={big.length > 5 ? 72 : 88} c={AMBIENT.ink} maxFontSizeMultiplier={1.1} style={{ opacity: 0.62, letterSpacing: -2 }} accessibilityLabel={`${big} remaining. Touch to wake.`}>{big}</Txt>
          <Txt f="hand" s={15} c={AMBIENT.ink} style={{ opacity: 0.34, marginTop: 6 }}>{t.phase === 'break' ? 'break' : course?.name ?? 'focus'}</Txt>
        </Animated.View>
      </Animated.View>

      {saved && <Saved s={saved.s} sum={saved.sum} courseName={courses.find((x) => x.id === saved.s.courseId)?.name ?? 'Something else'} onDone={() => setSaved(null)} />}
      <Txt f="bold" s={13} accessibilityLiveRegion="polite" style={{ position: 'absolute', left: 6, bottom: 6, opacity: 0 }}>{said}</Txt>
    </View>
  );
}

/* ── before a round ──────────────────────────────────────────────────────────────────────────────────── */

function SetUp({ W, courses, cid, taskTitle, planMin, flow, brk, summary, tints }: {
  W: number; courses: { id: string; name: string }[]; cid: string | null; taskTitle: string | null; planMin: number; flow: boolean; brk: { min: number; n: number }; summary: FocusSummary; tints: ReturnType<typeof useTheme>['tints'];
}) {
  const { c } = useTheme(), [custom, setCustom] = useState(!PRESETS.includes(planMin));
  /* The subject chosen when the page opened leads the strip, so it is never scrolled out of sight; the order
     is fixed then, so tapping another tab never shuffles the row under the finger. */
  const [lead] = useState(cid), order = useMemo(() => { const f = courses.find((x) => x.id === lead); return f ? [f, ...courses.filter((x) => x !== f)] : courses; }, [courses, lead]);
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18, gap: 18 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={{ gap: 10 }}>
        <Txt f="marker" s={32} accessibilityRole="header">What are you studying?</Txt>
        <HStrip gap={7}>
          {order[0] && order[0].id === lead ? <Tab label={order[0].name} on={cid === order[0].id} tint={subjectTint(order[0].id, tints)} onPress={() => act.timerSetSubject(order[0]!.id)} /> : null}
          <Tab label="Something else" on={cid === null} tint={c.card} onPress={() => act.timerSetSubject(null)} />
          {order.filter((x) => x.id !== lead).map((x) => <Tab key={x.id} label={x.name} on={cid === x.id} tint={subjectTint(x.id, tints)} onPress={() => act.timerSetSubject(x.id)} />)}
        </HStrip>
        {taskTitle ? <Txt f="serif" s={15} c="mut">Working on <Txt f="serif" s={15}>{taskTitle}</Txt></Txt> : null}
      </View>

      <View style={{ alignItems: 'center', gap: 12 }}>
        <Txt f="type" s={86} maxFontSizeMultiplier={1.15} style={{ lineHeight: 100, letterSpacing: -2 }} accessibilityLabel={`${planMin} minutes`}>{fmtClock(planMin * 60)}</Txt>
        <View style={{ flexDirection: 'row', gap: 7, flexWrap: 'wrap', justifyContent: 'center' }}>
          {PRESETS.map((m) => <Tab key={m} label={`${m}`} on={!custom && planMin === m} tint={c.card} onPress={() => { setCustom(false); act.timerSetMin(m); act.setSettings({ focusPresetMin: m }); fx.detent(500); }} />)}
          <Tab label="Other" on={custom} tint={c.card} onPress={() => setCustom(true)} />
        </View>
        {custom ? <NumberField label="Minutes" value={planMin} min={5} max={240} unit="min" width={Math.min(W - 40, 220)} onChange={(m) => { if (m) { act.timerSetMin(m); act.setSettings({ focusPresetMin: m }); } }} /> : null}
      </View>

      <HandBox seed="focus-opts" fill={c.card} style={{ paddingHorizontal: 14, paddingVertical: 6 }}>
        <Toggle value={flow} label="Keep going after the round" hint="Flow: the time counts on past zero, up to 15 minutes" onChange={(f) => { act.timerSetFlow(f); act.setSettings({ focusFlow: f }); fx.toggle(f); }} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Breaks: ${brk.n} per round, ${brk.min} minutes each. Change`} onPress={() => act.openSettingsPath(['focus'])} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="coffee" size={20} color={c.mut} />
          <Txt f="hand" s={18} style={{ flex: 1 }}>{`${brk.n} ${brk.n === 1 ? 'break' : 'breaks'} a round, ${fmtDur(brk.min)} each`}</Txt>
          <Txt f="bold" s={16} c="acc">Change</Txt>
        </Pressable>
      </HandBox>

      <StudyLog summary={summary} tints={tints} />
    </ScrollView>
  );
}

/** This week, by subject: the "what am I actually studying" the timer exists to answer. */
function StudyLog({ summary: s, tints }: { summary: FocusSummary; tints: ReturnType<typeof useTheme>['tints'] }) {
  const { c } = useTheme(), max = Math.max(1, ...s.week.map((w) => w.min));
  return (
    <HandBox seed="focus-log" fill={c.card} style={{ padding: 16, gap: 12 }}>
      <Txt f="bold" s={21} accessibilityRole="header">Your study log</Txt>
      <View style={{ flexDirection: 'row' }}>
        <Stat k="Today" v={fmtDur(s.todayMin)} />
        <Stat k="This week" v={fmtDur(s.weekMin)} />
        <Stat k="Streak" v={`${s.streak} ${s.streak === 1 ? 'day' : 'days'}`} />
      </View>
      {s.week.length === 0 ? (
        <Txt f="serif" s={15.5} c="mut">Nothing logged this week yet. Pick a subject and start — every session lands here, filed under it.</Txt>
      ) : (
        <View style={{ gap: 9 }}>
          {s.top ? <Txt f="serif" s={15.5} c="mut">Most studied this week: <Txt f="serif" s={15.5}>{s.top.name}</Txt></Txt> : null}
          {s.week.slice(0, 6).map((w, i) => (
            <View key={w.id} style={{ gap: 3 }} accessible accessibilityLabel={`${w.name}: ${fmtDur(w.min)} in ${w.sessions} ${w.sessions === 1 ? 'session' : 'sessions'}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: w.id === '_' ? c.card : subjectTint(w.id, tints), borderWidth: 1, borderColor: hexA(c.ink, 0.3) }} />
                <Txt f="hand" s={17} numberOfLines={1} style={{ flex: 1 }}>{w.name}</Txt>
                <Txt f="type" s={15} c="mut">{fmtDur(w.min)}</Txt>
              </View>
              <View style={{ height: 10, borderRadius: 2, backgroundColor: hexA(c.ink, 0.07), overflow: 'hidden' }}>
                {/* Accent ink so a bar reads on card at 3:1 whatever the subject's paper; the leader is full strength. */}
                <View style={{ width: `${Math.max(4, (w.min / max) * 100)}%`, height: 10, borderRadius: 2, backgroundColor: w.id === '_' ? hexA(c.ink, 0.4) : i === 0 ? c.acc : hexA(c.acc, 0.6) }} />
              </View>
            </View>
          ))}
          {s.lastWeekMin > 0 ? <Txt f="serif" s={14} c="mut">{s.weekMin >= s.lastWeekMin ? `Up on last week (${fmtDur(s.lastWeekMin)}).` : `Last week: ${fmtDur(s.lastWeekMin)}.`}</Txt> : null}
        </View>
      )}
    </HandBox>
  );
}
const Stat = ({ k, v }: { k: string; v: string }) => (
  <View style={{ flex: 1, gap: 1 }}><Txt f="type" s={20}>{v}</Txt><Txt f="serif" s={13.5} c="mut">{k}</Txt></View>
);

/* ── after a round: the receipt ─────────────────────────────────────────────────────────────────────── */

function Saved({ s, sum, courseName, onDone }: { s: Summary; sum: FocusSummary; courseName: string; onDone: () => void }) {
  const { c } = useTheme(), ins = useSafeAreaInsets(), reduce = useReduceMotion(), y = useSharedValue(reduce ? 0 : 1);
  useEffect(() => { if (!reduce) y.set(withSpring(0, { duration: 520, dampingRatio: 0.78 })); }, [reduce, y]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() * 420 }, { rotate: `${y.get() * 6 - 1}deg` }] }));
  const row = sum.week.find((w) => w.id === (s.courseId ?? '_')), isTop = !!sum.top && sum.top.id === s.courseId;
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: hexA(c.shadow, 0.35), justifyContent: 'flex-end', padding: 16, paddingBottom: ins.bottom + 20 }} accessibilityViewIsModal>
      <Animated.View style={st}>
        <HandBox seed="focus-saved" fill={c.card} style={{ padding: 18, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Jot size={78} mood="proud" cue={{ kind: 'hop', n: 1 }} />
            <View style={{ flex: 1 }}>
              <Txt f="type" s={13} c="acc" style={{ letterSpacing: 2 }}>SESSION SAVED</Txt>
              <Txt f="marker" s={30} accessibilityRole="header">{fmtDur(Math.max(1, Math.round(s.focusSec / 60)))} of {courseName}</Txt>
            </View>
          </View>
          <Txt f="serif" s={16} c="mut">
            {row ? `${fmtDur(row.min)} on it this week, across ${row.sessions} ${row.sessions === 1 ? 'session' : 'sessions'}.` : ''}{isTop ? ' Your most studied subject this week.' : ''}{s.breakSec >= 60 ? ` Breaks: ${fmtDur(Math.round(s.breakSec / 60))}.` : ''}
          </Txt>
          <StartBtn label="Done" icon="check" onPress={onDone} />
        </HandBox>
      </Animated.View>
    </View>
  );
}

/* ── small parts ─────────────────────────────────────────────────────────────────────────────────────── */

function Tab({ label, on, tint, onPress }: { label: string; on: boolean; tint: string; onPress: () => void }) {
  const { c } = useTheme(), [aIn, aLift] = usePressIn(() => { fx.select(); onPress(); });
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label} onPressIn={aIn} onPress={aLift} hitSlop={4}>
      <HandBox seed={`ftab-${label}`} fill={on ? c.ink : tint} cut="cut" shadow={on} style={{ minHeight: 40, minWidth: 48, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', maxWidth: 230 }}>
        <Txt f="bold" s={17} c={on ? 'paper' : 'ink'} numberOfLines={1} maxFontSizeMultiplier={FS}>{label}</Txt>
      </HandBox>
    </Pressable>
  );
}
function SubjectTag({ name, tint }: { name: string; tint: string }) {
  return <HandBox seed={`stag-${name}`} fill={tint} cut="cut" style={{ minHeight: 36, paddingHorizontal: 16, justifyContent: 'center', maxWidth: 300 }}><Txt f="bold" s={17} numberOfLines={1}>{name}</Txt></HandBox>;
}
/** Elapsed time dims; it never slides a marker (the bar rule the whole app keeps). One tick a minute up to an
 *  hour, one per five minutes beyond. */
function Ticks({ total, p, tone, width }: { total: number; p: number; tone: string; width: number }) {
  const n = Math.max(1, total <= 60 ? total : Math.ceil(total / 5));
  return (
    <View style={{ width, flexDirection: 'row', gap: n > 40 ? 2 : 3, marginTop: 14 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: n }, (_, i) => <View key={i} style={{ flex: 1, height: 16, borderRadius: 2, backgroundColor: tone, opacity: (i + 1) / n <= p + 1e-6 ? 0.16 : 0.85 }} />)}
    </View>
  );
}
function RoundBtn({ icon, label, onPress, on = true }: { icon: string; label: string; onPress: () => void; on?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable accessibilityRole={label === 'App sounds' ? 'switch' : 'button'} accessibilityState={label === 'App sounds' ? { checked: on } : undefined} accessibilityLabel={label} onPress={onPress} hitSlop={6} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={24} color={on ? c.ink : c.mut} />
      {!on ? <View style={{ position: 'absolute', width: 26, height: 2, backgroundColor: c.mut, transform: [{ rotate: '-40deg' }] }} /> : null}
    </Pressable>
  );
}
function MainBtn({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const { c } = useTheme(), reduce = useReduceMotion(), s = useSharedValue(1), [aIn, aLift] = usePressIn(onPress);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  return (
    <Pressable testID="focus-main" accessibilityRole="button" accessibilityLabel={label} onPressIn={() => { aIn(); s.set(reduce ? 1 : withTiming(0.93, { duration: 90 })); }} onPressOut={() => s.set(reduce ? 1 : withSpring(1, { duration: 260, dampingRatio: 0.55 }))} onPress={aLift} style={{ alignItems: 'center', gap: 6 }}>
      <Animated.View style={st}><HandBox seed={`main-${icon}`} fill={c.ink} cut="cut" style={{ width: 84, height: 84, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={32} color={c.paper} sw={2.4} /></HandBox></Animated.View>
      <Txt f="bold" s={16} maxFontSizeMultiplier={FS}>{label}</Txt>
    </Pressable>
  );
}
function SideBtn({ icon, label, sub, onPress, dim }: { icon: string; label: string; sub: string; onPress: () => void; dim?: boolean }) {
  const { c } = useTheme(), [aIn, aLift] = usePressIn(onPress);
  return (
    <Pressable testID={`focus-${label.toLowerCase()}`} accessibilityRole="button" accessibilityLabel={`${label}, ${sub}`} accessibilityState={{ disabled: !!dim }} onPressIn={aIn} onPress={aLift} style={{ alignItems: 'center', gap: 4, width: 76, opacity: dim ? 0.5 : 1 }}>
      <HandBox seed={`side-${icon}`} fill={c.card} cut="cut" style={{ width: 58, height: 58, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={24} color={c.ink} /></HandBox>
      <Txt f="bold" s={15} maxFontSizeMultiplier={FS}>{label}</Txt>
      <Txt f="serif" s={12.5} c="mut" maxFontSizeMultiplier={FS}>{sub}</Txt>
    </Pressable>
  );
}
function StartBtn({ label, onPress, icon = 'play' }: { label: string; onPress: () => void; icon?: string }) {
  const { c } = useTheme(), reduce = useReduceMotion(), s = useSharedValue(1), [aIn, aLift] = usePressIn(onPress);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  return (
    <Pressable testID={label === 'Done' ? 'focus-done' : 'focus-start'} accessibilityRole="button" accessibilityLabel={label} onPressIn={() => { aIn(); s.set(reduce ? 1 : withTiming(0.97, { duration: 90 })); }} onPressOut={() => s.set(reduce ? 1 : withSpring(1, { duration: 240, dampingRatio: 0.6 }))} onPress={aLift}>
      <Animated.View style={st}><HandBox seed="focus-start" fill={c.ink} cut="cut" style={{ minHeight: 60, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}><Icon name={icon} size={22} color={c.paper} sw={2.2} /><Txt f="bold" s={22} c="paper" numberOfLines={1} maxFontSizeMultiplier={FS}>{label}</Txt></HandBox></Animated.View>
    </Pressable>
  );
}
