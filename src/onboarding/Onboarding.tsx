import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, interpolate, runOnJS, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { Btn, Chip, HandBox, Icon, Txt, faceOf } from '../ui/kit';
import { PACKS, programs, sectionsOf } from '../domain/packs';
import { PaperBg } from '../ui/PaperBg';
import { SemesterRange } from '../ui/SemesterRange';
import { Art } from '../ui/collage/Art';
import { Sky, Sun } from '../ui/collage/Sun';
import { skyPhase } from '../ui/collage/sky';
import { TornSheet } from '../ui/collage/Torn';
import { Face, type FaceHandle } from '../ui/mascot/Face';
import { VIEW_H, VIEW_W, gazeAlong, gazeAt } from '../ui/mascot/faces';
import { ONBOARDING, useFaceMoment } from '../ui/mascot/moments';
import { useReduceMotion, useTheme } from '../ui/theme-context';
import { FS } from '../ui/fit';
import { act, refreshNotifStatus, useStore } from '../store/store';
import type { OnboardDoor } from '../store/session';
import * as notifs from '../services/notifications';
import { fx } from '../services/fx';
import { Legend } from './Legend';
import { PAPER, hexA, makeTheme } from '../tokens/theme';
import { SKY as DAY_SKY, V2 } from '../tokens/v2';
import { Sky as DaySky } from '../ui/Sky';
import type { Settings } from '../domain/types';

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

/* the face is 160 dp tall (D-22); the walker's box is its drawing's shape */
const N = 5, SZH = 160, SZ = (SZH * VIEW_W) / VIEW_H, FOOT = 108;
const REST = [ONBOARDING.welcome, ONBOARDING.layout, ONBOARDING.name, ONBOARDING.data, ONBOARDING.reminders] as const;
type Perm = 'unknown' | 'granted' | 'denied' | 'undetermined' | 'unavailable';

export function Onboarding({ firstRun }: { firstRun: boolean }) {
  const { c, look: cut, dark } = useTheme(), ins = useSafeAreaInsets(), win = useWindowDimensions(), reduce = useReduceMotion();
  /* The tour's own laid-out size, not the window's. On Android edge-to-edge the window height can leave out
     the system navigation strip, and a tour sized from it stopped short of the bottom with the app showing
     through underneath. The root fills its parent (absoluteFill) and every page is sized from what it got. */
  const [box, setBox] = useState<{ w: number; h: number } | null>(null), W = box?.w ?? win.width, H = box?.h ?? win.height;
  const settings = useStore((s) => s.settings), daylight = settings.palette === 'daylight', scheme = dark ? 'dark' as const : 'light' as const;
  const [page, setPage] = useState(0), [name, setName] = useState(settings.name ?? ''), [typing, setTyping] = useState(false);
  const [range, setRange] = useState({ semesterStart: settings.semesterStart, semesterEnd: settings.semesterEnd });
  const [door, setDoor] = useState<OnboardDoor>(firstRun ? 'hand' : 'keep'), [pack, setPack] = useState<string | null>(null), [perm, setPerm] = useState<Perm>(() => (Platform.OS === 'web' ? 'unavailable' : 'unknown'));
  const [phase] = useState(() => skyPhase(new Date().getHours()));
  const x = useSharedValue(0), leave = useSharedValue(0);
  /* One face rides the pages, resting on each page's face (D-22); `look` follows the name being typed. */
  const { face, play, clear } = useFaceMoment(REST[page]!), faceRef = useRef<FaceHandle>(null), [look, setLook] = useState<{ x: number; y: number } | null>(null);
  /* how far each hero page is scrolled, so Scrap rides up with the page instead of covering its words */
  const y0 = useSharedValue(0), y4 = useSharedValue(0);
  const onY0 = useAnimatedScrollHandler({ onScroll: (e) => { y0.set(e.contentOffset.y); } }), onY4 = useAnimatedScrollHandler({ onScroll: (e) => { y4.set(e.contentOffset.y); } });
  const pager = useRef<Animated.ScrollView>(null), gone = useRef(false), touch = useRef({ x: 0, y: 0, t: 0 }), steerT = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Where Scrap stands on each page: centre x, centre y, scale. */
  const heroBottom = ins.top + 56 + Math.min(H * 0.27, 230);
  /* v0.8 U9 #14: page 5 carries the most (reminders, then the ready-made classes), so its hero is shorter and the
     last card ends above the dots instead of under them on a 6.5" phone */
  const hero5 = ins.top + 56 + Math.min(H * (PACKS.length ? 0.17 : 0.27), PACKS.length ? 140 : 230);
  const anchors = [
    { cx: W / 2, cy: heroBottom - 22 - (SZH * 1.05) / 2, s: 1.05 },
    { cx: W - 58, cy: ins.top + 96, s: 0.36 },
    { cx: W - 70, cy: ins.top + 150, s: 0.5 },
    { cx: W - 58, cy: ins.top + 96, s: 0.36 },
    { cx: W / 2, cy: hero5 - 24 - (SZH * 0.74) / 2, s: 0.74 },
  ];
  const at = anchors[page]!;

  const onScroll = useAnimatedScrollHandler({ onScroll: (e) => { x.set(e.contentOffset.x); } });
  /* Arriving on a page: what Scrap feels there. Called from the two things that change the page (a tap
     on onward or a number, and a swipe settling), so the mood is set with the page, not after it. */
  const arrive = useCallback((j: number) => {
    setPage(j); fx.page(); clear();
    if (j === 2 && name.trim()) play('nameTyped');
  }, [name, play, clear]);
  /* the welcome: a wink, a moment after arriving */
  useEffect(() => { if (page !== 0) return; const t = setTimeout(() => play('hello'), 600); return () => clearTimeout(t); }, [page, play]);
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
    faceRef.current?.look(g.x, g.y);
  };
  const onTouchStart = (e: GestureResponderEvent) => {
    touch.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, t: Date.now() };
    if (steerT.current) clearTimeout(steerT.current);
    steerAt(e);
  };
  const onTouchEnd = (e: GestureResponderEvent) => {
    const t = touch.current, dx = e.nativeEvent.pageX - t.x, dy = e.nativeEvent.pageY - t.y;
    const onHim = Math.abs(t.x - at.cx) < (SZ * at.s) / 2 && Math.abs(t.y - at.cy) < (SZH * at.s) / 2;
    if (onHim && Math.hypot(dx, dy) < 10 && Date.now() - t.t < 400) { faceRef.current?.bounce(); fx.tap(); }
  };
  useEffect(() => () => { if (steerT.current) clearTimeout(steerT.current); }, []);

  /* Typing the name: he reads along it, left to right. */
  const onName = (v: string) => {
    setName(v);
    if (v.trim()) play('nameTyped'); else clear();
    setLook(gazeAlong(v.length));
  };

  const ask = async () => {
    fx.tap();
    const got = (await notifs.ensurePermission(true)) as Perm;
    setPerm(got); void refreshNotifStatus();
    if (got === 'granted') { play('remindersOn'); fx.done(); }
    else if (got === 'denied') { faceRef.current?.droop(); fx.denied(); }
  };
  /* Read, never ask, on arrival. The web build has no notification service at all: say so plainly. */
  useEffect(() => { if (Platform.OS !== 'web') void notifs.ensurePermission(false).then((p) => setPerm(p as Perm)).catch(() => setPerm('unavailable')); }, []);

  const finish = useCallback((d: OnboardDoor) => {
    if (gone.current) return;
    gone.current = true;
    Keyboard.dismiss();
    /* "Pick your class" without a section picked is the same as setting it up by hand. */
    /* a section picked on the last page wins: it IS where the timetable comes from */
    const dd: OnboardDoor = pack ? 'class' : d === 'class' ? (firstRun ? 'hand' : 'keep') : d;
    const choice = { door: dd, name, semesterStart: range.semesterStart, semesterEnd: range.semesterEnd, pack };
    const done = () => { void act.finishOnboarding(choice); };
    if (reduce) { done(); return; }
    faceRef.current?.bounce(); fx.done();
    /* The whole stack is lifted off the desk: up and away, the way a sheet is taken off a pad. */
    leave.set(withSequence(withTiming(0, { duration: 650 }), withTiming(1, { duration: 420, easing: Easing.in(Easing.cubic) }, (f) => { if (f) runOnJS(done)(); })));
  }, [name, range, reduce, leave, pack, firstRun]);

  const lifted = useAnimatedStyle(() => ({ transform: [{ translateY: -leave.get() * H * 1.05 }, { rotate: `${leave.get() * -4}deg` }] }));
  const skipDoor: OnboardDoor = firstRun ? 'sample' : 'keep';

  /* Each page clips its own collage: a piece drifting with the swipe never wanders onto the next page. */
  const pageShell = (i: number, art: React.ReactNode, body: React.ReactNode) => (
    <View key={i} style={{ width: W, height: H, overflow: 'hidden' }}>
      <Drift x={x} i={i} W={W}>{cut === 'collage' ? art : null}</Drift>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: ins.top + 62, paddingHorizontal: 24, paddingBottom: FOOT + ins.bottom + 12, minHeight: H }}>
        <Words x={x} i={i} W={W}>{body}</Words>
      </ScrollView>
    </View>
  );
  /* The two bookends: art and Scrap above, and the words on a sheet of paper torn across and laid over
     the art — the reference's hero, cut the same way. */
  const heroShell = (i: number, top: number, art: React.ReactNode, body: React.ReactNode) => (
    <View key={i} style={{ width: W, height: H, overflow: 'hidden' }}>
      <Drift x={x} i={i} W={W}>{cut === 'collage' ? art : <Halo cx={anchors[i]!.cx} cy={anchors[i]!.cy} r={(SZH * anchors[i]!.s) * 0.62} />}</Drift>
      <Animated.ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} scrollEventThrottle={16} onScroll={i === 0 ? onY0 : onY4} contentContainerStyle={{ minHeight: H }}>
        <View style={{ height: top }} />
        <Sheet i={i}>
          <View style={{ paddingHorizontal: 24, paddingTop: cut === 'collage' ? 10 : 22, paddingBottom: FOOT + ins.bottom + 12 }}><Words x={x} i={i} W={W}>{body}</Words></View>
        </Sheet>
      </Animated.ScrollView>
    </View>
  );

  return (
    <Animated.View testID="onboarding" style={[StyleSheet.absoluteFill, { zIndex: 5000, backgroundColor: daylight ? V2[scheme].flat : c.paper }, lifted]}
      onLayout={(e) => {
        /* Whole dp and a 1 dp dead band: the page sizes are derived from this box, so a sub-pixel wobble in the
           measured size must not set state again, or layout → state → layout loops ("Maximum update depth"). */
        const w = Math.round(e.nativeEvent.layout.width), h = Math.round(e.nativeEvent.layout.height);
        if (w > 0 && h > 0 && (!box || Math.abs(w - box.w) > 1 || Math.abs(h - box.h) > 1)) setBox({ w, h });
      }}
      onTouchStart={onTouchStart} onTouchMove={steerAt} onTouchEnd={onTouchEnd}>
      {daylight ? <DaySky mode={settings.sky === 'off' ? 'still' : settings.sky} scheme={scheme} /> : <PaperBg />}
      <Animated.ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16} keyboardShouldPersistTaps="handled"
        onMomentumScrollEnd={(e) => { const j = Math.round(e.nativeEvent.contentOffset.x / W); if (j !== page) arrive(j); }}>
        {heroShell(0, heroBottom - 6, <>
          <Sky w={W} h={heroBottom + 40} phase={phase} />
          <Sun size={130} phase={phase} rise style={{ position: 'absolute', right: -120, top: (phase === 'dawn' || phase === 'dusk' ? heroBottom - 150 : ins.top + 130) - 169 }} />
          <Art name="hill-sage" w={W * 1.25} style={{ position: 'absolute', left: -W * 0.18, top: heroBottom - 84 }} />
          <Art name="hill-moss" w={W * 1.1} style={{ position: 'absolute', left: -W * 0.02, top: heroBottom - 46 }} />
          <Art name="leaf" w={44} rot={-24} style={{ position: 'absolute', left: 18, top: heroBottom - 150 }} />
          <Art name="leaf-sage" w={38} rot={14} style={{ position: 'absolute', left: 52, top: heroBottom - 134 }} />
        </>, <>
          <Title>Hi, I&apos;m Marrow.</Title>
          <Kicker style={{ marginTop: 14 }}>Pick your style</Kicker>
          <StylePicker W={W} value={settings.palette === 'original' ? 'refined' : settings.palette} onChange={(p) => { void act.setSettings({ palette: p }); fx.select(); faceRef.current?.bounce(); }} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }} accessibilityRole="radiogroup" accessibilityLabel="Light or dark">
            {([['light', 'Light'], ['dark', 'Dark'], ['auto', 'Auto']] as const).map(([v, l]) => <Chip key={v} small label={l} on={settings.theme === v} onPress={() => { void act.setSettings({ theme: v }); fx.select(); }} />)}
          </View>
        </>)}
        {pageShell(1, <>
          <Art name="dot" w={74} style={{ position: 'absolute', right: 20, top: ins.top + 56 }} />
          <Art name="leaf-sage" w={46} rot={-38} style={{ position: 'absolute', right: -6, bottom: FOOT + ins.bottom + 40 }} />
        </>, <>
          <Kicker>The layout</Kicker>
          <Title style={{ marginRight: 88 }}>Everything has its place.</Title>
          <View style={{ height: 14 }} />
          <Legend active={page === 1} onLook={(r, of) => { faceRef.current?.look(-0.85, -0.2 + (r / of) * 1.4); }} />
        </>)}
        {pageShell(2, <>
          <Sun size={76} phase={phase} style={{ position: 'absolute', left: -82, top: ins.top + 106 }} />
          <Art name="leaf" w={40} rot={28} style={{ position: 'absolute', left: 14, bottom: FOOT + ins.bottom + 30 }} />
        </>, <>
          <Kicker>First things first</Kicker>
          <Title style={{ marginRight: 112 }}>What should I call you?</Title>
          <NamePaper cut={cut} name={name} onName={onName} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} onDone={() => goTo(3)} />
          <Txt f="serif" s={17} c="mut" style={{ marginTop: 14, minHeight: 24 }}>{name.trim() ? `Nice to meet you, ${name.trim()}.` : ''}</Txt>
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
          <Kicker style={{ marginTop: 22 }}>Your timetable</Kicker>
          <Doors firstRun={firstRun} value={door} onChange={(d) => { setDoor(d); fx.select(); if (d === 'import') play('importPreview'); else clear(); }} />
        </>)}
        {heroShell(4, hero5 - 6, <>
          <Sun size={84} phase={phase} style={{ position: 'absolute', left: -83, top: ins.top - 5 }} />
          <Art name="strip-denim" w={W * 0.9} rot={-4} style={{ position: 'absolute', right: -W * 0.42, top: hero5 - 64 }} />
          <Art name="strip-kraft" w={W * 0.8} rot={3} style={{ position: 'absolute', left: -W * 0.36, top: hero5 - 52 }} />
        </>, <>
          <Kicker>Reminders</Kicker>
          <Title>A nudge before class.</Title>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <Why icon="clock" text="Classes" />
            <Why icon="exam" text="Deadlines" />
            <Why icon="timer" text="Focus" />
          </View>
          <View style={{ marginTop: 16, gap: 8 }}>
            {perm === 'granted'
              ? <PermNote tone="ok" text="Reminders are on." />
              : perm === 'denied' ? <PermNote tone="warn" text="Later, in Settings → Reminders." />
              : perm === 'unavailable' ? <PermNote tone="mut" text="The web preview cannot send reminders." />
              : <Btn kind="primary" icon="bell" label="Allow reminders" onPress={() => { void ask(); }} />}
          </View>
          {PACKS.length ? (
            <View style={{ marginTop: 22, gap: 6 }}>
              <Kicker>Your class, ready-made</Kicker>
              <ClassPicker value={pack} onChange={(id) => { setPack(pack === id ? null : id); fx.select(); faceRef.current?.bounce(); }} />
              {pack ? <PermNote tone="ok" text="Done. Long-press a class on Week to change it." /> : null}
            </View>
          ) : null}
        </>)}
      </Animated.ScrollView>

      {/* Scrap, above every page. */}
      <Walker x={x} W={W} anchors={anchors} reduce={reduce} y0={y0} y4={y4}>
        <Face {...face} ref={faceRef} size={SZH} look={page === 2 && typing ? look : null} />
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
          : <Btn kind="ink" label="Start" icon="check" a11y="Start using Marrow" testID="onboarding-start" onPress={() => finish(door)} style={{ minWidth: 150 }} />}
      </View>
    </Animated.View>
  );
}

/* ── pieces ──────────────────────────────────────────────────────────────────────────────────────────── */

const Kicker = ({ children, style }: { children: string; style?: object }) => <Txt f="type" s={13} c="acc" maxFontSizeMultiplier={FS} accessibilityRole="header" style={[{ letterSpacing: 2.4, textTransform: 'uppercase', marginBottom: 8 }, style]}>{children}</Txt>;
const Title = ({ children, style }: { children: React.ReactNode; style?: object }) => <Txt f="marker" s={44} maxFontSizeMultiplier={1.3} accessibilityRole="header" style={[{ lineHeight: 50 }, style]}>{children}</Txt>;

/** One thing a reminder is sent for: an icon on a tile and one word. */
function Why({ icon, text }: { icon: string; text: string }) {
  const { c } = useTheme();
  return (
    <HandBox seed={`why-${icon}`} fill={c.card} style={{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: hexA(c.acc, 0.14), alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={21} color={c.acc} /></View>
      <Txt f="bold" s={15} maxFontSizeMultiplier={FS}>{text}</Txt>
    </HandBox>
  );
}
function PermNote({ tone, text }: { tone: 'ok' | 'warn' | 'mut'; text: string }) {
  const { c } = useTheme();
  return <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }} accessibilityLiveRegion="polite"><Icon name={tone === 'ok' ? 'check' : 'bell'} size={20} color={c[tone]} /><Txt f="hand" s={18} c={tone === 'mut' ? 'mut' : 'ink'} style={{ flex: 1 }}>{text}</Txt></View>;
}

/** The name is written on a torn piece of ruled paper, in a hand. */
function NamePaper({ cut, name, onName, onFocus, onBlur, onDone }: { cut: 'ink' | 'collage' | 'plain'; name: string; onName: (s: string) => void; onFocus: () => void; onBlur: () => void; onDone: () => void }) {
  /* The scrap is cream in both themes, so its ink is fixed dark, never the theme's. */
  const th = useTheme(), { c } = th, { width } = useWindowDimensions();
  /* The torn ruled scrap is a collage piece; every other style writes the name on its own kind of card. */
  if (cut !== 'collage') return (
    <HandBox seed="ob-name" fill={c.card} style={{ marginTop: 22, paddingHorizontal: 18, paddingVertical: 14 }}>
      <TextInput testID="onboarding-name" value={name} onChangeText={onName} onFocus={onFocus} onBlur={onBlur} onSubmitEditing={onDone} placeholder="Your name" placeholderTextColor={c.mut}
        autoCapitalize="words" autoCorrect={false} maxLength={40} returnKeyType="next" accessibilityLabel="Your name" selectionColor={c.acc} maxFontSizeMultiplier={FS}
        style={{ ...faceOf(th, cut === 'ink' ? 'script' : 'bold', cut === 'ink' ? 36 : 28), color: c.ink, paddingVertical: 0, height: 48 }} />
      <View style={{ height: 2, borderRadius: 1, backgroundColor: name.trim() ? c.acc : hexA(c.ink, 0.15), marginTop: 4 }} />
    </HandBox>
  );
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

const DOORS: { id: OnboardDoor; icon: string; title: string; short: string; line: string; tint: 'sky' | 'sage' | 'sand' | 'cream' | 'blush'; first?: boolean; later?: boolean; packs?: boolean }[] = [
  { id: 'import', icon: 'import', title: 'Bring my data back', short: 'Import', line: 'A Marrow backup or export, or a JSON or CSV file.', tint: 'sky' },
  { id: 'hand', icon: 'pencil', title: 'Set it up by hand', short: 'By hand', line: 'Start empty, add subjects with +.', tint: 'sage', first: true },
  { id: 'sample', icon: 'book', title: 'Look around first', short: 'Sample', line: 'A sample term to try.', tint: 'sand', first: true },
  { id: 'keep', icon: 'check', title: 'Keep my planner as it is', short: 'Keep mine', line: 'Nothing changes.', tint: 'cream', later: true },
];
function Doors({ firstRun, value, onChange }: { firstRun: boolean; value: OnboardDoor; onChange: (d: OnboardDoor) => void }) {
  const { c, tints } = useTheme();
  const list = DOORS.filter((d) => (firstRun ? !d.later : !d.first) && (!d.packs || PACKS.length > 0));
  return (
    <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
      {list.map((d, i) => { const on = d.id === value; return (
        /* A tile per door: the icon and one or two words. The full sentence is what a screen reader says. */
        <Pressable key={d.id} testID={`door-${d.id}`} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${d.title}. ${d.line}`} onPress={() => onChange(d.id)} style={{ flex: 1 }}>
          <HandBox seed={`door-${d.id}`} fill={on ? tints[d.tint] : c.card} stroke={on ? c.acc : undefined} sw={on ? 2.4 : 1.6} cut="cut" style={{ alignItems: 'center', gap: 8, paddingVertical: 16, paddingHorizontal: 4, minHeight: 96, transform: [{ rotate: `${(i % 2 ? 0.6 : -0.5)}deg` }, { scale: on ? 1.03 : 1 }] }}>
            <Icon name={d.icon} size={24} color={on ? c.ink : c.mut} />
            <Txt f="bold" s={15} maxFontSizeMultiplier={FS} numberOfLines={1} style={{ textAlign: 'center' }}>{d.short}</Txt>
          </HandBox>
        </Pressable>); })}
    </View>
  );
}

/** The built-in class timetables (domain/packs): the program, then its sections. */
function ClassPicker({ value, onChange }: { value: string | null; onChange: (id: string) => void }) {
  const { c } = useTheme(), progs = programs(), [prog, setProg] = useState(progs[0] ?? '');
  return (
    <HandBox seed="ob-class" fill={c.card} style={{ padding: 12, gap: 8, marginTop: 8 }}>
      <Txt f="serif" s={14.5} c="mut">Your program</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{progs.map((p) => <Chip key={p} small label={p} on={p === prog} onPress={() => setProg(p)} />)}</View>
      <Txt f="serif" s={14.5} c="mut">Your section</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{sectionsOf(prog).map((p) => <Chip key={p.id} label={`Section ${p.section}`} on={value === p.id} onPress={() => onChange(p.id)} />)}</View>
    </HandBox>
  );
}

/** Page one's choice: the four Styles, each drawn as a tiny page of itself (its own paper, card, accent
 *  and display face) so the choice is seen rather than read. Picking one restyles the tour at once. */
const STYLES: readonly (readonly [Exclude<Settings['palette'], 'original'>, string])[] = [['collage', 'Collage'], ['plain', 'Plain'], ['refined', 'Notebook'], ['daylight', 'Daylight']];
function StylePicker({ W, value, onChange }: { W: number; value: Settings['palette']; onChange: (p: Settings['palette']) => void }) {
  const w = Math.floor((Math.min(W, 520) - 48 - 10) / 2);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }} accessibilityRole="radiogroup" accessibilityLabel="Style">
      {STYLES.map(([id, label]) => <StyleCard key={id} id={id} label={label} w={w} on={value === id} onPress={() => onChange(id)} />)}
    </View>
  );
}
function StyleCard({ id, label, w, on, onPress }: { id: Settings['palette']; label: string; w: number; on: boolean; onPress: () => void }) {
  const { c } = useTheme(), s = useStore((st) => st.settings), sys = useColorScheme() === 'dark';
  const p = makeTheme({ theme: s.theme, palette: id, pen: s.pen }, sys), sc = p.dark ? 'dark' as const : 'light' as const, day = id === 'daylight';
  const r = p.look === 'plain' ? 12 : p.look === 'collage' ? 2 : 5, line = day ? V2[sc].ink3 : hexA(p.c.ink, 0.28);
  return (
    <Pressable testID={`style-${id}`} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${label} style`} onPress={onPress}
      style={{ width: w, height: 112, borderRadius: r + 6, overflow: 'hidden', borderWidth: on ? 2.5 : 1, borderColor: on ? c.acc : hexA(c.ink, 0.18), backgroundColor: day ? DAY_SKY[sc].noon[1] : p.c.paper }}>
      {day ? <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 56, backgroundColor: DAY_SKY[sc].noon[0] }} /> : null}
      <View style={{ margin: 10, marginBottom: 0, padding: 8, gap: 5, borderRadius: r, backgroundColor: day ? V2[sc].glassStrong : p.c.card, borderWidth: p.look === 'ink' ? 1.4 : 0, borderColor: p.c.ink, transform: [{ rotate: p.look === 'collage' ? '-1.5deg' : '0deg' }] }}>
        <View style={{ width: 28, height: 6, borderRadius: 3, backgroundColor: day ? V2[sc].now : p.c.acc }} />
        <View style={{ width: '82%', height: 4, borderRadius: 2, backgroundColor: line }} />
        <View style={{ width: '56%', height: 4, borderRadius: 2, backgroundColor: line }} />
      </View>
      <Text maxFontSizeMultiplier={FS} numberOfLines={1} style={{ fontFamily: p.type.marker.fam, fontSize: 19, color: day ? V2[sc].ink : p.c.ink, marginHorizontal: 12, marginTop: 8 }}>{label}</Text>
      {on ? <View style={{ position: 'absolute', right: 8, top: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: c.acc, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={14} color={c.onAcc} sw={2.6} /></View> : null}
    </Pressable>
  );
}

/** What Jot stands in front of on the two hero pages, per Style: the collage has its hills and sun; Plain a
 *  soft disc of colour, Notebook a pencilled ring, Daylight a pool of light in its sky. */
function Halo({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const { c, look, tints, dark } = useTheme(), day = useStore((s) => s.settings.palette === 'daylight');
  const size = r * 2.6, half = size / 2;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: cx - half, top: cy - half, width: size, height: size }}>
      <Svg width={size} height={size}>
        {day ? <>
          <Circle cx={half} cy={half} r={r * 1.25} fill={dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.35)'} />
          <Circle cx={half} cy={half} r={r} fill={dark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.55)'} />
        </> : look === 'plain' ? <>
          <Circle cx={half + r * 0.55} cy={half - r * 0.5} r={r * 0.42} fill={hexA(tints.sand, 0.9)} />
          <Circle cx={half} cy={half} r={r} fill={hexA(tints.sky, 0.85)} />
        </> : <>
          <Circle cx={half} cy={half} r={r} fill={hexA(c.acc, 0.08)} stroke={c.ink} strokeWidth={1.6} strokeDasharray="7 6" />
          <Path d={`M${half - r * 0.9} ${half + r * 1.12} q${r * 0.45} -10 ${r * 0.9} 0 t${r * 0.9} 0`} stroke={c.acc} strokeWidth={2.2} fill="none" strokeLinecap="round" />
        </>}
      </Svg>
    </View>
  );
}

/** The sheet the hero pages' words sit on, per Style: torn paper, a rounded card, a ruled page, or glass. */
function Sheet({ i, children }: { i: number; children: React.ReactNode }) {
  const { c, look, dark } = useTheme(), day = useStore((s) => s.settings.palette === 'daylight');
  if (look === 'collage' && !day) return <TornSheet seed={`ob-sheet-${i}`} style={{ flexGrow: 1 }}>{children}</TornSheet>;
  const sc = dark ? 'dark' : 'light';
  const st = day
    ? { backgroundColor: V2[sc].glassStrong, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: StyleSheet.hairlineWidth, borderColor: V2[sc].ring }
    : look === 'plain'
      ? { backgroundColor: c.card, borderTopLeftRadius: 28, borderTopRightRadius: 28 }
      : { backgroundColor: c.card, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderTopWidth: 1.6, borderColor: c.ink };
  return <View style={[{ flexGrow: 1 }, st]}>{children}</View>;
}

/** Scrap's travel between page anchors: position and size follow the pager exactly, with a hop in between. */
function Walker({ x, W, anchors, reduce, children, y0, y4 }: { x: SharedValue<number>; W: number; anchors: { cx: number; cy: number; s: number }[]; reduce: boolean; children: React.ReactNode; y0: SharedValue<number>; y4: SharedValue<number> }) {
  const xs = anchors.map((_, i) => i * W), cxs = anchors.map((a) => a.cx), cys = anchors.map((a) => a.cy), ss = anchors.map((a) => a.s);
  const st = useAnimatedStyle(() => {
    const v = x.get(), f = v / W - Math.floor(v / W), arc = reduce ? 0 : -Math.sin(f * Math.PI) * 54;
    const cx = interpolate(v, xs, cxs, 'clamp'), cy = interpolate(v, xs, cys, 'clamp'), s = interpolate(v, xs, ss, 'clamp');
    const lift = y0.get() * Math.max(0, 1 - v / W) + y4.get() * Math.max(0, 1 - Math.abs(v - 4 * W) / W);
    return { transform: [{ translateX: cx - SZ / 2 }, { translateY: cy - SZH / 2 + arc - lift }, { scale: s }, { rotate: `${Math.sin(f * Math.PI) * -8}deg` }] };
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

