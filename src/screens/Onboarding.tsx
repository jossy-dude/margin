/**
 * The onboarding tour: five screens that teach this app to someone who has never opened it, in the
 * app's own hand-drawn paper language, animated with the app's own motion vocabulary.
 *
 * ## What this component is, deliberately
 *
 * **Self-contained and prop-driven.** It reads no store state for anything that matters and holds
 * no gate logic: it is handed `onFinish` and it calls it once. `App.tsx` decides *whether* to show
 * it (`!toured(settings.onboarded)`) and nothing here knows how that is persisted, so replay is a
 * second write of `0` and there is no second piece of state anywhere. The wiring is three lines.
 *
 * **It replaces the navigator rather than covering it.** `Gate` renders this instead of `Shell`, so
 * no page mounts underneath: no hidden clock ticking, no hidden `DayBar` filling, and no gesture can
 * reach the app under the tour. That is V17's rule about off-screen work, and it is why this is a
 * screen rather than a sheet.
 *
 * **Every gesture has a button.** Back is a button. Next is a button. Skip is a button on every
 * screen. The dial — the one control here that has no visible `±`, exactly as in `Focus.tsx` —
 * carries the same non-gesture path the app already gives it: `accessibilityRole="adjustable"` with
 * increment and decrement actions. There is no swipe-back, because a horizontal drag on this page
 * belongs to the dial and inventing a second gesture over the same surface would be the tour
 * teaching something the app does not do.
 *
 * **Reduce-motion collapses to the end state, not to a fade.** The crumple is the one screen whose
 * entire lesson is movement, so under `useReduceMotion()` it is drawn *already* crumpled with the
 * Undo toast already up: the sentence survives with no motion at all. See `art.tsx`.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, Icon, Txt } from '../ui/kit';
import { PaperBg } from '../ui/PaperBg';
import { useReduceMotion, useTheme } from '../ui/theme-context';
import { fx } from '../services/fx';
import { hexA } from '../tokens/theme';
import { FS } from '../ui/fit';
import { SCREENS, TOUR_LEN } from '../ui/onboard/screens';

export type OnboardFinish = 'done' | 'skipped';

export interface OnboardingProps {
  /** Called exactly once, with how the user left. `App.tsx` persists it; this component does not. */
  onFinish: (how: OnboardFinish) => void;
  /** Overrides the OS / in-app motion preference. Tests pass this; the app does not. */
  reduce?: boolean;
  /** Which screen to open on. Defaults to the first; `Settings → Show the tour again` wants 0 too. */
  from?: number;
}

/** The app's own page-placement motion (`navigation/window.ts`), so the tour moves like a page. */
const PLACE_MS = 200, PLACE_EASE: [number, number, number, number] = [0.2, 0.9, 0.25, 1];

export function Onboarding({ onFinish, reduce, from = 0 }: OnboardingProps) {
  const { c } = useTheme(), ins = useSafeAreaInsets();
  const sysReduce = useReduceMotion();
  const rm = reduce ?? sysReduce;
  const [i, setI] = useState(from);
  const last = i >= TOUR_LEN - 1;
  const gone = useRef(false);
  /** `Btn` stays enabled through the whole of nothing here — there is no closing animation to race —
   *  but two fast taps on Next would otherwise skip a screen. */
  const finish = useCallback((how: OnboardFinish) => { if (gone.current) return; gone.current = true; onFinish(how); }, [onFinish]);
  const next = useCallback(() => { if (last) finish('done'); else { fx.page(); setI((v) => v + 1); } }, [last, finish]);

  useEffect(() => { fx.page(); }, []);
  /** Android back walks the tour back, and on the first screen it is left to the OS. */
  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => { if (i === 0) return false; fx.page(); setI((v) => v - 1); return true; });
    return () => h.remove();
  }, [i]);

  const S = SCREENS[i]!;
  return (
    <View style={{ flex: 1, backgroundColor: c.desk }}>
      <PaperBg />
      <View style={{ flex: 1, paddingTop: ins.top + 6, paddingBottom: Math.max(ins.bottom, 8) + 8 }}>
        <View style={[{ flexDirection: 'row', alignItems: 'center', height: 46, paddingHorizontal: 16 }, i === 0 && { paddingLeft: 16 }]}>
          {i === 0 ? <View style={{ width: 44 }} /> : <Btn small kind="ghost" icon="back" a11y="Back" onPress={() => { fx.page(); setI((v) => v - 1); }} style={{ width: 44 }} />}
          <Txt f="type" s={13} c="mut" style={{ marginLeft: 4 }} accessibilityLiveRegion="polite" maxFontSizeMultiplier={FS}>{`${i + 1} / ${TOUR_LEN}`}</Txt>
          <View style={{ flex: 1 }} />
          <Btn small kind="ghost" label="Skip" a11y="Skip the tour" onPress={() => finish('skipped')} style={{ width: 74 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, gap: 10 }}
          scrollEnabled={!rm}
        >
          {/* `flexGrow: 1` + `justifyContent: center`: the artwork absorbs any spare height on a
              tall phone instead of pooling it into a hole, and on a short one the ScrollView takes
              over rather than letting the artwork shrink under the text. */}
          <View style={{ flexGrow: 1, justifyContent: 'center' }}>
            <Placed key={S.id} reduce={rm}><S.art c={c} reduce={rm} /></Placed>
          </View>
          <View accessibilityRole="header">
            <Txt f="marker" s={27} numberOfLines={3}>{S.heading}</Txt>
            {S.body.map((line) => (
              <Txt key={line} f="serif" s={16} c="mut" style={{ lineHeight: 20, marginTop: 5 }}>{line}</Txt>
            ))}
            {(S.notes ?? []).map((n) => (
              <View key={n.label} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9, marginTop: 9 }}>
                <View style={{ width: 20, alignItems: 'center', paddingTop: 2 }}><Icon name={n.icon} size={17} color={c.acc} sw={2} /></View>
                <Txt f="serif" s={15} c="mut" style={{ flex: 1, lineHeight: 19 }}>
                  <Txt f="bold" s={15} c="ink">{n.label} </Txt>
                  {n.text}
                </Txt>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {SCREENS.map((sc, k) => (
              <View key={sc.id} style={{ width: k === i ? 18 : 8, height: 8, borderRadius: 4, backgroundColor: k <= i ? c.acc : hexA(c.ink, 0.22) }} />
            ))}
          </View>
          <Btn
            label={last ? 'Start' : 'Next'}
            icon={last ? undefined : 'chevron'}
            a11y={last ? 'Start using Marginalia' : `Next: ${SCREENS[i + 1]?.heading}`}
            onPress={next}
            style={{ width: last ? 128 : 120 }}
          />
        </View>
      </View>
    </View>
  );
}

/** One screen, dropped onto the table with the app's own placement: from above and to the right,
 *  tilted, settling flat. Under reduce-motion it is simply there — no translation, no scale, no
 *  overshoot, and nothing that could be mistaken for a stuck animation. */
function Placed({ children, reduce }: { children: React.ReactNode; reduce: boolean }) {
  const k = useSharedValue(reduce ? 1 : 0);
  useEffect(() => { k.set(reduce ? 1 : withTiming(1, { duration: PLACE_MS, easing: Easing.bezier(...PLACE_EASE) })); }, [k, reduce]);
  const st = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(k.get(), [0, 1], [-48, 0]) },
      { translateX: interpolate(k.get(), [0, 1], [30, 0]) },
      { rotate: `${interpolate(k.get(), [0, 0.7, 1], [3.8, -0.4, 0])}deg` },
      { scale: interpolate(k.get(), [0, 0.8, 1], [1.028, 1, 1]) },
    ],
  }));
  return <Animated.View style={{ width: '100%' }}><Animated.View style={st}>{children}</Animated.View></Animated.View>;
}

export default Onboarding;
