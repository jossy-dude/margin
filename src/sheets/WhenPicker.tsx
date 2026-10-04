import React, { useMemo, useState } from 'react';
import { ScrollView, View, Pressable } from 'react-native';
import { Chip, HandBox, Row, Stepper, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme-context';
import { FS } from '../ui/fit';
import { DW, MO, addDays, atTime, fmtWhen, fromMin, hm, startOfDay, weekdayOf } from '../domain/time';
import { fx } from '../services/fx';

const r5 = (ms: number) => Math.ceil(ms / 300_000) * 300_000;
export const nextHome = (now: number, homeAt: string) => { const t = atTime(now, homeAt); return t > now + 300_000 ? t : atTime(addDays(startOfDay(now), 1), homeAt); };
export function presetsFor(now: number, homeAt: string): { label: string; at: number }[] {
  const today = startOfDay(now), tmr = addDays(today, 1), wd = weekdayOf(new Date(now)), toFri = (4 - wd + 7) % 7 || 7, toMon = (7 - wd) % 7 || 7;
  const out = [{ label: 'In 1 h', at: r5(now + 3_600_000) }, { label: 'In 3 h', at: r5(now + 3 * 3_600_000) }, { label: 'When I get home', at: nextHome(now, homeAt) }, { label: 'Tonight 21:00', at: atTime(today, '21:00') }, { label: 'Tomorrow 08:00', at: atTime(tmr, '08:00') }, { label: 'Tomorrow 17:00', at: atTime(tmr, '17:00') }, { label: 'Friday 17:00', at: atTime(addDays(today, toFri), '17:00') }, { label: 'Next Mon 09:00', at: atTime(addDays(today, toMon), '09:00') }];
  return out.filter((p, i, a) => p.at > now && a.findIndex((x) => x.at === p.at) === i);
}
/** Due/start picker built for a thumb: presets first, then a day strip and two steppers. No system dialogs. */
export function WhenPicker({ value, onChange, now, homeAt, optional, nonePlaceholder = 'Not set', min }: { value: number | null; onChange: (v: number | null) => void; now: number; homeAt: string; optional?: boolean; nonePlaceholder?: string; min?: number }) {
  const { c } = useTheme(), [open, setOpen] = useState(false), pre = useMemo(() => presetsFor(now, homeAt).filter((p) => !min || p.at > min), [now, homeAt, min]);
  const base = value ?? r5(now + 3_600_000), days = useMemo(() => Array.from({ length: 35 }, (_, i) => addDays(startOfDay(now), i)), [now]);
  const minutes = hm(fromMin(new Date(base).getHours() * 60 + new Date(base).getMinutes())), setDay = (d: number) => { fx.select(); onChange(atTime(d, fromMin(minutes))); }, setMin = (m: number) => onChange(atTime(startOfDay(base), fromMin(m)));
  return (
    <View style={{ gap: 8 }}>
      <HandBox seed="when" shadow={false} fill={c.hl} style={{ paddingHorizontal: 12, paddingVertical: 8 }}><Txt f="bold" s={22} accessibilityLiveRegion="polite">{value ? fmtWhen(value, now) : nonePlaceholder}</Txt></HandBox>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }} keyboardShouldPersistTaps="handled">
        {optional && <Chip label="None" on={value === null} onPress={() => onChange(null)} />}
        {pre.map((p) => <Chip key={p.label} label={p.label} on={value === p.at} onPress={() => onChange(p.at)} />)}
        <Chip label={open ? 'Done' : 'Pick…'} icon={open ? 'check' : 'clock'} on={open} onPress={() => { if (!open && value === null) onChange(base); setOpen(!open); }} />
      </ScrollView>
      {open && (
        <View style={{ gap: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
            {days.map((d) => { const on = startOfDay(base) === d, dt = new Date(d); return (
              <Pressable key={d} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${DW[weekdayOf(dt)]} ${dt.getDate()} ${MO[dt.getMonth()]}`} onPress={() => setDay(d)}>
                <HandBox seed={`d${d}`} fill={on ? c.acc : c.card} shadow={false} style={{ width: 52, height: 66, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt f="serif" s={13} maxFontSizeMultiplier={FS} c={on ? 'onAcc' : 'mut'}>{dt.getDate() === 1 || d === days[0] ? MO[dt.getMonth()]?.slice(0, 3) : DW[weekdayOf(dt)]}</Txt><Txt f="marker" s={22} maxFontSizeMultiplier={FS} c={on ? 'onAcc' : 'ink'}>{dt.getDate()}</Txt><Txt f="serif" s={12} maxFontSizeMultiplier={FS} c={on ? 'onAcc' : 'mut'}>{DW[weekdayOf(dt)]}</Txt>
                </HandBox></Pressable>); })}
          </ScrollView>
          <Row><Stepper label="hour" value={Math.floor(minutes / 60)} min={0} max={23} fmt={(v) => String(v).padStart(2, '0')} onChange={(h) => setMin(h * 60 + (minutes % 60))} /><Txt f="marker" s={26}>:</Txt><Stepper label="minutes" value={minutes % 60} min={0} max={55} step={5} fmt={(v) => String(v).padStart(2, '0')} onChange={(m) => setMin(Math.floor(minutes / 60) * 60 + m)} /></Row>
        </View>
      )}
    </View>
  );
}
