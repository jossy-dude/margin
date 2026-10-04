import { Platform } from 'react-native';
import * as H from 'expo-haptics';

export type Feel = 'select' | 'tap' | 'soft' | 'heavy' | 'success' | 'warn' | 'error' | 'detent' | 'on' | 'off' | 'tick' | 'stamp' | 'crumple' | 'place' | 'peel' | 'fall';
let enabled = true;
export const setHapticsEnabled = (v: boolean) => { enabled = v; };

const ios: Record<Feel, () => Promise<void>> = {
  select: () => H.selectionAsync(), tap: () => H.impactAsync(H.ImpactFeedbackStyle.Light), soft: () => H.impactAsync(H.ImpactFeedbackStyle.Soft), heavy: () => H.impactAsync(H.ImpactFeedbackStyle.Heavy),
  success: () => H.notificationAsync(H.NotificationFeedbackType.Success), warn: () => H.notificationAsync(H.NotificationFeedbackType.Warning), error: () => H.notificationAsync(H.NotificationFeedbackType.Error),
  detent: () => H.impactAsync(H.ImpactFeedbackStyle.Rigid), on: () => H.impactAsync(H.ImpactFeedbackStyle.Light), off: () => H.impactAsync(H.ImpactFeedbackStyle.Soft),
  tick: () => H.impactAsync(H.ImpactFeedbackStyle.Rigid), stamp: () => H.impactAsync(H.ImpactFeedbackStyle.Medium), crumple: () => H.impactAsync(H.ImpactFeedbackStyle.Heavy),
  place: () => H.impactAsync(H.ImpactFeedbackStyle.Soft), peel: () => H.impactAsync(H.ImpactFeedbackStyle.Light), fall: () => H.impactAsync(H.ImpactFeedbackStyle.Medium),
};
const A = H.AndroidHaptics;
/** Android has real per-effect constants (clock tick, confirm, reject …); they are crisper than the generic impact levels. */
const android: Record<Feel, () => Promise<void>> = {
  select: () => H.performAndroidHapticsAsync(A.Segment_Tick), tap: () => H.performAndroidHapticsAsync(A.Keyboard_Tap), soft: () => H.performAndroidHapticsAsync(A.Virtual_Key), heavy: () => H.performAndroidHapticsAsync(A.Long_Press),
  success: () => H.performAndroidHapticsAsync(A.Confirm), warn: () => H.performAndroidHapticsAsync(A.Context_Click), error: () => H.performAndroidHapticsAsync(A.Reject),
  detent: () => H.performAndroidHapticsAsync(A.Segment_Tick), on: () => H.performAndroidHapticsAsync(A.Toggle_On), off: () => H.performAndroidHapticsAsync(A.Toggle_Off),
  tick: () => H.performAndroidHapticsAsync(A.Clock_Tick), stamp: () => H.performAndroidHapticsAsync(A.Long_Press), crumple: () => H.performAndroidHapticsAsync(A.Reject),
  place: () => H.performAndroidHapticsAsync(A.Virtual_Key), peel: () => H.performAndroidHapticsAsync(A.Gesture_Start), fall: () => H.performAndroidHapticsAsync(A.Gesture_End),
};
/** Silent where unsupported; never throws; never blocks the caller. */
export function haptic(f: Feel) {
  if (!enabled) return;
  const run = Platform.OS === 'android' ? android[f] : ios[f];
  try { run().catch(() => { if (Platform.OS === 'android') ios[f]().catch(() => undefined); }); } catch { /* unsupported */ }
}
/** A short hand-built sequence, e.g. a crumple rattle. */
export function hapticBurst(f: Feel, count: number, gapMs: number) { for (let i = 0; i < count; i++) setTimeout(() => haptic(f), i * gapMs); }
