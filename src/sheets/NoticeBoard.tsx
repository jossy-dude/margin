import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Btn, HandBox, Icon, Txt } from '../ui/kit';
import { FullPage } from '../ui/FullPage';
import { SwipeCard } from '../ui/Swipe';
import { useTheme } from '../ui/theme-context';
import { act, useStore } from '../store/store';
import { toast } from '../store/toast';
import { noticeOrder } from '../domain/vaultNotes';
import { dueWhen } from '../screens/today/model';
import { NOTE_LEVEL } from '../ui/collage/notes';
import type { Notice } from '../domain/types';

/**
 * The Notice board (v0.8 §3.2, was "Notes"): pinned reminders for the future self. Pinned first, then the dated ones
 * by date. Swipe right to unpin, left to archive, each with Undo; tap to edit. Archived notices are kept below.
 */
export function NoticeBoard() {
  const notices = useStore((s) => s.notices), courses = useStore((s) => s.courses), hour12 = useStore((s) => s.settings.hour12), now = useStore((s) => s.now);
  const [showOld, setShowOld] = useState(false);
  const live = noticeOrder(notices), old = notices.filter((n) => n.archived && !n.demo);
  const save = (n: Notice, said: string, undo: Notice) => { act.saveNotice(n); toast(said, () => act.saveNotice(undo)); };
  return (
    <FullPage title="Notice board" sub={live.length ? `${live.filter((n) => n.pinned).length} pinned · ${live.filter((n) => n.dueAt != null).length} dated` : 'Nothing pinned'}
      onBack={act.closePage} testID="notices"
      right={<Btn small kind="primary" icon="plus" a11y="New notice" onPress={() => act.open({ t: 'notice' })} />}>
      {live.length === 0 ? <Txt f="serif" s={17} c="mut">An exam date, a heads-up from class, something to bring: pin it here and it shows on Today.</Txt> : null}
      {live.map((n) => (
        <SwipeCard key={n.id} doneLabel={n.pinned ? 'Unpin' : 'Pin'}
          onComplete={() => save({ ...n, pinned: !n.pinned }, n.pinned ? 'Unpinned' : 'Pinned', n)}
          onDelete={() => save({ ...n, archived: true, pinned: false }, 'Archived', n)}
          onOpen={() => act.open({ t: 'notice', id: n.id })}>
          <NoticeRow n={n} course={courses.find((c) => c.id === n.courseId)?.name ?? null} now={now} hour12={hour12} />
        </SwipeCard>
      ))}
      {old.length ? <Btn small kind="ghost" icon={showOld ? 'chevron' : 'down'} label={`${showOld ? 'Hide' : 'Show'} archived · ${old.length}`} onPress={() => setShowOld(!showOld)} /> : null}
      {showOld ? old.map((n) => (
        <View key={n.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: 0.7 }}>
          <View style={{ flex: 1 }}><NoticeRow n={n} course={courses.find((c) => c.id === n.courseId)?.name ?? null} now={now} hour12={hour12} /></View>
          <Btn small kind="ghost" label="Restore" onPress={() => save({ ...n, archived: false }, 'Restored', n)} />
        </View>
      )) : null}
    </FullPage>
  );
}

function NoticeRow({ n, course, now, hour12 }: { n: Notice; course: string | null; now: number; hour12: boolean }) {
  const { c } = useTheme();
  const when = n.dueAt != null && n.dueAt >= now - 86_400_000 ? dueWhen(n.dueAt, now, hour12) : null;
  const level = NOTE_LEVEL[n.priority] ?? NOTE_LEVEL[0];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${n.text}${course ? `, ${course}` : ''}${when ? `, ${when}` : ''}${n.pinned ? ', pinned' : ''}`} onPress={() => act.open({ t: 'notice', id: n.id })}>
      <HandBox seed={`nb-${n.id}`} fill={n.priority >= 3 ? c.hl : c.card} style={{ padding: 12, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {n.pinned ? <Icon name="flag" size={16} color={c.acc} /> : null}
          <Txt f="bold" s={18} style={{ flex: 1 }} numberOfLines={3}>{n.text}</Txt>
        </View>
        <Txt f="serif" s={14.5} c="mut">{[course, when, n.priority ? level.word : '', n.remind != null && when ? 'reminds you' : ''].filter(Boolean).join(' · ') || 'No date'}</Txt>
      </HandBox>
    </Pressable>
  );
}
