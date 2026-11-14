import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Field, Icon, Txt } from '../../ui/kit';
import { useTheme } from '../../ui/theme-context';
import { hexA } from '../../tokens/theme';
import { act } from '../../store/store';
import { crumbs, searchSettings } from './settingsIndex';

/**
 * Settings search (PLAN R8): type a word ("quiet", "dark", "backup") and the rows that match show under the field,
 * each with where it lives; a tap opens that page. Nothing is hidden while the field is empty.
 */
export function SettingsSearch() {
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const hits = searchSettings(q);
  return (
    <View style={{ gap: 6 }}>
      <Field label="Search settings" placeholder="Quiet hours, dark, backup…" value={q} onChangeText={setQ} returnKeyType="search" autoCorrect={false} testID="settings-search" />
      {q.trim().length >= 2 ? (
        <View accessibilityLiveRegion="polite" style={{ gap: 2 }}>
          {hits.length === 0 ? <Txt f="serif" s={15.5} c="mut">{`Nothing called “${q.trim()}”.`}</Txt> : hits.map((x) => (
            <Pressable key={`${x.path.join('/')}:${x.label}`} accessibilityRole="button" accessibilityLabel={`${x.label}, in ${crumbs(x)}`} testID={`settings-hit-${x.label}`}
              onPress={() => { setQ(''); act.openSettingsPath(x.path); }} android_ripple={{ color: hexA(c.ink, 0.12) }}
              style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 }}>
              <View style={{ flex: 1 }}>
                <Txt f="bold" s={17}>{x.label}</Txt>
                <Txt f="serif" s={14} c="mut">{crumbs(x)}</Txt>
              </View>
              <Icon name="chevron" size={18} color={c.mut} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
