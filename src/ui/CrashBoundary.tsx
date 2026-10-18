import React from 'react';
import { ScrollView, View } from 'react-native';
import { Btn, HandBox, Icon, Tape, Txt } from './kit';
import { PaperBg } from './PaperBg';
import { useTheme } from './theme-context';
import { crashCount, recordCrash, type CrashEntry } from './crashlog';

/**
 * The recovery screen, in the app's own language: paper, a taped hand-cut card, the same buttons as everywhere
 * else. It is deliberately not a bare view with one line of red text — this is what the user sees when
 * something is already broken, so it has to look like the app and say what happens next.
 *
 * `useTheme()` outside a `ThemeProvider` returns the context default (refined light), so this also renders
 * correctly in the outer boundary that sits above the provider.
 */
export function CrashScreen({ entry, onRetry }: { entry: CrashEntry | null; onRetry?: () => void }) {
  const { c } = useTheme(), n = crashCount();
  return (
    <View style={{ flex: 1 }}>
      <PaperBg />
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 }}>
        <HandBox seed="crash" style={{ width: '100%', maxWidth: 460, padding: 18, paddingTop: 22, gap: 10 }}>
          <Tape w={72} rot={-5} style={{ top: -9, alignSelf: 'center' }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="note" size={26} color={c.bad} />
            <Txt f="marker" s={26} accessibilityRole="header">Something came unstuck</Txt>
          </View>
          <Txt f="serif" s={16} c="mut">
            A page failed to draw, so the app stopped instead of carrying on wrong. Nothing was lost: your subjects,
            timetable, marks and tasks are still in the database on this phone.
          </Txt>
          {entry ? (
            <View style={{ gap: 2 }}>
              <Txt f="bold" s={18} numberOfLines={3}>{entry.message || 'Unknown error'}</Txt>
              <Txt f="serif" s={14} c="mut">
                {entry.phase === 'boot' ? 'Failed while starting up' : `Failed on ${entry.route}`} · written to the crash log
              </Txt>
            </View>
          ) : null}
          {onRetry ? <Btn label="Try again" onPress={onRetry} /> : null}
          <Txt f="serif" s={14} c="mut">
            {n === 0
              ? 'Nothing else was recorded. If it keeps happening, Settings → Diagnostics has the details to copy.'
              : `${n} crash${n === 1 ? '' : 'es'} recorded. Settings → Diagnostics has the details to copy.`}
          </Txt>
        </HandBox>
      </ScrollView>
    </View>
  );
}

interface Props {
  children?: React.ReactNode;
  /** `boot` for the boundary that wraps the providers, `runtime` for the one inside the theme */
  phase: 'boot' | 'runtime';
  /** supplied by App.tsx so this module never imports the store itself: a boot failure can happen before the
   *  store is usable, and a module that cannot even load would leave a blank screen — the one thing this
   *  component exists to prevent. Must never throw. */
  getRoute?: () => string;
}

/**
 * Catches render and lifecycle errors anywhere below it, stores them (message, stack, route, timestamp, app
 * version, boot-vs-runtime) and shows `CrashScreen` instead of React's blank red box. Mounted twice in
 * App.tsx: above `ThemeProvider` so a failure in a provider still draws something, and inside it so the screen
 * is in the user's real theme.
 */
export class CrashBoundary extends React.Component<Props, { error: unknown }> {
  override state = { error: null as unknown };
  private entry: CrashEntry | null = null;
  static getDerivedStateFromError(error: unknown) { return { error }; }
  override componentDidCatch(error: unknown) {
    let route = 'unknown';
    try { route = this.props.getRoute?.() ?? 'unknown'; } catch { /* keep 'unknown' */ }
    this.entry = recordCrash(error, this.props.phase, this.props.phase === 'boot' ? 'boot' : route);
  }
  private retry = () => { this.entry = null; this.setState({ error: null }); };
  override render() {
    return this.state.error ? <CrashScreen entry={this.entry} onRetry={this.retry} /> : this.props.children;
  }
}
