/** v0.7 U3 — which sky is drawn for each setting (DESIGN.md D-3). */
import { Sky, skyFor } from '../ui/Sky';
jest.mock('react-native-reanimated', () => ({ __esModule: true, default: { View: 'View' }, useSharedValue: (v: number) => ({ get: () => v, set: () => {} }), useAnimatedStyle: () => ({}), withTiming: (v: number) => v }));
jest.mock('../ui/theme-context', () => ({ useReduceMotion: () => false }));

describe('the sky ground', () => {
  it('live follows the clock; still keeps one per theme; off draws none', () => {
    expect(skyFor('live', 'light', 8 * 60)).toBe('morning');
    expect(skyFor('live', 'dark', 23 * 60)).toBe('night');
    expect(skyFor('still', 'light', 23 * 60)).toBe('noon');
    expect(skyFor('still', 'dark', 12 * 60)).toBe('night');
    expect(skyFor('off', 'light', 600)).toBeNull();
    expect(typeof Sky).toBe('function');
  });
});
