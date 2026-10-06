import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HandBox, Icon, Txt } from './kit';
import { PaperBg } from './PaperBg';
import { useReduceMotion, useTheme } from './theme-context';
import { fx } from '../services/fx';
import { hexA } from '../tokens/theme';
import { afterClose } from './after';
import { FS } from './fit';

const SheetCtx = createContext<{ close: (after?: () => void) => void }>({ close: () => undefined });
export const useSheet = () => useContext(SheetCtx);
export type SheetClose = (after?: () => void) => void;
const TOP = { h: [34, 26, 0, 0], v: [34, 26, 0, 0] } as const;

/** One-hand bottom sheet: sits in the thumb zone, drags down to dismiss, Android back closes it, keyboard-aware, live-region title. */
export function Sheet({ title, onClose, children, maxH = 0.88, footer, peek = false, back }: { title?: string; onClose: () => void; children: React.ReactNode; maxH?: number; footer?: React.ReactNode; peek?: boolean; back?: (() => void) | null }) {
  const { height: H } = useWindowDimensions(), ins = useSafeAreaInsets(), { c } = useTheme(), reduce = useReduceMotion();
  const y = useSharedValue(H), [kb, setKb] = useState(0), [gone, setGone] = useState(false), restH = useRef(H), closing = useRef(false), after = useRef(afterClose()).current;
  useEffect(() => { y.set(reduce ? 0 : withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) })); fx.page(); }, [y, reduce]);
  useEffect(() => { const a = Keyboard.addListener('keyboardDidShow', (e) => setKb(e.endCoordinates.height)), b = Keyboard.addListener('keyboardDidHide', () => setKb(0)); return () => { a.remove(); b.remove(); }; }, []);
  /** Android lifts the window for the keyboard in one of two ways: `adjustResize` shrinks it, `adjustPan` /
      edge-to-edge leaves it alone and covers it. `restH` is the tallest height seen with no keyboard up, so
      `restH - H` (`lift`) is exactly the OS's own lift; taking `max` of that and `kb` never reads the
      keyboard twice, and subtracting `lift` back off again is what stops it being subtracted twice. */
  useEffect(() => { if (kb === 0 && H > restH.current) restH.current = H; }, [H, kb]);
  const lift = Math.max(0, restH.current - H), kbH = kb > 0 ? Math.max(lift, kb) : 0;
  /** How far the sheet must sit above the bottom edge. Under `adjustResize` the window already stops at the
      keyboard, so the sheet's own `bottom` is 0; under `adjustPan` / edge-to-edge the window is untouched and
      the sheet has to clear the keyboard itself. Without the `- lift` the first case would float the sheet a
      full keyboard-height above the keyboard with dead space beneath it. */
  const bottom = kbH - lift;
  /** Clamp to the space actually above the keyboard instead of a share of the whole window: sizing from the
      full height while also raising `bottom` by `kb` pushes the top edge to `H - kb - H*maxH`, which is
      negative once the keyboard is up and throws the grab handle, the title and the close button off-screen. */
  const cap = Math.min(H * maxH, Math.max(0, H - bottom - ins.top));
  /* `onClose` first, then whatever the button that started this close asked for: the sheet is out of
     the store by then, so the caller can navigate. */
  const finish = useCallback(() => { onClose(); after.run(); }, [onClose, after]);
  /* `after` is asked on *every* call and before the latch, because a dismissal is a later call with no
     argument, and it cancels a follow-up a button queued milliseconds earlier. That is the whole fix
     for the untracked `setTimeout` the focus buttons used to defer their navigation with. */
  const close = useCallback((next?: () => void) => {
    after.ask(next); if (closing.current) return;
    closing.current = true; setGone(true); Keyboard.dismiss(); if (reduce) finish(); else y.set(withTiming(H, { duration: 210, easing: Easing.in(Easing.cubic) }, (done) => { if (done) runOnJS(finish)(); }));
  }, [H, after, finish, reduce, y, setGone]);
  /* Caught mid-dismiss. The sheet is only removed from the store when the close animation FINISHES, so a
     user who drags it back up inside that 210 ms has not dismissed anything — they have caught it. The
     latch has to come off, because `close()` returns early while it is set: without this, catching a
     closing sheet leaves a sheet that can never be dismissed again, which is exactly what prompt.md V18's
     "open/close Settings 10x" produces. This is a stuck state, not a feel problem. */
  const catchBack = useCallback(() => { if (closing.current) { closing.current = false; setGone(false); } }, [setGone]);
  useEffect(() => { const s = BackHandler.addEventListener('hardwareBackPress', () => { if (back) { back(); return true; } close(); return true; }); return () => s.remove(); }, [close, back]);
  const pan = Gesture.Pan().activeOffsetY(8).onUpdate((e) => { y.set(Math.max(0, e.translationY)); }).onEnd((e) => {
    if (e.translationY > 110 || e.velocityY > 900) { runOnJS(close)(); return; }
    runOnJS(catchBack)();
    /* The release velocity is handed to the spring. `expo-animation`'s table is explicit about this one:
     * "reposition / snap back after a drag -> { duration, dampingRatio, velocity }". Without it the sheet
     * springs from rest while the finger is still travelling, and a sheet flicked up from half way reads
     * as a stall followed by a correction instead of as one movement. `e.velocityY` is dp/s and `y` is
     * dp, so the units already agree. */
    y.set(withSpring(0, { damping: 22, stiffness: 260, mass: 1, velocity: e.velocityY }));
  });
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  const dim = useAnimatedStyle(() => ({ opacity: interpolate(y.get(), [0, H], [peek ? 0.12 : 0.42, 0], 'clamp') }));
  return (
    <SheetCtx.Provider value={{ close }}>
      {/* `accessibilityViewIsModal` traps focus on iOS only, so Android gets the matching
          `importantForAccessibility`; App.tsx hides the navigator behind this sheet at the same time. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none" accessibilityViewIsModal importantForAccessibility="yes">
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.shadow }, dim]}><Pressable testID="sheet-dismiss" style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityLabel="Close" accessibilityRole="button" /></Animated.View>
        <Animated.View importantForAccessibility={gone ? 'no-hide-descendants' : 'yes'} pointerEvents={gone ? 'none' : 'auto'} style={[{ position: 'absolute', left: 0, right: 0, bottom, maxHeight: cap }, sheetStyle]}>
          <HandBox seed="sheet" corners={TOP} sw={1.8} shadow={false} amp={1.4} style={{ overflow: 'hidden', borderTopLeftRadius: 30, borderTopRightRadius: 26, flexShrink: 1, maxHeight: cap }} fill="transparent" stroke={c.ink}>
            <PaperBg card />
            <GestureDetector gesture={pan}>
              <View style={{ paddingTop: 8, paddingHorizontal: 16, paddingBottom: 6 }} accessible accessibilityRole="header" accessibilityLabel={title}>
                <View style={{ alignSelf: 'center', width: 46, height: 5, borderRadius: 3, backgroundColor: hexA(c.ink, 0.35), marginBottom: 6 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
                  {back ? <Pressable testID="sheet-back" accessibilityRole="button" accessibilityLabel="Back" onPress={back} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 }}><Icon name="back" /></Pressable> : null}
                  <Txt f="marker" s={25} maxFontSizeMultiplier={FS} numberOfLines={2} style={{ flex: 1 }} accessibilityLiveRegion="polite">{title}</Txt>
                  <Pressable testID="sheet-close" accessibilityRole="button" accessibilityLabel="Close" onPress={() => close()} hitSlop={10} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 }}><Icon name="x" /></Pressable>
                </View>
              </View>
            </GestureDetector>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: footer ? 8 : Math.max(ins.bottom, 12) + 10, gap: 12 }} style={{ flexGrow: 0, flexShrink: 1 }}>{children}</ScrollView>
            {footer ? <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(ins.bottom, 10) + 6 }}>{footer}</View> : null}
          </HandBox>
        </Animated.View>
      </View>
    </SheetCtx.Provider>
  );
}
export const Label = ({ children }: { children: React.ReactNode }) => <Txt f="serif" s={15} c="mut" style={{ marginBottom: -4, marginTop: 2 }}>{children}</Txt>;
