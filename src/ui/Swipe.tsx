import React, { useEffect, useRef } from 'react';
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
 */
export function SwipeCard({ children, onComplete, onDelete, onOpen, doneLabel = 'Done', disabled }: { children: React.ReactNode; onComplete: () => void; onDelete: () => void; onOpen?: () => void; doneLabel?: string; disabled?: boolean }) {
  const { c } = useTheme(), reduce = useReduceMotion(), x = useSharedValue(0), p = useSharedValue(0), w = useSharedValue(320), crumpling = useRef(false), buzzed = useSharedValue(0);
  const rustle = () => fx.swipe(), commit = () => onComplete(), startCrumple = () => { if (crumpling.current) return; crumpling.current = true; fx.crumple(); p.value = withTiming(1, { duration: reduce ? 180 : 1100, easing: Easing.linear }, (f) => { if (f) runOnJS(finishDelete)(); }); };
  const finishDelete = () => { onDelete(); crumpling.current = false; p.value = 0; x.value = 0; };
  useEffect(() => () => { crumpling.current = false; }, []);
  const pan = Gesture.Pan().enabled(!disabled).activeOffsetX([-14, 14]).failOffsetY([-12, 12])
    .onUpdate((e) => { x.value = e.translationX; if (Math.abs(e.translationX) > 70 && !buzzed.value) { buzzed.value = 1; runOnJS(rustle)(); } if (Math.abs(e.translationX) < 40) buzzed.value = 0; })
    .onEnd((e) => { buzzed.value = 0; if (e.translationX > w.value * 0.28) { x.value = withSequence(withTiming(w.value * 0.08, { duration: 120 }), withSpring(0, { damping: 16 })); runOnJS(commit)(); } else if (e.translationX < -w.value * 0.3) { runOnJS(startCrumple)(); } else x.value = withSpring(0, { damping: 18, stiffness: 240 }); });
  const card = useAnimatedStyle(() => {
    const k = p.value, sq = interpolate(k, [0, 0.12, 0.3, 0.5], [1, 0.86, 0.55, 0.3], 'clamp'), sy = interpolate(k, [0, 0.12, 0.3, 0.5], [1, 0.72, 0.42, 0.3], 'clamp'), rot = interpolate(k, [0, 0.12, 0.25, 0.4, 0.5, 1], [0, -4, 7, -12, 16, 150], 'clamp') + x.value / 40;
    const fall = interpolate(k, [0.5, 0.78, 0.86, 1], [0, 230, 205, 330], 'clamp');
    return { transform: [{ translateX: k > 0 ? interpolate(k, [0, 0.5], [x.value, -w.value * 0.28], 'clamp') : x.value }, { translateY: fall }, { rotate: `${rot}deg` }, { scaleX: sq }, { scaleY: sy }], opacity: interpolate(k, [0.9, 1], [1, 0], 'clamp'), borderRadius: interpolate(k, [0.2, 0.5], [0, 60], 'clamp'), overflow: 'hidden' };
  });
  const creases = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0.06, 0.3], [0, 0.9], 'clamp') }));
  const bgR = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, 90], [0, 1], 'clamp') })), bgL = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-90, 0], [1, 0], 'clamp') }));
  const onA11y = (e: AccessibilityActionEvent) => { const n = e.nativeEvent.actionName; if (n === 'complete') onComplete(); else if (n === 'delete') onDelete(); else if (n === 'activate') onOpen?.(); };
  return (
    <View onLayout={(e) => { w.value = e.nativeEvent.layout.width; }} accessible={false}>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 6, top: 0, bottom: 0, justifyContent: 'center' }, bgR]}><View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Icon name="check" color={c.ok} size={26} /><Txt f="bold" s={20} c="ok">{doneLabel}</Txt></View></Animated.View>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', right: 6, top: 0, bottom: 0, justifyContent: 'center' }, bgL]}><View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Txt f="bold" s={20} c="bad">Crumple</Txt><Icon name="trash" color={c.bad} size={24} /></View></Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={card} accessible accessibilityActions={[{ name: 'complete', label: doneLabel }, { name: 'delete', label: 'Delete' }, { name: 'activate', label: 'Open' }]} onAccessibilityAction={onA11y}>
          {children}
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, creases]}>
            <Svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none"><Path d="M0 8L22 14L40 6L58 18L80 9L100 16M10 40L28 24L50 30L66 20L86 34M30 0L36 20L24 40M70 0L62 18L74 40" stroke={c.ink} strokeOpacity={0.45} strokeWidth={0.7} fill="none" /></Svg>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
