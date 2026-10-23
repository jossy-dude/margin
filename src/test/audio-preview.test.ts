/**
 * The Sound page's Play button is only honest if three separate facts agree: the row's `SoundGroup`
 * has a sample, the sample names a file that is actually bundled, and that file belongs to the same
 * group so the slider sitting next to the button is the volume the preview really uses.
 *
 * These are exactly the three ways the button could do nothing while every other test stayed green,
 * so they are pinned here rather than being copied into the sheet and left to drift.
 */
import { PRELOAD, SAMPLE, SOUND_NAMES, groupOf, previewSilence } from '../services/audio';
import { DEFAULT_SETTINGS, SOUND_GROUPS } from '../domain/defaults';
import type { SoundGroup } from '../domain/types';

jest.mock('expo-audio', () => ({
  createAudioPlayer: () => ({ play: () => {}, pause: () => {}, seekTo: () => {}, remove: () => {} }),
  setAudioModeAsync: async () => {},
}));

const GROUPS = SOUND_GROUPS.map((g) => g.id);
const ids = (s: Record<string, unknown>) => Object.keys(s).sort();

describe('every Sound page row can actually preview itself', () => {
  it('has a sample for every group the page draws, and no sample for a group it does not', () => {
    expect(ids(SAMPLE)).toEqual([...GROUPS].sort());
  });

  it('names a bundled file for each one — not a key that only exists in the map', () => {
    for (const g of GROUPS) expect(SOUND_NAMES).toContain(SAMPLE[g]);
  });

  it('routes each sample back to the group whose slider rides with it', () => {
    for (const g of GROUPS) expect({ g, resolved: groupOf(SAMPLE[g]) }).toEqual({ g, resolved: g });
  });

  it('finds a real volume for every group, so a preview cannot read `undefined`', () => {
    for (const g of GROUPS) {
      const v = DEFAULT_SETTINGS.soundVol[g];
      expect({ g, numeric: typeof v === 'number', finite: Number.isFinite(v) }).toEqual({ g, numeric: true, finite: true });
    }
    expect(ids(DEFAULT_SETTINGS.soundVol)).toEqual([...GROUPS].sort());
  });
});

describe('boot warms every file a Play button can ask for', () => {
  /* The failure this pins: `preloadAudio()` kept its own hand-written list, so `done`, `notify` and
     `tape-peel` were never allocated. On web a cold player still plays, which is why the sheet looked
     fine there; on Android the first tap allocated a player and called `play()` before the asset was
     decoded, which is a plausible silent first tap. */
  it('preloads every sample the Sound page can preview', () => {
    for (const g of GROUPS) expect({ g, warm: PRELOAD.includes(SAMPLE[g]) }).toEqual({ g, warm: true });
  });

  it('warms each file once, so a derived list cannot grow duplicate players', () => {
    expect(new Set(PRELOAD).size).toBe(PRELOAD.length);
  });
});

describe('the Play button says why it would be silent instead of answering with nothing', () => {
  const loud = { ...DEFAULT_SETTINGS.soundVol, paper: 0.8 };

  it('is quiet (null) when the group can be heard', () => {
    expect(previewSilence('paper', 'Paper', { soundOn: true, soundVol: loud })).toBeNull();
  });

  it('names the master switch when the whole app is muted', () => {
    expect(previewSilence('paper', 'Paper', { soundOn: false, soundVol: loud })).toMatch(/sound is off/i);
  });

  it('names the row and the reason when that row sits at zero', () => {
    const why = previewSilence('paper', 'Paper', { soundOn: true, soundVol: { ...loud, paper: 0 } });
    expect(why).toContain('Paper');
    expect(why).toMatch(/0%/);
  });

  it('does not blame the master switch for a group that is merely turned down', () => {
    const why = previewSilence('clock', 'Clock tick', { soundOn: true, soundVol: { ...loud, clock: 0 } });
    expect(why).not.toMatch(/sound is off/i);
    expect(why).toContain('Clock tick');
  });

  it('treats a missing group volume as silent rather than loud', () => {
    const bad = { paper: 0.8 } as Record<SoundGroup, number>;
    expect(previewSilence('dial', 'Focus dial', { soundOn: true, soundVol: bad })).toContain('Focus dial');
  });
});
