import React, { useState } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { haptic } from '../services/haptics';

/** D-5 `drag`: the follow and the settle. D-23: lift after 250 ms, 150 ms to lift, scale 1.03. */
const DRAG = { damping: 18, stiffness: 220 } as const, LIFT_MS = 250, LIFT_IN = 150, LIFT_SCALE = 1.03;

/**
 * A card you can pick up (DESIGN.md D-23). Long-press 250 ms lifts it (scale 1.03, the lifted shadow, a haptic), it
 * follows the finger on the UI thread, and letting go reports where it landed. A tap is still a tap. Under reduced
 * motion nothing lifts: a long-press is a plain long-press, and the caller opens its "Move…" panel instead.
 *
 * `slotOf` must be a worklet: it maps the drag's offset to a slot id on every frame, and `onSlot` hears about it only
 * when it changes (the ghost), so the page re-renders a few times per drag, not 60 times a second.
 * TalkBack cannot drag: `actions` (Move…, Edit) are its way in.
 */
export function DragCard({ reduce, slotOf, onSlot, onDrop, onTap, onHold, label, hint, actions, onAction, testID, style, children }: {
  reduce: boolean;
  slotOf: (dx: number, dy: number) => number;
  onSlot: (slot: number | null) => void;
  onDrop: (slot: number) => void;
  onTap: () => void;
  onHold: () => void;
  label: string; hint?: string;
  actions?: { name: string; label: string }[];
  onAction?: (name: string) => void;
  testID?: string; style?: StyleProp<ViewStyle>; children: React.ReactNode;
}) {
  const x = useSharedValue(0), y = useSharedValue(0), up = useSharedValue(0), last = useSharedValue(-1);
  const [lifted, setLifted] = useState(false);
  const lift = () => { setLifted(true); haptic('peel'); };
  const land = (slot: number) => { setLifted(false); haptic('place'); onDrop(slot); };
  const pan = Gesture.Pan().enabled(!reduce).activateAfterLongPress(LIFT_MS)
    .onStart(() => { up.set(withTiming(1, { duration: LIFT_IN })); last.set(-1); runOnJS(lift)(); })
    .onUpdate((e) => {
      x.set(e.translationX); y.set(e.translationY);
      const s = slotOf(e.translationX, e.translationY);
      if (s !== last.get()) { last.set(s); runOnJS(onSlot)(s); }
    })
    .onEnd((e) => { runOnJS(land)(slotOf(e.translationX, e.translationY)); })
    .onFinalize(() => {
      x.set(withSpring(0, DRAG)); y.set(withSpring(0, DRAG)); up.set(withTiming(0, { duration: LIFT_IN }));
      runOnJS(onSlot)(null); runOnJS(setLifted)(false);
    });
  const hold = Gesture.LongPress().enabled(reduce).minDuration(LIFT_MS).onStart(() => { runOnJS(onHold)(); });
  const tap = Gesture.Tap().onEnd((_e, ok) => { if (ok) runOnJS(onTap)(); });
  const gesture = Gesture.Exclusive(pan, hold, tap);
  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: 1 + (LIFT_SCALE - 1) * up.get() }] }));
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View testID={testID} accessible accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint}
        accessibilityActions={[{ name: 'activate' }, { name: 'longpress', label: 'Move' }, ...(actions ?? [])]}
        onAccessibilityAction={(e) => { const n = e.nativeEvent.actionName; if (n === 'activate') onTap(); else if (n === 'longpress') onHold(); else onAction?.(n); }}
        style={[style, moving, lifted ? { zIndex: 10, boxShadow: '0 12px 28px rgba(0,0,0,0.22)' } : null]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
