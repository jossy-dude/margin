/* Which components rendered in a commit: React marks each fiber that ran its render with PerformedWork (1). The
   DevTools hook must exist before React loads, so it is installed at the top of the file (jest hoists only mocks). */
export const counts: Record<string, Record<string, number>> = {};
let hookLabel = 'mount';
export const setHookLabel = (l: string) => { hookLabel = l; };
const nameOf = (f: { type?: unknown; elementType?: unknown }) => { const t = (f.elementType ?? f.type) as { displayName?: string; name?: string; render?: { name?: string }; type?: { name?: string } } | string | undefined; if (!t || typeof t === 'string') return null; return t.displayName ?? t.name ?? t.render?.name ?? t.type?.name ?? null; };
(globalThis as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
  supportsFiber: true, renderers: new Map(), inject: () => 1, checkDCE: () => {}, onCommitFiberUnmount: () => {}, onPostCommitFiberRoot: () => {}, onScheduleFiberRoot: () => {},
  onCommitFiberRoot: (_id: number, root: { current: unknown }) => {
    const b = (counts[hookLabel] ??= {});
    const walk = (f: { tag: number; flags: number; child: unknown; sibling: unknown } | null) => {
      while (f) { const alt = (f as { alternate?: { child: unknown } | null }).alternate; if ((f.flags & 1) && [0, 1, 11, 14, 15].includes(f.tag)) { const n = nameOf(f as never); if (n) b[n] = (b[n] ?? 0) + 1; } if (!alt || alt.child !== f.child) walk(f.child as never); f = f.sibling as never; }
    };
    walk((root.current as { child: unknown }).child as never);
  },
};
