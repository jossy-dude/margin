import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Btn, Chip, Field, Row, Txt } from '../ui/kit';
import { RunningTimer } from '../ui/RunningTimer';
import { useNow } from '../ui/theme-context';
import { act, useStore } from '../store/store';
import { Empty, Page, TaskCard } from './common';
import { DAY_MS, startOfDay } from '../domain/time';
import type { Task } from '../domain/types';

export function TasksScreen() {
  const tasks = useStore((s) => s.tasks), settings = useStore((s) => s.settings), courses = useStore((s) => s.courses);
  const st = { tasks, settings, courses };
  const now = useNow(30_000), [q, setQ] = useState(''), [cid, setCid] = useState<string | null | 'all'>('all'), s = st.settings;
  const list = useMemo(() => {
    const f = st.tasks.filter((t) => (s.taskFilter === 'all' ? true : s.taskFilter === 'open' ? t.status !== 2 : t.status === 2) && (cid === 'all' || t.courseId === cid) && (!q.trim() || t.title.toLowerCase().includes(q.trim().toLowerCase())));
    const cmp: Record<string, (a: Task, b: Task) => number> = { due: (a, b) => (a.dueAt ?? 9e15) - (b.dueAt ?? 9e15), priority: (a, b) => b.priority - a.priority || (a.dueAt ?? 9e15) - (b.dueAt ?? 9e15), created: (a, b) => b.createdAt - a.createdAt };
    return [...f].sort((a, b) => (a.status === 2 ? 1 : 0) - (b.status === 2 ? 1 : 0) || (cmp[s.taskSort] as (a: Task, b: Task) => number)(a, b));
  }, [st.tasks, s.taskFilter, s.taskSort, cid, q]);
  const groups = useMemo(() => {
    const t0 = startOfDay(now), g: { title: string; items: Task[] }[] = [{ title: 'Late', items: [] }, { title: 'Today', items: [] }, { title: 'Tomorrow', items: [] }, { title: 'This week', items: [] }, { title: 'Later', items: [] }, { title: 'No date', items: [] }, { title: 'Done', items: [] }];
    for (const t of list) { const i = t.status === 2 ? 6 : t.dueAt === null ? 5 : t.dueAt < now ? 0 : t.dueAt < t0 + DAY_MS ? 1 : t.dueAt < t0 + 2 * DAY_MS ? 2 : t.dueAt < t0 + 7 * DAY_MS ? 3 : 4; (g[i] as { items: Task[] }).items.push(t); }
    return s.taskSort === 'due' ? g.filter((x) => x.items.length) : [{ title: '', items: list }];
  }, [list, now, s.taskSort]);
  const openN = st.tasks.filter((t) => t.status !== 2).length;
  return (
    <Page title="To-do" sub={`${openN} open · swipe right to finish, left to crumple`}>
      <RunningTimer />
      <Field placeholder="Search tasks" value={q} onChangeText={setQ} returnKeyType="search" />
      <Row>{(['all', 'open', 'done'] as const).map((f) => <Chip key={f} label={f[0]!.toUpperCase() + f.slice(1)} on={s.taskFilter === f} onPress={() => act.setSettings({ taskFilter: f })} small />)}<View style={{ width: 8 }} />{(['due', 'priority', 'created'] as const).map((f) => <Chip key={f} label={f === 'due' ? 'By date' : f === 'priority' ? 'By priority' : 'Newest'} on={s.taskSort === f} icon={undefined} onPress={() => act.setSettings({ taskSort: f })} small />)}</Row>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}><Chip label="Every subject" on={cid === 'all'} onPress={() => setCid('all')} small /><Chip label="Personal" on={cid === null} onPress={() => setCid(null)} small />{st.courses.map((c) => <Chip key={c.id} label={c.name} on={cid === c.id} onPress={() => setCid(c.id)} small />)}</ScrollView>
      {list.length === 0 ? <Empty icon="tasks" text={q ? 'Nothing matches that search.' : 'All clear. Tap + to add an assignment, exam or reading.'} /> : groups.map((g) => (
        <View key={g.title || 'all'} style={{ gap: 10 }}>{g.title ? <Txt f="serif" s={17} c={g.title === 'Late' ? 'bad' : 'mut'} accessibilityRole="header">{g.title} · {g.items.length}</Txt> : null}{g.items.map((t) => <TaskCard key={t.id} t={t} now={now} />)}</View>))}
      <Btn kind="ghost" icon="plus" label="New task" onPress={() => act.open({ t: 'task' })} />
    </Page>
  );
}
