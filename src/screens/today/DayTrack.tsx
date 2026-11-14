import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Bubble } from '../../ui/Bubble';
import { fmtTime } from '../../domain/time';
import { T, useV2 } from './kitv2';
import { bubbleSaid, type Track } from './model';

/** Where each class sits on the track, as fractions of the day's span (0…1). Pure, so the gaps stay
 *  proportional to time (a long lunch is a long hairline) and the test can hold it. */
export function trackLayout(track: Track, now: number) {
  const span = Math.max(1, track.to - track.from), f = (ms: number) => Math.min(1, Math.max(0, (ms - track.from) / span));
  return {
    stops: track.stops.map((s) => ({ ...s, x0: f(s.start), x1: f(s.end), fill: s.cancelled ? 0 : now <= s.start ? 0 : now >= s.end ? 1 : (now - s.start) / Math.max(1, s.end - s.start) })),
    /** the now tick, only inside the day's span */
    now: now > track.from && now < track.to ? f(now) : null,
  };
}

const B = 14;

/**
 * The BubbleTrack (DESIGN.md §4, "Bubble, BubbleRow, BubbleTrack"): the day's classes as bubbles on a hairline.
 * Each class is a 2 dp segment from its start to its end; the running one fills with `now` from left to right;
 * breaks are the bare hairline, so a gap reads as time. The first start and the last end are printed under the ends.
 * Staged here until `src/ui/Bubble.tsx` grows its own (requested kit change).
 */
export function DayTrack({ track, now, hour12, today }: { track: Track; now: number; hour12: boolean; today: boolean }) {
  const { t, scheme } = useV2();
  const [w, setW] = useState(0);
  const lay = trackLayout(track, today ? now : 0), inner = Math.max(0, w - B), x = (f: number) => B / 2 + f * inner;
  const said = track.stops.map((s) => `${s.label}: ${bubbleSaid(s.bubble)}`).join('; ');
  return (
    <View accessible accessibilityLabel={`The day: ${said}`} testID="day-track" style={{ height: 40 }}
      onLayout={(e) => { const v = Math.round(e.nativeEvent.layout.width); if (v !== w) setW(v); }}>
      {w > 0 ? (<>
        <View style={{ position: 'absolute', left: B / 2, right: B / 2, top: B / 2, height: StyleSheet.hairlineWidth, backgroundColor: t.ink3 }} />
        {lay.stops.map((s, i) => (
          <React.Fragment key={i}>
            <View style={{ position: 'absolute', left: x(s.x0), width: Math.max(2, x(s.x1) - x(s.x0)), top: B / 2 - 1, height: 2, borderRadius: 1, backgroundColor: s.cancelled ? 'transparent' : t.ink3, opacity: 0.55 }} />
            {s.fill > 0 ? <View style={{ position: 'absolute', left: x(s.x0), width: Math.max(2, (x(s.x1) - x(s.x0)) * s.fill), top: B / 2 - 1, height: 2, borderRadius: 1, backgroundColor: s.bubble === 'now' ? t.now : t.present }} /> : null}
          </React.Fragment>
        ))}
        {lay.now !== null ? <View style={{ position: 'absolute', left: x(lay.now) - 1, top: 0, width: 2, height: B, borderRadius: 1, backgroundColor: t.now }} /> : null}
        {lay.stops.map((s, i) => (
          <View key={`b${i}`} style={{ position: 'absolute', left: x(s.x0) - B / 2, top: 0, borderRadius: B / 2, backgroundColor: t.flat }}>
            <Bubble state={s.bubble} size={B} scheme={scheme} label={s.label} />
          </View>
        ))}
        <T k="label" c="ink3" style={{ position: 'absolute', left: 0, top: B + 6 }}>{fmtTime(track.from, hour12)}</T>
        <T k="label" c="ink3" style={{ position: 'absolute', right: 0, top: B + 6 }}>{fmtTime(track.to, hour12)}</T>
      </>) : null}
    </View>
  );
}
