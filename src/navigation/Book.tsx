import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { createNavigatorFactory, TabRouter, useNavigationBuilder, type ParamListBase, type TabNavigationState } from '@react-navigation/native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HandBox, Icon, Txt } from '../ui/kit';
import { useReduceMotion, useTheme } from '../ui/theme-context';
import { act, useStore, type RouteName } from '../store/store';
import { hexA } from '../tokens/theme';
import { NAV_BODY, navInset } from '../ui/fit';
import { useKeyboardUp } from '../ui/keyboard';
import { inMountWindow } from './window';
import { toNavigator, toStore } from './sync';

const TABS: { name: RouteName; label: string; icon: string }[] = [{ name: 'Today', label: 'Today', icon: 'today' }, { name: 'Week', label: 'Week', icon: 'week' }, { name: 'Tasks', label: 'To-do', icon: 'tasks' }, { name: 'Grades', label: 'Grades', icon: 'grades' }, { name: 'Stats', label: 'Stats', icon: 'stats' }];
type Nav = TabNavigationState<ParamListBase>;

/** Page that is "placed on the table": the new sheet drops in from above and to the right, tilted, then settles flat while its shadow tightens. */
function Placed({ children, on, order, instant }: { children: React.ReactNode; on: boolean; order: number; instant: boolean }) {
  const reduce = useReduceMotion(), { c } = useTheme(), k = useSharedValue(instant ? 1 : 0), mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; if (!on || instant) { k.value = 1; return; } }
    if (!on) return;
    k.value = 0; k.value = reduce ? 1 : withTiming(1, { duration: 520, easing: Easing.bezier(0.2, 0.9, 0.25, 1) });
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useAnimatedStyle(() => {
    const p = on ? k.value : 1;
    return { opacity: on ? interpolate(p, [0, 0.25, 1], [0, 1, 1]) : 1, transform: [{ translateY: interpolate(p, [0, 1], [-70, 0]) }, { translateX: interpolate(p, [0, 1], [38, 0]) }, { rotate: `${interpolate(p, [0, 0.7, 1], [4.5, -0.4, 0])}deg` }, { scale: interpolate(p, [0, 0.8, 1], [1.045, 1.0, 1]) }] };
  });
  const sh = useAnimatedStyle(() => ({ opacity: on ? interpolate(k.value, [0, 1], [0.35, 0]) : 0 }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { zIndex: order }, st]}>
      {children}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.shadow }, sh]} />
    </Animated.View>
  );
}
function BookView({ initialRouteName, children, screenOptions, id }: { initialRouteName?: string; children: React.ReactNode; screenOptions?: object; id?: string }) {
  const { state, descriptors, navigation, NavigationContent } = useNavigationBuilder(TabRouter, { initialRouteName, children, screenOptions, id } as never) as unknown as { state: Nav; descriptors: Record<string, { render: () => React.ReactNode }>; navigation: { navigate: (n: never) => void }; NavigationContent: React.ComponentType<{ children: React.ReactNode }> };
  const route = useStore((s) => s.route), { c } = useTheme(), ins = useSafeAreaInsets(), firstName = useRef(state.routes[state.index]?.name ?? 'Today'), [visited, setVisited] = useState<Record<string, number>>({ [firstName.current]: 1 }), counter = useRef(1);
  const cur = state.routes[state.index]?.name as RouteName | undefined, kbUp = useKeyboardUp();
  useEffect(() => { const n = toNavigator(route, cur); if (n) navigation.navigate(n as never); }, [route]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const s = toStore(route, cur); if (s) act.go(s); }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (cur) { counter.current += 1; setVisited((v) => ({ ...v, [cur]: counter.current })); } }, [cur]);
  /* Everything the nav draws reads `cur`, never `route`: a hardware BACK moves the navigator without
     the store changing, so a store-derived highlight would name a route the app is not on — and the
     tap on it would be `act.go` to the route it already holds, which does nothing. */
  /* `adjustResize` already leaves the bar at the bottom of the *visible* area, which is what V19 asks
     for — so it is not mis-positioned. What is wrong is that a floating bar and a 62 dp + button then sit
     on the content being typed near, on a strip barely half the screen tall. Both yield to the keyboard;
     neither is usable while typing. See `useKeyboardUp`. */
  const hideNav = cur === 'Focus' || kbUp;
  return (
    <NavigationContent>
      <View style={{ flex: 1, backgroundColor: c.desk }}>
        {state.routes.map((r, i) => (inMountWindow(visited, counter.current, r.name) ? <Placed key={r.key} on={i === state.index} order={visited[r.name] ?? 0} instant={visited[r.name] === 1}><View style={{ flex: 1 }} pointerEvents={i === state.index ? 'auto' : 'none'} accessibilityElementsHidden={i !== state.index} importantForAccessibility={i === state.index ? 'yes' : 'no-hide-descendants'}>{descriptors[r.key]?.render()}</View></Placed> : null))}
        {!hideNav && (
          <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: navInset(ins.bottom), paddingHorizontal: 12, zIndex: 999 }}>
            <HandBox seed="nav" fill={c.card} sw={2} amp={1.6} style={{ flexDirection: 'row', minHeight: NAV_BODY, paddingVertical: 4, paddingHorizontal: 4 }}>
              {TABS.map((t) => { const on = cur === t.name; return (
                <Pressable key={t.name} testID={`tab-${t.name.toLowerCase()}`} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label} onPress={() => act.go(t.name)} android_ripple={{ color: hexA(c.ink, 0.14), borderless: true }} style={{ flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 1 }}>
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
