import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterClose } from '../ui/after';

/** What a sheet does once it has finished closing. Every dismissal — hardware Back, the drag, the dim
 *  area, the ✕ — and the button that asks for something afterwards all go through the same `close()`,
 *  so this is the one place that can tell "close, then do X" from "the user dismissed it". */
describe('a queued follow-up is cancelled by a dismissal (BUG-015)', () => {
  it('runs what was queued, once', () => {
    const q = afterClose();
    let ran = 0;
    q.ask(() => { ran += 1; });
    expect(q.queued).toBe(true);
    expect(q.run()).toBe(true);
    expect(ran).toBe(1);
  });

  it('running twice does not run it twice — the animation callback fires once, and React StrictMode fires twice', () => {
    const q = afterClose();
    let ran = 0;
    q.ask(() => { ran += 1; });
    expect(q.run()).toBe(true);
    expect(q.run()).toBe(false);
    expect(q.run()).toBe(false);
    expect(ran).toBe(1);
  });

  it('a dismissal after the button cancels the navigation', () => {
    // this is the defect: the button queued `act.focusOpen`, the user then dismissed the sheet, and
    // the untracked timer fired anyway — navigating to Focus and re-initialising the timer
    const q = afterClose();
    let ran = 0;
    q.ask(() => { ran += 1; }); // "Start a focus session"
    q.ask(undefined); // …Back, or a tap on the dim area, inside the window
    expect(q.queued).toBe(false);
    expect(q.run()).toBe(false);
    expect(ran).toBe(0);
  });

  it('the most recent ask wins, so a second button press replaces the first', () => {
    const q = afterClose();
    const seen: string[] = [];
    q.ask(() => seen.push('free focus'));
    q.ask(() => seen.push('this task'));
    q.run();
    expect(seen).toEqual(['this task']);
  });

  it('an ask after a run is a fresh one, not a replay', () => {
    const q = afterClose();
    const seen: string[] = [];
    q.ask(() => seen.push('a'));
    q.run();
    q.ask(() => seen.push('b'));
    q.run();
    expect(seen).toEqual(['a', 'b']);
  });

  it('a Pressable event is not mistaken for a follow-up', () => {
    // `onPress={close}` hands the gesture event to the handler; treating it as a callback would throw
    const q = afterClose();
    q.ask({ nativeEvent: {} } as unknown as () => void);
    expect(q.queued).toBe(false);
    expect(q.run()).toBe(false);
  });

  it('nothing queued means nothing runs', () => {
    const q = afterClose();
    expect(q.queued).toBe(false);
    expect(q.run()).toBe(false);
  });
});

describe('the deferred navigation goes through the sheet, not a bare timer', () => {
  const sheet = readFileSync(join(__dirname, '../ui/Sheet.tsx'), 'utf8');
  const forms = readFileSync(join(__dirname, '../sheets/forms.tsx'), 'utf8');

  it('Sheet.close takes an optional follow-up and runs it when the animation finishes', () => {
    expect(sheet).toContain('afterClose()');
    expect(sheet).toContain('after.ask(next)');
    expect(sheet).toContain('after.run()');
    // and a dismissal can cancel one that is already queued
    expect(sheet).toContain('onPress={() => close()}');
  });

  it('both focus buttons use it, and no raw timer survives', () => {
    expect(forms).toContain('close(() => act.focusOpen(null))');
    expect(forms).toContain('close(() => act.focusOpen(existing.id))');
    expect(forms).not.toMatch(/setTimeout\(\(\) => act\.focusOpen/);
    expect(forms.split('act.focusOpen').length - 1).toBe(2); // exactly the two buttons, both routed
  });

  it('the follow-up runs after the sheet has closed, not before', () => {
    // onClose (which clears the sheet from the store) must be called before the navigation
    const finish = sheet.slice(sheet.indexOf('const finish'), sheet.indexOf('const close'));
    expect(finish.indexOf('onClose()')).toBeLessThan(finish.indexOf('after.run()'));
  });
});