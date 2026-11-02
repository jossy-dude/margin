import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Chip, HandBox, Icon, Txt, faceOf } from '../ui/kit';
import { TimeField } from '../ui/fields';
import { useTheme } from '../ui/theme-context';
import { FS } from '../ui/fit';
import { DW, uid } from '../domain/time';
import { SLOT_KINDS, kindLabel, nextDraft, type SlotDraft } from '../domain/schedule';
import { fx } from '../services/fx';

/** A subject's rooms, as chips: tap one to remove it, type a new one and press add. */
export function RoomChips({ rooms, onChange }: { rooms: string[]; onChange: (r: string[]) => void }) {
  const th = useTheme(), { c } = th, [draft, setDraft] = useState('');
  const add = () => { const r = draft.trim(); if (r && !rooms.some((x) => x.toLocaleLowerCase() === r.toLocaleLowerCase())) { onChange([...rooms, r]); fx.select(); } setDraft(''); };
  return (
    <View style={{ gap: 8 }}>
      {rooms.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{rooms.map((r) => <Chip key={r} small label={`${r}  ✕`} onPress={() => onChange(rooms.filter((x) => x !== r))} />)}</View> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput value={draft} onChangeText={setDraft} onSubmitEditing={add} placeholder={rooms.length ? 'Another room' : 'e.g. B-12'} placeholderTextColor={c.mut} accessibilityLabel="Add a room" returnKeyType="done" maxFontSizeMultiplier={FS}
          style={{ flex: 1, ...faceOf(th, 'bold', 20), color: c.ink, paddingVertical: 6, borderBottomWidth: 1.4, borderBottomColor: c.ink }} />
        <Chip small label="Add room" icon="plus" onPress={add} />
      </View>
    </View>
  );
}

/**
 * The weekly schedule, right inside the subject (owner: "when creating the subject, add its schedule right
 * there"). Each row is one weekly class — day, times, room, and kind (lecture or a lab/tutorial, which becomes
 * the subject's variant). The rows are a draft; the sheet's Save writes them (`domain/schedule.planSchedule`).
 */
export function ScheduleEditor({ rows, onChange, rooms, hour12 }: { rows: SlotDraft[]; onChange: (r: SlotDraft[]) => void; rooms: string[]; hour12: boolean }) {
  const { c, tints } = useTheme();
  const set = (k: string, p: Partial<SlotDraft>) => onChange(rows.map((r) => (r.key === k ? { ...r, ...p } : r)));
  return (
    <View style={{ gap: 10 }}>
      {rows.map((r, i) => (
        <HandBox key={r.key} seed={`slot-${r.key}`} fill={i % 2 ? tints.sky : tints.cream} cut="torn" style={{ padding: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Txt f="type" s={13} c="mut" style={{ flex: 1, letterSpacing: 1.6 }}>{`CLASS ${i + 1}`}</Txt>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove class ${i + 1}`} hitSlop={8} onPress={() => { fx.undone(); onChange(rows.filter((x) => x.key !== r.key)); }} style={{ width: 36, height: 30, alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={18} color={c.mut} /></Pressable>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }} accessibilityRole="radiogroup" accessibilityLabel="Day">
            {DW.map((d, wd) => <Chip key={d} small label={d} on={r.weekday === wd} onPress={() => set(r.key, { weekday: wd })} />)}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}><TimeField label={`class ${i + 1} start`} value={r.start} hour12={hour12} ruler={false} onChange={(v) => set(r.key, { start: v, end: r.end <= v ? Math.min(1435, v + 50) : r.end })} /></View>
            <Txt f="bold" s={20} c="mut">–</Txt>
            <View style={{ flex: 1 }}><TimeField label={`class ${i + 1} end`} value={r.end} hour12={hour12} ruler={false} onChange={(v) => set(r.key, { end: v })} /></View>
          </View>
          {r.end <= r.start ? <Txt f="bold" s={15} c="bad">It has to end after it starts.</Txt> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
            {SLOT_KINDS.map((k) => <Chip key={k || 'lecture'} small label={kindLabel(k)} on={r.kind.toLocaleLowerCase() === k.toLocaleLowerCase()} onPress={() => set(r.key, { kind: k })} />)}
          </View>
          {rooms.length > 1 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>{rooms.map((rm) => <Chip key={rm} small icon="today" label={rm} on={r.room === rm} onPress={() => set(r.key, { room: rm })} />)}</View>
          ) : null}
        </HandBox>
      ))}
      <Pressable accessibilityRole="button" accessibilityLabel="Add a weekly class" onPress={() => { fx.page(); onChange([...rows, nextDraft(rows, rooms[0] ?? '', uid('m'))]); /* the row's id is minted as it is added, never on save */ }}>
        <HandBox seed="slot-add" dashed fill="transparent" shadow={false} style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icon name="plus" size={20} /><Txt f="bold" s={18}>{rows.length ? 'Another weekly class' : 'Add when it meets'}</Txt>
        </HandBox>
      </Pressable>
    </View>
  );
}
