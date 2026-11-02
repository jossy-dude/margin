import React, { useLayoutEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { HandBox } from '../kit';
import { useReduceMotion, useTheme } from '../theme-context';

/**
 * The collage nav's "you are here": one cream scrap that slides along the kraft strip to the tab you tap.
 * It lives in the nav bar, never on a page: the page swap itself stays a cut with no animation at all
 * (navigation/Book.tsx, pinned by perf-placement.test.ts); this is one small view in the chrome.
 */
export function NavScrap({ index, width, count = 5, inset = 8 }: { index: number; width: number; count?: number; inset?: number }) {
  const { c } = useTheme(), reduce = useReduceMotion(), x = useSharedValue(index), w = width / count;
  useLayoutEffect(() => { x.set(reduce ? index : withSpring(index, { duration: 380, dampingRatio: 0.72 })); }, [index, reduce, x]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() * w }, { rotate: `${Math.sin(x.get() * Math.PI) * 1.8 - 1}deg` }] }));
  if (!width) return null;
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: inset, top: 3, width: w - 4, bottom: 3 }, st]}><HandBox seed="navscrap" fill={c.card} cut="torn" style={{ flex: 1 }} /></Animated.View>;
}
