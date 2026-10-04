import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Line, Pattern, Rect } from 'react-native-svg';
import { useTheme } from './theme-context';
import { useStore } from '../store/store';

const GRAIN = require('../../assets/textures/grain.png');
const PHOTO = require('../../assets/textures/t1.jpg');
/** The paper itself: base colour + ruling pattern + texture. Pages, sheets and Settings all use it, so a texture change shows everywhere at once. */
export function PaperBg({ card = false }: { card?: boolean }) {
  const { c, dark } = useTheme(), paper = useStore((s) => s.settings.paper), tex = useStore((s) => s.settings.texture);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: card ? c.card : c.paper }]}>
      {paper !== 'plain' && (
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            {paper === 'dots' && <Pattern id="pp" width={18} height={18} patternUnits="userSpaceOnUse"><Circle cx={9} cy={9} r={0.95} fill={c.dot} /></Pattern>}
            {paper === 'grid' && <Pattern id="pp" width={20} height={20} patternUnits="userSpaceOnUse"><Line x1={0} y1={0.5} x2={20} y2={0.5} stroke={c.dot} strokeWidth={1} /><Line x1={0.5} y1={0} x2={0.5} y2={20} stroke={c.dot} strokeWidth={1} /></Pattern>}
            {paper === 'ruled' && <Pattern id="pp" width={32} height={32} patternUnits="userSpaceOnUse"><Line x1={0} y1={31.5} x2={32} y2={31.5} stroke={c.dot} strokeWidth={1} /></Pattern>}
          </Defs>
          <Rect width="100%" height="100%" fill="url(#pp)" />
          {paper === 'ruled' && <Line x1={46} y1={0} x2={46} y2="100%" stroke={c.acc} strokeOpacity={0.35} strokeWidth={1.2} />}
        </Svg>
      )}
      {tex === 'grain' && <Image source={GRAIN} resizeMode="repeat" style={[StyleSheet.absoluteFill, { opacity: c.grain * (dark ? 0.55 : 0.8) }]} />}
      {tex === 'photo' && <View style={[StyleSheet.absoluteFill, { opacity: c.photo, mixBlendMode: dark ? 'screen' : 'multiply' }]}><Image source={PHOTO} resizeMode="repeat" style={StyleSheet.absoluteFill} /></View>}
    </View>
  );
}
