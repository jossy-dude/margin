import React, { useEffect, useState } from 'react';
import { Image, Linking, Platform, Pressable, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Btn, HandBox, Hair, Row, Txt, usePressIn } from '../ui/kit';
import { Scrap } from '../ui/mascot/Scrap';
import { useReduceMotion, useTheme } from '../ui/theme-context';
import { fx } from '../services/fx';
import { FONT } from '../tokens/theme';
import { Section } from '../screens/common';
import { toast } from '../store/store';
import { APP_VERSION } from '../domain/version';
import { applyUpdate, checkForUpdate, otaAvailable, otaView, updateStaged, useNativeUpdates, versionLine, type CheckResult, type OtaView } from '../services/ota';

/**
 * The owner's support link, and the ONE line he fills in.
 *
 * Empty means the section does not exist: no button, no placeholder, nothing on the page that could
 * only ever be tapped by someone waiting for a URL to be pasted. Set it and a `Buy me a coffee` row
 * appears at the bottom of About, opening `supportUrl` with `Linking.openURL`.
 *
 * It is a prop as well as a constant so both states are testable without rewriting the source: the
 * default is this value, the tests pass their own.
 */
/** Where the support button goes: Jossy's Gursha page (a gursha is a bite you feed someone you care about —
 *  Ethiopia's "buy me a coffee"). Passing `supportUrl=""` hides the section, as before. */
export const SUPPORT_URL = 'https://gurshaplus.com/jossy';
export const GITHUB_URL = 'https://github.com/jossy-dude/margin';

export function AboutPage({ supportUrl = SUPPORT_URL }: { supportUrl?: string }) {
  /* The update row reports only what IT asked for; a staged download opens it on `ready` (see services/ota). */
  const [mine, setMine] = useState<CheckResult | 'idle' | 'checking'>(() => (updateStaged() ? 'ready' : 'idle'));
  const native = useNativeUpdates(), ota = otaView(native, mine);
  const check = async () => { if (ota === 'checking' || ota === 'downloading') return; setMine('checking'); setMine(await checkForUpdate()); };
  const support = supportUrl.trim(), [hop, setHop] = useState<{ kind: 'celebrate'; n: number } | null>(null);

  return (
    <>
      <View style={{ alignItems: 'center', gap: 2, paddingTop: 4 }}>
        <Scrap size={92} mood="happy" cue={hop} />
        <Txt f="marker" s={34} style={{ textAlign: 'center' }} accessibilityRole="header">Margin</Txt>
        <Txt f="serif" s={17} c="mut" style={{ textAlign: 'center' }}>A school planner — on paper, in your pocket.</Txt>
      </View>

      <Section title="What it's for">
        <Txt f="hand" s={17.5} style={{ lineHeight: 24 }}>Your brain is for learning, not for remembering that Physics moved to room B-12 on Thursdays.</Txt>
        <Txt f="serif" s={15.5} c="mut">So Margin remembers it: your timetable, attendance, marks, deadlines, notes and study time, on one desk. It knows what class you are in and how long is left, nags you only if you ask it to, and keeps everything on this phone — no account, no cloud.</Txt>
      </Section>

      <Section title="Why it looks like paper">
        <Txt f="serif" s={15.5} c="mut">Because school already happens on paper. Margin was made to look like it and feel like it — torn edges, crumpled sheets, tape, stamps and a scrap of denim called Scrap — so opening it feels like your own desk, not another dashboard. A page you enjoy looking at is a page you actually open.</Txt>
      </Section>

      <Section title="Who made it">
        <View style={{ gap: 2 }}>
          <Txt f="serif" s={15} c="mut">Made by</Txt>
          <Txt f="script" s={58} style={{ fontFamily: FONT.handBold, lineHeight: 60, marginTop: -6, transform: [{ rotate: '-3deg' }] }} accessibilityLabel="Jossy">Jossy</Txt>
          <Txt f="serif" s={15.5} c="mut">A 20-year-old computer science student who wanted one app to run his whole school week — so he built it, for himself and his classmates.</Txt>
        </View>
      </Section>

      <Section title="It's open source">
        <Txt f="serif" s={15.5} c="mut">Every line is on GitHub. A star tells Jossy someone is using it (and makes Scrap do a little hop).</Txt>
        <Row><Btn icon="flag" label="Star it on GitHub" a11y="Star Margin on GitHub" onPress={() => { setHop((h) => ({ kind: 'celebrate', n: (h?.n ?? 0) + 1 })); openLink(GITHUB_URL); }} /></Row>
      </Section>

      {support ? (
        <Section title="Feed the developer">
          <Txt f="serif" s={15.5} c="mut">In Ethiopia, a gursha is a bite you feed someone you care about. This is the internet version.</Txt>
          <GurshaButton onPress={() => openLink(support)} />
        </Section>
      ) : null}

      <Hair />
      <Section title="This build">
        <Txt f="serif" s={15} c="mut">Margin {APP_VERSION} · local-first, no account; the network is used only for the update check.</Txt>
      </Section>
      <Section title="Updates">
        {otaAvailable() ? (<>
          <Txt f="serif" s={15} c="mut">{versionLine()}</Txt>
          <Row>
            <Btn small kind="ghost" label={ota === 'checking' ? 'Checking…' : 'Check for updates'} disabled={ota === 'checking' || ota === 'downloading'} onPress={() => void check()} />
            {ota === 'ready' ? <Btn small label="Update now (restart)" onPress={() => void applyUpdate(true)} /> : null}
          </Row>
          <Txt f="serif" s={14.5} c="mut">{OTA_LINE[ota]}</Txt>
        </>) : <Txt f="serif" s={14.5} c="mut">{Platform.OS === 'web' ? 'Updates are checked in the installed app; this browser build cannot update itself.' : 'This build cannot update itself. Updates must be enabled when the app is built.'}</Txt>}
      </Section>
    </>
  );
}

/**
 * The support button, with a pair of paper eyes perched on it (Scrap's own eye pieces) whose pupils keep
 * sliding over to stare at the button — "look. LOOK." — glance back at you, blink, and stare again. Press it
 * and they go wide. It is a real button: one label, one action, and the eyes are decoration a reader skips.
 */
function GurshaButton({ onPress }: { onPress: () => void }) {
  const { c } = useTheme(), reduce = useReduceMotion(), gx = useSharedValue(-1), gy = useSharedValue(1), lid = useSharedValue(0), wide = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    /* stare at the button … dart to you … back … blink … */
    const look = (x: number, y: number, d: number) => withDelay(d, withTiming(x, { duration: 140 }));
    gx.set(withRepeat(withSequence(look(-1, 1, 1600), look(0.4, -0.2, 0), withTiming(0.4, { duration: 700 }), look(-1, 1, 0), withTiming(-1, { duration: 900 }), look(-0.7, 1, 0)), -1));
    gy.set(withRepeat(withSequence(look(1, 1, 1600), look(-0.3, 0, 0), withTiming(-0.3, { duration: 700 }), look(1, 0, 0), withTiming(1, { duration: 900 }), look(0.9, 0, 0)), -1));
    lid.set(withRepeat(withSequence(withDelay(2600, withTiming(1, { duration: 70 })), withTiming(0, { duration: 110 }), withDelay(900, withTiming(0, { duration: 1 }))), -1));
    return () => { cancelAnimation(gx); cancelAnimation(gy); cancelAnimation(lid); };
  }, [reduce, gx, gy, lid]);
  const [aIn, aLift] = usePressIn(() => { wide.set(withSequence(withSpring(1.25, { duration: 200 }), withDelay(500, withSpring(1, { duration: 300 })))); fx.done(); onPress(); });
  const pupil = useAnimatedStyle(() => ({ transform: [{ translateX: gx.get() * 9 }, { translateY: gy.get() * 8 }, { scale: 1 / wide.get() }] }));
  const lidS = useAnimatedStyle(() => ({ transform: [{ scaleY: 1 - lid.get() * 0.92 }, { scale: wide.get() }] }));
  return (
    <View style={{ alignSelf: 'flex-start', paddingTop: 40, paddingRight: 34 }}>
      <Pressable accessibilityRole="link" accessibilityLabel="Buy Jossy a gursha" accessibilityHint="Opens gurshaplus.com in your browser" onPressIn={aIn} onPress={aLift}>
        <HandBox seed="gursha" fill={c.ink} cut="cut" style={{ minHeight: 54, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Txt f="bold" s={21} c="paper">Buy me a gursha</Txt>
        </HandBox>
      </Pressable>
      {/* the eyes, perched on the button's top-right corner, looking down at it */}
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', right: 0, top: 0, flexDirection: 'row', gap: 0, transform: [{ rotate: '-10deg' }] }}>
        {[0, 1].map((i) => (
          <Animated.View key={i} style={[{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }, lidS]}>
            <Image source={EYE} style={{ position: 'absolute', width: 56, height: 56 }} />
            <Animated.View style={pupil}><Image source={PUPIL} style={{ width: 24, height: 24 }} /></Animated.View>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}
const EYE = require('../../assets/paper/scrap-eye.webp'), PUPIL = require('../../assets/paper/scrap-pupil.webp');

const OTA_LINE: Record<OtaView, string> = {
  idle: 'Checked automatically when the app opens.',
  checking: 'Checking…',
  downloading: 'Downloading the update…',
  current: 'You are on the newest version.',
  ready: 'Update available — downloaded and ready to install.',
  error: 'Couldn’t reach the update server. Check your connection and try again.',
  unavailable: 'Updates are switched off in this build.',
};

/** A link that cannot be opened says so instead of failing silently: `openURL` rejects when there is
 *  nothing on the phone that handles the scheme, and an unhandled rejection on a tap is a crash the
 *  user cannot act on. */
const openLink = (url: string) => {
  Linking.openURL(url).catch(() => toast('That link could not be opened on this phone.'));
};
