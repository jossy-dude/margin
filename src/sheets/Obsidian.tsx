import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Btn, HandBox, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme-context';
import { act, useStore } from '../store/store';
import { onVault, vaultStatus, vaultSync } from '../store/vault';
import { leafOf, pickVault, vaultAvailable } from '../services/vaultFiles';
import { fmtTime } from '../domain/time';
import { SyncCard } from './SyncCard';

/** Settings → Obsidian: choose the vault folder, see the last sync, sync now, disconnect. */
export function ObsidianPage() {
  const { c } = useTheme(), uri = useStore((s) => s.settings.vaultUri), hour12 = useStore((s) => s.settings.hour12), can = vaultAvailable();
  const [st, setSt] = useState(vaultStatus());
  useEffect(() => onVault(() => setSt(vaultStatus())), []);
  const choose = async () => { const picked = await pickVault(); if (picked) { act.setSettings({ vaultUri: picked }); void vaultSync(); } };
  return (
    <View style={{ gap: 12 }}>
      <Txt f="serif" s={16} c="mut">{can ? 'Tasks and classes, shared with your vault.' : 'The vault link needs the Android app.'}</Txt>
      <HandBox seed="ob-vault" fill={c.card} style={{ padding: 14, gap: 8 }}>
        <Txt f="bold" s={21}>{uri ? leafOf(uri) || 'Vault connected' : 'No vault yet'}</Txt>
        <Txt f="serif" s={15} c={st.ok ? 'mut' : 'bad'} testID="vault-status">{!uri ? 'Pick the folder Obsidian opens.' : st.at ? `${fmtTime(st.at, hour12)} · ${st.note}` : 'Not synced yet'}</Txt>
        {can && <Btn small kind="ink" icon="import" label={uri ? 'Change folder' : 'Choose vault folder'} testID="vault-pick" onPress={() => { void choose(); }} />}
        {uri ? <Btn small kind="ghost" icon="play" label="Sync now" testID="vault-sync" onPress={() => { void vaultSync(); }} /> : null}
        {uri ? <Btn small kind="ghost" icon="trash" label="Disconnect" testID="vault-off" onPress={() => act.setSettings({ vaultUri: null })} /> : null}
      </HandBox>
      <SyncCard />
      <Txt f="serif" s={15} c="mut">1. Turn on the Margin Bridge plugin in Obsidian.</Txt>
      <Txt f="serif" s={15} c="mut">2. Choose the same vault folder here.</Txt>
      <Txt f="serif" s={15} c="mut">3. Your git sync carries the .margin folder between devices.</Txt>
    </View>
  );
}
