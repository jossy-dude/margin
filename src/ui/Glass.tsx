import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme, type StyleProp, type ViewStyle } from 'react-native';
import { RADIUS, SPACE, TYPE, V2, type Scheme } from '../tokens/v2';

/**
 * v0.7 U4 — the glass card (DESIGN.md D-8): `glass` + a 1-device-px `ring` + a faint top highlight, radius 16,
 * no drop shadow. Optional header (a Caps label and one trailing action). Collapsible: tapping the header folds it
 * to one summary line ("Due · 3 today, 2 overdue"); the folded state is kept by the caller per card.
 */
export function glassStyle(scheme: Scheme, strong = false): ViewStyle {
  const t = V2[scheme];
  return {
    backgroundColor: strong ? t.glassStrong : t.glass, borderRadius: RADIUS.card, borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.ring, borderTopColor: t.highlight, padding: SPACE.card, overflow: 'hidden',
  };
}

export function GlassCard({ title, summary, action, folded, onFold, strong, scheme, style, children }: {
  title?: string; summary?: string; action?: { label: string; onPress: () => void }; folded?: boolean; onFold?: (folded: boolean) => void;
  strong?: boolean; scheme?: Scheme; style?: StyleProp<ViewStyle>; children?: React.ReactNode;
}) {
  const sys = useColorScheme();
  const sc: Scheme = scheme ?? (sys === 'dark' ? 'dark' : 'light');
  const t = V2[sc];
  const [own, setOwn] = useState(false);
  const isFolded = folded ?? own;
  const fold = () => { const next = !isFolded; if (onFold) onFold(next); else setOwn(next); };
  const caps = { fontSize: TYPE.caps.size, lineHeight: TYPE.caps.line, fontWeight: TYPE.caps.weight, letterSpacing: TYPE.caps.track, color: t.ink3, textTransform: 'uppercase' as const };
  return (
    <View style={[glassStyle(sc, strong), style]}>
      {title ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 32, marginBottom: isFolded ? 0 : SPACE.s2 }}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: !isFolded }} accessibilityLabel={`${title}${isFolded && summary ? `, ${summary}` : ''}. ${isFolded ? 'Expand' : 'Collapse'}`}
            onPress={fold} hitSlop={8} style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: SPACE.s2 }}>
            <Text style={caps}>{title}</Text>
            {isFolded && summary ? <Text numberOfLines={1} style={{ flex: 1, fontSize: TYPE.bodyS.size, color: t.ink2 }}>{summary}</Text> : null}
          </Pressable>
          {action && !isFolded ? <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={10}><Text style={{ fontSize: TYPE.label.size, fontWeight: TYPE.label.weight, color: t.ink2 }}>{action.label}</Text></Pressable> : null}
        </View>
      ) : null}
      {isFolded ? null : children}
    </View>
  );
}
