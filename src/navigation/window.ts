/** Mount window for the book navigator: a screen renders only while it holds one of the two
 * newest visit stamps — the current screen and the one directly behind it, which is the
 * shuffle animation's backdrop. Everything older unmounts, so tab-hopping doesn't keep every
 * visited screen's tree, tickers and scroll containers alive for the whole session.
 *
 * `stamps` maps route name → visit counter (each navigation stamps the new route with
 * `latest + 1`), `latest` is the newest stamp. */
export const inMountWindow = (stamps: Record<string, number>, latest: number, name: string) =>
  (stamps[name] ?? -1) >= latest - 1;
