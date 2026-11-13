import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Btn, Field, HandBox, Txt } from '../ui/kit';
import { useTheme } from '../ui/theme-context';
import { syncForget, syncObsidianCode, syncPair, syncStatus, nativeAvailable, type SyncStatus } from '../services/native';
import { fmtTime } from '../domain/time';
import { useStore } from '../store/store';

/** The words a person reads for the service's state (SYNC_ANDROID.md §4). */
export function syncLine(s: SyncStatus | null, hour12: boolean): string {
  if (!s) return 'This build cannot sync.';
  if (!s.paired) return 'Not paired with a desktop yet.';
  if (!s.vault) return 'Paired. Choose the vault folder above so Margin can write it.';
  const last = s.lastOk ? ` · last contact ${fmtTime(s.lastOk, hour12)}` : '';
  if (s.live) return `Connected to your desktop${s.mode === 'read-only' ? ' (read-only trial)' : ''}${s.obsidian ? ' · Obsidian on this phone connected' : ''}${last}`;
  if (s.state === 'ready') return `Home network: syncs when you look${last}`;
  if (s.state === 'dormant') return `Waiting for home Wi-Fi or your hotspot${last}`;
  return `Starting${last}`;
}

/** Settings → Obsidian → Sync with your desktop: pair, status, the code for phone Obsidian, forget. */
export function SyncCard() {
  const { c } = useTheme(), hour12 = useStore((s) => s.settings.hour12);
  const [st, setSt] = useState<SyncStatus | null>(() => syncStatus());
  const [text, setText] = useState(''), [msg, setMsg] = useState<string | null>(null), [code, setCode] = useState<string | null>(null);
  useEffect(() => { const t = setInterval(() => setSt(syncStatus()), 3000); return () => clearInterval(t); }, []);
  if (!nativeAvailable()) return null;
  const pair = () => { const err = syncPair(text); setMsg(err ?? 'Paired. Margin connects when you are on home Wi-Fi or your hotspot.'); if (!err) setText(''); setSt(syncStatus()); };
  const today = st?.stats?.[0];
  return (
    <HandBox seed="ob-sync" fill={c.card} style={{ padding: 14, gap: 8 }}>
      <Txt f="bold" s={21}>Sync with your desktop</Txt>
      <Txt f="serif" s={15} c={st?.lastError ? 'bad' : 'mut'} testID="sync-status">{syncLine(st, hour12)}{st?.lastError ? ` · ${st.lastError}` : ''}</Txt>
      {st?.paired ? null : (
        <>
          <Txt f="serif" s={14.5} c="mut">On the desktop run “bone-syncd pair”. Scan its code with the camera and paste the text here, or type its eight words, then @ and the desktop address.</Txt>
          <Field placeholder="bone-sync://pair?…  or  eight words @ 192.168.1.11" value={text} onChangeText={setText} autoCapitalize="none" autoCorrect={false} />
          <Btn small kind="ink" icon="check" label="Pair" testID="sync-pair" disabled={!text.trim()} onPress={pair} />
        </>
      )}
      {msg ? <Txt f="serif" s={14.5} c="mut">{msg}</Txt> : null}
      {st?.paired ? (
        <View style={{ gap: 8 }}>
          <Btn small kind="ghost" icon="note" label="Connect phone Obsidian" testID="sync-obsidian-code" onPress={() => setCode(syncObsidianCode())} />
          {code ? <Txt f="bold" s={28} selectable testID="sync-code">{code.replace(/(\d{3})(\d{3})/, '$1 $2')}</Txt> : null}
          {code ? <Txt f="serif" s={14.5} c="mut">In Obsidian: Settings → Margin Bridge → Connect to Margin, type this code. It works for 10 minutes.</Txt> : null}
          {today ? <Txt f="type" s={13} c="mut" selectable>Today: {today.connects} connects · {Math.round(today.liveMs / 60000)} min live · {Math.round((today.rx + today.tx) / 1024)} KB · {today.catchups} catch-ups{today.err ? ` · ${today.err} errors (${today.lastErr ?? ''})` : ''} · queue {st.outbox}</Txt> : null}
          <Btn small kind="ghost" icon="trash" label="Forget this desktop" testID="sync-forget" onPress={() => { syncForget(); setCode(null); setSt(syncStatus()); }} />
        </View>
      ) : null}
    </HandBox>
  );
}
