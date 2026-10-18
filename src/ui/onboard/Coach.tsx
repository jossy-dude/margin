import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, HandBox, Tape, Txt } from '../kit';
import { useTheme } from '../theme-context';
import { act, getState, useStore } from '../../store/store';
import { hexA } from '../../tokens/theme';
import { fx } from '../../services/fx';
import { FS } from '../fit';
import { STEPS, TOUR_LEN } from './screens';
import { SHEET_TARGET, cardTop, cutRects, holeBox, measureSlot, sameBox, type CoachBox } from './coach';

export type OnboardFinish =
  /** "Get started": App.tsx adopts the session with `keepSamples = false` — the samples go, the
      planner the user meets is theirs (and empty, if they made nothing during the tour). */
  | 'started'
  /** "Keep exploring" or any other way the last step ends: the samples stay on screen for this
      session only, and everything the user made is adopted regardless. */
  | 'done'
  | 'skipped';

export interface CoachProps {
  /** Called exactly once, with how the user left. `App.tsx` adopts the demo session from it and
   *  persists `onboarded`; this component does neither. */
  onFinish: (how: OnboardFinish) => void;
  /** A genuine first run — a planner holding nothing the user made. `false` on a replay from Settings
   *  and on any device with real rows, which is what keeps the replay's body copy honest. The finale
   *  buttons themselves are the same on both passes. */
  firstRun?: boolean;
  /** Which step to open on. `Settings → Show the tour again` wants 0, and the tests want any of them. */
  from?: number;
}

/** How far the cut-out stands back from the control it points at, and the height the callout is
 *  estimated at for placement. The estimate only decides which side of the hole the card goes on, and
 *  the card's own body is capped and scrollable, so being wrong by a few tenths of a font scale costs
 *  a scrollbar rather than a line of text. */
const PAD = 6, CARD_EST = 214, HEAD_EST = 118;

/**
 * The tour itself: a scrim with a hole cut out of it, a ring round the hole, and a card that says what
 * the control under the hole does.
 *
 * **It covers the app; it does not replace it.** `App.tsx` mounts this over `Shell`, so the thing being
 * pointed at is the real control on the real page — not a copy, and not a screenshot. Every page is
 * mounted underneath, which is also why the scrim is four views and not a gesture: with the app live
 * under the tour, "everything outside the hole is blocked" is a statement about the four rectangles,
 * and `ui/onboard/coach.ts`'s `cutRects` is what makes it exact.
 *
 * **The hole is the only live region.** The four scrim views are plain `View`s with the default
 * `pointerEvents`, which makes each one a hit target that consumes the touch: a tap over the scrim
 * stops there and never reaches the page. The ring is `pointerEvents="none"` so it cannot swallow the
 * tap it exists to draw attention to, and the card sits in a `box-none` layer so only the card itself
 * takes touches. TalkBack skips the scrim (`importantForAccessibility="no-hide-descendants"`) and
 * still reaches the control underneath, because an accessibility activation is delivered to the
 * focused node rather than hit-tested through the overlay.
 *
 * **There is no motion here to reduce.** No entrance animation, no shared value, no layout animation:
 * the tour appears with the step and leaves with the press. That is deliberate — a coach mark that
 * fades is a coach mark that is briefly in the wrong place — and it is what makes the reduce-motion
 * contract trivially true rather than carefully honoured.
 */
export function Coach({ onFinish, firstRun = false, from = 0 }: CoachProps) {
  const { c } = useTheme(), ins = useSafeAreaInsets(), { width: W, height: H } = useWindowDimensions();
  const [i, setI] = useState(from);
  const [box, setBox] = useState<CoachBox | null>(null);
  /* How tall the callout actually is. `CARD_EST` covers the frame before the first layout; from then on
     the card measures itself, because its height is the one number the position depends on and the copy
     behind it runs from two lines to six. */
  const [cardH, setCardH] = useState(0);
  const step = STEPS[i]!;
  const last = i >= TOUR_LEN - 1;
  const gone = useRef(false);
  /** What the dial was set to when the tour mounted: the dial step is over when the user has moved it
   *  from *this*, not from some value written into the step. */
  const startPlan = useRef(getState().timer.planMin).current;
  /* Both selectors return primitives, so a write that leaves them alone re-renders nothing. */
  const route = useStore((s) => s.route), sheetT = useStore((s) => (s.sheet ? s.sheet.t : '')), planMin = useStore((s) => s.timer.planMin);

  const finish = useCallback((how: OnboardFinish) => { if (gone.current) return; gone.current = true; onFinish(how); }, [onFinish]);
  const next = useCallback(() => { if (last) finish('done'); else { fx.page(); setI((v) => v + 1); } }, [last, finish]);
  /** Android back walks the tour back; on the first step it ends it, rather than falling through to the
   *  OS and leaving the app half-toured. Either way the press is consumed, so the app is never left
   *  with a tour the user cannot get out of. */
  const back = useCallback(() => { if (i === 0) { finish('skipped'); return; } fx.page(); setI((v) => v - 1); }, [i, finish]);

  /* What the app said the moment this step was entered. The await below is about an EVENT, not a
     state: a user who presses Next past the `+` lands on the sheet step with a sheet already open,
     and must not have that step finish itself as they arrive; stepping back onto a step whose
     condition is already true must not fling them forward again either. Only a value that has MOVED
     since entry counts, which is also what makes the ring honest — it points at what just happened. */
  const entered = useRef({ route: '', sheet: '', plan: -1 });

  /* Put the app where the step needs it, then give the step the entry it asks for, then take the
     reading. All three in one commit and in this order: the entry's write has to be the thing the
     reading records, rather than racing it.
     
     A sheet left open by the previous step is put away first. Step 2 opens the ADD sheet so that its ✕
     can be pointed at, and a user who presses Next rather than the ✕ leaves it there — at which point
     the scrim, doing exactly the job it exists to do, blocks that ✕ and the tour is sitting on top of a
     sheet nobody can dismiss. Every later step then inherits it. The one exception is the step whose
     own target lives inside a sheet. */
  useEffect(() => {
    if (step.route && getState().route !== step.route) act.go(step.route);
    if (step.target !== SHEET_TARGET && getState().sheet) act.close();
    step.enter?.(getState());
  }, [step]);

  /* The awaited event. `getState()` and not the render's own values, because the write that fired this
     effect is the one being asked about, and it may be a write this commit's enter made. Next and Skip
     are on every step, so a predicate that never comes true slows the tour down and cannot hold it. */
  useEffect(() => { const s = getState(); entered.current = { route: s.route, sheet: s.sheet ? s.sheet.t : '', plan: s.timer.planMin }; }, [step]);
  useEffect(() => {
    const s = getState(), e = entered.current;
    const moved = s.route !== e.route || (s.sheet ? s.sheet.t : '') !== e.sheet || s.timer.planMin !== e.plan;
    if (moved && step.await?.(s, startPlan)) next();
  }, [step, next, startPlan, route, sheetT, planMin]);

  /* Re-measure on anything that can move the control: the step, the page under it, a sheet opening or
     closing over it, and the window itself — and then keep reading until the control holds still.
     `measureInWindow` answers on the next tick on the web and after layout on a device, so the first
     read is of wherever the node was on its way in: a sheet takes 280 ms to slide up, and reading it on
     its first frame reports it a whole window below the screen. A hole cut there covers everything the
     tour is trying to let the user touch, so the hole waits for the control to settle, and a control
     that never settles — one scrolled out of view, one on a page that never mounted — gets no hole at
     all, which is the case the callout already handles by reading on its own. */
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined, tries = 0, prev: CoachBox | null = null;
    const tick = () => {
      if (!alive) return;
      measureSlot(step.target ?? '').then((raw) => {
        if (!alive) return;
        const off = raw ? raw.y >= H || raw.y + raw.h <= 0 || raw.x >= W || raw.x + raw.w <= 0 : false;
        const b: CoachBox | null = off ? null : raw;
        /* Settled means *the same reading twice in a row*, and an absent control settles on the first —
           there is nothing to wait for. Something off the screen never settles on a null: it is on its
           way, and that is precisely the reading that must not be cut a hole for. */
        const settled = !off && raw !== null && sameBox(b, prev);
        prev = b;
        if (settled || tries >= 10) setBox(b);
        else { tries += 1; timer = setTimeout(tick, 70); }
      });
    };
    tick();
    return () => { alive = false; if (timer !== undefined) clearTimeout(timer); };
  }, [step, route, sheetT, W, H]);

  useEffect(() => { const h = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; }); return () => h.remove(); }, [back]);

  const hole = holeBox(box, PAD), rects = cutRects(box, W, H, PAD);
  const top = cardTop(hole, H, cardH || CARD_EST, ins.top + 8, Math.max(ins.bottom, 8) + 8);
  const body = (!firstRun && step.replayBody) ? step.replayBody : step.body;
  /* The body's cap is measured against the whole window and never against where the card happens to be
     sitting: height must not depend on position, or measuring the card would move the card, which would
     re-measure it, and the two would chase each other for the rest of the tour. */
  const bodyMax = Math.max(64, H - (ins.top + 8) - (Math.max(ins.bottom, 8) + 8) - HEAD_EST);
  return (
    <View testID="coach" pointerEvents="box-none" style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, zIndex: 5000 }}>
      {/* The scrim. Hidden from a screen reader so the app under it stays reachable, and left as the
          default touch target so it is exactly as blocking as it looks. */}
      <View importantForAccessibility="no-hide-descendants" pointerEvents="box-none" style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }}>
        {rects.map((r, k) => <View key={k} style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, backgroundColor: hexA(c.ink, 0.62) }} />)}
        {hole ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: hole.x, top: hole.y, width: hole.w, height: hole.h }}>
            <HandBox seed="coach-ring" fill="transparent" stroke={c.acc} sw={2.6} shadow={false} amp={1.4} style={{ width: hole.w, height: hole.h }} />
          </View>
        ) : null}
      </View>

      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, top: 0, width: W, height: H }}>
        <View style={{ position: 'absolute', left: 16, top, width: W - 32 }} onLayout={(e) => { const h = e.nativeEvent.layout.height; if (Math.abs(h - cardH) > 0.5) setCardH(h); }}>
          <HandBox seed="coach-card" style={{ padding: 16, gap: 10 }}>
            <Tape w={64} rot={-4} style={{ top: -9, alignSelf: 'flex-start' }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt f="type" s={13} c="mut" maxFontSizeMultiplier={FS} accessibilityLiveRegion="polite">{`${i + 1} / ${TOUR_LEN}`}</Txt>
              <View style={{ flex: 1 }} />
              {i > 0 ? <Btn small kind="ghost" icon="back" a11y="Back" onPress={back} style={{ width: 46 }} /> : null}
              <Btn small kind="ghost" label="Skip" a11y="Skip the tour" onPress={() => finish('skipped')} style={{ width: 82 }} />
            </View>
            {/* The one brand moment: the masthead the illustrated tour opened with, now four lines of
                text on the first callout instead of a plate, an SVG and a screen of its own. */}
            {step.brand ? <Txt f="type" s={11} c="mut" maxFontSizeMultiplier={FS} style={{ letterSpacing: 3 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">MARGIN</Txt> : null}
            <Txt f="marker" s={25} maxFontSizeMultiplier={FS} accessibilityRole="header">{step.heading}</Txt>
            <ScrollView style={{ maxHeight: bodyMax }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 5, paddingBottom: 2 }}>
              {body.map((line) => <Txt key={line} f="serif" s={16} c="mut" style={{ lineHeight: 20 }}>{line}</Txt>)}
            </ScrollView>
            {step.nudge ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Btn small kind="ghost" label="5 min less" a11y="Five minutes less" onPress={() => act.timerSetMin(Math.max(5, getState().timer.planMin - 5))} />
                <Btn small kind="ghost" label="5 min more" a11y="Five minutes more" onPress={() => act.timerSetMin(Math.min(240, getState().timer.planMin + 5))} />
              </View>
            ) : null}
            {step.empty ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {/* The two ways out, always both (v0.1 after a first-run report): "Get started" is the
                    primary hand-off — App.tsx adopts the session with the samples put away — and
                    "Keep exploring" is the soft one. Neither is destructive: with the demo session in
                    memory, there is nothing here to fear on a replay either. */}
                <Btn flex kind="primary" label="Get started" a11y="Start your own planner: the sample semester is put away" onPress={() => finish('started')} />
                <Btn flex kind="ghost" label="Keep exploring" a11y="Keep the sample data and finish the tour" onPress={() => finish('done')} />
              </View>
            ) : (
              <Btn kind="primary" label="Next" icon="chevron" a11y={`Next: ${STEPS[i + 1]!.heading}`} onPress={next} style={{ alignSelf: 'flex-end' }} />
            )}
          </HandBox>
        </View>
      </View>
    </View>
  );
}
