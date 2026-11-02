/**
 * Scrap's moods and cues: the one table a screen reaches for. Pure, so it is testable without a renderer.
 *
 * A mood is a held pose (which mouth, how far each lid is closed, a tilt, whether he blushes); a cue is a
 * one-off reaction played over whatever mood is held. `lidTop`/`lidLow` run 0 (open) … 1 (closed);
 * `pupil` scales the pupils (wide-eyed surprise shrinks them).
 */
export type ScrapMood = 'idle' | 'happy' | 'curious' | 'wow' | 'sleepy' | 'worried' | 'proud' | 'focused';
export type ScrapCueKind = 'hop' | 'celebrate' | 'wow' | 'nod' | 'shake';
export interface ScrapCue { kind: ScrapCueKind; n: number }

export interface Pose { mouth: 'smile' | 'grin' | 'o' | 'wow' | 'flat' | 'wobble'; lidTop: number; lidLow: number; tilt: number; cheeks: boolean; pupil: number; say: string }
export const MOODS: Record<ScrapMood, Pose> = {
  idle: { mouth: 'smile', lidTop: 0, lidLow: 0, tilt: 0, cheeks: false, pupil: 1, say: 'friendly' },
  happy: { mouth: 'grin', lidTop: 0, lidLow: 0.62, tilt: -3, cheeks: true, pupil: 1, say: 'delighted' },
  curious: { mouth: 'o', lidTop: 0.08, lidLow: 0, tilt: 5, cheeks: false, pupil: 1, say: 'curious' },
  wow: { mouth: 'wow', lidTop: 0, lidLow: 0, tilt: 0, cheeks: false, pupil: 0.82, say: 'amazed' },
  sleepy: { mouth: 'flat', lidTop: 0.55, lidLow: 0.12, tilt: -4, cheeks: false, pupil: 1, say: 'sleepy' },
  worried: { mouth: 'wobble', lidTop: 0.22, lidLow: 0, tilt: 3, cheeks: false, pupil: 0.9, say: 'worried' },
  proud: { mouth: 'smile', lidTop: 0.05, lidLow: 0.56, tilt: -2, cheeks: true, pupil: 1, say: 'proud' },
  focused: { mouth: 'flat', lidTop: 0.3, lidLow: 0, tilt: 0, cheeks: false, pupil: 1, say: 'focused' },
};

/** Gaze for a point (finger) relative to Scrap's centre, as −1…1 on each axis. Saturates softly, so a finger
 *  across the screen and one just past his edge both read as "over there" rather than snapping. */
export function gazeAt(dx: number, dy: number, reach = 160): { x: number; y: number } {
  'worklet';
  const sx = dx / reach, sy = dy / reach;
  return { x: sx / Math.sqrt(1 + sx * sx), y: sy / Math.sqrt(1 + sy * sy) };
}
/** Gaze while typing: the eyes read along a field below him, left to right as the text grows. */
export const gazeAlong = (chars: number, max = 22) => ({ x: -0.75 + Math.min(1, chars / max) * 1.5, y: 0.85 });

