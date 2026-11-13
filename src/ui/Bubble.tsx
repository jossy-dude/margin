import React from 'react';
import { Pressable, View, useColorScheme } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { V2, type Scheme } from '../tokens/v2';
import type { AttStatus } from '../domain/types';

/**
 * v0.7 U5 — the bubble, Daylight sheet's signature mark (docs/v07/DESIGN.md D-7): every yes/no in the app is a
 * pencil-filled bubble, like an answer sheet. Present = filled graphite, absent = rose, late = half, cancelled =
 * hollow and struck, not yet = hollow, now = an amber ring. Each bubble carries its own TalkBack label.
 */
export type BubbleState = 'empty' | 'filled' | 'absent' | 'half' | 'struck' | 'now';

/** An attendance record (or none) as a bubble. `late` is present with a why of "late" (v0.6 states). */
export function bubbleOf(rec: { status: AttStatus; why?: string } | null | undefined, isNow = false): BubbleState {
  if (isNow && !rec) return 'now';
  if (!rec) return 'empty';
  if (rec.status === 'c') return 'struck';
  if (rec.status === 'a') return 'absent';
  return rec.why === 'late' ? 'half' : 'filled';
}
const WORDS: Record<BubbleState, string> = { empty: 'Not marked', filled: 'Present', absent: 'Absent', half: 'Present, late', struck: 'Cancelled', now: 'Now' };
export const bubbleWords = (s: BubbleState) => WORDS[s];

export function Bubble({ state, size = 14, label, onLongPress, scheme }: { state: BubbleState; size?: 10 | 14 | 20; label?: string; onLongPress?: () => void; scheme?: Scheme }) {
  const sys = useColorScheme();
  const t = V2[scheme ?? (sys === 'dark' ? 'dark' : 'light')];
  const r = size / 2, sw = state === 'now' ? 2 : 1.25, ri = r - sw / 2;
  const fill = state === 'filled' ? t.present : state === 'absent' ? t.absent : null;
  const mark = (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={r} cy={r} r={ri} stroke={state === 'now' ? t.now : state === 'absent' ? t.absent : state === 'filled' ? t.present : t.ink3} strokeWidth={sw} fill={fill ?? 'none'} />
      {state === 'half' ? <Path d={`M${r} ${sw / 2} A${ri} ${ri} 0 0 0 ${r} ${size - sw / 2} Z`} fill={t.present} /> : null}
      {state === 'struck' ? <Line x1={size * 0.2} y1={size * 0.8} x2={size * 0.8} y2={size * 0.2} stroke={t.ink3} strokeWidth={1.5} strokeLinecap="round" /> : null}
    </Svg>
  );
  const a11y = label ? `${label}: ${WORDS[state]}` : WORDS[state];
  if (!onLongPress) return <View accessible accessibilityLabel={a11y}>{mark}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={a11y} onLongPress={onLongPress} hitSlop={(48 - size) / 2}>{mark}</Pressable>;
}

/** A row of bubbles with 4 dp gaps and a 12 dp gap after every `groupOf` (a week). */
export function BubbleRow({ items, size = 14, groupOf = 5, onLongPress, scheme }: { items: { state: BubbleState; label: string }[]; size?: 10 | 14 | 20; groupOf?: number; onLongPress?: (i: number) => void; scheme?: Scheme }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
      {items.map((it, i) => (
        <View key={i} style={{ marginRight: (i + 1) % groupOf === 0 ? 12 : 4, marginBottom: 4 }}>
          <Bubble state={it.state} size={size} label={it.label} scheme={scheme} onLongPress={onLongPress ? () => onLongPress(i) : undefined} />
        </View>
      ))}
    </View>
  );
}
