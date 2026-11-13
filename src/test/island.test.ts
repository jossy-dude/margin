/** v0.7 U6 — the island's collapse rule and the space a page keeps for it (no content hidden under it). */
import { ISLAND_COLLAPSED_H, ISLAND_H, Island, islandCollapsed, islandSpace } from '../ui/Island';
jest.mock('../ui/kit', () => ({ Icon: () => null }));

describe('nav island', () => {
  it('collapses scrolling down past 64 dp, expands on any scroll up, never at the top', () => {
    expect(islandCollapsed(100, 140, false)).toBe(true);
    expect(islandCollapsed(140, 120, true)).toBe(false);
    expect(islandCollapsed(140, 142, true)).toBe(true);
    expect(islandCollapsed(80, 30, true)).toBe(false);
  });
  it('a page ends with enough space for the whole island and its gap', () => {
    expect(islandSpace(24)).toBe(ISLAND_H + 16 + 24 + 16);
    expect(ISLAND_COLLAPSED_H).toBeLessThan(ISLAND_H);
    expect(typeof Island).toBe('function');
  });
});
