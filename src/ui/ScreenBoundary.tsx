import React from 'react';
import { View } from 'react-native';
import { Btn, HandBox, Icon, Tape, Txt } from './kit';
import { useTheme } from './theme-context';
import { recordCrash } from './crashlog';

/**
 * One page's own error boundary.
 *
 * `CrashBoundary` in App.tsx is the right answer to "the app cannot draw itself": it stops everything
 * and says so. It was the wrong answer to "one page hit a problem" — a single bad render on Stats
 * replaced the whole shell, so the nav bar was gone too and the student could not even reach
 * Settings → Diagnostics to copy the details out. This boundary lives INSIDE the navigator, around
 * one screen, so a failure is contained to the page it happened on: the nav still works, the other
 * five pages still draw, the store is untouched, and the failure is written to the same Problems log
 * with the route it happened on (`'runtime'`).
 *
 * Still a class on purpose: `getDerivedStateFromError`/`componentDidCatch` have no hook equivalent.
 * The crash is recorded in `componentDidCatch` and NOT in `render`, so re-rendering the fallback
 * cannot append the same failure twice. `Try again` clears the state, which remounts the child — the
 * only action that gives the page a chance to draw again.
 *
 * Nothing here animates: the app's motion vocabulary is in `kit.tsx`, and a recovery card earns no
 * new entry in it.
 */
export class ScreenBoundary extends React.Component<{ route: string; children?: React.ReactNode }, { error: unknown }> {
  override state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { error }; }
  override componentDidCatch(error: unknown) { recordCrash(error, 'runtime', this.props.route); }
  private retry = () => this.setState({ error: null });
  override render() {
    // The message comes from the thrown value, not from the logged entry: `componentDidCatch` runs
    // AFTER the fallback is committed, so a fallback that read the entry would paint "Unknown error"
    // and then never repaint — the entry field is set, but nothing re-renders the card.
    return this.state.error ? <PageCrash message={messageOf(this.state.error)} onRetry={this.retry} /> : this.props.children;
  }
}

/** The same derivation `recordCrash` uses, so the card and the log cannot disagree about the text. */
function messageOf(e: unknown): string {
  const err = e instanceof Error ? e : new Error(String((e as { message?: unknown })?.message ?? e));
  return err.message || String(e) || 'Unknown error';
}

/** The in-page fallback. Paper and ink like every other card, because it appears inside a working app,
 *  and `flex: 1` so it fills the page slot the failed screen left behind rather than collapsing to a
 *  strip at the top of the window. */
function PageCrash({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24 }}>
      <HandBox seed="page-crash" style={{ padding: 16, paddingTop: 22, gap: 10 }}>
        <Tape w={64} rot={-4} style={{ top: -9, alignSelf: 'center' }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="note" size={24} color={c.bad} />
          <Txt f="marker" s={24} accessibilityRole="header">This page hit a problem</Txt>
        </View>
        <Txt f="type" s={14} c="mut" selectable numberOfLines={4} style={{ lineHeight: 18 }}>{message}</Txt>
        <Btn label="Try again" onPress={onRetry} />
        <Txt f="serif" s={14} c="mut">The rest of the app still works: the tabs, and every other page. Settings → Diagnostics has the details to copy.</Txt>
      </HandBox>
    </View>
  );
}
