import React, { useEffect } from 'react';
import { View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { fx } from '../services/fx';
import { useReduceMotion, useTheme } from './theme-context';
import { Icon, Txt } from './kit';

/**
 * Swipe a card right to finish, left to throw it away. The paper rustles while you drag; deleting crumples it into a ball that drops off the table.
 * Gestures are shortcuts: the same four actions are exposed to TalkBack through accessibilityActions.
 *
 * What this pass changed, and none of it is the crumple itself — the 1100 ms squash-rotate-fall is the
 * app's own designed sequence and `fx.crumple()` fires its thud at 620 ms to land with it, so retiming
 * it would desync the sound (`COORDINATION.md` §3 protects the system as well as the numbers):
 *
 *  · **Release velocity reaches the springs.** Both springs were starting from rest while the finger was
 *    still travelling. `expo-animation` names this case exactly — a reposition after a drag takes the
 *    gesture's velocity — and without it a flicked card reads as a stall then a correction.
 *  · **The pan is locked while a crumple is running.** `crumpled` is a shared value so the worklet can
 *    read it. Before, a right-swipe landing inside the 1100 ms could call `onComplete()` *and* leave the
 *    delete running: one card, two actions, and "swipe-delete two tasks in a row" as the test for it —
 *    a second delete landing inside the window must find nothing left to delete.
 *  · **The animated `borderRadius` is gone.** It was a *layout* property on a view holding text and an
 *    SVG, so it re-ran Yoga every frame for 550 ms. At 30 % scale the corner rounding is not perceptible,
 *    so it was paying a layout pass for nothing — the same class of cost A1 removed from page placement.
 *  · **`overflow` moved to the static style.** It was never animated.
 *  · **The delete resets before it writes.** `p`/`x` are cleared before `onDelete()`, so the React commit
 *    that re-mounts the card can never observe it at `p = 1` (invisible, 30 %, rotated 150°): a restored
 *    card must not be left invisible or scaled.
 */
export function SwipeCard({ children, onComplete, onDelete, onOpen, doneLabel = 'Done', disabled }: { children: React.ReactNode; onComplete: () => void; onDelete: () => void; onOpen?: () => void; doneLabel?: string; disabled?: boolean }) {
  const { c } = useTheme(), reduce = useReduceMotion(), x = useSharedValue(0), p = useSharedValue(0), w = useSharedValue(320), buzzed = useSharedValue(0);
  /** Read inside the worklet, so it cannot be a `useRef`: a ref is not observable from the UI thread. */
  const crumpled = useSharedValue(false);
  const rustle = () => fx.swipe(), commit = () => onComplete();
  const startCrumple = () => { if (crumpled.get()) return; crumpled.set(true); fx.crumple(); p.set(withTiming(1, { duration: reduce ? 180 : 1100, easing: Easing.linear }, (f) => { if (f) runOnJS(finishDelete)(); })); };
  const finishDelete = () => { /* first, so the re-mount cannot paint the folded card */ p.set(0); x.set(0); crumpled.set(false); onDelete(); };
  useEffect(() => () => { crumpled.set(false); }, [crumpled]);
  const pan = Gesture.Pan().enabled(!disabled).activeOffsetX([-14, 14]).failOffsetY([-12, 12])
    .onUpdate((e) => {
      if (crumpled.get()) return; // the card is already on its way off; the finger no longer owns it
      x.set(e.translationX);
      /* The rustle is a hysteresis gate at a FRACTION of the card, not at a fixed 70/40 dp: the commit
         points below are fractions too, so on a 320 dp screen the fixed numbers sat *past* the complete
         threshold and a card could commit without ever rustling. 0.2 of the width is ~76 dp on the
         reference device — the number that was there — and it stays ahead of the commit at every width. */
      if (Math.abs(e.translationX) > w.get() * 0.2 && !buzzed.get()) { buzzed.set(1); runOnJS(rustle)(); }
      if (Math.abs(e.translationX) < w.get() * 0.1) buzzed.set(0);
    })
    .onEnd((e) => {
      buzzed.set(0);
      if (crumpled.get()) return;
      if (e.translationX > w.get() * 0.28) { x.set(withSequence(withTiming(w.get() * 0.08, { duration: 120 }), withSpring(0, { damping: 16, mass: 1, velocity: e.velocityX }))); runOnJS(commit)(); }
      else if (e.translationX < -w.get() * 0.3) { runOnJS(startCrumple)(); }
      else x.set(withSpring(0, { damping: 18, stiffness: 240, mass: 1, velocity: e.velocityX }));
    });
  const card = useAnimatedStyle(() => {
    const k = p.get(), sq = interpolate(k, [0, 0.12, 0.3, 0.5], [1, 0.86, 0.55, 0.3], 'clamp'), sy = interpolate(k, [0, 0.12, 0.3, 0.5], [1, 0.72, 0.42, 0.3], 'clamp'), rot = interpolate(k, [0, 0.12, 0.25, 0.4, 0.5, 1], [0, -4, 7, -12, 16, 150], 'clamp') + x.get() / 40;
    const fall = interpolate(k, [0.5, 0.78, 0.86, 1], [0, 230, 205, 330], 'clamp');
    return { transform: [{ translateX: k > 0 ? interpolate(k, [0, 0.5], [x.get(), -w.get() * 0.28], 'clamp') : x.get() }, { translateY: fall }, { rotate: `${rot}deg` }, { scaleX: sq }, { scaleY: sy }], opacity: interpolate(k, [0.9, 1], [1, 0], 'clamp') };
  });
  const creases = useAnimatedStyle(() => ({ opacity: interpolate(p.get(), [0.06, 0.3], [0, 0.9], 'clamp') }));
  /* Each hint reaches full ink exactly at its own commit distance — 0.28 right, 0.30 left, deliberately
     a little harder to throw away than to finish. Before, both fades finished at a flat 90 dp: on the
     left that left a 3–13 dp dead zone where "Crumple" was already at full strength and a release still
     sprang the card back, which is the exact feel of a control that lies about its own threshold. */
  const bgR = useAnimatedStyle(() => ({ opacity: interpolate(x.get(), [0, w.get() * 0.28], [0, 1], 'clamp') })), bgL = useAnimatedStyle(() => ({ opacity: interpolate(x.get(), [-w.get() * 0.3, 0], [1, 0], 'clamp') }));
  const onA11y = (e: AccessibilityActionEvent) => { const n = e.nativeEvent.actionName; if (n === 'complete') onComplete(); else if (n === 'delete') onDelete(); else if (n === 'activate') onOpen?.(); };
  return (
    <View onLayout={(e) => { w.set(e.nativeEvent.layout.width); }} accessible={false}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 6, top: 0, bottom: 0, justifyContent: 'center' }, bgR]}><View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Icon name="check" color={c.ok} size={26} /><Txt f="bold" s={20} c="ok">{doneLabel}</Txt></View></Animated.View>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', right: 6, top: 0, bottom: 0, justifyContent: 'center' }, bgL]}><View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Txt f="bold" s={20} c="bad">Crumple</Txt><Icon name="trash" color={c.bad} size={24} /></View></Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[card, { overflow: 'hidden' }]} accessible accessibilityActions={[{ name: 'complete', label: doneLabel }, { name: 'delete', label: 'Delete' }, { name: 'activate', label: 'Open' }]} onAccessibilityAction={onA11y}>
          {children}
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, creases]}>
            <Svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none"><Path d="M0 8L22 14L40 6L58 18L80 9L100 16M10 40L28 24L50 30L66 20L86 34M30 0L36 20L24 40M70 0L62 18L74 40" stroke={c.ink} strokeOpacity={0.45} strokeWidth={0.7} fill="none" /></Svg>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}