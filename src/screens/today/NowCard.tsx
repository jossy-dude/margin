import React, { useState } from 'react';
import { View } from 'react-native';
import { Bubble } from '../../ui/Bubble';
import { glassStyle } from '../../ui/Glass';
import { DayBar, type AnyBarKind } from '../../ui/DayBar';
import { useNow } from '../../ui/theme-context';
import { fmtClock, fmtTime } from '../../domain/time';
import { SPACE } from '../../tokens/v2';
import { Button, Chip, Segmented, T, Tap, TintMark, useV2 } from './kitv2';
import { DayTrack } from './DayTrack';
import type { ClassItem, Countdown, NowCardVM } from './model';

/** The countdown's words for one tick of the card's own clock. Under an hour it is digits (`29:44`, tabular, so it
 *  never walks); a start more than an hour away is its clock time with the wait in words ("13:15", "in 1 h 20 min"),
 *  because a seconds readout ticking for an hour is noise. Pure. */
export function countWords(c: Countdown, t: number, hour12: boolean): { big: string; unit: string; spoken: string } {
  const left = Math.max(0, c.target - t), min = Math.ceil(left / 60_000);
  if (c.kind === 'left') return { big: fmtClock(left / 1000), unit: 'left', spoken: `${min} minute${min === 1 ? '' : 's'} left` };
  if (left < 3_600_000) return { big: fmtClock(left / 1000), unit: 'until it starts', spoken: `Starts in ${min} minute${min === 1 ? '' : 's'}` };
  const h = Math.floor(min / 60), m = min % 60, words = `in ${h} h${m ? ` ${m} min` : ''}`;
  return { big: fmtTime(c.target, hour12), unit: words, spoken: `Starts at ${fmtTime(c.target, hour12)}, ${words}` };
}

/** One class as a row: time, tint mark, name, room and teacher, the attendance bubble. Tap = mark, hold = edit.
 *  `quiet` is D-11's focus rule: while a class runs, the rest of the day steps back. By tone, not by opacity:
 *  64 % opacity (the sketch's number) would put the meta line at 2.7:1 on the glass; ink → ink2 keeps every line
 *  above 4.5:1 and still lets the Now card lead. */
export function ClassRow({ item, tint, divider, quiet, onOpen, onEdit }: { item: ClassItem; tint: string; divider?: boolean; quiet?: boolean; onOpen: () => void; onEdit: () => void }) {
  const { t, scheme } = useV2();
  return (
    <Tap onPress={onOpen} onLongPress={onEdit} label={item.spoken} hint="Opens attendance. Hold to edit the class." testID={`class-${item.key}`}>
      <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: SPACE.s3, paddingVertical: SPACE.s2, borderTopWidth: divider ? 0.5 : 0, borderTopColor: t.ring }}>
        <T k="bodyS" c="ink2" style={{ width: 52 }}>{item.range.split('–')[0]}</T>
        <View style={quiet ? { opacity: 0.64 } : null}><TintMark color={tint} height={28} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T k="body" c={item.cancelled ? 'ink3' : quiet ? 'ink2' : 'ink'} numberOfLines={2} style={item.cancelled ? { textDecorationLine: 'line-through' } : null}>{item.name}</T>
          <T k="bodyS" c="ink3" numberOfLines={1}>{[item.part, item.room, item.teacher].filter(Boolean).join(' · ') || item.range}</T>
        </View>
        <Bubble state={item.bubble} size={20} scheme={scheme} label={item.name} />
      </View>
    </Tap>
  );
}

/**
 * The Now card (D-11). It owns a 1 Hz clock for the digits only; everything else it shows comes from the page's
 * view-model, which moves on the minute — exactly where class boundaries fall — so the two never disagree.
 * In class it wears the `now` ring (the one reserved amber). No eyebrow over the class name: the state is said by
 * the countdown's own words ("left" / "until it starts") and by the ring.
 */
export function NowCard({ card, live, hour12, bar, tintFor, onPick, onMark, onMarkLong, onOpenClass, onEditClass, onToday }: {
  card: NowCardVM; live: boolean; hour12: boolean;
  /** `settings.bar`: the default ('glass') draws the bubble track; a chosen instrument keeps drawing (v0.6 choice kept) */
  bar: string;
  tintFor: (courseId: string) => string;
  onPick: (k: number) => void; onMark: () => void; onMarkLong: () => void;
  onOpenClass: (x: ClassItem) => void; onEditClass: (x: ClassItem) => void; onToday: () => void;
}) {
  const { t, scheme } = useV2();
  /* 1 Hz only while the digits show seconds on the page under your finger; frozen (0) on a hidden page (audit M5) */
  const now = useNow(!live ? 0 : card.count ? 1000 : 60_000);
  const [w, setW] = useState(0);
  const cw = card.count ? countWords(card.count, now, hour12) : null;
  const ring = card.state === 'inClass' ? { borderColor: t.now, borderTopColor: t.now, borderWidth: 1.5 } : null;
  const compact = card.state === 'none';
  return (
    <View testID="now-card" style={[glassStyle(scheme), ring, { gap: compact ? SPACE.s1 : SPACE.s3 }]} onLayout={(e) => { const v = Math.round(e.nativeEvent.layout.width) - SPACE.card * 2; if (v !== w) setW(v); }}>
      <View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: SPACE.s2, rowGap: SPACE.s1 }}>
          <T k={compact ? 'subtitle' : 'title'} accessibilityRole="header" style={{ flexGrow: 1, flexShrink: 1, flexBasis: 180 }}>{card.title}</T>
          {card.room ? <View style={{ marginTop: 1 }}><Chip text={card.room} /></View> : null}
          {/* the 40 dp button's label sits on the title's line: lifted by half the height difference */}
          {card.state === 'picked' ? <Button small kind="text" label="Today" a11y="Back to today" onPress={onToday} testID="now-today" style={{ marginTop: -SPACE.s2 }} /> : null}
        </View>
        {card.meta ? <T k="bodyS" c="ink2" style={{ marginTop: 2 }}>{card.meta}</T> : null}
      </View>
      {card.tabs ? (
        <Segmented label="Classes on now" testID="now-tabs" value={String(card.tabs.findIndex((x) => x.on))} options={card.tabs.map((x, k) => [String(k), x.label] as const)} onChange={(v) => onPick(Number(v))} />
      ) : null}
      {cw ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.s3 }}>
          <T k="display" accessibilityLabel={cw.spoken} testID="now-count">{cw.big}</T>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T k="label" c="ink2">{cw.unit}</T>
            {card.position ? <T k="bodyS" c="ink3">{card.position}</T> : null}
          </View>
          {card.mark ? (
            <Tap onPress={onMark} onLongPress={onMarkLong} testID="now-mark" label={card.mark.bubble === 'empty' ? `Mark ${card.mark.title} present` : `${card.mark.title} attendance`} hint="Hold for absent, cancelled or a reason"
              style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: SPACE.s2, paddingHorizontal: SPACE.s3, borderRadius: 24, backgroundColor: t.fill }}>
              <Bubble state={card.mark.bubble} size={20} scheme={scheme} />
              <T k="label" style={{ fontWeight: '600' }}>{card.mark.bubble === 'empty' ? 'Mark' : card.mark.bubble === 'absent' ? 'Absent' : card.mark.bubble === 'struck' ? 'Cancelled' : 'Present'}</T>
            </Tap>
          ) : null}
        </View>
      ) : null}
      {card.track ? (bar === 'glass' || !w
        ? <DayTrack track={card.track} now={now} hour12={hour12} today={card.state !== 'picked'} />
        : <DayBar kind={bar as AnyBarKind} periods={card.track.stops.map((s) => ({ start: s.start, end: s.end, label: s.label, cancelled: s.cancelled }))} now={now} ink={t.ink} bg={t.flat} w={w} h={48} live={live} />) : null}
      {card.rows.length ? (
        <View>
          {card.rows.map((x, k) => <ClassRow key={x.key} item={x} tint={tintFor(x.courseId)} divider={k > 0} onOpen={() => onOpenClass(x)} onEdit={() => onEditClass(x)} />)}
        </View>
      ) : null}
      {card.next ? <T k="bodyS" c="ink2" testID="now-next">{card.next}</T> : null}
    </View>
  );
}
