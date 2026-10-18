import React from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BEAT, Btn, EASE, HandBox, Icon, Txt, usePressIn } from './kit';
import { useReduceMotion, useTheme } from './theme-context';
import { act, dismissToast, useStore } from '../store/store';
import { useKeyboardUp } from './keyboard';
import { AddSheet, CourseSheet, MarkSheet, MeetingSheet, NoticeSheet, StatusSheet, TaskSheet } from '../sheets/forms';
import { SettingsSheet } from '../sheets/Settings';
import { fx } from '../services/fx';
import { FAB_GAP, TOAST_CLEAR, navHeight, navInset, toastBottom } from './fit';
import { useCoachSlot } from './onboard/coach';

/** The + button. A floating target with nothing under it to give, so it gets the deepest press in the
 *  app — 0.94, not the 0.97 a `Btn` gets — because a 62 dp cut square has no label to carry the press
 *  and only the silhouette can say it was touched. It deliberately does NOT fade in and out as sheets
 *  open: it holds `Pressable` + a hand-drawn `Svg`, so an `exiting` animation on it risks leaving a ghost
 *  button over a sheet, which is a worse outcome than a button that appears in one frame.
 *
 *  `tour` is the first stop of the tour: the ring goes round this button, and this button is what ends
 *  the step. One hook call and one `ref` is the whole of the tour's footprint in this file. */
function Fab({ bottom, onPress }: { bottom: number; onPress: () => void }) {
  const { c } = useTheme(), reduce = useReduceMotion(), s = useSharedValue(1), tour = useCoachSlot('fab');
  const face = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  /* The sheet opens on the down frame, like every other control — a sheet that waits for the lift is
     a sheet that waits for the user's own hold time. */
  const [actIn, actLift] = usePressIn(onPress);
  return (
    <Pressable testID="fab-add" accessibilityRole="button" accessibilityLabel="Add" onPress={actLift} ref={tour}
      onPressIn={() => { actIn(); s.set(reduce ? 1 : withTiming(0.94, { duration: BEAT, easing: EASE })); }} onPressOut={() => s.set(reduce ? 1 : withSpring(1, { duration: 200, dampingRatio: 0.7 }))}
      style={{ position: 'absolute', right: 18, bottom: navHeight(bottom) + FAB_GAP }}>
      <Animated.View style={[{ width: 62, height: 62 }, face]}>
        <HandBox seed="fab" fill={c.acc} stroke={c.ink} sw={2.2} amp={1.8} corners={{ h: [34, 30, 34, 30], v: [30, 34, 30, 34] }} style={{ width: 62, height: 62, alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={32} color={c.onAcc} sw={2.6} /></HandBox>
      </Animated.View>
    </Pressable>
  );
}

/** Renders whichever sheet the store says is open, plus the undo toast and the + button. */
export function Overlay() {
  const sheet = useStore((s) => s.sheet), toast = useStore((s) => s.toast), { c } = useTheme(), ins = useSafeAreaInsets();
  /* `ui/live.ts` removed the `s.route` subscription from every screen for the reason this file was
     still doing it for one boolean: six pages watching one atom meant every tab tap re-rendered all of
     them before the first moving frame, and the overlay + FAB subtree came with it (audit M6). The
     selector returns a PRIMITIVE, so `useSyncExternalStore`'s `Object.is` comparison means a tap that
     does not change this boolean does not re-render the unit at all. */
  const fabAllowed = useStore((s) => !s.sheet && s.route !== 'Focus');
  /* The + button floats over the page and covers whatever card is under it. While the keyboard is up
     the visible strip is about half the screen and the button lands squarely on a task's text, and
     neither it nor the nav can be used without dismissing the keyboard first. */
  const kbUp = useKeyboardUp(), showFab = fabAllowed && !kbUp;
  return (
    // `importantForAccessibility` is the Android half of the sheet's modal focus trap — `accessibilityViewIsModal`
    // on the sheet itself only does anything on iOS. App.tsx hides the navigator behind this view at the
    // same time, so while a sheet is open nothing behind it can be reached or read out.
    <View pointerEvents="box-none" importantForAccessibility={sheet ? 'yes' : 'auto'} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 2000 }}>
      {/* The + is the app's one way in, on every surface. The tour says so in words ("the + adds
          anything… it is the only way in"), Today's empty state repeats it, and the audit's walkthrough
          found the web build had no `+` at all: `t: 'add'` was opened from exactly one place in the repo,
          the line below, and it was suppressed on web — so a web student was stranded until they happened
          to open Week or To-do and find a button the tour never mentions (audit UX-1).

          The reason this gate gave for suppressing it — "the desktop surface puts its own `+` at the foot
          of the margin" — described something that was never built. `git log -S "Platform.OS === 'web'"
          -- src/ui/Overlay.tsx` names one commit, cdb26e0d ("+ answers on press-in"), whose whole diff is
          this file and kit.tsx's press timing; it added `import Platform` and this gate in passing and no
          second caller has ever existed (`git log --all -S "t: 'add'"` returns only the v1 baseline, the
          pre-v2 snapshot and a docs commit). "Foot of the margin" appears nowhere else in the repo.

          `showFab` is the only gate, and it is untouched: it is about *when* the floating chrome must get
          out of the way (a sheet is open, the route is Focus, the keyboard is up — BUG-028). */}
      {showFab && (<Fab bottom={ins.bottom} onPress={() => { fx.tap(); act.open({ t: 'add' }); }} />)}
      {sheet && (
        sheet.t === 'add' ? <AddSheet /> : sheet.t === 'task' ? <TaskSheet key={sheet.id ?? sheet.kind ?? 'new'} id={sheet.id} kind={sheet.kind} courseId={sheet.courseId} />
        : sheet.t === 'status' ? <StatusSheet key={sheet.key} spec={sheet} /> : sheet.t === 'settings' ? <SettingsSheet />
        : sheet.t === 'course' ? <CourseSheet key={sheet.id ?? 'new'} id={sheet.id} /> : sheet.t === 'meeting' ? <MeetingSheet key={sheet.id ?? 'new'} id={sheet.id} courseId={sheet.courseId} weekday={sheet.weekday} />
        : sheet.t === 'mark' ? <MarkSheet key={sheet.id ?? 'new'} courseId={sheet.courseId} id={sheet.id} /> : <NoticeSheet key={sheet.id ?? 'new'} id={sheet.id} />)}
      {/* `toastBottom` is TOAST_CLEAR dp above the nav bar's top edge, which is exactly the 90 dp the old flat
          `Math.max(ins.bottom, 8) + 90` produced — same pixels, now derived from the shared nav metrics. */}
      {toast && (
        /* The curve is the only change here: `FadeInDown` on its own uses Reanimated's built-in default,
           which `expo-animation` calls "as weak as CSS's". The app decelerates on `EASE` everywhere
           else — the page placement, and now every control in `kit.tsx` — so the toast was the one
           thing arriving on a different shape. Durations, direction and both layout animations are the
           numbers the motion rules already fixed: an exit softer than an
           enter, 180 against 220. */
        <Animated.View key={toast.id} entering={FadeInDown.duration(220).easing(EASE)} exiting={FadeOutDown.duration(180).easing(EASE)} style={{ position: 'absolute', left: 14, right: 14, bottom: sheet ? navInset(ins.bottom) + 10 : kbUp ? Math.max(ins.bottom, 8) + TOAST_CLEAR : toastBottom(ins.bottom), zIndex: 3000 }} accessibilityLiveRegion="polite">
          <HandBox seed="toast" fill={c.ink} stroke={c.ink} sw={2} amp={1.4} style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 6, paddingVertical: 6, gap: 8, minHeight: 52 }}>
            <Txt f="bold" s={19} c="paper" style={{ flex: 1 }}>{toast.text}</Txt>
            {toast.undo ? <Btn small kind="primary" label="Undo" onPress={() => { toast.undo?.(); dismissToast(); fx.undone(); }} /> : <Pressable testID="toast-dismiss" accessibilityLabel="Dismiss" accessibilityRole="button" onPress={dismissToast} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={20} color={c.paper} /></Pressable>}
          </HandBox>
        </Animated.View>)}
    </View>
  );
}
