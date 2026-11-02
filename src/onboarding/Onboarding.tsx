import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, interpolate, runOnJS, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Btn, HandBox, Icon, Txt, faceOf } from '../ui/kit';
import { PaperBg } from '../ui/PaperBg';
import { SemesterRange } from '../ui/SemesterRange';
import { Art } from '../ui/collage/Art';
import { TornSheet } from '../ui/collage/Torn';
import { Scrap, SCRAP_H, SCRAP_W } from '../ui/mascot/Scrap';
import { gazeAlong, gazeAt, type ScrapCue, type ScrapCueKind, type ScrapMood } from '../ui/mascot/scrap-rig';
import { useReduceMotion, useTheme } from '../ui/theme-context';
import { FS } from '../ui/fit';
import { act, refreshNotifStatus, useStore } from '../store/store';
import type { OnboardDoor } from '../store/session';
import * as notifs from '../services/notifications';
import { fx } from '../services/fx';
import { Legend } from './Legend';
import { PAPER } from '../tokens/theme';

/* ──────────────────────────────────────────────────────────────────────────────────────────────────────
 * The onboarding: five pages of paper, swiped like a stack of index cards.
 *
 *   1 Hello · 2 How it is laid out · 3 Your name · 4 Your term and where the data comes from · 5 Reminders
 *
 * One Scrap walks the whole way: he is not on any page but above all of them, and as the pages slide he
 * hops from his spot on one to his spot on the next (his anchors are interpolated on the UI thread from the
 * pager's own offset, so he is exactly as far along as the swipe is). The collage on each page sits behind
 * the words and drifts at its own depth while the page moves.
 *
 * Nothing is written until the last step (`act.finishOnboarding`): the name, the term and the data door are
 * held here, so leaving half-way leaves nothing half-done.
 * ────────────────────────────────────────────────────────────────────────────────────────────────────── */

const N = 5, SZ = 220, SZH = (SZ * SCRAP_H) / SCRAP_W, FOOT = 108;
type Perm = 'unknown' | 'granted' | 'denied' | 'undetermined' | 'unavailable';

export function Onboarding({ firstRun }: { firstRun: boolean }) {
  const { c } = useTheme(), ins = useSafeAreaInsets(), { width: W, height: H } = useWindowDimensions(), reduce = useReduceMotion();
  const settings = useStore((s) => s.settings);
  const [page, setPage] = useState(0), [name, setName] = useState(settings.name ?? ''), [typing, setTyping] = useState(false);
  const [range, setRange] = useState({ semesterStart: settings.semesterStart, semesterEnd: settings.semesterEnd });
  const [door, setDoor] = useState<OnboardDoor>(firstRun ? 'hand' : 'keep'), [perm, setPerm] = useState<Perm>(() => (Platform.OS === 'web' ? 'unavailable' : 'unknown'));
  const [mood, setMood] = useState<ScrapMood>('idle'), [cue, setCue] = useState<ScrapCue | null>(null), [steer, setSteer] = useState(false);
  const x = useSharedValue(0), gx = useSharedValue(0), gy = useSharedValue(0.2), leave = useSharedValue(0);
  const pager = useRef<Animated.ScrollView>(null), gone = useRef(false), touch = useRef({ x: 0, y: 0, t: 0 }), steerT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const play = useCallback((kind: ScrapCueKind) => setCue((q) => ({ kind, n: (q?.n ?? 0) + 1 })), []);

  /* Where Scrap stands on each page: centre x, centre y, scale. */
  const heroBottom = ins.top + 56 + Math.min(H * 0.42, 380), hero5 = ins.top + 56 + Math.min(H * 0.27, 230);
  const anchors = [
    { cx: W / 2, cy: heroBottom - 40 - SZH / 2, s: 1 },
    { cx: W - 58, cy: ins.top + 96, s: 0.36 },
    { cx: W - 70, cy: ins.top + 150, s: 0.5 },
    { cx: W - 58, cy: ins.top + 96, s: 0.36 },
    { cx: W / 2, cy: hero5 - 30 - (SZH * 0.62) / 2, s: 0.62 },
  ];
  const at = anchors[page]!;

  const onScroll = useAnimatedScrollHandler({ onScroll: (e) => { x.set(e.contentOffset.x); } });
  /* Arriving on a page: what Scrap feels there. Called from the two things that change the page (a tap
     on onward or a number, and a swipe settling), so the mood is set with the page, not after it. */
  const arrive = useCallback((j: number) => {
    setPage(j); fx.page();
    setMood(j === 1 ? 'curious' : j === 2 ? (name.trim() ? 'happy' : 'idle') : j === 4 ? (perm === 'granted' ? 'happy' : perm === 'denied' ? 'worried' : 'curious') : 'idle');
  }, [name, perm]);
  const goTo = useCallback((i: number) => {
    const j = Math.max(0, Math.min(N - 1, i));
    Keyboard.dismiss();
    pager.current?.scrollTo?.({ x: j * W, animated: !reduce });
    if (reduce) x.set(j * W);
    arrive(j);
  }, [W, reduce, x, arrive]);
  useEffect(() => { const h = BackHandler.addEventListener('hardwareBackPress', () => { if (page > 0) { goTo(page - 1); return true; } return true; }); return () => h.remove(); }, [page, goTo]);

  /* A finger anywhere on the page: Scrap watches it. A tap on Scrap himself makes him hop. */
  const steerAt = (e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent, g = gazeAt(pageX - at.cx, pageY - at.cy, 200);
    gx.set(withTiming(g.x, { duration: 90 })); gy.set(withTiming(g.y, { duration: 90 }));
  };
  const onTouchStart = (e: GestureResponderEvent) => {
    touch.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, t: Date.now() };
    if (steerT.current) clearTimeout(steerT.current);
    setSteer(true); steerAt(e);
  };
  const onTouchEnd = (e: GestureResponderEvent) => {
    const t = touch.current, dx = e.nativeEvent.pageX - t.x, dy = e.nativeEvent.pageY - t.y;
    const onHim = Math.abs(t.x - at.cx) < (SZ * at.s) / 2 && Math.abs(t.y - at.cy) < (SZH * at.s) / 2;
    if (onHim && Math.hypot(dx, dy) < 10 && Date.now() - t.t < 400) { const k = Math.random() < 0.5 ? 'hop' : 'celebrate'; play(k); fx.tap(); setMood('happy'); setTimeout(() => setMood(page === 1 ? 'curious' : 'idle'), 1600); }
    steerT.current = setTimeout(() => setSteer(false), 1100);
  };
  useEffect(() => () => { if (steerT.current) clearTimeout(steerT.current); }, []);

  /* Typing the name: he reads along it, left to right. */
  const onName = (v: string) => {
    setName(v); setMood('curious');
    const g = gazeAlong(v.length); gx.set(withSpring(g.x, { duration: 220, dampingRatio: 0.8 })); gy.set(withSpring(g.y, { duration: 220, dampingRatio: 0.8 }));
  };

  const ask = async () => {
    fx.tap();
    const got = (await notifs.ensurePermission(true)) as Perm;
    setPerm(got); void refreshNotifStatus();
    if (got === 'granted') { setMood('happy'); play('celebrate'); fx.done(); }
    else if (got === 'denied') { setMood('worried'); play('shake'); fx.denied(); }
    else setMood('idle');
  };
  /* Read, never ask, on arrival. The web build has no notification service at all: say so plainly. */
  useEffect(() => { if (Platform.OS !== 'web') void notifs.ensurePermission(false).then((p) => setPerm(p as Perm)).catch(() => setPerm('unavailable')); }, []);

  const finish = useCallback((d: OnboardDoor) => {
    if (gone.current) return;
    gone.current = true;
    Keyboard.dismiss();
    const choice = { door: d, name, semesterStart: range.semesterStart, semesterEnd: range.semesterEnd };
    const done = () => { void act.finishOnboarding(choice); };
    if (reduce) { done(); return; }
    setMood('happy'); play('celebrate'); fx.done();
    /* The whole stack is lifted off the desk: up and away, the way a sheet is taken off a pad. */
    leave.set(withSequence(withTiming(0, { duration: 650 }), withTiming(1, { duration: 420, easing: Easing.in(Easing.cubic) }, (f) => { if (f) runOnJS(done)(); })));
  }, [name, range, reduce, leave, play]);

  const lifted = useAnimatedStyle(() => ({ transform: [{ translateY: -leave.get() * H * 1.05 }, { rotate: `${leave.get() * -4}deg` }] }));
  const skipDoor: OnboardDoor = firstRun ? 'sample' : 'keep';

  /* Each page clips its own collage: a piece drifting with the swipe never wanders onto the next page. */
  const pageShell = (i: number, art: React.ReactNode, body: React.ReactNode) => (
    <View key={i} style={{ width: W, height: H, overflow: 'hidden' }}>
      <Drift x={x} i={i} W={W}>{art}</Drift>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: ins.top + 62, paddingHorizontal: 24, paddingBottom: FOOT + ins.bottom + 12, minHeight: H }}>
        <Words x={x} i={i} W={W}>{body}</Words>
      </ScrollView>
    </View>
  );
  /* The two bookends: art and Scrap above, and the words on a sheet of paper torn across and laid over
     the art — the reference's hero, cut the same way. */
  const heroShell = (i: number, top: number, art: React.ReactNode, body: React.ReactNode) => (
    <View key={i} style={{ width: W, height: H, overflow: 'hidden' }}>
      <Drift x={x} i={i} W={W}>{art}</Drift>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ minHeight: H }}>
        <View style={{ height: top }} />
        <TornSheet seed={`ob-sheet-${i}`} style={{ flexGrow: 1 }}>
          <View style={{ paddingHorizontal: 24, paddingTop: 10, paddingBottom: FOOT + ins.bottom + 12 }}><Words x={x} i={i} W={W}>{body}</Words></View>
        </TornSheet>
      </ScrollView>
    </View>
  );

  return (
    <Animated.View testID="onboarding" style={[{ position: 'absolute', left: 0, top: 0, width: W, height: H, zIndex: 5000, backgroundColor: c.paper }, lifted]}
      onTouchStart={onTouchStart} onTouchMove={steerAt} onTouchEnd={onTouchEnd}>
      <PaperBg />
      <Animated.ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16} keyboardShouldPersistTaps="handled"
        onMomentumScrollEnd={(e) => { const j = Math.round(e.nativeEvent.contentOffset.x / W); if (j !== page) arrive(j); }}>
        {heroShell(0, heroBottom - 6, <>
          <Art name="sun" w={190} style={{ position: 'absolute', right: -46, top: ins.top + 46 }} />
          <Art name="hill-sage" w={W * 1.25} style={{ position: 'absolute', left: -W * 0.18, top: heroBottom - 84 }} />
          <Art name="hill-moss" w={W * 1.1} style={{ position: 'absolute', left: -W * 0.02, top: heroBottom - 46 }} />
          <Art name="leaf" w={44} rot={-24} style={{ position: 'absolute', left: 18, top: heroBottom - 150 }} />
          <Art name="leaf-sage" w={38} rot={14} style={{ position: 'absolute', left: 52, top: heroBottom - 134 }} />
        </>, <>
          <Kicker>A school planner, on paper</Kicker>
          <Title>Hi, I&apos;m Scrap.</Title>
          <Body>I keep your classes, homework, marks and study time on one desk — and all of it stays on this phone. No account, nothing sent anywhere.</Body>
        </>)}
        {pageShell(1, <>
          <Art name="dot" w={74} style={{ position: 'absolute', right: 20, top: ins.top + 56 }} />
          <Art name="leaf-sage" w={46} rot={-38} style={{ position: 'absolute', right: -6, bottom: FOOT + ins.bottom + 40 }} />
        </>, <>
          <Kicker>How it is laid out</Kicker>
          <Title style={{ marginRight: 88 }}>Everything has its place.</Title>
          <View style={{ height: 14 }} />
          <Legend active={page === 1} onLook={(r, of) => { setSteer(true); gx.set(withSpring(-0.85, { duration: 260 })); gy.set(withSpring(-0.2 + (r / of) * 1.4, { duration: 260 })); play('nod'); if (steerT.current) clearTimeout(steerT.current); steerT.current = setTimeout(() => setSteer(false), 1600); }} />
        </>)}
        {pageShell(2, <>
          <Art name="sun" w={110} style={{ position: 'absolute', left: -38, top: ins.top + 150 }} />
          <Art name="leaf" w={40} rot={28} style={{ position: 'absolute', left: 14, bottom: FOOT + ins.bottom + 30 }} />
        </>, <>
          <Kicker>First things first</Kicker>
          <Title style={{ marginRight: 112 }}>What should I call you?</Title>
          <NamePaper name={name} onName={onName} onFocus={() => setTyping(true)} onBlur={() => { setTyping(false); if (name.trim()) { setMood('happy'); play('hop'); } }} onDone={() => goTo(3)} />
          <Txt f="serif" s={17} c="mut" style={{ marginTop: 14, minHeight: 24 }}>{name.trim() ? `Nice to meet you, ${name.trim()}.` : 'Your first name is plenty. You can leave it blank.'}</Txt>
        </>)}
        {pageShell(3, <>
          <Art name="scrap-sand" w={150} rot={9} style={{ position: 'absolute', right: -64, top: ins.top + 210 }} />
          <Art name="dot" w={52} style={{ position: 'absolute', left: -16, bottom: FOOT + ins.bottom + 24 }} />
        </>, <>
          <Kicker>Your term</Kicker>
          <Title style={{ marginRight: 88 }}>When does your term run?</Title>
          <HandBox seed="ob-term" fill={c.card} style={{ padding: 14, marginTop: 14 }}>
            <SemesterRange start={range.semesterStart} end={range.semesterEnd} onChange={(p) => setRange(p)} />
          </HandBox>
          <Txt f="bold" s={20} style={{ marginTop: 22, marginBottom: 8 }} accessibilityRole="header">Where does your timetable come from?</Txt>
          <Doors firstRun={firstRun} value={door} onChange={(d) => { setDoor(d); fx.select(); play('nod'); setMood(d === 'sample' ? 'happy' : d === 'import' ? 'curious' : 'idle'); }} />
        </>)}
        {heroShell(4, hero5 - 6, <>
          <Art name="sun" w={120} style={{ position: 'absolute', left: -34, top: ins.top + 44 }} />
          <Art name="strip-denim" w={W * 0.9} rot={-4} style={{ position: 'absolute', right: -W * 0.42, top: hero5 - 64 }} />
          <Art name="strip-kraft" w={W * 0.8} rot={3} style={{ position: 'absolute', left: -W * 0.36, top: hero5 - 52 }} />
        </>, <>
          <Kicker>Reminders</Kicker>
          <Title>A tap on the shoulder before class.</Title>
          <View style={{ gap: 10, marginTop: 12 }}>
            <Why icon="clock" text="A few minutes before each class, with the room." />
            <Why icon="exam" text="When an assignment or exam is coming up." />
            <Why icon="timer" text="When a focus round or a break is over." />
          </View>
          <Txt f="serif" s={15} c="mut" style={{ marginTop: 12 }}>They are scheduled on this phone — nothing comes from a server — and you can tune every kind in Settings → Reminders.</Txt>
          <View style={{ marginTop: 16, gap: 8 }}>
            {perm === 'granted'
              ? <PermNote tone="ok" text="Reminders are on. I will keep it quiet." />
              : perm === 'denied' ? <PermNote tone="warn" text="That is fine. You can turn them on any time in Settings → Reminders." />
              : perm === 'unavailable' ? <PermNote tone="mut" text="This build cannot send reminders (the web preview). On the phone, this asks once." />
              : <Btn kind="primary" icon="bell" label="Allow reminders" onPress={() => { void ask(); }} />}
          </View>
        </>)}
      </Animated.ScrollView>

      {/* Scrap, above every page. */}
      <Walker x={x} W={W} anchors={anchors} reduce={reduce}>
        <Scrap size={SZ} mood={mood} cue={cue} lookX={gx} lookY={gy} attentive={steer || (page === 2 && typing)} />
      </Walker>

      {/* The masthead and the way out. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 24, right: 14, top: ins.top + 14, flexDirection: 'row', alignItems: 'center' }}>
        <Txt f="type" s={13} c="mut" maxFontSizeMultiplier={FS} style={{ letterSpacing: 4, flex: 1 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">MARGIN</Txt>
        {page < N - 1 && <Pressable testID="onboarding-skip" accessibilityRole="button" accessibilityLabel="Skip the introduction" onPress={() => finish(skipDoor)} hitSlop={10} style={{ paddingHorizontal: 10, minHeight: 44, justifyContent: 'center' }}><Txt f="bold" s={16} c="mut" maxFontSizeMultiplier={FS}>Skip</Txt></Pressable>}
      </View>

      {/* Where you are, and onward. */}
      <View pointerEvents="box-none" style={{ position: 'absolute', left: 24, right: 20, bottom: ins.bottom + 22, flexDirection: 'row', alignItems: 'center' }}>
        <Dots x={x} W={W} page={page} onGo={goTo} />
        <View style={{ flex: 1 }} />
        {page < N - 1
          ? <NextSquare onPress={() => goTo(page + 1)} label={['Next: how it is laid out', 'Next: your name', 'Next: your term', 'Next: reminders'][page]!} />
          : <Btn kind="ink" label="Start" icon="check" a11y="Start using Margin" testID="onboarding-start" onPress={() => finish(door)} style={{ minWidth: 150 }} />}
      </View>
    </Animated.View>
  );
}

/* ── pieces ──────────────────────────────────────────────────────────────────────────────────────────── */

const Kicker = ({ children }: { children: string }) => <Txt f="type" s={13} c="acc" maxFontSizeMultiplier={FS} style={{ letterSpacing: 2.4, textTransform: 'uppercase', marginBottom: 8 }}>{children}</Txt>;
const Title = ({ children, style }: { children: React.ReactNode; style?: object }) => <Txt f="marker" s={44} maxFontSizeMultiplier={1.3} accessibilityRole="header" style={[{ lineHeight: 50 }, style]}>{children}</Txt>;
const Body = ({ children }: { children: React.ReactNode }) => <Txt f="serif" s={19} c="mut" style={{ marginTop: 12, lineHeight: 26 }}>{children}</Txt>;

function Why({ icon, text }: { icon: string; text: string }) {
  const { c } = useTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={19} color={c.acc} /></View><Txt f="hand" s={19} style={{ flex: 1 }}>{text}</Txt></View>;
}
function PermNote({ tone, text }: { tone: 'ok' | 'warn' | 'mut'; text: string }) {
  const { c } = useTheme();
  return <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }} accessibilityLiveRegion="polite"><Icon name={tone === 'ok' ? 'check' : 'bell'} size={20} color={c[tone]} /><Txt f="hand" s={18} c={tone === 'mut' ? 'mut' : 'ink'} style={{ flex: 1 }}>{text}</Txt></View>;
}

/** The name is written on a torn piece of ruled paper, in a hand. */
function NamePaper({ name, onName, onFocus, onBlur, onDone }: { name: string; onName: (s: string) => void; onFocus: () => void; onBlur: () => void; onDone: () => void }) {
  /* The scrap is cream in both themes, so its ink is fixed dark, never the theme's. */
  const th = useTheme(), { c } = th, { width } = useWindowDimensions();
  return (
    <View style={{ marginTop: 22, height: 132, transform: [{ rotate: '-1.4deg' }] }}>
      <Art name="ruled-wide" w={Math.min(400, width - 30)} style={{ position: 'absolute', left: -14, top: -12 }} />
      <View style={{ position: 'absolute', left: 36, right: 24, top: 30 }}>
        <TextInput testID="onboarding-name" value={name} onChangeText={onName} onFocus={onFocus} onBlur={onBlur} onSubmitEditing={onDone} placeholder="Your name" placeholderTextColor={PAPER.scrapHint}
          autoCapitalize="words" autoCorrect={false} maxLength={40} returnKeyType="next" accessibilityLabel="Your name" selectionColor={c.acc} maxFontSizeMultiplier={FS}
          style={{ ...faceOf(th, 'script', 38), color: PAPER.scrapInk, paddingVertical: 0, height: 52 }} />
      </View>
    </View>
  );
}

const DOORS: { id: OnboardDoor; icon: string; title: string; line: string; tint: 'sky' | 'sage' | 'sand' | 'cream'; first?: boolean; later?: boolean }[] = [
  { id: 'import', icon: 'import', title: 'Bring a file', line: 'Import a JSON or CSV export, or paste one in.', tint: 'sky' },
  { id: 'hand', icon: 'pencil', title: 'Set it up by hand', line: 'Start empty, then add your subjects with +.', tint: 'sage', first: true },
  { id: 'sample', icon: 'book', title: 'Look around first', line: 'A sample semester, just for this session.', tint: 'sand', first: true },
  { id: 'keep', icon: 'check', title: 'Keep my planner as it is', line: 'Nothing about your data changes.', tint: 'cream', later: true },
];
function Doors({ firstRun, value, onChange }: { firstRun: boolean; value: OnboardDoor; onChange: (d: OnboardDoor) => void }) {
  const { c, tints } = useTheme();
  const list = DOORS.filter((d) => (firstRun ? !d.later : !d.first));
  return (
    <View style={{ gap: 8 }} accessibilityRole="radiogroup">
      {list.map((d, i) => { const on = d.id === value; return (
        <Pressable key={d.id} testID={`door-${d.id}`} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${d.title}. ${d.line}`} onPress={() => onChange(d.id)}>
          <HandBox seed={`door-${d.id}`} fill={tints[d.tint]} stroke={on ? c.acc : undefined} cut="torn" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, transform: [{ rotate: `${(i % 2 ? 0.6 : -0.5)}deg` }, { scale: on ? 1.015 : 1 }] }}>
            <Icon name={d.icon} size={22} color={c.ink} />
            <View style={{ flex: 1, minWidth: 0 }}><Txt f="bold" s={18}>{d.title}</Txt><Txt f="serif" s={14.5} c="mut">{d.line}</Txt></View>
            <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? c.acc : c.mut, alignItems: 'center', justifyContent: 'center' }}>{on && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: c.acc }} />}</View>
          </HandBox>
        </Pressable>); })}
    </View>
  );
}

/** Scrap's travel between page anchors: position and size follow the pager exactly, with a hop in between. */
function Walker({ x, W, anchors, reduce, children }: { x: SharedValue<number>; W: number; anchors: { cx: number; cy: number; s: number }[]; reduce: boolean; children: React.ReactNode }) {
  const xs = anchors.map((_, i) => i * W), cxs = anchors.map((a) => a.cx), cys = anchors.map((a) => a.cy), ss = anchors.map((a) => a.s);
  const st = useAnimatedStyle(() => {
    const v = x.get(), f = v / W - Math.floor(v / W), arc = reduce ? 0 : -Math.sin(f * Math.PI) * 54;
    const cx = interpolate(v, xs, cxs, 'clamp'), cy = interpolate(v, xs, cys, 'clamp'), s = interpolate(v, xs, ss, 'clamp');
    return { transform: [{ translateX: cx - SZ / 2 }, { translateY: cy - SZH / 2 + arc }, { scale: s }, { rotate: `${Math.sin(f * Math.PI) * -8}deg` }] };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: SZ, height: SZH }, st]}>{children}</Animated.View>;
}
/** The page's collage, drifting at its own depth as the page slides. */
function Drift({ x, i, W, children }: { x: SharedValue<number>; i: number; W: number; children: React.ReactNode }) {
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: (x.get() - i * W) * 0.35 }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }, st]}>{children}</Animated.View>;
}
/** The words trail the page a little, so a swipe has depth: paper over paper, not one flat sheet. */
function Words({ x, i, W, children }: { x: SharedValue<number>; i: number; W: number; children: React.ReactNode }) {
  const st = useAnimatedStyle(() => { const d = (x.get() - i * W) / W; return { transform: [{ translateX: d * W * 0.12 }, { rotate: `${d * 2}deg` }] }; });
  return <Animated.View style={st}>{children}</Animated.View>;
}

/** 01 02 03 04 05, the current one in ink with a tomato dot under it that slides with the swipe. */
function Dots({ x, W, page, onGo }: { x: SharedValue<number>; W: number; page: number; onGo: (i: number) => void }) {
  const { tints } = useTheme(), STEP = 34;
  const dot = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(x.get(), [0, (N - 1) * W], [0, (N - 1) * STEP], 'clamp') }] }));
  return (
    <View accessibilityRole="tablist">
      <View style={{ flexDirection: 'row' }}>
        {Array.from({ length: N }, (_, i) => (
          <Pressable key={i} accessibilityRole="tab" accessibilityState={{ selected: i === page }} accessibilityLabel={`Page ${i + 1} of ${N}`} onPress={() => onGo(i)} style={{ width: STEP, alignItems: 'center', paddingVertical: 8 }}>
            <Txt f="type" s={i === page ? 16 : 14} c={i === page ? 'ink' : 'mut'} maxFontSizeMultiplier={FS}>{String(i + 1).padStart(2, '0')}</Txt>
          </Pressable>
        ))}
      </View>
      <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: tints.tomato, marginLeft: STEP / 2 - 3.5, marginTop: -4 }, dot]} />
    </View>
  );
}

/** The onward control from the reference: a dark square, cut from card, inside four drawn corner marks
 *  that pinch in when it is pressed. */
function NextSquare({ onPress, label }: { onPress: () => void; label: string }) {
  const { c } = useTheme(), reduce = useReduceMotion(), p = useSharedValue(0);
  const marks = useAnimatedStyle(() => ({ transform: [{ scale: 1 - p.get() * 0.08 }] }));
  const sq = useAnimatedStyle(() => ({ transform: [{ scale: 1 - p.get() * 0.05 }] }));
  const B = 84;
  return (
    <Pressable testID="onboarding-next" accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      onPressIn={() => p.set(reduce ? 0 : withTiming(1, { duration: 90 }))} onPressOut={() => p.set(reduce ? 0 : withSpring(0, { duration: 260, dampingRatio: 0.55 }))}
      style={{ width: B, height: B, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, marks]} pointerEvents="none">
        <Svg width={B} height={B} viewBox={`0 0 ${B} ${B}`}>
          <Path d={`M2 18 Q2 2 18 2 M${B - 18} 2 Q${B - 2} 2 ${B - 2} 18 M${B - 2} ${B - 18} Q${B - 2} ${B - 2} ${B - 18} ${B - 2} M18 ${B - 2} Q2 ${B - 2} 2 ${B - 18}`} stroke={c.ink} strokeWidth={2} fill="none" strokeLinecap="round" />
        </Svg>
      </Animated.View>
      <Animated.View style={sq}>
        <HandBox seed="ob-next" fill={c.ink} cut="cut" style={{ width: 58, height: 58, alignItems: 'center', justifyContent: 'center' }}><Icon name="chevron" size={26} color={c.paper} sw={2.4} /></HandBox>
      </Animated.View>
    </Pressable>
  );
}

