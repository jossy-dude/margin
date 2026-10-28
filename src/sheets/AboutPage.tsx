import React, { useState } from 'react';
import { Image, Linking, Platform, View } from 'react-native';
import { Btn, HandBox, Hair, Row, Txt } from '../ui/kit';
import { Section } from '../screens/common';
import { useTheme } from '../ui/theme-context';
import { toast } from '../store/store';
import { APP_VERSION } from '../domain/version';
import { applyUpdate, checkForUpdate, otaAvailable, versionLine, type CheckResult } from '../services/ota';

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
export const SUPPORT_URL = '';

/**
 * Settings → About.
 *
 * This page used to be `Settings.tsx`'s `about` page, which was titled *Reset* and carried three
 * unrelated things: the erase warning, the version line and the Updates block. It is now its own file
 * (`ImportPage` and `DiagnosticsPage` are the pattern) and holds the two halves of what an About page
 * is actually asked for — what this thing is, and what this build is — while the destructive action
 * went to the `reset` page it belongs on.
 *
 * Copy is bound by `PRODUCT.md`: warm, plain, slightly wry, never corporate, and nothing invented —
 * no testimonials, no numbers, no pricing. Everything here is either a fact of the code or the owner's
 * own line.
 */
export function AboutPage({ supportUrl = SUPPORT_URL }: { supportUrl?: string }) {
  const { c } = useTheme();
  /* The Updates row's own state: what the last check said, and nothing else. A check is one network
     round-trip, so it is only ever started by a tap — the app checks on launch by itself. */
  const [ota, setOta] = useState<CheckResult | 'idle' | 'checking'>('idle');
  /** One check per tap. `checkForUpdate` is total and answers rather than throwing, so there is no
   *  catch here — the result line is the whole report. */
  const check = async () => { if (ota === 'checking') return; setOta('checking'); setOta(await checkForUpdate()); };
  const support = supportUrl.trim();

  return (
    <>
      {/* The app's own mark, unchanged: a hand-cut card, an ink border that is not quite straight, and
          the margin rule beside the letter — the whole idea of the app in one small image. 64 dp is the
          size at which the rule still reads as a rule rather than as a smudge.
          It is NOT wrapped in a `HandBox`: the artwork already contains a drawn frame, and a card inside
          a card is two borders eight pixels apart. The mark pastes straight onto the sheet's paper, the
          way a photo of a card would. */}
      <View style={{ alignItems: 'center', gap: 4, paddingTop: 2 }}>
        <Image source={require('../../assets/icon.png')} accessible accessibilityLabel="Margin, drawn as a hand-cut card" style={{ width: 64, height: 64 }} />
        <Txt f="bold" s={28} style={{ textAlign: 'center' }}>Margin</Txt>
        <Txt f="serif" s={15.5} c="mut" style={{ textAlign: 'center' }}>A school planner in paper and ink, on your phone.</Txt>
      </View>

      <Section title="What it holds">
        <Txt f="serif" s={15.5} c="mut">Your timetable, attendance, tasks and exams, grades, notes and focus time, in one place. Nothing leaves the phone: no account, no sign-in, no network needed. Export is the way out, not a subscription.</Txt>
      </Section>

      <Section title="Why it looks like this">
        <Txt f="serif" s={15.5} c="mut">It is drawn, not skinned. Every card is a hand-cut rectangle with an elliptical wobble and a slightly wrong edge, because a box that is exactly square looks like a form to fill in.</Txt>
        <Txt f="serif" s={15.5} c="mut">The bar at the top of Today is a measured instrument, not a progress strip: sixteen of them, grouped by the subject each was designed for, plus one day-wide sight glass. They read the real clock and the real length of the period, so the number on them is the truth.</Txt>
        <Txt f="serif" s={15.5} c="mut">Four faces carry the writing: Caveat for anything that should look handwritten, a serif for the body, a slab for headings, and a typewriter face for numbers so two digits never change width. Two palettes, a cream theme and a dark one, and every hand-cut edge has a reason written next to it in the source.</Txt>
      </Section>

      <Section title="Who made it">
        <Txt f="serif" s={15.5} c="mut">Made by Jossy, a student, for his own term. A planner he wanted to actually open — and the one he still uses.</Txt>
      </Section>

      <Section title="This build">
        <Txt f="serif" s={15} c="mut">Margin {APP_VERSION} · local-first, no account, no network needed.</Txt>
      </Section>

      <Hair />
      <Section title="Updates">
        {/* Web and a build with updates switched off both get a sentence instead of a button that could
            only ever answer "unavailable" — and the sentence names the right reason for each. */}
        {otaAvailable() ? (<>
          <Txt f="serif" s={15} c="mut">{versionLine()}</Txt>
          <Row>
            <Btn small kind="ghost" label={ota === 'checking' ? 'Checking…' : 'Check for updates'} disabled={ota === 'checking'} onPress={() => void check()} />
            {ota === 'ready' ? <Btn small label="Restart now" onPress={() => void applyUpdate()} /> : null}
          </Row>
          <Txt f="serif" s={14.5} c="mut">{OTA_LINE[ota]}</Txt>
        </>) : <Txt f="serif" s={14.5} c="mut">{Platform.OS === 'web' ? 'Updates are checked in the installed app; this browser build cannot update itself.' : 'This build cannot update itself. Updates must be enabled when the app is built.'}</Txt>}
      </Section>

      {/* The slot, and its off state: while `SUPPORT_URL` is empty this renders nothing at all, so the
          shipped page has no disabled button and no "coming soon" to explain. */}
      {support ? (
        <>
          <Hair />
          <Section title="Support">
            <Txt f="serif" s={15} c="mut">If it earned its place, you can buy the person who built it a coffee.</Txt>
            <Row><Btn small icon="coffee" label="Buy me a coffee" onPress={() => void openSupport(supportUrl)} /></Row>
          </Section>
        </>
      ) : null}
    </>
  );
}

/** What the Updates block says after a check, one line, in the app's own voice. */
const OTA_LINE: Record<CheckResult | 'idle' | 'checking', string> = {
  idle: 'Checked automatically when the app opens.',
  checking: 'Checking…',
  current: 'You are on the newest version.',
  ready: 'An update is downloaded. Restart to use it.',
  error: 'Could not reach the update service. Try again later.',
  unavailable: 'Updates are switched off in this build.',
};

/** A link that cannot be opened says so instead of failing silently: `openURL` rejects when there is
 *  nothing on the phone that handles the scheme, and an unhandled rejection on a tap is a crash the
 *  user cannot act on. */
const openSupport = (url: string) => {
  Linking.openURL(url).catch(() => toast('That link could not be opened on this phone.'));
};
