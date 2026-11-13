/** v0.7 U5 — the bubble's states and words (DESIGN.md D-7). */
import { Bubble, BubbleRow, bubbleOf, bubbleWords } from '../ui/Bubble';

describe('bubble', () => {
  it('maps attendance to a bubble', () => {
    expect(bubbleOf({ status: 'p' })).toBe('filled');
    expect(bubbleOf({ status: 'p', why: 'late' })).toBe('half');
    expect(bubbleOf({ status: 'a', why: 'sick' })).toBe('absent');
    expect(bubbleOf({ status: 'c' })).toBe('struck');
    expect(bubbleOf(null)).toBe('empty');
    expect(bubbleOf(undefined, true)).toBe('now');
  });
  it('every state has words for TalkBack', () => {
    expect((['empty', 'filled', 'absent', 'half', 'struck', 'now'] as const).map(bubbleWords)).toEqual(['Not marked', 'Present', 'Absent', 'Present, late', 'Cancelled', 'Now']);
    expect(typeof Bubble).toBe('function'); expect(typeof BubbleRow).toBe('function');
  });
});
