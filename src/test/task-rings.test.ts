/** v0.7.8.4 (SPEC §9.9): task reminders ring natively; Done and Snooze 10 min need no JS. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { nativeRing } from '../domain/notifActions';

const MAIN = join(__dirname, '..', '..', 'modules', 'margin-native', 'android', 'src', 'main');
const kt = readFileSync(join(MAIN, 'java', 'app', 'marginalia', 'nativebits', 'TaskRings.kt'), 'utf8');

describe('which plan items ring natively', () => {
  const p = (kind: string, entityId = 't1') => ({ id: `x-${kind}`, kind, at: 5, title: 'T', body: 'B', entityId });
  it('a task or an exam task: with Done for that task', () => {
    expect(nativeRing(p('task'))).toEqual({ id: 'x-task', at: 5, title: 'T', body: 'B', task: 't1' });
    expect(nativeRing(p('exam'))?.task).toBe('t1');
  });
  it("a notice's exam ring: Snooze only", () => { expect(nativeRing(p('exam', 'n-9'))?.task).toBe(''); });
  it('classes, starts and focus stay with expo', () => { for (const k of ['class', 'ended', 'start', 'focus']) expect(nativeRing(p(k))).toBeNull(); });
});

describe('TaskRings.kt', () => {
  it('Done ticks natively through TaskTick, off the main thread', () => {
    expect(kt).toContain('TaskTick.tick(context, r.task)');
    expect(kt).toContain('goAsync()');
  });
  it('Snooze is ten minutes', () => { expect(kt).toContain('SNOOZE_MS = 10 * 60_000L'); });
  it('Done only for a task; Snooze always', () => {
    expect(kt).toContain('if (r.task.isNotEmpty()) b.addAction(Notification.Action.Builder(null, "Done"');
    expect(kt).toContain('"Snooze 10 min"');
  });
  it('exact while idle, falling back when exact alarms are not allowed', () => {
    expect(kt).toContain('setExactAndAllowWhileIdle');
    expect(kt).toContain('canScheduleExactAlarms()');
  });
  it('re-armed after a reboot, a clock change or an update', () => {
    expect(readFileSync(join(MAIN, 'java', 'app', 'marginalia', 'nativebits', 'Surfaces.kt'), 'utf8')).toContain('TaskRings.rearm(context.applicationContext)');
  });
  it('the receiver is in the manifest, not exported', () => {
    expect(readFileSync(join(MAIN, 'AndroidManifest.xml'), 'utf8')).toContain('<receiver android:name="app.marginalia.nativebits.TaskRingReceiver" android:exported="false"/>');
  });
  it('uses the tasks channel expo made, so the sound setting is one', () => {
    expect(kt).toContain('CHANNEL = "tasks_v2"');
    expect(readFileSync(join(__dirname, '..', 'services', 'notifications.ts'), 'utf8')).toContain("tasks: 'tasks_v2'");
  });
  it('JS hands task rings over and schedules the rest with expo', () => {
    const n = readFileSync(join(__dirname, '..', 'services', 'notifications.ts'), 'utf8');
    expect(n).toContain('const native = Platform.OS === \'android\' && planTaskRings(rings);');
    expect(n).toContain('const items = native ? plan.items.filter((p) => !nativeRing(p)) : plan.items;');
  });
});
