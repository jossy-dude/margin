/**
 * The mascot's contract with its Rive file — the one map a restyled remix changes (spec O8).
 *
 * Teddy ("Animated Login Screen" by JcToon, rive.app/community/2244-4437, CC BY 4.0): artboard `Teddy`,
 * state machine `Login Machine`. Its inputs mean, in onboarding terms: `numLook` 0–100 is where the eyes
 * go (a finger's x, the caret in a name), `isChecking` is "reading along", `isHandsUp` covers the eyes
 * (quiet during class), and the two triggers celebrate or wince.
 */
export const RIG = {
  file: 'teddy.riv',
  artboard: 'Teddy',
  machine: 'Login Machine',
  look: 'numLook',
  checking: 'isChecking',
  handsUp: 'isHandsUp',
  success: 'trigSuccess',
  fail: 'trigFail',
} as const;

/** Credit line, shown in About and recorded in `assets/rive/LICENSES.md`. */
export const MASCOT_CREDIT = 'Teddy by JcToon (rive.app), CC BY 4.0';

/** What the page tells the mascot. `cue` fires a trigger once per change of `n`. */
export interface MascotProps {
  size: number;
  /** 0–100, where the eyes look. */
  look?: number;
  checking?: boolean;
  handsUp?: boolean;
  cue?: { kind: 'success' | 'fail'; n: number } | null;
  /** Reduce-motion: hold still (the page carries a caption instead of a reaction). */
  still?: boolean;
  testID?: string;
}

/** Where the eyes go for a finger at `x` across a page `width` wide, clamped to the rig's 0–100. */
export const lookAt = (x: number, width: number) => (width > 0 ? Math.max(0, Math.min(100, (x / width) * 100)) : 50);
/** Where the eyes go while typing: they follow the caret along a name, the way Teddy reads a field. */
export const lookAlong = (chars: number) => Math.max(0, Math.min(100, chars * 3));
