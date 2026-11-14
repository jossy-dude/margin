/**
 * v0.7 R8 — every v0.6 setting stays reachable. The lists below are the baseline taken before v0.7 work started
 * (`polish-pass/baseline/margin.json`: 66 rows of Settings, 33 settings keys, 21 notification keys). Each row must be in
 * the search index, each index row must still be drawn in `Settings.tsx`, on pages that still exist and are still
 * linked; each key must be edited by some row or say where it is edited instead. Search finds "quiet" → Quiet hours.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ELSEWHERE, PAGES, SETTINGS_INDEX, crumbs, searchSettings } from '../sheets/settings/settingsIndex';

const BASELINE_ROWS: string[] = ["Btn: Add class", "Btn: Add subject", "Btn: Allow notifications", "Btn: Open phone settings", "Btn: Play", "Btn: Rebuild queue", "Btn: Save to folder…", "Btn: Share newest", "Btn: Share…", "Btn: Show it now", "Btn: Test in 10 s", "Field: What should the app call you?", "Labelled: Break length", "Labelled: Effort buffer", "Labelled: Lead time", "MinStep: Active from", "MinStep: Active until", "MinStep: Quiet from", "MinStep: Quiet until", "MinStep: “When I get home”", "Nav: About", "Nav: Accent pen", "Nav: Alarms", "Nav: Attendance & semester", "Nav: Classes", "Nav: Data & export", "Nav: Delivery status", "Nav: Diagnostics", "Nav: Focus & breaks", "Nav: Hours & quiet time", "Nav: Import", "Nav: Look & feel", "Nav: Obsidian", "Nav: Paper & texture", "Nav: Per-subject lead time", "Nav: Progress bar", "Nav: Reminders", "Nav: Reset", "Nav: Semesters", "Nav: Show the introduction again", "Nav: Sound & haptics", "Nav: Tasks & exams", "Nav: Theme & palette", "Nav: Widgets", "NumberField: Break length", "NumberField: Effort buffer", "NumberField: Lead time", "Section: Safety copies", "Section: The next 14 days", "Section: What actually arrived", "Toggle: 24-hour clock", "Toggle: Ask me when a class ends", "Toggle: Class starting soon", "Toggle: Exam reminders", "Toggle: Flow mode by default", "Toggle: Haptics", "Toggle: Hold reminders until class ends", "Toggle: Lock attendance grid", "Toggle: Old-clock tick while focusing", "Toggle: Pin the class that is running", "Toggle: Quiet hours", "Toggle: Reminders", "Toggle: Show reminder text on the lock screen", "Toggle: Sound", "Toggle: Start-by nudges", "Toggle: Task reminders"];
const BASELINE_KEYS: string[] = ["alarms", "bar", "breakMin", "breaksPerRound", "clock", "focusFlow", "focusPresetMin", "hapticsOn", "hour12", "lockAttendance", "lookV", "name", "notif", "onboarded", "palette", "paper", "pen", "reduceMotion", "reminders", "seededAt", "semesterEnd", "semesterStart", "sky", "soundOn", "soundVol", "taskFilter", "taskSort", "taskSubject", "teacherAbsent", "texture", "theme", "tickOn", "vaultUri"];
const BASELINE_NOTIF_KEYS: string[] = ["activeDays", "activeFrom", "activeTo", "classEnded", "classLeadMin", "classSoon", "courseLead", "defaultTaskMinutes", "duringClass", "effortBuffer", "enabled", "examReminders", "homeAt", "lockText", "pinClass", "quietEnabled", "quietFrom", "quietTo", "startBy", "taskReminders", "weekend"];

const src = readFileSync(join(__dirname, '..', 'sheets', 'Settings.tsx'), 'utf8');
const types = readFileSync(join(__dirname, '..', 'domain', 'types.ts'), 'utf8');
const labels = new Set(SETTINGS_INDEX.map((x) => x.label));
const edited = new Set(SETTINGS_INDEX.flatMap((x) => x.keys ?? []));
/** The keys of an interface in types.ts, depth 0 only (comments stripped). */
function keysOf(name: string): string[] {
  const s = types.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const at = s.indexOf(`interface ${name} {`), open = s.indexOf('{', at);
  let depth = 0, body = '';
  for (let k = open; k < s.length; k++) { if (s[k] === '{') depth++; if (s[k] === '}') depth--; if (depth === 0) { body = s.slice(open + 1, k); break; } }
  let flat = '', d = 0;
  for (const ch of body) { if (ch === '{' || ch === '(' || ch === '[' || ch === '<') d++; if (ch === '}' || ch === ')' || ch === ']' || ch === '>') d--; else if (d === 0) flat += ch; }
  return [...flat.matchAll(/(\w+)\??\s*:/g)].map((m) => m[1]!);
}

describe('every v0.6 setting stays reachable (R8)', () => {
  it('each of the 66 baseline rows is in the search index', () => {
    expect(BASELINE_ROWS).toHaveLength(66);
    const missing = BASELINE_ROWS.map((r) => r.slice(r.indexOf(': ') + 2)).filter((l) => !labels.has(l));
    expect(missing).toEqual([]);
  });
  it('each index row is still drawn in Settings.tsx, on a page that still exists and is still linked', () => {
    for (const x of SETTINGS_INDEX) {
      expect({ label: x.label, drawn: src.includes(`"${x.label}"`) || src.includes(`'${x.label}'`) }).toEqual({ label: x.label, drawn: true });
      for (const p of x.path) {
        expect({ page: p, titled: p in PAGES, linked: src.includes(`to="${p}"`) }).toEqual({ page: p, titled: true, linked: true });
      }
    }
    // and the index's page titles are Settings' own
    const titles = Object.fromEntries([...src.match(/const TITLES[^=]*=\s*\{([^}]*)\}/)![1]!.matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
    expect(PAGES).toEqual(titles);
  });
  it('each settings key (the 33 + 21 of the baseline, and every key since) is edited by a row or says where else', () => {
    expect([BASELINE_KEYS.length, BASELINE_NOTIF_KEYS.length]).toEqual([33, 21]);
    const nowKeys = keysOf('Settings'), nowNotif = keysOf('NotifSettings');
    for (const k of BASELINE_KEYS) expect(nowKeys).toContain(k);
    for (const k of BASELINE_NOTIF_KEYS) expect(nowNotif).toContain(k);
    const open = [...new Set([...BASELINE_KEYS, ...nowKeys])].filter((k) => k !== 'notif' && !edited.has(k) && !(k in ELSEWHERE));
    const openNotif = [...new Set([...BASELINE_NOTIF_KEYS, ...nowNotif])].filter((k) => !edited.has(`notif.${k}`));
    expect({ open, openNotif }).toEqual({ open: [], openNotif: [] });
  });
});

describe('search', () => {
  it('"quiet" finds Quiet hours first, on Reminders › Hours & quiet time', () => {
    const [hit] = searchSettings('quiet');
    expect(hit).toMatchObject({ label: 'Quiet hours', path: ['notifications', 'nhours'] });
    expect(crumbs(hit!)).toBe('Reminders › Hours & quiet time');
    expect(searchSettings('Quiet').map((x) => x.label).slice(0, 3)).toEqual(['Quiet hours', 'Quiet from', 'Quiet until']);
  });
  it('finds by other words people use, and finds nothing for one letter or nonsense', () => {
    expect(searchSettings('dark')[0]?.label).toBe('Theme & palette');
    expect(searchSettings('backup')[0]?.label).toBe('Automatic backup');
    expect(searchSettings('vibration')[0]?.label).toBe('Sound & haptics');
    expect(searchSettings('12-hour')[0]?.label).toBe('24-hour clock');
    expect(searchSettings('q')).toEqual([]);
    expect(searchSettings('zzqx')).toEqual([]);
  });
});
