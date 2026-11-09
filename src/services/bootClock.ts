/**
 * Cold-start timings (v0.6, owner: "loading once the phone restarts is very bad"). Each phase of bring-up
 * stamps a mark; the list is printed once to the log under `[margin-boot]` (read with `adb logcat -s
 * ReactNativeJS`) and kept for Settings → Diagnostics. `t0` is when this module was first evaluated, i.e.
 * when the JS bundle reached the app's own code; the native part before it shows in Android's own
 * "Displayed …" log line.
 */
const t0 = Date.now();
const list: { name: string; ms: number }[] = [];
let printed = false;
export function mark(name: string) { if (!list.some((m) => m.name === name)) list.push({ name, ms: Date.now() - t0 }); }
export const bootMarks = (): readonly { name: string; ms: number }[] => list;
/** Print the marks once, after the first frame. */
export function reportBoot() {
  if (printed) return; printed = true;
  console.log(`[margin-boot] ${list.map((m) => `${m.name}=${m.ms}`).join(' ')}`);
}
