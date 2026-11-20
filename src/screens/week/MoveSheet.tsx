import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, EASE, HandBox, Txt } from '../../ui/kit';
import { TimeField } from '../../ui/fields';
import { useReduceMotion, useTheme } from '../../ui/theme-context';
import { navHeight, FAB, FAB_GAP } from '../../ui/fit';
import { act, useStore } from '../../store/store';
import { moveAt, moveClashes, withMove } from '../../domain/moves';
import { DW, addDays, uid, ymd } from '../../domain/time';
import { hhmm } from './model';

/** A move being decided (v0.8: Week's hold-and-drag, from Daylight's Week, now in every skin). `from`/`to` are day
 *  offsets from Monday; `start` and `dur` are minutes; `pick` = choose the day and time here (no drag happened). */
export interface MoveDraft { meetingId: string; name: string; mon: number; from: number; fromStart: number; to: number; start: number; dur: number; pick: boolean }

/** "This week only" (a one-off move, `domain/moves.ts`) or "Every week" (the timetable itself), D-23. */
export function MoveSheet({ d, hour12, onChange, onClose }: { d: MoveDraft; hour12: boolean; onChange: (d: MoveDraft) => void; onClose: () => void }) {
  const { c } = useTheme(), ins = useSafeAreaInsets(), still = useReduceMotion();
  const meetings = useStore((s) => s.meetings), moves = useStore((s) => s.settings.moves) ?? [];
  const m = meetings.find((x) => x.id === d.meetingId);
  const fromDay = ymd(new Date(addDays(d.mon, d.from))), toDay = ymd(new Date(addDays(d.mon, d.to)));
  const start = hhmm(d.start), end = hhmm(d.start + d.dur), fromStart = hhmm(d.fromStart);
  const here = d.to === d.from && start === fromStart;
  const clash = !!m && !here && moveClashes(toDay, d.to, meetings, moves, m, start, { day: fromDay, start: fromStart });
  const thisWeek = () => { if (!m) return; act.setSettings({ moves: withMove(moves, m, fromDay, fromStart, toDay, start, end, uid('mv')) }); onClose(); };
  const everyWeek = () => {
    if (!m) return;
    const moved = moveAt(moves, m.id, fromDay, fromStart);
    if (!act.saveMeeting({ ...m, weekday: d.to, start, end })) return;
    if (moved) act.setSettings({ moves: moves.filter((v) => v !== moved) });
    onClose();
  };
  return (
    <Animated.View exiting={still ? undefined : FadeOut.duration(160)} style={StyleSheet.absoluteFill} testID="week-move">
      {/* v0.8: the shade fades and the card rises, instead of both appearing in one frame */}
      <Animated.View entering={still ? undefined : FadeIn.duration(200)} style={StyleSheet.absoluteFill}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel the move" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.28)' }]} />
      </Animated.View>
      <Animated.View entering={still ? undefined : FadeInDown.duration(240).easing(EASE)} accessibilityViewIsModal style={{ position: 'absolute', left: 8, right: 8, bottom: navHeight(ins.bottom) + FAB + FAB_GAP }}>
        <HandBox seed="move" fill={c.card} style={{ padding: 14, gap: 10 }}>
          <Txt f="bold" s={22} accessibilityRole="header">{`Move ${d.name}${d.pick ? '' : ` to ${DW[d.to]} ${start}`}?`}</Txt>
          <Txt f="serif" s={15} c="mut">{`Now ${DW[d.from]} ${fromStart}. ${here ? 'Pick a new day or time.' : `New: ${DW[d.to]} ${start}–${end}.`}`}</Txt>
          {d.pick ? (<>
            <View accessibilityRole="radiogroup" accessibilityLabel="Day" style={{ flexDirection: 'row', gap: 4 }}>
              {DW.map((w, k) => <Btn key={w} small flex kind={k === d.to ? 'ink' : 'ghost'} selected={k === d.to} label={w} testID={`move-day-${k}`} onPress={() => onChange({ ...d, to: k })} />)}
            </View>
            <TimeField label="Starts" value={d.start} hour12={hour12} max={1435 - d.dur} onChange={(v) => onChange({ ...d, start: v })} />
          </>) : null}
          {clash ? <Txt f="serif" s={15} c="bad">{`${d.name} already starts at ${start} on ${DW[d.to]}. Two of them could never be marked apart.`}</Txt> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Btn kind="primary" label="This week only" testID="move-week" disabled={here || clash || !m} onPress={thisWeek} />
            <Btn kind="ghost" label="Every week" testID="move-every" disabled={here || clash || !m} onPress={everyWeek} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Btn small kind="ghost" label="Edit class" onPress={() => { onClose(); act.open({ t: 'meeting', id: d.meetingId }); }} />
            <Btn small kind="ghost" label="Cancel" testID="move-cancel" onPress={onClose} />
          </View>
        </HandBox>
      </Animated.View>
    </Animated.View>
  );
}
