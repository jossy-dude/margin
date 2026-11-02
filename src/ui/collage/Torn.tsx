import React, { useMemo, useState } from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme-context';
import { hashSeed, tornEdge } from '../hand';
import { PAPER, hexA } from '../../tokens/theme';

const CRUMPLE = require('../../../assets/paper/crumple.webp');

/**
 * A sheet of paper laid across the full width with a TORN top edge: the reference's way of dividing a
 * page (the hero's art above, the words on the sheet below). The white core shows along the tear the way
 * it does on dyed or bleached paper; the sheet carries the same crumple as the page, so it reads as one
 * more piece of the same stack rather than a flat panel.
 */
export function TornSheet({ children, fill, seed = 'sheet', depth = 7, style, bodyStyle, crumple = 0.4, lift = false }: { children?: React.ReactNode; fill?: string; seed?: string; depth?: number; style?: StyleProp<ViewStyle>; bodyStyle?: StyleProp<ViewStyle>; crumple?: number;
  /** The sheet hovers over something (a sheet over the dimmed app): a soft shadow above the tear. */
  lift?: boolean }) {
  const { c, dark } = useTheme(), [w, setW] = useState(0), bg = fill ?? c.card;
  const e = useMemo(() => tornEdge(w, hashSeed(seed), depth), [w, seed, depth]), E = depth * 2 + 2;
  const close = (pts: [number, number][]) => (pts.length ? `M0 ${E}L${pts.map(([x, y]) => `${x.toFixed(1)} ${(y + 1).toFixed(1)}`).join('L')}L${w} ${E}Z` : '');
  return (
    <View style={style} onLayout={(ev) => { const nw = ev.nativeEvent.layout.width; if (Math.abs(nw - w) > 0.5) setW(nw); }}>
      {w > 0 && (
        <Svg width={w} height={E} style={{ marginBottom: -1 }} pointerEvents="none">
          {lift && <Path d={close(e.core.map(([x, y]) => [x, y - 3.5] as [number, number]))} fill={hexA(c.shadow, dark ? 0.3 : 0.1)} />}
          <Path d={close(e.core.map(([x, y]) => [x, y - 1.6] as [number, number]))} fill={hexA(c.shadow, dark ? 0.35 : 0.08)} />
          <Path d={close(e.core)} fill={dark ? hexA(c.ink, 0.28) : PAPER.core} />
          <Path d={close(e.face)} fill={bg} />
        </Svg>
      )}
      <View style={[{ backgroundColor: bg, flexGrow: 1, overflow: 'hidden' }, bodyStyle]}>
        {crumple > 0 && <Image source={CRUMPLE} accessible={false} style={{ position: 'absolute', left: 0, top: -E, width: 512, height: 900, opacity: crumple * (dark ? 0.9 : 0.7) }} />}
        {children}
      </View>
    </View>
  );
}
