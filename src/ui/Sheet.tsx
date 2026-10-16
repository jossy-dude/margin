import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { FS, sheetFit } from './fit';

export type SheetCloser = (after?: () => void) => void;

/**
 * Which way round this surface opens: a bottom sheet in the thumb zone, or a right-hand inspector panel
 * on the desktop.
 *
 * It is a context rather than a prop on all seven forms on purpose. The forms are the product's
 * vocabulary — one Task form, one Mark form, one Settings tree, and the desktop view is the *same* app
 * seen from a wider desk, not a second app with parallel forms. Threading a variant through seven
 * call sites would also have meant touching each one, and `src/test/sheet-close.test.ts` pins the exact
 * shape of that file (seven `useSheetClose()`, seven `closeRef={closeRef}`, seven `<Sheet `) precisely
 * so a half-migration is caught. A context changes nothing in `forms.tsx` at all: the desktop shell
 * wraps its tree once, and every form already inside becomes a panel.
 *
 * The default is `'sheet'`, because that is the surface the app is, and a form rendered standalone — a
 * test, a preview — must come up as what it has always come up as.
 */
export const SheetVariant = createContext<'sheet' | 'panel'>('sheet');
export const useSheetVariant = () => useContext(SheetVariant);

/** How far a panel travels in from the right. Not a screen width: the panel is a fixed-width column, and
 *  a drawer that slid the whole window width would read as a page transition rather than as a column
 *  arriving. Matches `desktop/tokens.ts`'s `INSPECTOR`. */
export const PANEL_W = 460;
/**
 * A form's own closer, handed back by the `Sheet` it renders.
 *
 * This used to be a context read (`useSheet()`), and it was the **context default** in all seven
 * forms plus the Add sheet: a provider is below its own parent in the tree, so a form body asking
 * for `close` before it returns its `<Sheet>` got `{ close: () => undefined }`. All 24 of those
 * `close()` calls were no-ops — every Save, every Delete, every attendance mark, "Back to
 * automatic", both "focus on this" buttons. The store write happened first and landed, so the page
 * behind updated while the sheet sat on top of it still showing the old values, and the only way
 * out was the ✕, the dim area or a back gesture. See `src/test/sheet-close.test.ts`.
 *
 * The ref is populated by `Sheet` on its first commit, which is strictly before any button inside
 * it can be pressed, and it never changes identity for the life of the sheet — so `close` is stable
 * and the forms need no effect, no state and no ordering assumption beyond "press it".
 */
export function useSheetClose() {
  /* The local is `ref` and the returned closer is `ask`, not `close`: `deferred-nav.test.ts` proves
     the close ordering by slicing this file between the sheet's `finish` and its closer, and any
     earlier declaration whose name merely *starts* with those five letters matches that slice's end
     and silently empties it — so the assertion would pass on an empty string instead of failing. */
  const ref = useRef<SheetCloser | null>(null);
  const ask = useCallback<SheetCloser>((after) => ref.current?.(after), []);
  return { closeRef: ref, close: ask };
}
const TOP = { h: [34, 26, 0, 0], v: [34, 26, 0, 0] } as const;

/** One-hand bottom sheet: sits in the thumb zone, drags down to dismiss, Android back closes it, keyboard-aware, live-region title.
 *
 *  `closeRef` is how a form reaches its own closer — see `useSheetClose`. It is written during the
 *  first render, before `children` exist, so a button rendered in the same pass already reads a
 *  live callback. */
export function Sheet({ title, onClose, children, maxH = 0.88, footer, peek = false, back, closeRef }: { title?: string; onClose: () => void; children: React.ReactNode; maxH?: number; footer?: React.ReactNode; peek?: boolean; back?: (() => void) | null; closeRef?: React.RefObject<SheetCloser | null> }) {
  const { height: H } = useWindowDimensions(), ins = useSafeAreaInsets(), { c } = useTheme(), reduce = useReduceMotion();
  const variant = useSheetVariant(), panel = variant === 'panel';
  /** One value, two distances. A sheet's travel is the window's own height; a panel's is its own width
   *  (`PANEL_W`). Normalising the travel to 0..1 rather than branching the style keeps the close path
   *  single: `OUT` is the far end, and everything downstream of it is identical for both. */
  const OUT = panel ? 1 : H;
  const y = useSharedValue(OUT), [kb, setKb] = useState(0), [boxH, setBoxH] = useState(H), [gone, setGone] = useState(false), restH = useRef(H), closing = useRef(false), after = useRef(afterClose()).current;
  /* Armed from a LAYOUT effect, not a passive one — the same rule as the page placement in
     `navigation/Book.tsx`: a passive effect waits for the commit to paint, so the first frame was the
     sheet parked a full travel off-screen with the dim at zero and the present only starting on the
     frame after. The press-to-first-moving-frame gap on the sheet path was that dead frame plus the
     form's own mount cost; the mount cost is unavoidable (the form must exist to be seen), the frame is not. */
  useLayoutEffect(() => { y.set(reduce ? 0 : withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) })); fx.page(); }, [y, reduce]);
  useEffect(() => { const a = Keyboard.addListener('keyboardDidShow', (e) => setKb(e.endCoordinates.height)), b = Keyboard.addListener('keyboardDidHide', () => setKb(0)); return () => { a.remove(); b.remove(); }; }, []);
  /** Android lifts the window for the keyboard in one of two ways: `adjustResize` shrinks the root view,
      `adjustPan` / edge-to-edge leaves it alone and covers it. `restH` is the tallest the sheet host has
      ever been with no keyboard up — the container's own rest height, not the window's — so `restH - boxH`
      is exactly the OS's own lift; taking `max` of that and `kb` never reads the keyboard twice, and
      subtracting `lift` back off again is what stops it being subtracted twice. The full arithmetic,
      and why the window's JS height was the wrong thing to measure, is in `sheetFit`. */
  useEffect(() => { if (kb === 0 && boxH > restH.current) restH.current = boxH; }, [boxH, kb]);
  const { bottom, cap } = sheetFit({ H, boxH, restH: restH.current, kb, maxH, insTop: ins.top });
  /* `onClose` first, then whatever the button that started this close asked for: the sheet is out of
     the store by then, so the caller can navigate. */
  const finish = useCallback(() => { onClose(); after.run(); }, [onClose, after]);
  /* `after` is asked on *every* call and before the latch, because a dismissal is a later call with no
      argument, and it cancels a follow-up a button queued milliseconds earlier. That is the whole fix
      for the untracked `setTimeout` the focus buttons used to defer their navigation with.
      The second argument is the flick's own release velocity, in `y`'s units (`dp/s` for a sheet, and
      the pan only exists on a sheet). A drag that ends in a dismissal is already travelling: restarting
      the exit from rest with an ease-in left the sheet hanging for the first ~60 ms of the close — the
      stall a native sheet never has, and the reason "drag-down feels slow" is a different complaint
      from "close feels slow". So a flick gets a spring that continues the finger, and a tap (✕, the dim
      area, Back — anything with no velocity behind it) keeps a timing, which is the right shape for an
      exit that starts at rest. */
  const close = useCallback((next?: () => void, thrown?: number) => {
    after.ask(next); if (closing.current) return;
    closing.current = true; setGone(true); Keyboard.dismiss();
    if (reduce) { finish(); return; }
    const done = (d?: boolean) => { if (d) runOnJS(finish)(); };
    y.set(thrown === undefined
      ? withTiming(OUT, { duration: 200, easing: Easing.in(Easing.quad) }, done)
      : withSpring(OUT, { stiffness: 320, damping: 34, mass: 1, velocity: thrown }, done));
  }, [OUT, after, finish, reduce, y, setGone]);
  /* Published during render, not in an effect: the form's buttons are rendered in this same pass, and
     an effect would leave `closeRef.current` null for the whole of the first commit. The ref is the
     form's own, so writing to it here is not a render side effect on anyone else's state — it is
     this component handing over the callback it has just built. */
  if (closeRef && closeRef.current !== close) closeRef.current = close;
  /* Caught mid-dismiss. The sheet is only removed from the store when the close animation FINISHES, so a
     user who drags it back up inside that ~200 ms has not dismissed anything — they have caught it. The
     latch has to come off, because `close()` returns early while it is set: without this, catching a
     closing sheet leaves a sheet that can never be dismissed again, which is exactly what prompt.md V18's
     "open/close Settings 10x" produces. This is a stuck state, not a feel problem. */
  const catchBack = useCallback(() => { if (closing.current) { closing.current = false; setGone(false); } }, [setGone]);
  useEffect(() => { const s = BackHandler.addEventListener('hardwareBackPress', () => { if (back) { back(); return true; } close(); return true; }); return () => s.remove(); }, [close, back]);
  const pan = Gesture.Pan().activeOffsetY(8).onUpdate((e) => { y.set(Math.max(0, e.translationY)); }).onEnd((e) => {
    if (e.translationY > 110 || e.velocityY > 900) { runOnJS(close)(undefined, e.velocityY); return; }
    runOnJS(catchBack)();
    /* The release velocity is handed to the spring. `expo-animation`'s table is explicit about this one:
     * "reposition / snap back after a drag -> { duration, dampingRatio, velocity }". Without it the sheet
     * springs from rest while the finger is still travelling, and a sheet flicked up from half way reads
     * as a stall followed by a correction instead of as one movement. `e.velocityY` is dp/s and `y` is
     * dp, so the units already agree. */
    y.set(withSpring(0, { damping: 22, stiffness: 260, mass: 1, velocity: e.velocityY }));
  });
  const sheetStyle = useAnimatedStyle(() => ({ transform: panel ? [{ translateX: interpolate(y.get(), [0, 1], [PANEL_W, 0], 'clamp') }] : [{ translateY: y.get() }] }));
  const dim = useAnimatedStyle(() => ({ opacity: panel ? interpolate(y.get(), [0, 1], [peek ? 0.12 : 0.42, 0], 'clamp') : interpolate(y.get(), [0, H], [peek ? 0.12 : 0.42, 0], 'clamp') }));
  return (
    <>
      {/* `accessibilityViewIsModal` traps focus on iOS only, so Android gets the matching
          `importantForAccessibility`; App.tsx hides the navigator behind this sheet at the same time. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none" accessibilityViewIsModal importantForAccessibility="yes"
        /* The one honest measurement of the space this sheet lives in. The window's JS height does not
           reliably track the keyboard — on the SM-A516N the root view shrinks for it while the window
           height stays full — and every term of the keyboard arithmetic is taken from this layout
           instead. See `sheetFit`. */
        onLayout={(e) => setBoxH(e.nativeEvent.layout.height)}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.shadow }, dim]}><Pressable testID="sheet-dismiss" style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityLabel="Close" accessibilityRole="button" /></Animated.View>
        {/* ── panel ── a right-hand inspector column.
         *
         *  Same card, same title, same close, same live region, same footer — the four things a form
         *  actually depends on. What is gone is everything the *gesture* owned, and each removal is a
         *  real desktop fact rather than a concession: no grab handle (a column does not get pulled
         *  up from a handle), no drag-to-dismiss (a mouse can click the dim area, and a drag that moved
         *  a fixed column would move it away from where the eye just went), no rounded top corners and
         *  no bottom inset (it is not sitting on the bottom of anything), and no keyboard lift
         *  arithmetic (a soft keyboard does not follow a pointer to a 460 px column).
         *
         *  It is cut with the world's full-radius card corners (`RG`), not the sheet's `TOP` corners,
         *  because it is a card on the page rather than a lid on a screen. */}
        {panel ? (
          <Animated.View importantForAccessibility={gone ? 'no-hide-descendants' : 'yes'} pointerEvents={gone ? 'none' : 'auto'} style={[{ position: 'absolute', right: 0, top: 0, bottom: 0, width: PANEL_W, maxWidth: '100%' }, sheetStyle]}>
            <HandBox seed="panel" sw={1.8} shadow={false} amp={0.8} fill={c.paper} stroke={c.ink}
              style={{ flex: 1, overflow: 'hidden', borderTopLeftRadius: 14, borderBottomLeftRadius: 14, borderRightWidth: 0 }}>
              <PaperBg card />
              <View style={{ paddingTop: 10, paddingHorizontal: 16, paddingBottom: 6 }} accessible accessibilityRole="header" accessibilityLabel={title}>
                <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
                  {back ? <Pressable testID="sheet-back" accessibilityRole="button" accessibilityLabel="Back" onPress={back} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -10 }}><Icon name="back" /></Pressable> : null}
                  <Txt f="marker" s={25} maxFontSizeMultiplier={FS} numberOfLines={2} style={{ flex: 1 }} accessibilityLiveRegion="polite">{title}</Txt>
                  <Pressable testID="sheet-close" accessibilityRole="button" accessibilityLabel="Close" onPress={() => close()} hitSlop={10} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 }}><Icon name="x" /></Pressable>
                </View>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: footer ? 8 : 20, gap: 12 }} style={{ flexGrow: 0, flexShrink: 1 }}>{children}</ScrollView>
              {footer ? <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14, borderTopWidth: 1.4, borderTopColor: c.rule }}>{footer}</View> : null}
            </HandBox>
          </Animated.View>
        ) : (
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
        )}
      </View>
    </>
  );
}
export const Label = ({ children }: { children: React.ReactNode }) => <Txt f="serif" s={15} c="mut" style={{ marginBottom: -4, marginTop: 2 }}>{children}</Txt>;
