import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SPACE } from '../../tokens/v2';
import { T, Tap, useV2 } from './kitv2';
import type { WeekPill } from './model';

/** The day picker, opened from the date: seven pills, each with that day's classes as small bubbles. */
export function WeekStrip({ week, onPick }: { week: WeekPill[]; onPick: (day: number) => void }) {
  const { t } = useV2();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: SPACE.s1 }}>
      {week.map((p, k) => (
        <Tap key={p.day} role="tab" selected={p.selected} label={`${p.label}${p.selected ? ', shown' : ''}`} testID={`day-${k}`} onPress={() => onPick(p.day)}
          style={{ flex: 1, minHeight: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2,
            backgroundColor: p.selected ? t.glassStrong : 'transparent', borderWidth: StyleSheet.hairlineWidth, borderColor: p.selected ? t.ring : 'transparent' }}>
          <T k="caps" c={p.selected ? 'ink' : 'ink3'}>{p.dw}</T>
          <T k="subtitle" c={p.isToday || p.selected ? 'ink' : 'ink2'} style={p.isToday ? { textDecorationLine: 'underline' } : null}>{String(p.date)}</T>
          <View style={{ flexDirection: 'row', gap: 2, height: 6 }}>
            {p.bubbles.slice(0, 5).map((b, i) => (
              <View key={i} style={{ width: 6, height: 6, borderRadius: 3, borderWidth: 1,
                borderColor: b === 'absent' ? t.absent : b === 'now' ? t.now : b === 'filled' || b === 'half' ? t.present : t.ink3,
                backgroundColor: b === 'absent' ? t.absent : b === 'filled' || b === 'half' ? t.present : 'transparent' }} />
            ))}
          </View>
        </Tap>
      ))}
    </View>
  );
}
