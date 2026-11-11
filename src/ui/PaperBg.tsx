import React, { useEffect, useId, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, Path, Pattern, Rect } from 'react-native-svg';
import { EASE } from './kit';
import { useReduceMotion, useTheme } from './theme-context';
import { useStore } from '../store/store';
import { MARGIN, PAPER } from '../tokens/theme';
import { FLECKS, TILE, grainOn } from './paper-flecks';

/* How long a ruling or texture change takes to fade. */
const PAPER_MS = 220;
const RULED = 28;

/**
 * The paper itself: base colour + ruling pattern + drawn grain. Pages, sheets and Settings all use it,
 * so a texture change shows everywhere at once. The pattern ids are per instance (`useId`), because two
 * mounted copies sharing a literal id resolve each other's `url(#…)`.
 */
export function PaperBg({ card = false }: { card?: boolean }) {
  const { c, dark, look } = useTheme(), reduce = useReduceMotion(), paper = useStore((s) => s.settings.paper), setTex = useStore((s) => s.settings.texture);
  const on = look === 'plain' ? 0 : grainOn(setTex);
  const id = useId();
  const gid = `${id}g`;
  const rule = useSharedValue(1), grain = useSharedValue(on);
  const seen = useRef(false);
  useEffect(() => {
    const first = !seen.current;
    seen.current = true;
    grain.set(first || reduce ? on : withTiming(on, { duration: PAPER_MS, easing: EASE }));
  }, [on, reduce, grain]);
  useEffect(() => { rule.set(1); }, [paper, rule]);
  const ruleStyle = useAnimatedStyle(() => ({ opacity: rule.get() }));
  const grainStyle = useAnimatedStyle(() => ({ opacity: grain.get() }));
  /* Ink flecks sit darker than the sheet, lit ones lighter; on dark paper the two swap roles. */
  const k = card ? 0.6 : 1, inkA = (dark ? 0.1 : 0.13) * k, litA = (dark ? 0.35 : 0.7) * k, lit = dark ? c.shadow : PAPER.core;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: card ? c.card : c.paper }]}>
      {paper !== 'plain' && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, ruleStyle]}>
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              {paper === 'dots' && <Pattern id={id} width={18} height={18} patternUnits="userSpaceOnUse"><Circle cx={9} cy={9} r={0.95} fill={c.dot} /></Pattern>}
              {paper === 'grid' && <Pattern id={id} width={20} height={20} patternUnits="userSpaceOnUse"><Line x1={0} y1={0.5} x2={20} y2={0.5} stroke={c.dot} strokeWidth={1} /><Line x1={0.5} y1={0} x2={0.5} y2={20} stroke={c.dot} strokeWidth={1} /></Pattern>}
              {paper === 'ruled' && <Pattern id={id} width={RULED} height={RULED} patternUnits="userSpaceOnUse"><Line x1={0} y1={RULED - 0.5} x2={RULED} y2={RULED - 0.5} stroke={c.dot} strokeWidth={1} /></Pattern>}
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${id})`} />
            {paper === 'ruled' && <Line x1={46} y1={0} x2={46} y2="100%" stroke={dark ? MARGIN.dark : MARGIN.light} strokeOpacity={dark ? 0.45 : 0.5} strokeWidth={1.2} />}
          </Svg>
        </Animated.View>
      )}
      {look !== 'plain' && (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, grainStyle]}>
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <Pattern id={gid} width={TILE} height={TILE} patternUnits="userSpaceOnUse">
                {FLECKS.dots.map((f, i) => <Circle key={i} cx={f.x} cy={f.y} r={f.r} fill={f.lit ? lit : c.ink} fillOpacity={(f.lit ? litA : inkA) * f.o} />)}
                {FLECKS.fibres.map((f, i) => <Path key={`f${i}`} d={f.d} fill="none" stroke={f.lit ? lit : c.ink} strokeOpacity={(f.lit ? litA : inkA) * f.o} strokeWidth={0.6} strokeLinecap="round" />)}
              </Pattern>
            </Defs>
            <Rect width="100%" height="100%" fill={`url(#${gid})`} />
          </Svg>
        </Animated.View>
      )}
    </View>
  );
}
