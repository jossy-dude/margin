import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Btn, DropChip, Field, Row, Segmented, Txt } from '../ui/kit';
import { RunningTimer } from '../ui/RunningTimer';
import { useNow } from '../ui/theme-context';
import { useScreenLive } from '../ui/live';
import { act, useStore } from '../store/store';
import { Empty, Page, TaskCard } from './common';
import { addDays, startOfDay } from '../domain/time';
import type { Task } from '../domain/types';

/** How many task cards one "page" of the list draws. */
export const PAGE_ROWS = 60;

export function TasksScreen() {
  const tasks = useStore((s) => s.tasks), taskFilter = useStore((s) => s.settings.taskFilter), subj = useStore((s) => s.settings.taskSubject), taskSort = useStore((s) => s.settings.taskSort), courses = useStore((s) => s.courses);
  const st = { tasks, courses };
  /* The day groups and the cards' overdue marks only move at day granularity, so the list re-sorts on
     the wall clock twice a minute while it is under your finger — and does not tick at all while it is
     not, because a hidden page re-filtering and re-grouping for nobody is exactly the cost audit M5
     measured (~600 text nodes across the hidden pages every minute). */
  const live = useScreenLive();
  const now = useNow(live ? 30_000 : 0), [q, setQ] = useState('');
  /* The subject choice is a setting now (BUGS #7: it was component state, reset on every visit). A subject that
     was deleted since reads as "all". */
  const cid: string | null | 'all' = subj === 'personal' ? null : subj && courses.some((c) => c.id === subj) ? subj : 'all';
  const [pick, setPick] = useState(false);
  const list = useMemo(() => {
    const f = st.tasks.filter((t) => (taskFilter === 'done' ? t.status === 2 : t.status !== 2) && (cid === 'all' || t.courseId === cid) && (!q.trim() || t.title.toLowerCase().includes(q.trim().toLowerCase())));
    const cmp: Record<string, (a: Task, b: Task) => number> = { due: (a, b) => (a.dueAt ?? 9e15) - (b.dueAt ?? 9e15), priority: (a, b) => b.priority - a.priority || (a.dueAt ?? 9e15) - (b.dueAt ?? 9e15), created: (a, b) => b.createdAt - a.createdAt };
    /* Done is the archive: newest finished first, whatever the sort says. */
    if (taskFilter === 'done') return [...f].sort((a, b) => (b.completedAt ?? b.createdAt) - (a.completedAt ?? a.createdAt));
    return [...f].sort((cmp[taskSort] as (a: Task, b: Task) => number));
  }, [st.tasks, taskFilter, taskSort, cid, q]);
  const groups = useMemo(() => {
    const t0 = startOfDay(now), g: { title: string; items: Task[] }[] = [{ title: 'Late', items: [] }, { title: 'Today', items: [] }, { title: 'Tomorrow', items: [] }, { title: 'This week', items: [] }, { title: 'Later', items: [] }, { title: 'No date', items: [] }, { title: 'Done', items: [] }];
    for (const t of list) { const i = t.status === 2 ? 6 : t.dueAt === null ? 5 : t.dueAt < now ? 0 : t.dueAt < addDays(t0, 1) ? 1 : t.dueAt < addDays(t0, 2) ? 2 : t.dueAt < addDays(t0, 7) ? 3 : 4; (g[i] as { items: Task[] }).items.push(t); }
    return taskSort === 'due' ? g.filter((x) => x.items.length) : [{ title: '', items: list }];
  }, [list, now, taskSort]);
  const openN = st.tasks.filter((t) => t.status !== 2).length;
  /* F8: the page draws at most `shown` cards, then a "Show more" row. Every card is a full swipeable
     paper slip, and drawing a thousand of them made the first visit (and every refocus, which rebuilds
     the page's layout) cost seconds on a mid-range phone. The cap resets when the question changes. */
  const [more, setMore] = useState({ key: '', n: PAGE_ROWS });
  const askKey = `${q}|${cid}|${taskFilter}|${taskSort}`;
  const shown = more.key === askKey ? more.n : PAGE_ROWS;
  let budget = shown;
  const capped = groups.map((g) => { const items = g.items.slice(0, Math.max(0, budget)); budget -= items.length; return { ...g, items, total: g.items.length }; }).filter((g) => g.items.length);
  const hidden = list.length - Math.min(list.length, shown);
  return (
    <Page title="To-do" sub={`${openN} open · swipe right to finish, left to crumple`} right={<RunningTimer />}>
      <Field placeholder="Search tasks" value={q} onChangeText={setQ} returnKeyType="search" />
      {/* BUGS #7: one quiet row, three controls with different shapes for different jobs. */}
      <Row style={{ flexWrap: 'nowrap', gap: 8, alignItems: 'center' }}>
        <Segmented label="Show" value={taskFilter} options={[{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }]} onChange={(v) => act.setSettings({ taskFilter: v })} />
        <View style={{ flex: 1 }} />
        <DropChip label={cid === 'all' ? 'All subjects' : cid === null ? 'Personal' : courses.find((c) => c.id === cid)?.name ?? 'All subjects'} chosen={cid !== 'all'}
          onPress={() => setPick((x) => !x)} onClear={() => act.setSettings({ taskSubject: '' })} />
        {taskFilter === 'open' ? <Btn small kind="ghost" icon="sort" label={taskSort === 'due' ? 'Due' : taskSort === 'priority' ? 'Priority' : 'Newest'} a11y={`Sort: ${taskSort === 'due' ? 'due date' : taskSort === 'priority' ? 'priority' : 'newest'}. Tap to change.`}
          onPress={() => act.setSettings({ taskSort: taskSort === 'due' ? 'priority' : taskSort === 'priority' ? 'created' : 'due' })} /> : null}
      </Row>
      {pick ? (
        <View testID="subject-menu" style={{ gap: 2 }}>
          {[{ id: '', name: 'All subjects' }, { id: 'personal', name: 'Personal' }, ...courses.map((c) => ({ id: c.id, name: c.name }))].map((o) => {
            // counts for the segment being shown (phone test #11: Done showed the open counts)
            const inSeg = (t: Task) => (taskFilter === 'done' ? t.status === 2 : t.status !== 2);
            const n = tasks.filter((t) => inSeg(t) && (o.id === '' || (o.id === 'personal' ? t.courseId === null : t.courseId === o.id))).length;
            return <Btn key={o.id || 'all'} small kind={(subj || '') === o.id ? 'primary' : 'ghost'} label={`${o.name} · ${n}`} onPress={() => { act.setSettings({ taskSubject: o.id }); setPick(false); }} />;
          })}
        </View>
      ) : null}
      {list.length === 0 ? <Empty icon="tasks" mood={q ? 'curious' : 'happy'} text={q ? 'Nothing matches that search.' : 'All clear. Tap + to add one.'} /> : capped.map((g) => (
        <View key={g.title || 'all'} style={{ gap: 10 }}>{g.title ? <Txt f="serif" s={17} c={g.title === 'Late' ? 'bad' : 'mut'} accessibilityRole="header">{g.title} · {g.total}</Txt> : null}{g.items.map((t) => <TaskCard key={t.id} t={t} now={now} />)}</View>))}
      {hidden > 0 ? <Btn kind="ghost" testID="tasks-show-more" label={`Show ${Math.min(hidden, PAGE_ROWS)} more · ${hidden} not shown`} onPress={() => setMore({ key: askKey, n: shown + PAGE_ROWS })} /> : null}
      <Btn kind="ghost" icon="plus" label="New task" onPress={() => act.open({ t: 'task' })} />
    </Page>
  );
}
