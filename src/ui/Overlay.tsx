import React from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, HandBox, Icon, Txt } from './kit';
import { useTheme } from './theme-context';
import { act, dismissToast, useStore } from '../store/store';
import { AddSheet, CourseSheet, MarkSheet, MeetingSheet, NoticeSheet, StatusSheet, TaskSheet } from '../sheets/forms';
import { SettingsSheet } from '../sheets/Settings';
import { fx } from '../services/fx';
import { FAB_GAP, navHeight, navInset, toastBottom } from './fit';

/** Renders whichever sheet the store says is open, plus the undo toast and the + button. */
export function Overlay() {
  const sheet = useStore((s) => s.sheet), toast = useStore((s) => s.toast), route = useStore((s) => s.route), { c } = useTheme(), ins = useSafeAreaInsets();
  const showFab = !sheet && route !== 'Focus';
  return (
    // `importantForAccessibility` is the Android half of the sheet's modal focus trap — `accessibilityViewIsModal`
    // on the sheet itself only does anything on iOS (V14). App.tsx hides the navigator behind this view at the
    // same time, so while a sheet is open nothing behind it can be reached or read out.
    <View pointerEvents="box-none" importantForAccessibility={sheet ? 'yes' : 'auto'} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 2000 }}>
      {showFab && (
        <Pressable accessibilityRole="button" accessibilityLabel="Add" onPress={() => { fx.tap(); act.open({ t: 'add' }); }} style={{ position: 'absolute', right: 18, bottom: navHeight(ins.bottom) + FAB_GAP }}>
          <HandBox seed="fab" fill={c.acc} stroke={c.ink} sw={2.2} amp={1.8} corners={{ h: [34, 30, 34, 30], v: [30, 34, 30, 34] }} style={{ width: 62, height: 62, alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={32} color={c.onAcc} sw={2.6} /></HandBox>
        </Pressable>)}
      {sheet && (
        sheet.t === 'add' ? <AddSheet /> : sheet.t === 'task' ? <TaskSheet key={sheet.id ?? sheet.kind ?? 'new'} id={sheet.id} kind={sheet.kind} courseId={sheet.courseId} />
        : sheet.t === 'status' || sheet.t === 'slip' ? <StatusSheet key={sheet.key} spec={sheet} /> : sheet.t === 'settings' ? <SettingsSheet />
        : sheet.t === 'course' ? <CourseSheet key={sheet.id ?? 'new'} id={sheet.id} /> : sheet.t === 'meeting' ? <MeetingSheet key={sheet.id ?? 'new'} id={sheet.id} courseId={sheet.courseId} weekday={sheet.weekday} />
        : sheet.t === 'mark' ? <MarkSheet key={sheet.id ?? 'new'} courseId={sheet.courseId} id={sheet.id} /> : <NoticeSheet key={sheet.id ?? 'new'} id={sheet.id} />)}
      {/* `toastBottom` is TOAST_CLEAR dp above the nav bar's top edge, which is exactly the 90 dp the old flat
          `Math.max(ins.bottom, 8) + 90` produced — same pixels, now derived from the shared nav metrics. */}
      {toast && (
        <Animated.View key={toast.id} entering={FadeInDown.duration(220)} exiting={FadeOutDown.duration(180)} style={{ position: 'absolute', left: 14, right: 14, bottom: sheet ? navInset(ins.bottom) + 10 : toastBottom(ins.bottom), zIndex: 3000 }} accessibilityLiveRegion="polite">
          <HandBox seed="toast" fill={c.ink} stroke={c.ink} sw={2} amp={1.4} style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 6, paddingVertical: 6, gap: 8, minHeight: 52 }}>
            <Txt f="bold" s={19} c="paper" style={{ flex: 1 }}>{toast.text}</Txt>
            {toast.undo ? <Btn small kind="primary" label="Undo" onPress={() => { toast.undo?.(); dismissToast(); fx.undone(); }} /> : <Pressable accessibilityLabel="Dismiss" accessibilityRole="button" onPress={dismissToast} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={20} color={c.paper} /></Pressable>}
          </HandBox>
        </Animated.View>)}
    </View>
  );
}
