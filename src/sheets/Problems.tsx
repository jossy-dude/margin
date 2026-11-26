import React, { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { Btn, HandBox, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme-context';
import { Face } from '../ui/mascot/Face';
import { act, useStore } from '../store/store';
import { obsidianNow } from '../store/obsidian';
import { leafOf, pickVault } from '../services/vaultFiles';
import { onSyncEvent, syncClearErrors, syncConfigure, syncDismissError, syncForget, syncNow, syncStatus, type SyncStatus } from '../services/native';
import { problemGroups, syncView, type Problem } from '../domain/syncView';
import { fmtTime } from '../domain/time';
import { obsidianLink } from '../domain/obsidianLink';

const UPDATE = 'On the desktop: cd ~/Documents/Projects/tools/vault-sync && git pull, then systemctl --user restart bone-syncd. Margin Bridge updates itself by sync.';
const HUB = 'On the desktop: systemctl --user enable --now bone-syncd. Then the computer and the phone on the same Wi-Fi (or the phone\'s hotspot, or Tailscale).';


/**
 * Settings → Obsidian & sync → What went wrong (v0.7.8, SPEC §8 G3). One card per problem: its code, the plain
 * sentence, ONE 48 dp button, the time. Grouped by device, open ones first and newest first; a fixed problem stays
 * a while, greyed, with "Fixed 14:20". Nothing wrong: the mascot and the last good sync.
 */
export function ProblemsPage() {
  const { c } = useTheme(), hour12 = useStore((s) => s.settings.hour12), uri = useStore((s) => s.settings.vaultUri), now = useStore((s) => s.now);
  const [st, setSt] = useState<SyncStatus | null>(() => syncStatus()), [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const off = onSyncEvent('onSyncStatus', () => setSt(syncStatus()));
    const t = setInterval(() => setSt(syncStatus()), 5000);
    return () => { off(); clearInterval(t); };
  }, []);
  const refresh = () => setTimeout(() => setSt(syncStatus()), 800);
  const vaultName = st?.vaultName ?? (uri ? leafOf(uri) : null);
  const run = async (p: Problem) => {
    setMsg(null);
    if (p.action === 'retry') { syncNow(); void obsidianNow(); refresh(); }
    else if (p.action === 'folder') { const picked = await pickVault(); if (picked) { syncConfigure(picked, leafOf(picked)); act.setSettings({ vaultUri: picked }); syncNow(); refresh(); } }
    else if (p.action === 'pair') { syncForget(); act.settingsPop(); }
    else if (p.action === 'review') act.settingsPop();
    else if ((p.action === 'open' || p.action === 'show') && p.arg) void Linking.openURL(obsidianLink(vaultName, p.arg)).catch(() => setMsg(`Open ${p.arg} in Obsidian.`));
    else if (p.action === 'hub') setMsg(HUB);
    else if (p.action === 'update') setMsg(UPDATE);
    else { syncDismissError(p.at); refresh(); }
  };
  const v = syncView(st, now, hour12), groups = problemGroups(v.problems), open = v.problems.filter((p) => !p.fixed).length;
  if (!groups.length) return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 32 }} testID="problems-empty">
      <Face name="content" size={64} label="All fine" />
      <Txt f="bold" s={19}>Nothing wrong</Txt>
      <Txt f="serif" s={15} c="mut">{st?.lastOk ? `Last good sync ${fmtTime(st.lastOk, hour12)}` : 'Not synced yet'}</Txt>
    </View>
  );
  return (
    <View style={{ gap: 12 }}>
      {msg ? <Txt f="serif" s={14.5} c="mut" selectable testID="problems-msg">{msg}</Txt> : null}
      {groups.map((g) => (
        <View key={g.side} style={{ gap: 8 }}>
          <Txt f="bold" s={15} c="mut">{g.title}</Txt>
          {g.items.map((p) => (
            <View key={`${p.at}${p.cause}`} testID={`problem-${p.code}`} style={p.fixed ? { opacity: 0.55 } : undefined}>
              <HandBox seed={`pr-${p.at}`} fill={c.card} stroke={p.fixed ? c.rule : c.warn} style={{ padding: 12, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Txt f="type" s={13} c={p.fixed ? 'mut' : 'warn'}>{p.code}</Txt>
                  <Txt f="serif" s={13} c="mut" style={{ marginLeft: 'auto' }}>{p.fixed ? `Fixed ${fmtTime(p.fixed, hour12)}` : fmtTime(p.at, hour12)}</Txt>
                </View>
                <Txt f="bold" s={16} selectable>{p.cause}</Txt>
                <Txt f="serif" s={14.5} c="mut">{p.affects}</Txt>
                {p.fixed ? null : <Btn kind="ghost" label={p.label} testID={`problem-${p.code}-act`} onPress={() => { void run(p); }} />}
              </HandBox>
            </View>
          ))}
        </View>
      ))}
      <Btn small kind="ghost" icon="trash" label={open ? 'Clear the list' : 'Clear the fixed ones'} testID="problems-clear" onPress={() => { syncClearErrors(); refresh(); }} />
    </View>
  );
}
