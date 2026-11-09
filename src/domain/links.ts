/**
 * Where a `marginalia://…` link lands (v0.7). The widgets, the pinned class and the alarm notifications open the
 * app with one; this is the whole vocabulary. Pure, and total: anything it does not know is `null`, and the
 * app simply opens where it was.
 */
export type LinkTarget = { t: 'route'; route: 'Today' | 'Tasks' | 'Week' | 'Grades' | 'Stats' } | { t: 'add-task' } | { t: 'alarms' };

export function linkTarget(url: string | null | undefined): LinkTarget | null {
  if (!url) return null;
  const m = /^(?:exp\+)?marginalia:\/\/\/?([a-z/-]*)/i.exec(url.trim());
  if (!m) return null;
  const path = (m[1] ?? '').toLowerCase().replace(/\/+$/, '');
  switch (path) {
    case 'today': return { t: 'route', route: 'Today' };
    case 'tasks': return { t: 'route', route: 'Tasks' };
    case 'week': return { t: 'route', route: 'Week' };
    case 'grades': return { t: 'route', route: 'Grades' };
    case 'stats': return { t: 'route', route: 'Stats' };
    case 'add/task': return { t: 'add-task' };
    case 'alarms': return { t: 'alarms' };
    default: return null;
  }
}
