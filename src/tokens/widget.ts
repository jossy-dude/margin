/** v0.7.7.8 (SPEC §5): colours the home-screen widgets take from the skin, worked out here and sent with `setLook`. */

/** v0.7.7.8: the widget's bar on the widget's own surface (the deck, or Daylight's sky). The skin's `now` when it shows
 *  3:1 against that surface; else the deck's ink, so a paper skin's brown accent never vanishes into a dark deck. */
export const widgetBar = (now: string, deck: string, deckInk: string, sky: boolean) => {
  if (sky) return now;
  const l = (h: string) => { const [r, g, b] = [1, 3, 5].map((i) => { const s = parseInt(h.slice(i, i + 2), 16) / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!; };
  const x = l(now), y = l(deck);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) >= 3 ? now.slice(0, 7) : deckInk;
};
