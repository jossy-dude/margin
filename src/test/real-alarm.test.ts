/** v0.7.8.9 (owner's ask 1): a real alarm that only Volume Down stops, set up by touch. */
import { readFileSync } from 'fs';
import { join } from 'path';

const kt = readFileSync(join(__dirname, '..', '..', 'modules', 'margin-native', 'android', 'src', 'main', 'java', 'app', 'marginalia', 'nativebits', 'Alarms.kt'), 'utf8');
const page = readFileSync(join(__dirname, '..', 'sheets', 'Alarms.tsx'), 'utf8');

describe('only Volume Down stops it', () => {
  it('Volume Down dismisses', () => { expect(kt).toContain('KeyEvent.KEYCODE_VOLUME_DOWN -> { dismissHappy(); return true }'); });
  it('Volume Up and Mute are swallowed, on key down and up, so the alarm stream is not turned down', () => {
    expect(kt).toContain('KeyEvent.KEYCODE_VOLUME_UP, KeyEvent.KEYCODE_VOLUME_MUTE -> return true');
    expect(kt).toContain('override fun onKeyUp(');
  });
  it('no double tap silences it, and the notification has no Silence or Dismiss', () => {
    expect(kt).not.toContain('dispatchTouchEvent');
    expect(kt).not.toContain('"Silence", PendingIntent');
    expect(kt).not.toMatch(/Action\.Builder\(null, "Dismiss"/);
  });
  it('the screen says how to stop it; a test ring still taps off', () => {
    expect(kt).toContain('"Press Volume Down to stop"');
    expect(kt).toContain('"Tap to stop the test"');
  });
});

describe('the setup page is touch first', () => {
  it('one-tap times, leads, day sets and snoozes', () => {
    for (const k of ['QUICK_TIMES.map', 'LEADS.map', 'DAY_SETS.map', 'SNOOZES.map', 'a11y="Five minutes earlier"', 'a11y="Five minutes later"']) expect(page).toContain(k);
  });
  it('says what stops it', () => { expect(page).toContain('Only Volume Down stops it'); });
});
