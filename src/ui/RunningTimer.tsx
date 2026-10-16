import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, Txt } from './kit';
import { FS } from './fit';
import { useNow, useTheme } from './theme-context';
import { useScreenLive } from './live';
import { act, useStore } from '../store/store';
import { FLOW_OVER_CAP_MS, view } from '../domain/timer';
import { fmtClock } from '../domain/time';
import { hexA } from '../tokens/theme';

/** A duration as a person would say it out loud: "1 minute", "12 minutes". Per-second digits are
 *  deliberately never spoken — the visible readout changes every second, and a live region that
 *  re-announced it would talk over whatever the user was actually reading. */
const mins = (ms: number) => { const n = Math.max(0, Math.ceil(ms / 60_000)); return `${n} ${n === 1 ? 'minute' : 'minutes'}`; };

/** The focus round as a header-slot button — the "is a session live?" answer that used to be a strip
 *  row above the list.
 *
 *  It sits in `Page`'s `right` slot, immediately left of the gear, so admitting a round costs no rows
 *  of list height: the countdown shows as plain tabular digits next to the timer glyph, and idle
 *  collapses to the glyph alone. The slot is a fixed-height header element, so the round starting or
 *  ending cannot grow or vanish mid-flow and walk the list under the user's thumb the way an in-flow
 *  strip could.
 *
 *  Idle it opens the Focus overlay itself (`focusOpen(null)` — replacing Today's old static timer
 *  button, same `testID` so the QA harness keeps its tap). Once a round exists it navigates
 *  (`act.go('Focus')` — navigation only; it never starts or resets anything).
 *
 *  Reusable as-is on any `Page`-based screen: it reads the store itself and takes only an optional
 *  `style` for placement. */
export function RunningTimer({ style }: { style?: StyleProp<ViewStyle> }) {
  // A raw state field, so the selector is referentially stable between writes (N9). Copied from
  // `ui/Overlay.tsx` (`useStore((s) => s.sheet)`) / `ui/PaperBg.tsx` (`useStore((s) => s.settings.paper)`).
  // Nothing derived is returned from here; the view below is derived in render, from `useMemo`-free
  // pure functions over two stable primitives.
  const timer = useStore((s) => s.timer);
  // Same cadence rule as Focus (Focus.tsx:207): 1 s while a round can move, 30 s when nothing can —
  // and a hidden header pays none of it, because there is no one to read it. The round's state machine
  // is still pumped at 1 Hz wherever you are: Focus ticks at 1 s whenever a round is running, on screen
  // or not, so slowing the hidden copies here cannot strand a round between two tabs.
  const live = useScreenLive();
  const now = useNow(live ? (timer.running ? 1000 : 30_000) : 60_000);
  const { c } = useTheme();
  const v = view(timer, now);

  // `view()` is a pure derivation from the checkpointed timestamps, so this header node cannot drift
  // from the real timer — and pumping it here means the store's discrete events (round done, the
  // 10-second warning) still fire even when Focus has never been mounted this launch. `timerPump`
  // returns at once when nothing is running, so an idle screen pays nothing for it.
  React.useEffect(() => { act.timerPump(now); }, [now]);

  /** Flow keeps crediting overtime past the round, but only up to a cap: past it the clock is frozen, so
   *  the header must stop pretending to count rather than bill focus that never happened. */
  const frozen = v.running && v.phase === 'focus' && v.leftMs === 0 && v.overMs >= FLOW_OVER_CAP_MS;

  // Phase and running are read off `v`, never off the raw store, and that is the whole point: `view()`
  // advances the state machine itself, so between two pumps the store can still be holding the
  // pre-transition values. Reading `v` everywhere means the label and the digits always describe the
  // same instant — otherwise a break that expires between pumps would read "on a break · 00:00" while
  // the focus clock is already running again.
  let icon = 'timer', time: string, label: string, tone: 'acc' | 'warn' | 'mut';
  if (v.phase === 'set') { icon = 'timer'; time = `${timer.planMin} min`; label = 'ready'; tone = 'mut'; }
  else if (v.phase === 'break') { icon = 'coffee'; time = fmtClock(v.breakLeftMs / 1000); label = 'on a break'; tone = 'acc'; }
  else if (v.leftMs === 0) { icon = 'timer'; time = `${v.overMs > 0 ? '+' : ''}${fmtClock(v.overMs / 1000)}`; label = frozen ? 'flow capped' : v.running ? 'flow' : 'round done'; tone = frozen || !v.running ? 'mut' : 'acc'; }
  else { icon = 'timer'; time = fmtClock(v.leftMs / 1000); label = v.running ? 'focusing' : 'paused'; tone = v.running ? 'acc' : 'warn'; }

  const spoken =
    v.phase === 'set' ? `Focus timer, ready, ${timer.planMin} minutes set`
      : v.phase === 'break' ? `Focus timer, on a break, ${mins(v.breakLeftMs)} left`
        : v.leftMs === 0
          ? frozen ? `Focus timer, flow overtime capped at ${FLOW_OVER_CAP_MS / 60_000} minutes`
            : v.running ? `Focus timer, flow overtime, ${mins(v.overMs)} over`
              : `Focus timer, round done, ${mins(v.overMs)} over`
          : v.running ? `Focus timer, focusing, ${mins(v.leftMs)} left`
            : `Focus timer, paused, ${mins(v.leftMs)} left`;
  const hint = v.phase === 'set' ? 'Opens the focus page to start a round.' : 'Opens the focus page to resume or end the session.';
  const idle = v.phase === 'set';

  return (
    <View style={style}>
      <Pressable onPress={() => { if (idle) act.focusOpen(null); else act.go('Focus'); }} testID="open-focus"
        accessibilityRole="button" accessibilityLiveRegion="none" accessibilityLabel={spoken} accessibilityHint={hint}
        android_ripple={{ color: hexA(c.ink, 0.14) }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 46, paddingLeft: 6, paddingRight: 4 }}>
        <Icon name={icon} size={19} sw={2} color={tone === 'acc' ? c.acc : tone === 'warn' ? c.warn : c.mut} />
        {/* Digits only once there is something to count — idle is just the glyph, so a dead slot never
            reads as a countdown to nothing. Tabular figures keep "12:34" from shivering every second,
            capped at FS like every other fixed-size row here. */}
        {!idle && <Txt f="type" s={18} maxFontSizeMultiplier={FS} accessibilityLiveRegion="none" style={{ letterSpacing: -0.4, fontVariant: ['tabular-nums'] }}>{time}</Txt>}
      </Pressable>
      {/* The header node is one accessibility button, so the phase word inside it would be swallowed by
          the button's own label. This is the Focus screen's arrangement (Focus.tsx:198): a separate,
          silent, polite node that speaks the phase when it *changes* — ready, focusing, paused, on a
          break, flow, round done — and stays quiet through the per-second digits. */}
      <Txt f="bold" s={13} accessibilityLiveRegion="polite" pointerEvents="none" style={{ position: 'absolute', left: 2, bottom: 0, opacity: 0 }}>{label}</Txt>
    </View>
  );
}
