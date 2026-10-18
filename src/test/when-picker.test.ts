import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addDays, atTime, fmtTime, startOfDay, weekdayOf } from '../domain/time';

/* ───────────────────────────────────────────────────────────────────────────
   W4 — the due/start picker's preset labels must read in the app's own clock.

   `presetsFor` lives in `src/sheets/WhenPicker.tsx`, which pulls in `react-native` (through `../ui/kit`),
   so a node-environment test cannot import it directly — the same reason `time-format.test.ts` models
   `relDue`/`nextWhen` from `screens/common.tsx`. It is therefore modelled here faithfully and the model
   is pinned to the real file below, so the two cannot drift without this test failing.

   The defect it guards: with the clock set to 12-hour the picker printed `Today · 4:25 PM` above steppers
   reading `16 : 25`, while its chips still said `Tonight 21:00`. The baked labels now go through
   `fmtTime`, the same formatter the header above them uses.
   ─────────────────────────────────────────────────────────────────────────── */

/* ── the model of `presetsFor` in src/sheets/WhenPicker.tsx ────────────────── */
const r5 = (ms: number) => Math.ceil(ms / 300_000) * 300_000;
const nextHome = (now: number, homeAt: string) => { const t = atTime(now, homeAt); return t > now + 300_000 ? t : atTime(addDays(startOfDay(now), 1), homeAt); };
function presetsFor(now: number, homeAt: string, h12 = false): { label: string; at: number }[] {
  const today = startOfDay(now), tmr = addDays(today, 1), wd = weekdayOf(new Date(now)), toFri = (4 - wd + 7) % 7 || 7, toMon = (7 - wd) % 7 || 7;
  const tonight = atTime(today, '21:00'), tmr8 = atTime(tmr, '08:00'), tmr17 = atTime(tmr, '17:00'), fri17 = atTime(addDays(today, toFri), '17:00'), mon9 = atTime(addDays(today, toMon), '09:00');
  const out = [{ label: 'In 1 h', at: r5(now + 3_600_000) }, { label: 'In 3 h', at: r5(now + 3 * 3_600_000) }, { label: 'When I get home', at: nextHome(now, homeAt) }, { label: `Tonight ${fmtTime(tonight, h12)}`, at: tonight }, { label: `Tomorrow ${fmtTime(tmr8, h12)}`, at: tmr8 }, { label: `Tomorrow ${fmtTime(tmr17, h12)}`, at: tmr17 }, { label: `Friday ${fmtTime(fri17, h12)}`, at: fri17 }, { label: `Next Mon ${fmtTime(mon9, h12)}`, at: mon9 }];
  return out.filter((p, i, a) => p.at > now && a.findIndex((x) => x.at === p.at) === i);
}

const NOW = new Date(2026, 9, 19, 8, 0, 0, 0).getTime(); // local Mon 19 Oct 2026, 08:00
const HOME = '17:00';
const labels = (h12: boolean) => presetsFor(NOW, HOME, h12).map((p) => p.label);

describe('presetsFor: the baked preset times follow the app\'s clock', () => {
  it('12-hour prints every baked time on the 12-hour clock', () => {
    const out = labels(true);
    expect(out).toContain('Tonight 9:00 PM');
    expect(out).toContain('Tomorrow 8:00 AM');
    expect(out).toContain('Tomorrow 5:00 PM');
    expect(out).toContain('Friday 5:00 PM');
    expect(out).toContain('Next Mon 9:00 AM');
  });

  it('24-hour is unchanged', () => {
    const out = labels(false);
    expect(out).toContain('Tonight 21:00');
    expect(out).toContain('Tomorrow 08:00');
    expect(out).toContain('Tomorrow 17:00');
    expect(out).toContain('Friday 17:00');
    expect(out).toContain('Next Mon 09:00');
    expect(out).not.toContain('Tonight 9:00 PM');
  });

  it('the three clockless labels are identical in both modes', () => {
    const timeless = (h12: boolean) => labels(h12).filter((l) => !l.includes(':'));
    expect(timeless(true)).toEqual(['In 1 h', 'In 3 h', 'When I get home']);
    expect(timeless(false)).toEqual(timeless(true));
  });
});

/* ── source pins for the model above (WhenPicker.tsx cannot be imported: react-native) ── */
describe('WhenPicker.tsx wiring — the presetsFor model cannot go stale', () => {
  const src = readFileSync(join(__dirname, '..', 'sheets', 'WhenPicker.tsx'), 'utf8');

  it('presetsFor takes the clock as its third argument and formats each baked label through fmtTime', () => {
    expect(src).toContain('export function presetsFor(now: number, homeAt: string, h12 = false)');
    expect(src).toContain('label: `Tonight ${fmtTime(tonight, h12)}`');
    expect(src).toContain('label: `Next Mon ${fmtTime(mon9, h12)}`');
  });

  it('the component threads h12 into the presets and into the hour stepper', () => {
    expect(src).toContain('presetsFor(now, homeAt, h12)');
    expect(src).toContain('[now, homeAt, h12]');
    expect(src).toContain("h12 ? String(v % 12 || 12) : String(v).padStart(2, '0')");
  });

  /* The first build of the 12-hour pen put ONE chip under the steppers that read `AM`/`PM` and flipped
     on tap. In a static frame it reads as a label — there is nothing on screen saying PM exists (the
     vision round failed it). It is now the pair the rest of the sheet already uses for choices
     (Assignment | Exam | Deadline): both halves visible, the active one filled. */
  it('the 12-hour stepper carries a visible AM/PM pair, not a lone flipping chip', () => {
    expect(src).toContain('<Chip label="AM" on={minutes < 720}');
    expect(src).toContain('<Chip label="PM" on={minutes >= 720}');
    expect(src).not.toContain("label={minutes >= 720 ? 'PM' : 'AM'}");
  });
});
