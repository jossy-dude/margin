import React, { useMemo, useState } from 'react';
import { View, Pressable } from 'react-native';
import { Chip, HandBox, HStrip, Reveal, Row, Stepper, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme-context';
import { FS } from '../ui/fit';
import { DW, MO, addDays, atTime, fmtTime, fmtWhen, fromMin, hm, startOfDay, weekdayOf } from '../domain/time';
import { fx } from '../services/fx';

const r5 = (ms: number) => Math.ceil(ms / 300_000) * 300_000;
export const nextHome = (now: number, homeAt: string) => { const t = atTime(now, homeAt); return t > now + 300_000 ? t : atTime(addDays(startOfDay(now), 1), homeAt); };
export function presetsFor(now: number, homeAt: string, h12 = false): { label: string; at: number }[] {
  const today = startOfDay(now), tmr = addDays(today, 1), wd = weekdayOf(new Date(now)), toFri = (4 - wd + 7) % 7 || 7, toMon = (7 - wd) % 7 || 7;
  /* The five baked times are printed through `fmtTime` so the label matches the clock the picker itself is
     reading in; the three relative labels ("In 1 h", "In 3 h", "When I get home") carry no wall clock and
     stay verbatim in both. */
  const tonight = atTime(today, '21:00'), tmr8 = atTime(tmr, '08:00'), tmr17 = atTime(tmr, '17:00'), fri17 = atTime(addDays(today, toFri), '17:00'), mon9 = atTime(addDays(today, toMon), '09:00');
  const out = [{ label: 'In 1 h', at: r5(now + 3_600_000) }, { label: 'In 3 h', at: r5(now + 3 * 3_600_000) }, { label: 'When I get home', at: nextHome(now, homeAt) }, { label: `Tonight ${fmtTime(tonight, h12)}`, at: tonight }, { label: `Tomorrow ${fmtTime(tmr8, h12)}`, at: tmr8 }, { label: `Tomorrow ${fmtTime(tmr17, h12)}`, at: tmr17 }, { label: `Friday ${fmtTime(fri17, h12)}`, at: fri17 }, { label: `Next Mon ${fmtTime(mon9, h12)}`, at: mon9 }];
  return out.filter((p, i, a) => p.at > now && a.findIndex((x) => x.at === p.at) === i);
}
/** Due/start picker built for a thumb: presets first, then a day strip and two steppers. No system dialogs.
 *  `h12` is the user's 12/24-hour choice (settings.hour12), passed in by the parent like `now` so this stays
 *  a pure component with no store import — see `fmtWhen` in `domain/time.ts`. */
export function WhenPicker({ value, onChange, now, homeAt, optional, nonePlaceholder = 'Not set', h12 = false }: { value: number | null; onChange: (v: number | null) => void; now: number; homeAt: string; optional?: boolean; nonePlaceholder?: string; h12?: boolean }) {
  const { c } = useTheme(), [open, setOpen] = useState(false), pre = useMemo(() => presetsFor(now, homeAt, h12), [now, homeAt, h12]);
  const base = value ?? r5(now + 3_600_000), days = useMemo(() => Array.from({ length: 35 }, (_, i) => addDays(startOfDay(now), i)), [now]);
  const minutes = hm(fromMin(new Date(base).getHours() * 60 + new Date(base).getMinutes())), setDay = (d: number) => { fx.select(); onChange(atTime(d, fromMin(minutes))); }, setMin = (m: number) => onChange(atTime(startOfDay(base), fromMin(m)));
  return (
    <View style={{ gap: 8 }}>
      <HandBox seed="when" shadow={false} fill={c.hl} style={{ paddingHorizontal: 12, paddingVertical: 8 }}><Txt f="bold" s={22} accessibilityLiveRegion="polite">{value ? fmtWhen(value, now, h12) : nonePlaceholder}</Txt></HandBox>
      <HStrip gap={8} bg={c.card}>
        {optional && <Chip label="None" on={value === null} onPress={() => onChange(null)} />}
        {pre.map((p) => <Chip key={p.label} label={p.label} on={value === p.at} onPress={() => onChange(p.at)} />)}
        <Chip label={open ? 'Done' : 'Pick…'} icon={open ? 'check' : 'clock'} on={open} onPress={() => { if (!open && value === null) onChange(base); setOpen(!open); }} />
      </HStrip>
      <Reveal open={open}>
          <HStrip gap={6} bg={c.card}>
            {days.map((d) => { const on = startOfDay(base) === d, dt = new Date(d); return (
              <Pressable key={d} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${DW[weekdayOf(dt)]} ${dt.getDate()} ${MO[dt.getMonth()]}`} onPress={() => setDay(d)}>
                <HandBox seed={`d${d}`} fill={on ? c.acc : c.card} shadow={false} style={{ width: 52, height: 66, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt f="serif" s={13} maxFontSizeMultiplier={FS} c={on ? 'onAcc' : 'mut'}>{dt.getDate() === 1 || d === days[0] ? MO[dt.getMonth()]?.slice(0, 3) : DW[weekdayOf(dt)]}</Txt><Txt f="marker" s={22} maxFontSizeMultiplier={FS} c={on ? 'onAcc' : 'ink'}>{dt.getDate()}</Txt><Txt f="serif" s={12} maxFontSizeMultiplier={FS} c={on ? 'onAcc' : 'mut'}>{DW[weekdayOf(dt)]}</Txt>
                </HandBox></Pressable>); })}
          </HStrip>
          <Row><Stepper label="hour" value={Math.floor(minutes / 60)} min={0} max={23} fmt={(v) => (h12 ? String(v % 12 || 12) : String(v).padStart(2, '0'))} onChange={(h) => setMin(h * 60 + (minutes % 60))} /><Txt f="marker" s={26}>:</Txt><Stepper label="minutes" value={minutes % 60} min={0} max={55} step={5} fmt={(v) => String(v).padStart(2, '0')} onChange={(m) => setMin(Math.floor(minutes / 60) * 60 + m)} />{h12 && <><Chip label="AM" on={minutes < 720} onPress={() => setMin(minutes % 720)} /><Chip label="PM" on={minutes >= 720} onPress={() => setMin((minutes % 720) + 720)} /></>}</Row>
      </Reveal>
    </View>
  );
}
