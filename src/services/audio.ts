import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import type { SoundGroup } from '../domain/types';

/* Metro needs literal require() paths, so every asset is listed once here. Durations come from assets/sounds/manifest.json (generated). */
const SRC = {
  place: require('../../assets/sounds/place.wav'), shuffle: require('../../assets/sounds/shuffle.wav'), crumple: require('../../assets/sounds/crumple.wav'), thud: require('../../assets/sounds/thud.wav'), flutter: require('../../assets/sounds/flutter.wav'),
  tick: require('../../assets/sounds/tick.wav'), tock: require('../../assets/sounds/tock.wav'),
  'stamp-here': require('../../assets/sounds/stamp-here.wav'), 'stamp-late': require('../../assets/sounds/stamp-late.wav'), 'stamp-absent': require('../../assets/sounds/stamp-absent.wav'), 'stamp-sick': require('../../assets/sounds/stamp-sick.wav'), 'stamp-cancel': require('../../assets/sounds/stamp-cancel.wav'),
  done: require('../../assets/sounds/done.wav'), notify: require('../../assets/sounds/notify.wav'), 'toggle-on': require('../../assets/sounds/toggle-on.wav'), 'toggle-off': require('../../assets/sounds/toggle-off.wav'),
  'detent-1': require('../../assets/sounds/detent-1.wav'), 'detent-2': require('../../assets/sounds/detent-2.wav'), 'detent-3': require('../../assets/sounds/detent-3.wav'), 'detent-4': require('../../assets/sounds/detent-4.wav'),
  bump: require('../../assets/sounds/bump.wav'), thunk: require('../../assets/sounds/thunk.wav'), clack: require('../../assets/sounds/clack.wav'), blip: require('../../assets/sounds/blip.wav'), 'round-done': require('../../assets/sounds/round-done.wav'),
  'break-start': require('../../assets/sounds/break-start.wav'), 'tape-peel': require('../../assets/sounds/tape-peel.wav'),
  /* Its own file, so muting the clock tick can never mute the off-track warning. Moved to assets/sounds/ when the candidate set is promoted. */
  nudge: require('../../assets/sounds/nudge.wav'),
} as const;
export type SoundName = keyof typeof SRC;
/** Every sound this build can load. The Sound page's preview map is checked against it, so a sample
 *  naming a file nobody bundled is a failing test rather than a tap that does nothing. */
export const SOUND_NAMES = Object.keys(SRC) as SoundName[];
/**
 * The one sound each Sound page row previews. It lives here, next to `SRC` and `groupOf`, because the
 * preview only tells the truth if three things agree: the row's `SoundGroup` has an entry here, the
 * entry names a file that is bundled, and the file belongs to that group so the slider next to it is
 * the volume the preview actually uses. `audio-preview.test.ts` asserts all three.
 */
export const SAMPLE: Record<SoundGroup, SoundName> = { paper: 'place', stamp: 'stamp-here', done: 'done', notify: 'notify', toggle: 'toggle-on', dial: 'detent-3', clock: 'tick', break: 'tape-peel' };
/**
 * Why a preview tap would be silent, or `null` when it can be heard.
 *
 * The Play buttons used to call `play()` and throw the answer away, so a group at 0 % (or the master
 * switch off) looked exactly like a broken sound: the tap answered with nothing at all. This is the
 * sentence the control says instead, and it is a pure function so the wording is testable.
 */
export function previewSilence(g: SoundGroup, label: string, s: { soundOn: boolean; soundVol: Record<SoundGroup, number> }): string | null {
  if (!s.soundOn) return 'Sound is off — turn it on above to hear a preview.';
  if ((s.soundVol[g] ?? 0) <= 0) return `${label} is at 0% — raise its volume to hear it.`;
  return null;
}
/* Durations of the files actually loaded above. Regenerate from manifest.json when the set is promoted. */
const SECONDS: Record<SoundName, number> = { place: 0.22, shuffle: 0.5, crumple: 0.62, thud: 0.32, flutter: 0.55, tick: 0.05, tock: 0.05, 'stamp-here': 0.22, 'stamp-late': 0.2, 'stamp-absent': 0.36, 'stamp-sick': 0.3, 'stamp-cancel': 0.25, done: 0.85, notify: 1.2, 'toggle-on': 0.06, 'toggle-off': 0.06, 'detent-1': 0.09, 'detent-2': 0.09, 'detent-3': 0.09, 'detent-4': 0.09, bump: 0.18, thunk: 0.24, clack: 0.12, blip: 0.2, 'round-done': 0.95, 'break-start': 0.9, 'tape-peel': 0.66, nudge: 0.2 };
/** Which volume slider governs a sound. Exported because the Sound page's preview must be shown to
 *  ride the row it sits on — `SAMPLE` maps a group to a sound, and this maps the sound back, so the
 *  two cannot drift apart silently. */
export const groupOf = (n: SoundName): SoundGroup => n.startsWith('stamp') ? 'stamp' : n.startsWith('detent') || ['bump', 'thunk', 'clack', 'blip', 'round-done'].includes(n) ? 'dial' : n === 'tick' || n === 'tock' ? 'clock' : n.startsWith('toggle') ? 'toggle' : n === 'done' ? 'done' : n === 'notify' ? 'notify' : n === 'break-start' || n === 'tape-peel' ? 'break' : 'paper';
/** higher wins when the voice cap is reached; tiny ticks are the first to be dropped */
const PRIO = (n: SoundName) => (n === 'tick' || n === 'tock' || n.startsWith('detent') ? 1 : n === 'notify' || n === 'round-done' || n === 'done' ? 4 : n.startsWith('toggle') ? 2 : 3);

/* A sweep of the dial retriggers far faster than a 75 ms file lasts. Handing out a player that is
   still sounding is what turned a fast drag into machine-gun clipping, so the drag-critical sounds
   get a deep pool and every trigger must find a player that is neither sounding nor mid-seek. */
/* Device test, v0.5 dev build on the owner's Galaxy A51: with 3 players per sound and 6 per drag sound,
   boot preloading alone held ~80 ExoPlayer AudioTracks, Android refused the rest ("UnsupportedOperation
   Exception: Cannot create AudioTrack", 206 times in one session), and not one player ever reached
   `started` — the same silent app `dumpsys audio` showed on v0.1.0. So: one player per sound, two for the
   drag sounds, and never more than `MAX_PLAYERS` alive at once (least recently used are released). */
const POOL = 1, DRAG_POOL = 2, MAX_PLAYERS = 14;
const isDrag = (n: SoundName) => n.startsWith('detent') || n === 'tick' || n === 'tock';
/** A ratchet pawl cannot click faster than this; without it one layer retriggers several times
    inside a single file and the velocity mapping degrades into noise. */
const GUARD = (n: SoundName) => (n.startsWith('detent') ? 26 : n === 'tick' || n === 'tock' ? 40 : 0);

const VOICES = 4;
let ready = false, master = true, vols: Record<SoundGroup, number> | null = null;
/* A browser refuses `play()` before the document has been activated, and Expo's web player drops that
   promise inside itself — `AudioPlayer.web.js` calls `this.media.play()` and never catches — so the refusal
   arrives as an *uncaught* page error instead of a `false` from here. The audit caught exactly that on every
   fresh load, before any tap (audit UX-7); it is `Onboarding`'s mount effect playing the placement sound on
   a document no finger has touched yet. There is nothing to catch at our own call sites: `pl.play()` is
   typed `void` and the promise is created and dropped one frame down. So the ask is not made. Nothing
   audible is lost — an unactivated document was never going to play it — and the flag is set from the
   *capture* phase of the first real gesture, i.e. before the handler whose own sound that gesture runs, so
   the first tap still answers. Where there is no `document` (native, and jest) the gate is open from the
   start: that platform has no autoplay policy and behaves exactly as it did. */
let activated = typeof document === 'undefined';
if (!activated) {
  const mark = () => { activated = true; };
  document.addEventListener('pointerdown', mark, { capture: true, once: true });
  document.addEventListener('keydown', mark, { capture: true, once: true });
}
const pools = new Map<SoundName, AudioPlayer[]>();
type Voice = { end: number; prio: number; pl: AudioPlayer };
let active: Voice[] = [];
/** player -> token while its seek is in flight, so a fast drag cannot hand the same player out twice */
const seeking = new Map<AudioPlayer, number>();
/** players already run at least once; a fresh one is still at position 0 and needs no seek */
const played = new WeakSet<AudioPlayer>();
const lastAt = new Map<SoundName, number>();
let token = 0;

export function configureAudio(on: boolean, v: Record<SoundGroup, number>) { master = on; vols = v; }
export async function initAudio() {
  if (ready) return; ready = true;
  try { await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }); } catch { /* best effort */ }
}
function pool(n: SoundName): AudioPlayer[] {
  let p = pools.get(n);
  if (p) { pools.delete(n); pools.set(n, p); return p; } // most recently used goes to the back
  p = Array.from({ length: isDrag(n) ? DRAG_POOL : POOL }, () => createAudioPlayer(SRC[n]));
  pools.set(n, p);
  let live = 0; for (const x of pools.values()) live += x.length;
  for (const [k, old] of pools) {
    if (live <= MAX_PLAYERS) break;
    if (k === n) continue;
    pools.delete(k); live -= old.length;
    for (const pl of old) { seeking.delete(pl); try { pl.remove(); } catch { /* already gone */ } }
    active = active.filter((a) => !old.includes(a.pl));
  }
  return p;
}
/**
 * What boot warms: the latency-critical dial and stamp sounds, plus every file the Sound page's Play
 * button can ask for. It is derived from `SAMPLE` instead of being a second hand-written list, because
 * that list is exactly how `done`, `notify` and `tape-peel` stayed cold — their rows allocated a player
 * and called `play()` before the asset was decoded, which on Android is a plausible silent first tap.
 * `audio-preview.test.ts` asserts the cover, so adding a preview cannot reintroduce it.
 */
export const PRELOAD: SoundName[] = [...new Set<SoundName>([
  'detent-1', 'detent-2', 'detent-3', 'detent-4', 'tick', 'tock', 'stamp-here', 'toggle-on', 'toggle-off', 'place',
  ...Object.values(SAMPLE),
])];
/** Warm those sounds so the first dial detent, and the first Play tap, are not late. */
export function preloadAudio() { PRELOAD.forEach((n) => { try { pool(n); } catch { /* ignore */ } }); }
/** v0.6 cold start: the same warm-up, one player per 40 ms instead of 14 synchronous native loads before the
 *  first frame. A sound asked for before its turn simply builds its player then (`pool` is lazy). */
export function preloadAudioSoon(step = 40): () => void {
  let i = 0, t: ReturnType<typeof setTimeout> | null = null;
  const next = () => { const n = PRELOAD[i++]; if (!n) { t = null; return; } try { pool(n); } catch { /* ignore */ } t = setTimeout(next, step); };
  t = setTimeout(next, step);
  return () => { if (t) clearTimeout(t); t = null; };
}

function stop(pl: AudioPlayer) { seeking.delete(pl); try { pl.pause(); } catch { /* ignore */ } }
/** pause, await the seek, then play. play() must stay synchronous, so the resume is chained off the
    seek and the player stays reserved for the whole chain; a resumed player that was stopped or
    handed out again meanwhile is dropped by the token check. A player that has never run is still
    at position 0, so it starts straight away instead of waiting on a seek that would block on the
    asset load. */
function start(pl: AudioPlayer, g: number) {
  const mine = ++token;
  seeking.set(pl, mine);
  try {
    pl.pause();
    pl.volume = g;
    if (!played.has(pl)) {
      played.add(pl); seeking.delete(pl); pl.play(); return;
    }
    void Promise.resolve(pl.seekTo(0)).catch(() => { /* ignore */ }).then(() => {
      if (seeking.get(pl) !== mine) return;
      seeking.delete(pl);
      try { pl.play(); } catch { /* ignore */ }
    });
  } catch { seeking.delete(pl); }
}

export function play(n: SoundName, gain = 1): boolean {
  if (!master || !vols || !activated) return false;
  const g = vols[groupOf(n)] * gain; if (g <= 0.01) return false;
  const now = Date.now();
  if (now - (lastAt.get(n) ?? -1e9) < GUARD(n)) return false;
  active = active.filter((a) => a.end > now);
  if (active.length >= VOICES) {
    let li = 0;
    for (let i = 1; i < active.length; i++) if ((active[i] as Voice).prio <= (active[li] as Voice).prio) li = i;
    const low = active[li] as Voice;
    if (low.prio >= PRIO(n)) return false;
    active.splice(li, 1);
    stop(low.pl);
  }
  try {
    const sounding = new Set(active.map((a) => a.pl));
    const free = pool(n).find((x) => !sounding.has(x) && !seeking.has(x));
    if (!free) return false;
    lastAt.set(n, now);
    start(free, Math.min(1, g));
    active.push({ end: now + SECONDS[n] * 1000, prio: PRIO(n), pl: free });
    return true;
  } catch { return false; }
}
