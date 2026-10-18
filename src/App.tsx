import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { loadAsync } from 'expo-font';
import { Caveat_500Medium } from '@expo-google-fonts/caveat/500Medium';
import { Caveat_700Bold } from '@expo-google-fonts/caveat/700Bold';
import { Newsreader_400Regular_Italic } from '@expo-google-fonts/newsreader/400Regular_Italic';
import { Newsreader_600SemiBold_Italic } from '@expo-google-fonts/newsreader/600SemiBold_Italic';
import { PermanentMarker_400Regular } from '@expo-google-fonts/permanent-marker/400Regular';
import { SpecialElite_400Regular } from '@expo-google-fonts/special-elite/400Regular';
import { ThemeProvider, useTheme } from './ui/theme-context';
import { CrashBoundary } from './ui/CrashBoundary';
import { ScreenBoundary } from './ui/ScreenBoundary';
import { recordCrash } from './ui/crashlog';
import { PaperBg } from './ui/PaperBg';
import { Btn, HandBox, Icon, Tape, Txt } from './ui/kit';
import { Overlay } from './ui/Overlay';
import { createBookNavigator } from './navigation/Book';
import { TodayScreen } from './screens/Today';
import { WeekScreen } from './screens/Week';
import { TasksScreen } from './screens/Tasks';
import { GradesScreen } from './screens/Grades';
import { StatsScreen } from './screens/Stats';
import { FocusScreen } from './screens/Focus';
import { Onboarding } from './screens/Onboarding';
import { TOUR_VERSION, toured } from './domain/defaults';
import { getState, hydrate, set, useStore, wireLifecycle, act } from './store/store';
import { openRepository } from './data/sqliteExpo';
import { configureNotifications } from './services/notifications';
import { initAudio, preloadAudio } from './services/audio';

const Book = createBookNavigator();

/** One page boundary per screen, built once at module scope so each `component` identity is stable —
 *  a wrapper created inside `Shell`'s render would remount the whole page on every render, and
 *  `navTree`'s `useMemo(() => …, [])` depends on that identity. A failure is then contained to the page
 *  it happened on instead of replacing the shell (see `ui/ScreenBoundary`). The name is set because a
 *  bare arrow here is anonymous and React DevTools would show six identical `guarded` entries. */
const guarded = (route: string, C: React.ComponentType) => {
  const Page = () => <ScreenBoundary route={route}><C /></ScreenBoundary>;
  Page.displayName = `${route}Page`;
  return Page;
};
const TodayGuarded = guarded('Today', TodayScreen), WeekGuarded = guarded('Week', WeekScreen), TasksGuarded = guarded('Tasks', TasksScreen);
const GradesGuarded = guarded('Grades', GradesScreen), StatsGuarded = guarded('Stats', StatsScreen), FocusGuarded = guarded('Focus', FocusScreen);

function Shell() {
  const { c } = useTheme();
  // While a sheet is open the navigator must not be reachable: `accessibilityViewIsModal` on the sheet is
  // iOS-only, so on Android the background is hidden explicitly here (background content must not be reachable
  // while a sheet is open). `ui/Overlay` marks itself `yes` over the same condition so the sheet stays readable.
  const sheet = useStore((s) => s.sheet);
  /** Stable identity on purpose: a fresh `theme` object per render put a new value into navigation's
   *  ThemeContext, which re-rendered every consumer on each sheet open/close. */
  const navTheme = React.useMemo(() => ({ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: c.desk, card: c.paper, text: c.ink, border: c.rule, primary: c.acc } }), [c]);
  /** The screen list never changes, so keeping the element identity stable lets React bail out of
   *  re-rendering the whole navigator whenever Shell itself re-renders (sheet/toast writes). */
  const navTree = React.useMemo(() => (
    <Book.Navigator initialRouteName="Today" screenOptions={{}}>
      <Book.Screen name="Today" component={TodayGuarded} /><Book.Screen name="Week" component={WeekGuarded} /><Book.Screen name="Tasks" component={TasksGuarded} />
      <Book.Screen name="Grades" component={GradesGuarded} /><Book.Screen name="Stats" component={StatsGuarded} /><Book.Screen name="Focus" component={FocusGuarded} />
    </Book.Navigator>
  ), []);
  return (
    <View style={{ flex: 1, backgroundColor: c.desk }}>
      <View style={{ flex: 1 }} importantForAccessibility={sheet ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={!!sheet}>
        <NavigationContainer theme={navTheme}>
          {navTree}
        </NavigationContainer>
      </View>
      <Overlay />
    </View>
  );
}

/** The database could not be opened or hydrated. Paper and ink like every other screen, and the one
 *  irreversible action in the app is guarded by the same double tap Settings → Reset uses. */
function Fatal({ message }: { message: string }) {
  const { c } = useTheme(), ins = useSafeAreaInsets(), [sure, setSure] = useState(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const reset = () => {
    if (!sure) { setSure(true); timer.current = setTimeout(() => setSure(false), 5000); return; }
    setSure(false); void act.resetAll();
  };
  return (
    <View style={{ flex: 1 }}>
      <PaperBg />
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: ins.top + 24, paddingBottom: ins.bottom + 24 }}>
        <HandBox seed="fatal" style={{ padding: 18, paddingTop: 24, gap: 12 }}>
          <Tape w={72} rot={-5} style={{ top: -9, alignSelf: 'center' }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="note" size={26} color={c.bad} />
            <Txt f="marker" s={26} accessibilityRole="header">The planner could not open your data</Txt>
          </View>
          <Txt f="serif" s={16} c="mut">
            Everything is still on this phone. Rebuilding the demo set replaces the database with a fresh copy — the only
            thing here that cannot be undone, which is why it asks twice, exactly like Settings → Reset.
          </Txt>
          <HandBox seed="fatal-msg" shadow={false} dashed fill="transparent" style={{ padding: 10 }}>
            <Txt f="type" s={14} c="mut" selectable style={{ lineHeight: 18 }}>{message}</Txt>
          </HandBox>
          <Btn kind={sure ? 'danger' : 'ghost'} icon="trash" label={sure ? 'Tap again to erase everything' : 'Reset to the demo set'} onPress={reset} />
          <Txt f="serif" s={14} c="mut">The reason is in Settings → Diagnostics.</Txt>
        </HandBox>
      </View>
    </View>
  );
}

/** One failed font left `fonts` false forever and the app sat on the spinner with nothing to say. */
function FontsFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  const ins = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <PaperBg />
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: ins.top + 24, paddingBottom: ins.bottom + 24 }}>
        <HandBox seed="fonts" style={{ padding: 18, paddingTop: 24, gap: 12 }}>
          <Tape w={72} rot={-5} style={{ top: -9, alignSelf: 'center' }} />
          <Txt f="marker" s={26} accessibilityRole="header">The handwriting would not load</Txt>
          <Txt f="serif" s={16} c="mut">The app needs its six font files before any page can be drawn. Check the connection and try again.</Txt>
          <HandBox seed="fonts-msg" shadow={false} dashed fill="transparent" style={{ padding: 10 }}>
            <Txt f="type" s={14} c="mut" selectable style={{ lineHeight: 18 }}>{message}</Txt>
          </HandBox>
          <Btn icon="export" label="Try again" onPress={onRetry} />
          <Txt f="serif" s={14} c="mut">Without the fonts the app would fall back to a plain sans-serif, so it waits here instead.</Txt>
        </HandBox>
      </View>
    </View>
  );
}

function Gate() {
  const ready = useStore((s) => s.ready), error = useStore((s) => s.error), onboarded = useStore((s) => s.settings.onboarded);
  if (!ready) return <Splash />;
  if (error) return <Fatal message={error} />;
  // The tour REPLACES the shell rather than covering it, so no page is mounted underneath it: nothing hidden
  // ticks, nothing fills off-screen, and no gesture can reach the app through it. That is why
  // it is a screen and not a sheet. Skipping and finishing write the same value — the point is only that it is
  // not shown twice — and Settings → "Show the tour again" replays it by writing `0`.
  if (!toured(onboarded)) return <Onboarding onFinish={() => act.setSettings({ onboarded: TOUR_VERSION })} />;
  return <Shell />;
}

const Splash = () => {
  const { c } = useTheme();
  return <View style={{ flex: 1, backgroundColor: c.paper }}><PaperBg /><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.acc} size="large" /></View></View>;
};

/** Module scope so the map identity is stable: `useFonts` re-runs its effect on every render if handed a
 *  fresh object literal. Loading imperatively also lets a failure be reported and retried. */
const FONT_MAP = { Caveat_500Medium, Caveat_700Bold, Newsreader_400Regular_Italic, Newsreader_600SemiBold_Italic, PermanentMarker_400Regular, SpecialElite_400Regular };

/** The runtime subtree. `useTheme()` is invisible above `ThemeProvider`, so both the status bar and the paint
 *  behind it live in this child of it rather than in `App` — read from `App` they would get the context default
 *  and pin the icon brightness. The background is what the band under the status bar shows, edge-to-edge.
 *
 *  **The status bar names its own background colour, and that is the fix for the black band.** It used to mount
 *  `expo-status-bar`'s wrapper, which forwards only `animated`, `hidden`, `barStyle` and `showHideTransition` and
 *  never `backgroundColor` (`expo-status-bar/src/NativeStatusBarWrapper.tsx:26-32`), so React Native filled the
 *  missing `backgroundColor` from its own default — and that default is the native `DEFAULT_BACKGROUND_COLOR`, i.e.
 *  `window.statusBarColor` printed as `#%06X` with the alpha dropped
 *  (`react-native/.../modules/statusbar/StatusBarModule.kt:70-73`, consumed at `Libraries/Components/StatusBar/StatusBar.js:235-241`).
 *  `android/app/src/main/res/values/styles.xml` declares that colour as `@android:color/transparent` (#00000000),
 *  which prints as `#000000` — so RN pushed `setColor(black)` on every mount (`StatusBar.js:475-488`). Edge-to-edge
 *  would ignore that, but React Native only turns edge-to-edge on for a device running Android 15+
 *  (`util/AndroidVersion.kt:42-44` gates on `Build.VERSION.SDK_INT`, read at `views/view/WindowUtil.kt:45-68`),
 *  so on Android 13/14 the window is not edge-to-edge, the system status bar is real and `setColor` is honoured
 *  (`StatusBarModule.kt:91-97` ignores it only under edge-to-edge). Naming `c.paper` fixes those devices; on
 *  Android 15+ the platform ignores the colour and the strip is this View's own paper. `app.json` cannot do it:
 *  `androidStatusBar` is deprecated and has no effect (`@expo/config-plugins/.../android/SystemBars.js:46`), the
 *  `expo-status-bar` plugin takes only `hidden`/`style` (`expo-status-bar/plugin/build/withStatusBar.d.ts:3-8`),
 *  and under a non-edge-to-edge window no app view is drawn there at all. */
function Themed({ children }: { children: React.ReactNode }) {
  const { c, dark } = useTheme();
  return <View style={{ flex: 1, backgroundColor: c.paper }}><StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={c.paper} />{children}</View>;
}

export default function App() {
  const [fonts, setFonts] = useState(false), [fontError, setFontError] = useState<string | null>(null), [fontTry, setFontTry] = useState(0), [booted, setBooted] = useState(false);
  useEffect(() => {
    let alive = true;
    loadAsync(FONT_MAP).then(() => { if (alive) { setFonts(true); setFontError(null); } }).catch((e: unknown) => { if (alive) setFontError(String((e as Error)?.message ?? e)); });
    return () => { alive = false; };
  }, [fontTry]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        /* `expo-sqlite`, `expo-notifications` and `expo-audio` are native modules with no web
           implementation, so a browser build that called them would throw during boot and never
           reach a screen. `wireLifecycle()` still runs: it is what pumps the timer and keeps `now`
           fresh, and neither is native. */
        const repo = await openRepository();
        await hydrate(repo);
        await configureNotifications(getState().settings.notif.lockText);
        initAudio();
        preloadAudio();
        wireLifecycle();
      } catch (e) { recordCrash(e, 'boot'); set({ error: String((e as Error)?.message ?? e), ready: true }); }
      finally { if (alive) setBooted(true); }
    })();
    return () => { alive = false; };
  }, []);
  const route = () => { try { return getState().route; } catch { return 'unknown'; } };
  return (
    <SafeAreaProvider>
      <CrashBoundary phase="boot">
        <GestureHandlerRootView style={{ flex: 1 }}>
          <ThemeProvider>
            <CrashBoundary phase="runtime" getRoute={route}>
              <Themed>
                {fontError ? <FontsFailed message={fontError} onRetry={() => { setFontError(null); setFontTry((n) => n + 1); }} />
                  : fonts && booted ? <Gate /> : <Splash />}
              </Themed>
            </CrashBoundary>
          </ThemeProvider>
        </GestureHandlerRootView>
      </CrashBoundary>
    </SafeAreaProvider>
  );
}
