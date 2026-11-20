import React, { useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight, FadeOutLeft, FadeOutRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EASE, Icon, Txt } from './kit';
import { PaperBg } from './PaperBg';
import { useReduceMotion, useTheme } from './theme-context';
import { pageBottomPad } from './fit';
import { fabScrollProps } from './fabScroll';

/**
 * A full page over the book (v0.8 §3.2, §3.3, §4.1): Settings, the Subjects pages, the Notice board, the Obsidian &
 * Sync page. Its own header with a Back arrow and the title, the skin's background layer, one scroll. System Back
 * goes back one step (`onBack`), never past the page. Every skin draws it with the same structure; the paper, ink,
 * cards and fonts are the skin's.
 */
/* v0.8 (owner's ask: "make sure every transition is very smooth"): a page used to appear and vanish in one frame.
   It now drifts in from the right as it fades up, and leaves the same way, the way Android's own pages move. The
   travel is the preset's 25 dp, not the whole width: a short drift reads as paper laid down, and keeps the frame
   cost low on a page full of SVG cards. Reduce motion turns both off. */
const IN = FadeInRight.duration(240).easing(EASE), OUT = FadeOutRight.duration(180).easing(EASE);
const BACK_IN = FadeInLeft.duration(240).easing(EASE), DEEP_OUT = FadeOutLeft.duration(180).easing(EASE);

/** The page's way in and out; `still` when a parent already moves it (the Subjects stack). */
export function usePageMotion(still = false) {
  const reduce = useReduceMotion();
  return reduce || still ? { entering: undefined, exiting: undefined } : { entering: IN, exiting: OUT };
}

/**
 * A stack of pages inside one slot (Subjects list → one subject): deeper comes in from the right while the page
 * under it slides off left, and Back does the reverse. The first page of the stack does not move on its own; the
 * slot that holds it does.
 */
export function PageStack({ depth, children }: { depth: number; children: React.ReactNode }) {
  const reduce = useReduceMotion();
  /* the depth this stack last drew, and which way it last moved (state derived while rendering, React's own pattern) */
  const [was, setWas] = useState({ depth, moved: 0 });
  if (was.depth !== depth) setWas({ depth, moved: depth > was.depth ? 1 : -1 });
  const enter = reduce || was.moved === 0 ? undefined : was.moved > 0 ? IN : BACK_IN;
  const exit = reduce ? undefined : depth === 0 ? DEEP_OUT : OUT;
  return <Animated.View key={depth} entering={enter} exiting={exit} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>{children}</Animated.View>;
}

export function FullPage({ title, sub, onBack, right, children, testID, scroll = true, still = false }: {
  title: string; sub?: string; onBack: () => void; right?: React.ReactNode; children: React.ReactNode; testID?: string; scroll?: boolean; still?: boolean;
}) {
  const ins = useSafeAreaInsets(), { c } = useTheme(), motion = usePageMotion(still);
  useEffect(() => { const sub0 = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; }); return () => sub0.remove(); }, [onBack]);
  const head = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: ins.top + 6, paddingHorizontal: 8, paddingBottom: 6 }}>
      <Pressable testID={`${testID ?? 'page'}-back`} accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={8}
        style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="back" size={24} />
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt f="marker" s={28} numberOfLines={1} accessibilityRole="header">{title}</Txt>
        {sub ? <Txt f="serif" s={15} c="mut" numberOfLines={2}>{sub}</Txt> : null}
      </View>
      {right}
    </View>
  );
  return (
    <Animated.View testID={testID} entering={motion.entering} exiting={motion.exiting} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: c.paper }} accessibilityViewIsModal>
      <PaperBg />
      {head}
      {scroll
        ? <ScrollView {...fabScrollProps} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: pageBottomPad(ins.bottom), gap: 12 }}>{children}</ScrollView>
        : <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: ins.bottom + 12 }}>{children}</View>}
    </Animated.View>
  );
}
