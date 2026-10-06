import { haptic, hapticBurst, setHapticsEnabled } from './haptics';
import { configureAudio, play } from './audio';
import type { AttStatus, Settings } from '../domain/types';

/** One call per meaningful state change: sound + haptic together, each respecting its own toggle and volume.
 *
 *  Every member here is called from somewhere. `tapeStick()` was the exception for one release: defined,
 *  mapped to a sound, and never requested — a leftover from when the break sticker got an arrival sound. It is
 *  gone rather than wired up, because giving the sticker's appearance a sound is an audio decision that needs
 *  ears, and there are none on this machine (`qa/COORDINATION.md` §0). `Feel: 'error'` was the other orphan and
 *  it did not need deleting — see `denied()` below. */
export function configureFx(s: Settings) { configureAudio(s.soundOn, s.soundVol); setHapticsEnabled(s.hapticsOn); }
const STAMP: Record<AttStatus, Parameters<typeof play>[0]> = { p: 'stamp-here', l: 'stamp-late', n: 'stamp-late', a: 'stamp-absent', s: 'stamp-sick', c: 'stamp-cancel', t: 'stamp-cancel' };
export const fx = {
  page() { play('place'); haptic('place'); },   // 0.22s, matched to PLACE_MS=200 in navigation/window.ts
  swipe() { play('shuffle'); haptic('soft'); },
  crumple() { play('crumple'); hapticBurst('crumple', 4, 70); setTimeout(() => { play('thud'); haptic('fall'); }, 620); },
  stamp(s: AttStatus) { play(STAMP[s]); haptic(s === 'a' ? 'heavy' : s === 'p' ? 'stamp' : 'tap'); },
  /** `'error'`, not `'warn'`. It is Android's `Reject` and iOS's `NotificationFeedbackType.Error` — a refusal,
   *  where `warn` is `Context_Click`, a menu press. `prompt.md` V7 asks for a *distinct* feel for "denied
   *  (locked cell)" and this was the feel that was mapped and never requested. Nothing else in the app is a
   *  refusal, so it cannot be confused with another event. */
  denied() { haptic('error'); },
  done() { play('done'); haptic('success'); },
  undone() { play('toggle-off'); haptic('off'); },
  chime() { play('notify'); haptic('success'); },
  toggle(on: boolean) { play(on ? 'toggle-on' : 'toggle-off'); haptic(on ? 'on' : 'off'); },
  select() { haptic('select'); },
  tap() { haptic('tap'); },
  tick(odd: boolean) { play(odd ? 'tick' : 'tock'); haptic('tick'); },
  detent(velocity: number) { const i = velocity > 900 ? 4 : velocity > 450 ? 3 : velocity > 150 ? 2 : 1; play(`detent-${i}` as 'detent-1'); haptic('detent'); },
  bump() { play('bump'); haptic('heavy'); },
  start() { play('thunk'); haptic('heavy'); },
  clack() { play('clack'); haptic('tap'); },
  blip() { play('blip'); haptic('warn'); },
  roundDone() { play('round-done'); hapticBurst('success', 3, 140); },
  breakStart() { play('break-start'); haptic('tap'); },
  nudge() { play('nudge'); haptic('warn'); },
  peel() { play('tape-peel'); haptic('peel'); },
  fall() { play('flutter'); setTimeout(() => { play('thud'); haptic('fall'); }, 780); },
};
