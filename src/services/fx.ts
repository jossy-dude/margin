import { haptic, hapticBurst, setHapticsEnabled } from './haptics';
import { configureAudio, play } from './audio';
import type { AttStatus, AttWhy, Settings } from '../domain/types';

/** One call per meaningful state change: sound + haptic together, each respecting its own toggle and volume.
 *
 *  Every member here is called from somewhere. `tapeStick()` was the exception for one release: defined,
 *  mapped to a sound, and never requested — a leftover from when the break sticker got an arrival sound. It is
 *  gone rather than wired up, because giving the sticker's appearance a sound is an audio decision that needs
 *  ears, and there are none on this machine (`qa/COORDINATION.md` §0). `Feel: 'error'` was the other orphan and
 *  it did not need deleting — see `denied()` below. */
export function configureFx(s: Settings) { configureAudio(s.soundOn, s.soundVol); setHapticsEnabled(s.hapticsOn); }
const STAMP: Record<AttStatus, Parameters<typeof play>[0]> = { p: 'mark', a: 'absent', c: 'cancel' };
/** The why picks the sound where one exists: a late entry still sounds late, a sick day sounds sick. */
const stampSound = (s: AttStatus, why: AttWhy) => (s === 'p' && why === 'late' ? 'mark_late' : s === 'a' && why === 'sick' ? 'absent_sick' : STAMP[s]);
export const fx = {
  page() { play('page'); haptic('place'); },   // 0.3 s, starts with PLACE_MS=200 in navigation/window.ts
  swipe() { play('slide'); haptic('soft'); },
  crumple() { play('crumple'); hapticBurst('crumple', 4, 70); setTimeout(() => haptic('fall'), 520); },
  stamp(s: AttStatus, why: AttWhy = '') { play(stampSound(s, why)); haptic(s === 'a' ? 'heavy' : s === 'p' ? 'stamp' : 'tap'); },
  /** `'error'`, not `'warn'`. It is Android's `Reject` and iOS's `NotificationFeedbackType.Error` — a refusal,
   *  where `warn` is `Context_Click`, a menu press. A *distinct* feel is wanted for "denied
   *  (locked cell)" and this was the feel that was mapped and never requested. Nothing else in the app is a
   *  refusal, so it cannot be confused with another event. */
  denied() { haptic('error'); },
  done() { play('done'); haptic('success'); },
  undone() { play('done_undone'); haptic('off'); },
  chime() { play('chime'); haptic('success'); },
  toggle(on: boolean) { play(on ? 'pop' : 'pop_off'); haptic(on ? 'on' : 'off'); },
  select() { haptic('select'); },
  tap() { haptic('tap'); },
  tick(odd: boolean) { play(odd ? 'tick' : 'tick_tock'); haptic('tick'); },
  detent(velocity: number) { play(velocity > 450 ? 'detent_c' : velocity > 150 ? 'detent_b' : 'detent_a'); haptic('detent'); },
  bump() { play('knock_low'); haptic('heavy'); },
  start() { play('start'); haptic('heavy'); },
  clack() { play('click'); haptic('tap'); },
  blip() { play('low'); haptic('warn'); },
  roundDone() { play('round'); hapticBurst('success', 3, 140); },
  breakStart() { play('break'); haptic('tap'); },
  nudge() { play('knock'); haptic('warn'); },
  peel() { play('peel'); haptic('peel'); },
  fall() { play('slide'); setTimeout(() => haptic('fall'), 780); },
};
