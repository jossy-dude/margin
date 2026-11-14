import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { glassStyle } from '../../ui/Glass';
import { FAB_GAP, navHeight } from '../../ui/fit';
import { RADIUS, SPACE } from '../../tokens/v2';
import { TodayScreen } from '../Today';
import { Glyph, T, Tap, useV2 } from './kitv2';
import { TodayV2 } from './TodayV2';

/**
 * The Today route (PLAN R1). The v0.7 Today is the page; the v0.6 one stays a tap away ("Classic Today" at the end
 * of the page) until the other screens are rebuilt too (Phase 5), so nothing it shows is out of reach. The peek
 * lasts the session: every route stays mounted, and a restart opens the new Today again. No setting, on purpose:
 * PLAN Question 2 settled on one look, so this is a bridge, not a choice to keep.
 */
export function TodayPage() {
  const [classic, setClassic] = useState(false);
  if (!classic) return <TodayV2 onClassic={() => setClassic(true)} />;
  return (
    <View style={{ flex: 1 }}>
      <TodayScreen />
      <BackToNew onPress={() => setClassic(false)} />
    </View>
  );
}

/** One small glass pill over the classic page, beside the + button, the way back. */
function BackToNew({ onPress }: { onPress: () => void }) {
  const { t, scheme } = useV2(), ins = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', alignItems: 'flex-start', padding: SPACE.gutter, paddingBottom: navHeight(ins.bottom) + FAB_GAP + SPACE.s2 }]}>
      <Tap onPress={onPress} label="Back to the new Today" testID="today-new"
        style={[glassStyle(scheme, true), { flexDirection: 'row', alignItems: 'center', gap: SPACE.s1, minHeight: 48, paddingVertical: 0, paddingHorizontal: SPACE.s4, borderRadius: RADIUS.island }]}>
        <T k="label" style={{ fontWeight: '600' }}>New Today</T>
        <Glyph name="chevron" size={16} color={t.ink2} />
      </Tap>
    </View>
  );
}
