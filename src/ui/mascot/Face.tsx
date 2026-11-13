import React from 'react';
import { View, useColorScheme } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { FACES, eyePath, mouthPath, type FaceName } from './faces';
import { V2, type Scheme } from '../../tokens/v2';

/** v0.7 U7 — a face (D-21), drawn in ≤ 6 strokes. Static here; blink, look and morph come with the screens. */
export function Face({ name, size = 28, scheme, label }: { name: FaceName; size?: number; scheme?: Scheme; label?: string }) {
  const sys = useColorScheme();
  const t = V2[scheme ?? (sys === 'dark' ? 'dark' : 'light')];
  const f = FACES[name];
  const sw = 5;
  return (
    <View accessible accessibilityLabel={label ?? `Jot looks ${name}`} style={{ width: size * (120 / 64), height: size }}>
      <Svg width="100%" height="100%" viewBox="0 0 120 64">
        <G stroke={t.ink} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <Path d={eyePath(f.eyes[0], 30, 26)} />
          <Path d={eyePath(f.eyes[1], 90, 26)} />
          <Path d={mouthPath(f.mouth)} fill={f.open ? t.ink : 'none'} />
        </G>
        {f.extras.includes('blush') ? <Path d="M18 40 l6 -4 M24 42 l6 -4 M90 40 l6 -4 M96 42 l6 -4" stroke={t.absent} strokeOpacity={0.5} strokeWidth={3} strokeLinecap="round" /> : null}
        {f.extras.includes('sweat') ? <Path d="M104 10 q4 6 0 10 M110 16 q3 4 0 7" stroke={t.ink3} strokeWidth={3} strokeLinecap="round" fill="none" /> : null}
      </Svg>
    </View>
  );
}
