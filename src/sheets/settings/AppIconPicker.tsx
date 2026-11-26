import React from 'react';
import { Image, Pressable, View, type ImageSourcePropType } from 'react-native';
import { Chip, Row, Txt } from '../../ui/kit';
import { useTheme } from '../../ui/theme-context';
import { act, useStore } from '../../store/store';
import { nativeAvailable } from '../../services/native';
import { APP_ICONS, iconFor, type AppIconName } from '../../domain/appIcon';
import { fx } from '../../services/fx';

/** tools/app-icons.mjs draws these from the same paths as the launcher's. Metro needs literal requires. */
const PIC: Record<AppIconName, ImageSourcePropType> = {
  paper: require('../../../assets/icons/paper.png'),
  denim: require('../../../assets/icons/denim.png'),
  ink: require('../../../assets/icons/ink.png'),
  sky: require('../../../assets/icons/sky.png'),
};

/**
 * Settings → Look & feel → App icon (v0.7.8.13, owner's ask 4): four icons to tap, or "Match my skin". The icon in use
 * is ringed. Some launchers take a few seconds to redraw, and may move the icon to the app drawer.
 */
export function AppIconPicker() {
  const { c, dark } = useTheme();
  const choice = useStore((s) => s.settings.appIcon), palette = useStore((s) => s.settings.palette);
  const on = iconFor(choice, palette, dark);
  if (!nativeAvailable()) return null;
  return (
    <View style={{ gap: 8 }} testID="app-icon-picker">
      <Row style={{ flexWrap: 'nowrap', justifyContent: 'space-between' }}>
        {APP_ICONS.map((i) => (
          <Pressable key={i.id} testID={`app-icon-${i.id}`} accessibilityRole="radio" accessibilityState={{ selected: on === i.id }} accessibilityLabel={`${i.name} icon`}
            onPress={() => { act.setSettings({ appIcon: i.id }); fx.select(); }} style={{ alignItems: 'center', gap: 4, minWidth: 64, minHeight: 48 }}>
            <View style={{ borderRadius: 32, padding: 3, borderWidth: 2.5, borderColor: on === i.id ? c.acc : 'transparent' }}>
              <Image source={PIC[i.id]} fadeDuration={0} style={{ width: 52, height: 52 }} />
            </View>
            <Txt f="serif" s={14} c={on === i.id ? 'ink' : 'mut'}>{i.name}</Txt>
          </Pressable>
        ))}
      </Row>
      <Row><Chip small label="Match my skin" on={choice === 'skin'} onPress={() => { act.setSettings({ appIcon: choice === 'skin' ? on : 'skin' }); fx.select(); }} /></Row>
    </View>
  );
}
