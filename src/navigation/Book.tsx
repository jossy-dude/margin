import React, { useLayoutEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { createNavigatorFactory, TabRouter, useNavigationBuilder, type ParamListBase, type TabNavigationState } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HandBox, Icon, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme-context';
import { act, useStore, type RouteName } from '../store/store';
import { hexA } from '../tokens/theme';
import { NAV_BODY, navInset } from '../ui/fit';
import { useKeyboardUp } from '../ui/keyboard';
import { ScreenLive } from '../ui/live';
import { toNavigator, toStore } from './sync';

const TABS: { name: RouteName; label: string; icon: string }[] = [{ name: 'Today', label: 'Today', icon: 'today' }, { name: 'Week', label: 'Week', icon: 'week' }, { name: 'Tasks', label: 'To-do', icon: 'tasks' }, { name: 'Grades', label: 'Grades', icon: 'grades' }, { name: 'Stats', label: 'Stats', icon: 'stats' }];
type Nav = TabNavigationState<ParamListBase>;

/** One page, mounted for the session, in the DRAW tree exactly while it is focused.
 *
 *  Everything about this component is about a frame budget, and each of the three decisions is
 *  load-bearing in one direction only — this file is the evidence, so the reasoning is kept.
 *
 *  **Mount is unconditional.** Every route mounts on the navigator's first render and stays for the
 *  session, so no navigation ever cold-mounts a page: the subtree's effects, the text measuring, the
 *  SVG pattern and the grain tile are all paid once, behind the splash. The cost used to be paid on
 *  every tap, on the UI thread, between the press and the first frame the finger sees.
 *
 *  **The page does not move.** The paper drop — 70 dp of travel, a tilt, a scale, a shadow overlay,
 *  ten frames of two composited full-screen pages — is gone. `perf-placement.test.ts` holds the
 *  curve that everything else still uses; nothing in the page swap needs it. The press answers on the
 *  finger-down frame already, so the page is a cut: `display` flips from 'none' to 'flex' in the
 *  commit that carries the tab write and it is simply the one on top.
 *
 *  **A hidden page leaves the DRAW tree.** Six full-screen pages — each a base colour, a full-screen
 *  SVG pattern, a tiled grain bitmap and a blended photograph — stacked under one is ~20 full-screen
 *  fills per frame. `display: 'none'` sets `YogaDisplay.NONE` on the node
 *  (ReactAndroid/.../uimanager/LayoutShadowNode.kt), which makes Yoga SKIP the subtree: the page is
 *  neither laid out nor drawn. Note this is NOT `View.INVISIBLE` — layout is dropped, not parked —
 *  so the flip back to 'flex' rebuilds it from scratch. That rebuild is paid in the commit that
 *  focuses the page, and it is proportional to the page's node count: cheap for a light page, and
 *  the reason To-do is the worst tab, since it renders every row via `.map()` with no virtualisation
 *  (screens/Tasks.tsx) and so costs more as the task list grows. Whether that rebuild or the
 *  overdraw it avoids is the larger cost is a per-device question, and the trade is deliberate.
 *
 *  `zIndex` follows focus rather than a visit bookkeeping table, so the layer order moves in the same
 *  commit as the navigator with nothing left to catch up. Focus travels to the page as a plain boolean
 *  (`ui/live.ts`) rather than as a store-route subscription, which is what keeps a tap from
 *  re-rendering every mounted page. */
function Placed({ children, on }: { children: React.ReactNode; on: boolean }) {
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: on ? 2 : 1, display: on ? 'flex' : 'none' }]}>
      <ScreenLive.Provider value={on}>{children}</ScreenLive.Provider>
    </View>
  );
}
function BookView({ initialRouteName, children, screenOptions, id }: { initialRouteName?: string; children: React.ReactNode; screenOptions?: object; id?: string }) {
  const { state, descriptors, navigation, NavigationContent } = useNavigationBuilder(TabRouter, { initialRouteName, children, screenOptions, id } as never) as unknown as { state: Nav; descriptors: Record<string, { render: () => React.ReactNode }>; navigation: { navigate: (n: never) => void }; NavigationContent: React.ComponentType<{ children: React.ReactNode }> };
  const route = useStore((s) => s.route), { c } = useTheme(), ins = useSafeAreaInsets();
  const cur = state.routes[state.index]?.name as RouteName | undefined, kbUp = useKeyboardUp();
  /* A tab tap does NOT come through these syncs: `onPressIn` writes the store and moves the navigator
   *  in the SAME event handler, React batches both into ONE render, and that render already has
   *  `route === cur` — so the finger pays a single render pass instead of two. The store-first flow
   *  needed a second full BookView + nav-bar render plus a scheduler round-trip before the pass that
   *  shows the new page: store write → render 1 (nothing visible changes) → this effect → navigator →
   *  render 2 → the page the finger asked for. That dead time before the first frame is what read as
   *  "a delay in the transition", with the place sound and haptic firing at the tap and the page
   *  waiting behind them.
   * It is `onPressIn`, not `onPress`, for the same reason in reverse: `onPress` fires on LIFT, so the
   *  whole chain sat behind the user's own hold time — typically 60–150 ms — which is the "after I
   * press a tab" report. Press-in is the frame of the touch event, where the ripple already starts.
   * The cost is that a touch-down commits even if the finger slides off before the lift; accepted,
   *  because a tab bar's whole job is to switch on contact, and the app's own `kit.tsx` buttons take
   *  their press feedback on press-in for the same reason.
   * The syncs still carry everything that is NOT a tab tap: store-only navigation (the focus entry, a
   *  notification open) forward, Android BACK reverse. Both are LAYOUT effects because a passive one
   *  waits for paint — the same latency, on the non-tap paths. Keying is load-bearing: forward on
   *  `[route]`, reverse on `[cur]`, so neither runs in a commit where the other is mid-flight. */
  useLayoutEffect(() => { const n = toNavigator(route, cur); if (n) navigation.navigate(n as never); }, [route]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { const s = toStore(route, cur); if (s) act.go(s); }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps
  /* Everything the nav draws reads `cur`, never `route`: a hardware BACK moves the navigator without
     the store changing, so a store-derived highlight would name a route the app is not on — and the
     tap on it would be `act.go` to the route it already holds, which does nothing. */
  /* `adjustResize` already leaves the bar at the bottom of the *visible* area, so a floating bar and a
     62 dp + button sitting on the content being typed near is what is wrong; both yield to the keyboard. */
  const hideNav = cur === 'Focus' || kbUp;
  return (
    <NavigationContent>
      <View style={{ flex: 1, backgroundColor: c.paper }}>
        {/* Every route mounts on this first render and stays for the session: a tap's only pre-paint
            work is the shell and the two pages whose focus flipped, so no tap ever pays a cold mount.
            Hidden pages answer `live=false` from the navigator context and tick at the slow cadence.
            They are out of the DRAW tree entirely — and, because `display:'none'` drops layout rather
            than parking it, out of the layout tree too, so the flip back to 'flex' rebuilds the page
            from scratch. That rebuild is the residual cost of a switch and is proportional to the
            destination's node count (measured on web: week 286, today 639, tasks 658, stats 727,
            grades 756). The trade against the ~20 full-screen fills a stacked set of pages would cost
            every frame is deliberate; see the `Placed` note above. */}
        {state.routes.map((r, i) => (<Placed key={r.key} on={i === state.index}><View style={{ flex: 1 }} pointerEvents={i === state.index ? 'auto' : 'none'} accessibilityElementsHidden={i !== state.index} importantForAccessibility={i === state.index ? 'yes' : 'no-hide-descendants'}>{descriptors[r.key]?.render()}</View></Placed>))}
        {!hideNav && (
          <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: navInset(ins.bottom), paddingHorizontal: 12, zIndex: 999 }}>
            <HandBox seed="nav" fill={c.card} sw={2} amp={1.6} style={{ flexDirection: 'row', minHeight: NAV_BODY, paddingVertical: 4, paddingHorizontal: 4 }}>
              {TABS.map((t) => { const on = cur === t.name; return (
                <Pressable key={t.name} testID={`tab-${t.name.toLowerCase()}`} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label} onPressIn={() => { act.go(t.name); navigation.navigate(t.name as never); }} android_ripple={{ color: hexA(c.ink, 0.14), borderless: true }} style={{ flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                  <View style={{ width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? hexA(c.acc, 0.2) : 'transparent', borderWidth: on ? 1.5 : 0, borderColor: c.acc }}><Icon name={t.icon} size={23} color={on ? c.acc : c.ink} sw={on ? 2.2 : 1.8} /></View>
                  <Txt f="bold" s={14.5} c={on ? 'acc' : 'mut'}>{t.label}</Txt>
                </Pressable>); })}
            </HandBox>
          </View>)}
      </View>
    </NavigationContent>
  );
}
export const createBookNavigator = createNavigatorFactory(BookView as never) as unknown as () => { Navigator: React.ComponentType<{ initialRouteName?: string; screenOptions?: object; children: React.ReactNode }>; Screen: React.ComponentType<{ name: string; component: React.ComponentType }> };
