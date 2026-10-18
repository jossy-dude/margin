import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Btn, Chip, Field, HStrip, Row, Txt } from '../ui/kit';
import { RunningTimer } from '../ui/RunningTimer';
import { useNow } from '../ui/theme-context';
import { useScreenLive } from '../ui/live';
import { act, useStore } from '../store/store';
import { Empty, Page, TaskCard } from './common';
import { DAY_MS, startOfDay } from '../domain/time';
import type { Task } from '../domain/types';

export function TasksScreen() {
  const tasks = useStore((s) => s.tasks), taskFilter = useStore((s) => s.settings.taskFilter), taskSort = useStore((s) => s.settings.taskSort), courses = useStore((s) => s.courses);
  const st = { tasks, courses };
  /* The day groups and the cards' overdue marks only move at day granularity, so the list re-sorts on
     the wall clock twice a minute while it is under your finger — and does not tick at all while it is
     not, because a hidden page re-filtering and re-grouping for nobody is exactly the cost audit M5
     measured (~600 text nodes across the hidden pages every minute). */
  const live = useScreenLive();
  const now = useNow(live ? 30_000 : 0), [q, setQ] = useState(''), [cid, setCid] = useState<string | null | 'all'>('all');
  const list = useMemo(() => {
    const f = st.tasks.filter((t) => (taskFilter === 'all' ? true : taskFilter === 'open' ? t.status !== 2 : t.status === 2) && (cid === 'all' || t.courseId === cid) && (!q.trim() || t.title.toLowerCase().includes(q.trim().toLowerCase())));
    const cmp: Record<string, (a: Task, b: Task) => number> = { due: (a, b) => (a.dueAt ?? 9e15) - (b.dueAt ?? 9e15), priority: (a, b) => b.priority - a.priority || (a.dueAt ?? 9e15) - (b.dueAt ?? 9e15), created: (a, b) => b.createdAt - a.createdAt };
    return [...f].sort((a, b) => (a.status === 2 ? 1 : 0) - (b.status === 2 ? 1 : 0) || (cmp[taskSort] as (a: Task, b: Task) => number)(a, b));
  }, [st.tasks, taskFilter, taskSort, cid, q]);
  const groups = useMemo(() => {
    const t0 = startOfDay(now), g: { title: string; items: Task[] }[] = [{ title: 'Late', items: [] }, { title: 'Today', items: [] }, { title: 'Tomorrow', items: [] }, { title: 'This week', items: [] }, { title: 'Later', items: [] }, { title: 'No date', items: [] }, { title: 'Done', items: [] }];
    for (const t of list) { const i = t.status === 2 ? 6 : t.dueAt === null ? 5 : t.dueAt < now ? 0 : t.dueAt < t0 + DAY_MS ? 1 : t.dueAt < t0 + 2 * DAY_MS ? 2 : t.dueAt < t0 + 7 * DAY_MS ? 3 : 4; (g[i] as { items: Task[] }).items.push(t); }
    return taskSort === 'due' ? g.filter((x) => x.items.length) : [{ title: '', items: list }];
  }, [list, now, taskSort]);
  const openN = st.tasks.filter((t) => t.status !== 2).length;
  return (
    <Page title="To-do" sub={`${openN} open · swipe right to finish, left to crumple`} right={<RunningTimer />}>
      <Field placeholder="Search tasks" value={q} onChangeText={setQ} returnKeyType="search" />
      <Row>{(['all', 'open', 'done'] as const).map((f) => <Chip key={f} label={f[0]!.toUpperCase() + f.slice(1)} on={taskFilter === f} onPress={() => act.setSettings({ taskFilter: f })} small />)}<View style={{ width: 8 }} />{(['due', 'priority', 'created'] as const).map((f) => <Chip key={f} label={f === 'due' ? 'By date' : f === 'priority' ? 'By priority' : 'Newest'} on={taskSort === f} icon={undefined} onPress={() => act.setSettings({ taskSort: f })} small />)}</Row>
      <HStrip gap={8}><Chip label="Every subject" on={cid === 'all'} onPress={() => setCid('all')} small /><Chip label="Personal" on={cid === null} onPress={() => setCid(null)} small />{st.courses.map((c) => <Chip key={c.id} label={c.name} on={cid === c.id} onPress={() => setCid(c.id)} small />)}</HStrip>
      {list.length === 0 ? <Empty icon="tasks" text={q ? 'Nothing matches that search.' : 'All clear. Tap + to add an assignment, exam or reading.'} /> : groups.map((g) => (
        <View key={g.title || 'all'} style={{ gap: 10 }}>{g.title ? <Txt f="serif" s={17} c={g.title === 'Late' ? 'bad' : 'mut'} accessibilityRole="header">{g.title} · {g.items.length}</Txt> : null}{g.items.map((t) => <TaskCard key={t.id} t={t} now={now} />)}</View>))}
      <Btn kind="ghost" icon="plus" label="New task" onPress={() => act.open({ t: 'task' })} />
    </Page>
  );
}
