/**
 * Settings → Diagnostics → Face check (PLAN U7): every face, every motion and every moment on a button, so the
 * face can be judged on the phone itself. If the big face blinks, looks, hops and morphs smoothly between any two,
 * Reanimated is drawing the SVG paths on the UI thread on this phone.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Btn, Chip, Row, Txt } from '../kit';
import { useTheme } from '../theme-context';
import { hexA } from '../../tokens/theme';
import { Face, type FaceHandle } from './Face';
import { FACES, FACE_NAMES, type FaceName } from './faces';
import { EMPTY_KINDS, FACE_EVENTS, emptyFace, useFaceMoment } from './moments';

const SIZES = [20, 28, 64, 72, 96, 160] as const;
/** The reduced-motion override cycles: follow the setting → force on → force off. */
const REDUCE: readonly (boolean | undefined)[] = [undefined, true, false];
const REDUCE_LABEL = ['Motion: as set', 'Motion: reduced', 'Motion: full'];

export function FaceTester() {
  const { c } = useTheme();
  const [rest, setRest] = useState<FaceName>('smirk'), [size, setSize] = useState<number>(160);
  const [slow, setSlow] = useState(false), [tour, setTour] = useState(false), [reduceAt, setReduceAt] = useState(0);
  const { face, play, clear } = useFaceMoment(rest);
  const ref = useRef<FaceHandle>(null);
  const show = (n: FaceName) => { clear(); setRest(n); };

  /* Tour: morph through all twelve, 1.2 s each, so every pair that sits side by side gets seen. */
  useEffect(() => {
    if (!tour) return;
    const id = setInterval(() => setRest((r) => FACE_NAMES[(FACE_NAMES.indexOf(r) + 1) % FACE_NAMES.length]!), 1200);
    return () => clearInterval(id);
  }, [tour]);

  return (
    <View style={{ gap: 10 }}>
      <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: 176, paddingTop: 8 }}>
        <Face {...face} slowBlink={face.slowBlink || slow} size={size} reduce={REDUCE[reduceAt]} ref={ref} testID="diag-face" />
      </View>
      <Txt f="serif" s={14.5} c="mut" style={{ textAlign: 'center' }}>{face.name} · {FACES[face.name].label} · {size} dp</Txt>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
        {FACE_NAMES.map((n) => (
          <Pressable key={n} testID={`diag-face-${n}`} onPress={() => show(n)} accessibilityRole="button" accessibilityLabel={`Show ${n}`} accessibilityState={{ selected: n === face.name }}
            style={{ width: 76, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: n === face.name ? hexA(c.ink, 0.08) : 'transparent' }}>
            <Face name={n} size={22} decorative />
          </Pressable>
        ))}
      </View>

      <Row gap={6}>
        <Btn small kind="ink" label="Blink" onPress={() => ref.current?.blink()} />
        <Btn small kind="ink" label="Bounce" onPress={() => ref.current?.bounce()} />
        <Btn small kind="ink" label="Droop" onPress={() => ref.current?.droop()} />
        <Btn small kind="ghost" label="Look ←" onPress={() => ref.current?.look(-1, 0)} />
        <Btn small kind="ghost" label="Look →" onPress={() => ref.current?.look(1, 0)} />
        <Btn small kind="ghost" label="Look ↑" onPress={() => ref.current?.look(0, -1)} />
        <Btn small kind="ghost" label="Look ↓" onPress={() => ref.current?.look(0, 1)} />
      </Row>
      <Row gap={6}>{SIZES.map((s) => <Chip key={s} small label={`${s}`} on={s === size} onPress={() => setSize(s)} />)}</Row>
      <Row gap={6}>
        <Chip small label="Tour all 12" on={tour} onPress={() => setTour((v) => !v)} />
        <Chip small label="Slow blink" on={slow} onPress={() => setSlow((v) => !v)} />
        <Chip small label={REDUCE_LABEL[reduceAt]!} on={reduceAt !== 0} onPress={() => setReduceAt((i) => (i + 1) % REDUCE.length)} />
      </Row>

      <Txt f="serif" s={14.5} c="mut">Moments: the face and motion each one plays in the app, then back.</Txt>
      <Row gap={6}>{FACE_EVENTS.map((e) => <Btn key={e} small kind="ghost" label={e} onPress={() => play(e)} />)}</Row>
      <Txt f="serif" s={14.5} c="mut">Empty pages (the rest are words only):</Txt>
      <Row gap={6}>{EMPTY_KINDS.map((k) => ({ k, f: emptyFace(k) })).filter((x) => x.f).map(({ k, f }) => <Chip key={k} small label={k} on={face.name === f && rest === f} onPress={() => show(f!)} />)}</Row>
    </View>
  );
}
