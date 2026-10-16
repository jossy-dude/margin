import React, { useCallback, useState } from 'react';
import { Clipboard, View } from 'react-native';
import { Btn, HandBox, Hair, Row, Txt } from '../ui/kit';
import { Label } from '../ui/Sheet';
import { Empty } from '../screens/common';
import { useTheme } from '../ui/theme-context';
import { getState, toast } from '../store/store';
import { appVersion, clearCrashes, formatAllCrashes, formatCrash, readCrashes, sdkVersion, testCrashReporter, type CrashEntry } from '../ui/crashlog';

/** Clipboard from react-native core. It is marked `@deprecated` (and logs one `warnOnce` the first time it is
 *  touched) but it is still a real native module in RN 0.86, and it is the only copy-to-clipboard available
 *  without adding a dependency, which this project forbids. `selectable` text is the guaranteed fallback: every
 *  crash block below can be long-pressed and copied from the Android selection menu. */
const copy = (text: string): boolean => {
  try {
    Clipboard.setString(text);
    return true;
  } catch {
    return false;
  }
};

const when = (ms: number) => {
  const d = new Date(ms), p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Settings → Diagnostics. Read-only apart from Clear: a copy of existing text components, no new UI language. */
export function DiagnosticsPage() {
  const { c } = useTheme();
  const [list, setList] = useState<CrashEntry[]>(readCrashes);
  const refresh = useCallback(() => setList(readCrashes()), []);
  const route = (() => { try { return getState().route; } catch { return 'unknown'; } })();
  const copyOne = (e: CrashEntry) => toast(copy(formatCrash(e)) ? 'Crash copied. Paste it anywhere.' : 'Press and hold the text below to copy it.');
  const copyAll = () => toast(copy(formatAllCrashes(list)) ? `Copied ${list.length} crash${list.length === 1 ? '' : 'es'}.` : 'Press and hold a block below to copy it.');
  return (
    <>
      <HandBox seed="diag" fill={c.card} style={{ padding: 12, gap: 4 }}>
        <Txt f="bold" s={20}>Marginalia {appVersion()} · Expo SDK {sdkVersion()}</Txt>
        <Txt f="serif" s={15} c="mut">
          {list.length === 0 ? 'No crashes recorded.' : `${list.length} crash${list.length === 1 ? '' : 'es'} recorded, newest first.`}
        </Txt>
        <Txt f="serif" s={14} c="mut">
          Stored on this phone only, in the app’s own files. Nothing is uploaded — there is no account and no network call.
        </Txt>
      </HandBox>
      <Row>
        <Btn small icon="note" label="Test the crash reporter" onPress={() => { const made = testCrashReporter(route); refresh(); toast(made ? 'Caught and recorded. The app is fine.' : 'Could not write the crash log.'); }} />
        <Btn small kind="ghost" icon="export" label="Copy all" disabled={list.length === 0} onPress={copyAll} />
        <Btn small kind="ghost" icon="trash" label="Clear" disabled={list.length === 0} onPress={() => { clearCrashes(); refresh(); toast('Crash log cleared'); }} />
      </Row>
      <Txt f="serif" s={14.5} c="mut">
        “Test the crash reporter” throws a real error and catches it on the spot. It is written to the log below and the app keeps running.
      </Txt>
      <Hair />
      {list.length === 0 ? <Empty icon="note" text="Nothing has gone wrong. If something does, it lands here." /> : (
        <View style={{ gap: 12 }}>{list.map((e) => (
          <HandBox key={e.id} seed={e.id} style={{ padding: 12, gap: 6 }}>
            <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              {/* `boot`/`runtime` name the page the failure happened on; `save`/`data` happen with no
                  page involved, so they name what the app was doing instead of inventing a route. */}
              <Txt f="bold" s={18} style={{ flexShrink: 1 }} numberOfLines={1}>{e.phase === 'boot' ? 'During boot' : e.phase === 'save' ? 'While saving' : e.phase === 'data' ? 'While reading data' : `On ${e.route}`}</Txt>
              <Txt f="serif" s={14} c="mut">{when(e.at)}</Txt>
            </Row>
            <Txt f="bold" s={17} c="bad" numberOfLines={3}>{e.message}</Txt>
            <Txt f="type" s={13} c="mut" selectable style={{ lineHeight: 17 }}>{e.stack}</Txt>
            <Row><Btn small kind="ghost" label="Copy this one" onPress={() => copyOne(e)} /></Row>
          </HandBox>
        ))}</View>
      )}
      <Label>What gets recorded</Label>
      <Txt f="serif" s={14.5} c="mut">
        The error message, its stack, the page you were on, the time, the app version and whether it happened before or after the app finished starting. No task, mark or note content is ever copied into the log.
      </Txt>
    </>
  );
}
