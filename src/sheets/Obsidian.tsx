import React, { useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import { Btn, Field, HandBox, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme-context';
import { act, useStore } from '../store/store';
import { obsidianNow, obsidianStatus, onObsidian } from '../store/obsidian';
import { leafOf, pickVault, vaultAvailable } from '../services/vaultFiles';
import { nativeAvailable, onSyncEvent, scanQr, syncClearErrors, syncConfigure, syncEvents, syncForget, syncHold, syncNow, syncPair, syncStatus, type SyncStatus } from '../services/native';
import { syncView, type Action } from '../domain/syncView';
import { holdQuestion } from '../domain/syncHold';
import { DEFAULT_TRACKED } from '../domain/vaultTasks';
import { fmtTime } from '../domain/time';

const DOT = { on: 'ok', off: 'bad', unknown: 'mut' } as const;

/**
 * Settings → Obsidian & sync (v0.8 §4.2): one place that answers "is it working, and if not, why". The devices and
 * their state, the path in use, what is happening now with a bar when it has a size, problems as cards with one
 * action each, files that could not land, the last 200 events (copyable), and setup: the vault folder, pairing by
 * the desktop's QR code, the tracked tags. One "Sync now". Margin is the only bridge; phone Obsidian links itself.
 */
export function ObsidianPage() {
  const { c } = useTheme(), hour12 = useStore((s) => s.settings.hour12), tags = useStore((s) => s.settings.trackedTags), uri = useStore((s) => s.settings.vaultUri);
  const [st, setSt] = useState<SyncStatus | null>(() => syncStatus());
  const [tasks, setTasks] = useState(obsidianStatus());
  const [text, setText] = useState(''), [msg, setMsg] = useState<string | null>(null), [log, setLog] = useState(false), [sure, setSure] = useState(false);
  useEffect(() => {
    const off = onSyncEvent('onSyncStatus', () => setSt(syncStatus()));
    const t = setInterval(() => setSt(syncStatus()), 5000);
    const off2 = onObsidian(() => setTasks(obsidianStatus()));
    return () => { off(); off2(); clearInterval(t); };
  }, []);
  const now = useStore((x) => x.now), v = syncView(st, now, hour12), can = vaultAvailable() && nativeAvailable();
  const refresh = () => setTimeout(() => setSt(syncStatus()), 800);
  const sync = () => { syncNow(); void obsidianNow(); refresh(); };
  const choose = async () => { const picked = await pickVault(); if (picked) { syncConfigure(picked, leafOf(picked)); act.setSettings({ vaultUri: picked }); sync(); } };
  const pairWith = (t: string) => { const err = syncPair(t); setMsg(err ?? 'Paired. Margin finds the desktop on your Wi-Fi, the hotspot or Tailscale.'); if (!err) setText(''); refresh(); };
  const scan = async () => { const r = await scanQr(); if (!r) return; if (r.startsWith('error:')) { setMsg(`The scanner is not available (${r.slice(6)}). Paste the text instead.`); return; } pairWith(r); };
  const doAction = (a: Action) => {
    if (a === 'folder') void choose();
    else if (a === 'retry') { syncClearErrors(); sync(); }
    else if (a === 'clear') { syncClearErrors(); refresh(); }
    else if (a === 'pair') { syncForget(); refresh(); }
    else setMsg('On the desktop: systemctl --user enable --now bone-syncd. Then the computer and the phone on the same Wi-Fi (or the phone\'s hotspot, or Tailscale).');
  };
  if (!can) return <Txt f="serif" s={16} c="mut">The vault link and sync need the Android app.</Txt>;
  const vaultName = st?.vaultName ?? (uri ? leafOf(uri) : null);
  return (
    <View style={{ gap: 12 }}>
      {/* the devices */}
      <View testID="sync-devices"><HandBox seed="sy-dev" fill={c.card} style={{ padding: 12, gap: 6 }}>
        {v.devices.map((d) => (
          <View key={d.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessible accessibilityLabel={`${d.name}: ${d.note}`}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c[DOT[d.dot]] }} />
            <Txt f="bold" s={16} style={{ flex: 1 }} numberOfLines={1}>{d.name}</Txt>
            <Txt f="serif" s={14} c="mut" numberOfLines={1}>{d.note}</Txt>
          </View>
        ))}
        <Txt f="serif" s={15} c={st?.live ? 'mut' : 'bad'} testID="sync-status">{v.connection}</Txt>
      </HandBox></View>
      {/* what is happening now */}
      {v.stage ? (
        <View style={{ gap: 6 }} testID="sync-stage" accessibilityLiveRegion="polite">
          <Txt f="type" s={15}>{v.stage.text}</Txt>
          {v.stage.of > 0 ? <View style={{ height: 6, borderRadius: 3, backgroundColor: c.rule, overflow: 'hidden' }}><View style={{ width: `${Math.min(100, (100 * v.stage.done) / v.stage.of)}%`, height: 6, backgroundColor: c.acc }} /></View> : null}
          {tasks.at ? <Txt f="serif" s={14} c="mut">Task lines: {tasks.note} · {fmtTime(tasks.at, hour12)}</Txt> : null}
        </View>
      ) : null}
      <Btn kind="primary" icon="check" label="Sync now" testID="sync-now" onPress={sync} />
      {/* a big delete waits for the owner */}
      {st?.hold ? (() => {
        const q = holdQuestion(st.hold);
        const answer = (op: 'apply' | 'cancel') => { syncHold(op); refresh(); };
        return (
          <View testID="sync-hold"><HandBox seed="sy-hold" fill={c.card} stroke={c.bad} style={{ padding: 12, gap: 6 }}>
            <Txt f="bold" s={17} c="bad">{q.title}</Txt>
            <Txt f="serif" s={14.5} c="mut">{q.body}</Txt>
            <Btn small kind="ink" icon="trash" label={q.yes} testID="sync-hold-apply" onPress={() => answer('apply')} />
            <Btn small kind="ghost" icon="check" label={q.no} testID="sync-hold-cancel" onPress={() => answer('cancel')} />
          </HandBox></View>
        );
      })() : null}
      {/* problems: the plain cause, what it affects, one action */}
      {v.problems.map((p) => (
        <View key={p.at + p.cause} testID="sync-problem"><HandBox seed={`sy-p-${p.at}`} fill={c.card} stroke={c.warn} style={{ padding: 12, gap: 6 }}>
          <Txt f="bold" s={16} selectable>{p.cause}</Txt>
          <Txt f="serif" s={14.5} c="mut">{p.affects} · {fmtTime(p.at, hour12)}</Txt>
          <Btn small kind="ghost" label={p.label} onPress={() => doAction(p.action)} />
        </HandBox></View>
      ))}
      {st?.skipped?.length ? (
        <View style={{ gap: 4 }} testID="sync-skipped">
          <Txt f="bold" s={17}>Files that could not land</Txt>
          {st.skipped.slice(0, 10).map((x) => <Txt key={x.p} f="serif" s={14} c="mut" selectable>{x.p} · {x.reason}</Txt>)}
          <Txt f="serif" s={14} c="mut">Sync now asks for them again.</Txt>
        </View>
      ) : null}
      {msg ? <Txt f="serif" s={14.5} c="mut" selectable>{msg}</Txt> : null}
      {/* setup */}
      <Txt f="bold" s={19}>Setup</Txt>
      <HandBox seed="sy-vault" fill={c.card} style={{ padding: 12, gap: 6 }}>
        <Txt f="bold" s={17}>{vaultName ? `Vault: ${vaultName}` : 'No vault folder yet'}</Txt>
        <Btn small kind="ink" icon="import" label={vaultName ? 'Change folder' : 'Choose vault folder'} testID="vault-pick" onPress={() => { void choose(); }} />
      </HandBox>
      {st?.paired ? null : (
        <HandBox seed="sy-pair" fill={c.card} style={{ padding: 12, gap: 6 }}>
          <Txt f="bold" s={17}>Pair with the desktop</Txt>
          <Txt f="serif" s={14.5} c="mut">On the desktop run “bone-syncd pair”, then scan the code it shows.</Txt>
          <Btn small kind="ink" icon="check" label="Scan the desktop's code" testID="sync-scan-qr" onPress={() => { void scan(); }} />
          <Field placeholder="or paste: bone-sync://pair?…" value={text} onChangeText={setText} autoCapitalize="none" autoCorrect={false} />
          {text.trim() ? <Btn small kind="ghost" label="Pair with this text" testID="sync-pair" onPress={() => pairWith(text)} /> : null}
        </HandBox>
      )}
      <Field label="Tracked tags" testID="vault-tags" defaultValue={(tags?.length ? tags : DEFAULT_TRACKED).join(' ')} autoCapitalize="none"
        onEndEditing={(e) => { const next = e.nativeEvent.text.split(/[\s,]+/).filter(Boolean).map((t) => (t.startsWith('#') ? t : `#${t}`)); act.setSettings({ trackedTags: next.length ? next : DEFAULT_TRACKED }); sync(); }} />
      <Txt f="serif" s={14} c="mut">Task lines with any of these tags come to To-do. A subject’s own tag counts too. Obsidian on this phone links itself the first time both apps are open.</Txt>
      {/* the event log, copyable for a bug report */}
      <Btn small kind="ghost" icon={log ? 'chevron' : 'down'} label={log ? 'Hide the event log' : 'Show the event log'} onPress={() => setLog(!log)} />
      {log ? (() => {
        const ev = syncEvents();
        const lines = ev.map((e) => `${new Date(e.at).toISOString().slice(0, 19).replace('T', ' ')} ${e.kind}: ${e.msg}`);
        return (
          <View style={{ gap: 2 }} testID="sync-log">
            <Btn small kind="ghost" icon="export" label="Copy the log" onPress={() => { void Share.share({ message: lines.join('\n') }); }} />
            {lines.slice(0, 200).map((l, i) => <Txt key={i} f="type" s={12} c="mut" selectable>{l}</Txt>)}
          </View>
        );
      })() : null}
      {st?.paired ? <Btn small kind={sure ? 'danger' : 'ghost'} icon="trash" label={sure ? 'Tap again to forget this desktop' : 'Forget this desktop'} testID="sync-forget"
        onPress={() => { if (!sure) { setSure(true); setTimeout(() => setSure(false), 4000); return; } syncForget(); setSure(false); refresh(); }} /> : null}
    </View>
  );
}
