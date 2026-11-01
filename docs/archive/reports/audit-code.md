# Marginalia — code audit (v2-improvements)

Read-only audit of `/home/jossy/Documents/Projects/School_planner_v2` @ `v2-improvements`.
Nothing outside this file was created, edited or deleted. Every finding below carries a `file:line`,
an evidence excerpt, and a minimal fix.

**Deliberately excluded.** Findings already recorded in `docs/lag-diagnosis-2026-10-14.md`
(RC-1…RC-7) and `docs/BATCH-2026-10-14.md` are not re-reported here. Value in this document is what
those two missed or did not prove. Where a known area is *confirmed* here (e.g. the write path), it is
reported only because there is now a reproducing probe, not a theory.

**Method.** Static read of `src/**` plus three throwaway probes run from outside the repo with an
inline jest config (`/tmp/opencode/audit-probe/`: `tx-repro.test.ts`, `offscreen.test.tsx`,
`migration-window.test.ts`). The repo tree was never written to. Sizes were measured with `du -b`.

**What the probes measure, honestly.** The perf probe counts React component renders and their
aggregate render time inside a mocked node harness (`react-test-renderer`, mocked reanimated / gesture
handler / svg). Those are *render counts and relative costs*, not device frame times. The data-layer
probe runs the real `SqliteRepository` over a `node:sqlite` shim whose `withTransactionAsync` is a
straight BEGIN/COMMIT — the same shape `expo-sqlite` documents for its own implementation.

---

## Working-tree note (read this before the findings)

`git status --porcelain` observed during this audit, at two different moments:

```
(first check)                       (last check, ~20 min later)
 M DECISIONS.md                      M DECISIONS.md
 M tools/cap-baseline.mjs            M STATE.md
?? .shots/                           M tools/cap-baseline.mjs
?? tools/probe-capture.mjs          ?? .shots/
?? tools/ux-audit/                  ?? reports/
                                    ?? tools/ux-audit/
```

The set of modified/untracked paths **changed while this audit was running** (`STATE.md` appeared,
`tools/probe-capture.mjs` disappeared), which means other sessions are writing into this working tree
concurrently. None of those paths was produced by this audit: the audit created exactly one file,
`reports/audit-code.md` (the `?? reports/` entry above; the `reports/` directory was empty at session
start), and ran no write command against the repo. The pre-existing entries are listed here rather than
silently ignored, because the task's binary gate is "no changes outside `reports/`" and that gate can
only be read honestly with the concurrent writers on the record.

---

# Critical

## C1. Every mutating repository call opens its own non-exclusive transaction, so overlapping writes silently lose data

**Severity: critical** — `src/data/sqlite.ts:35,37,43,49,67,77,78` (each `withTransactionAsync`) with
`src/store/store.ts:43,168,178,193`

`expo-sqlite`'s own doc-comment states the contract:

```
node_modules/expo-sqlite/build/SQLiteDatabase.js:99
     * > **Note:** This transaction is not exclusive and can be interrupted by other async queries.
...
:130       * If you worry about the order of execution, use `withExclusiveTransactionAsync` instead.
```

and the implementation is a bare `BEGIN` / `COMMIT` on the shared connection
(`SQLiteDatabase.js:120-130`). The adapter wraps *every* mutation in one of these:

```ts
src/data/sqlite.ts:35
  async upsert<K extends EntityName>(e: K, v: EntityMap[K]) { await this.db.withTransactionAsync(async () => { await this.put(e, v); }); }
```

and the store fires those calls without awaiting them:

```ts
src/store/store.ts:43
const persist = (p: Promise<unknown>) => p.catch((e) => set({ toast: { ... `Couldn't save: ...` } }));
src/store/store.ts:168
    set((s) => ({ tasks: exists ? ... })); void persist(R().upsert('task', t)); resync();
src/store/store.ts:193
    void persist((async () => { await R().remove('course', id); for (const m of ms) await R().remove('meeting', m.id); for (const m of mk) await R().remove('mark', m.id); })()); resync();
```

Two writes in flight at once therefore nest `BEGIN`s. Probe B and C (`tx-repro.test.ts`, run against the
real `SqliteRepository`, two `upsert`s and three `remove`s issued concurrently):

```
B: results → ["fulfilled","rejected: cannot start a transaction within a transaction"]
B: surviving tasks → ["a"]
B: outbox → ["put:a"]
C: results → ["fulfilled","rejected: cannot start a transaction within a transaction"]
C: tasks → ["t1"]
```

Read that literally: task `a` is in the database, task `b` is **not**, and the caller's promise
rejected with `cannot start a transaction within a transaction`. The store's in-memory state still
contains `b` (the `set()` ran before `persist`), and `persist` reduces the rejection to a 2.6-second
toast (`store.ts:43`, `toast` default timeout at `store.ts:55`) with no rollback. The user sees the task,
closes the app, and it is gone. Reachable from ordinary UI: two quick taps on a Here/Late stamp
(`store.ts:182` calls `upsert` per tap), *Add* then a subtask toggle (`toggleSubtask` → `saveTask`,
`store.ts:175`), or anything during `removeCourse`'s three sequential removes (`store.ts:193`).

**Fix (minimal, adapter-local).** Serialise the transaction entry points inside `SqliteRepository` so no
two can interleave:

```ts
private q: Promise<unknown> = Promise.resolve();
private ser<T>(f: () => Promise<T>): Promise<T> {
  const r = this.q.then(f, f);
  this.q = r.then(() => undefined, () => undefined);
  return r;
}
// then: await this.ser(() => this.db.withTransactionAsync(async () => { await this.put(e, v); }));
```

applied at `sqlite.ts:35,37,43,49,67,77,78`. A stronger variant is `withExclusiveTransactionAsync`,
which hands back a `txn` object — the write helpers then have to take the executor as a parameter
(`put(entity, value, run = this.db.runAsync)`), because calls on `this.db` are deliberately *outside*
the exclusive connection. Either way, `load()` (`sqlite.ts:55-65`) must be serialised against writes too,
or a read can observe a half-applied compound write.

## C2. A kill between migration 0's COMMIT and `PRAGMA user_version = 1` bricks the app, and the Fatal screen's only button cannot recover it

**Severity: critical** — `src/data/sqlite.ts:22-24`, `src/data/specs.ts:36`, `src/store/store.ts:50,233`

```ts
src/data/sqlite.ts:22
    for (; v < MIGRATIONS.length; v++) {
      await this.db.withTransactionAsync(async () => { await this.db.execAsync(MIGRATIONS[v] as string); });
      await this.db.execAsync(`PRAGMA user_version = ${v + 1}`);
    }
```

The schema is committed in one statement pair and the version marker is written in a *separate*
statement outside that transaction. `MIGRATIONS[0]` is plain `CREATE TABLE` with no `IF NOT EXISTS`
(`src/data/specs.ts:36-47`). Probe A and probe D:

```
A: second exec → table course already exists
D: user_version before init -> {"user_version":0}
D: init() rejects on every retry; user_version after -> {"user_version":0}
D: tables present -> [{"name":"course"}]
```

Probe D models the crash window exactly: schema committed, `user_version` still 0. `init()` then rejects
on the first `MIGRATIONS[0]` (`already exists`) and **rejects on every subsequent attempt**, because the
loop restarts from `v = 0` forever.

The chain to "bricked" is static and complete:
`openRepository` → `repo.init()` (`src/data/sqliteExpo.ts:17`) throws →
the boot effect's `catch` sets `error` before `hydrate` ever runs (`src/App.tsx:164-170`) → `Gate` renders
the Fatal screen (`src/App.tsx:66-96`) → its single action calls `act.resetAll()` → whose **first**
statement is `await ensureRepo()` (`src/store/store.ts:233`) → `ensureRepo` calls `openRepository()`
(`src/store/store.ts:50`) → `init()` → throws again. `repo` was never assigned, so there is no handle to
`reset()`; the button re-shows the same error forever. Only Android's *Clear data* (which deletes
`marginalia.db`) gets the app back. The Fatal screen's own copy — "Rebuilding the demo set replaces the
database with a fresh copy" (`src/App.tsx:83-85`) — is false for this failure.

**Fix (minimal).** Make migration 0 idempotent and move the marker inside the transaction:

```ts
await this.db.execAsync(`BEGIN; ${MIGRATIONS[v]}; PRAGMA user_version = ${v + 1}; COMMIT;`);
```

(or `CREATE TABLE IF NOT EXISTS` in `specs.ts:36-47` **and** `PRAGMA user_version` executed on the same
connection inside the same `withTransactionAsync`). Any of the three alone breaks the brick; doing all
three also makes an already-bricked install self-heal on the next launch.

---

# High

## H1. `persist` turns a failed write into a transient toast while the optimistic state stays visible

**Severity: high** — `src/store/store.ts:43` (amplifier for C1; affects all ~20 `void persist(...)` sites)

```ts
src/store/store.ts:43
const persist = (p: Promise<unknown>) => p.catch((e) => set({ toast: { id: Date.now(), text: `Couldn't save: ${String((e as Error)?.message ?? e).slice(0, 60)}` } }));
```

Evidence that the write can fail while the UI does not change: probe B's `B: surviving tasks → ["a"]`
above — the failing `upsert` was a `persist`ed promise, so on device the only trace is a 2.6 s toast
(`store.ts:55`: `undo ? 6000 : 2600`) with no `undo`, while `state.tasks` keeps the row until the next
`hydrate`. Nothing is written to the crash log (`src/ui/crashlog.ts` is called only from the error
boundary and `App.tsx:170`), so Diagnostics shows nothing.

**Fix (minimal).** In `persist`, also push the failure into the local crash log and expose the count in
Diagnostics, so "Couldn't save" is auditable after the toast is gone; and for the actions where a stale
row is worse than a visible failure (`saveTask`, `saveCourse`, `saveMeeting`), re-read the row and
revert the `set()` when the write rejects.

## H2. A corrupt JSON column silently becomes `[]`, and the next write commits that loss

**Severity: high** — `src/data/specs.ts:29,31`

```ts
src/data/specs.ts:29
  if (v === null || v === undefined) return fl.nullable ? null : fl.k === 'json' ? [] : fl.k === 'text' ? '' : 0;
src/data/specs.ts:31
  if (fl.k === 'json') { try { return JSON.parse(String(v)); } catch { return []; } }
```

`reminders` and `subtasks` are `json` (`specs.ts:13`). A truncated or hand-edited value loads as an empty
array, and the very next `upsert` of that task writes the empty array back over the original bytes
(`sqlite.ts:31` binds every mapped column on `INSERT OR REPLACE`). The user's reminders and subtasks are
then unrecoverable, with no message. Same shape for the non-nullable fallbacks on line 29: a missing
`score`/`goal` reads as `0` rather than as an error, so schema drift between `SPECS` and a live database
is invisible.

**Fix (minimal).** Fail loudly instead of inventing a value: rethrow from `fromSql` with the entity,
column and the first 40 characters of the raw text, or return the raw string under a sentinel and let
`load()` surface a Diagnostics warning while keeping the original value untouched (never re-write a
column whose parse failed).

## H3. A corrupt setting is dropped and then overwritten with the default

**Severity: high** — `src/data/sqlite.ts:58`

```ts
sqlite.ts:58
    for (const r of st) { try { settings[r.k] = JSON.parse(r.v); } catch { /* ignore a corrupt value, defaults apply */ } }
```

`load()` returns `withDefaults(settings)` (`sqlite.ts:63`), so the corrupt key silently becomes its
default and the user's choice disappears. On the next `putSettings` for that key — `setSettings`
(`store.ts:160`) writes whatever the UI now shows — the default is persisted over the corrupt bytes,
making the loss permanent.

**Fix (minimal).** Collect failing keys during the loop and (a) keep them out of the returned settings,
(b) report the key names once via the crash log / Diagnostics. Do not allow a `putSettings` for a key
whose stored value failed to parse without an explicit user action.

## H4. Reminder titles and bodies carry course and task names onto the lock screen

**Severity: high** (privacy) — `src/domain/reminders.ts:188,199,203`, `src/services/notifications.ts:55`

```ts
src/domain/reminders.ts:199
      push({ kind: isExam ? 'exam' : 'task', at, title: t.title, body: `${cname} · due ${fmtTime(t.dueAt)}...`, channel: 'tasks', ... });
src/domain/reminders.ts:203
      ... push({ kind: 'start', at: x.startAt, title: `Start: ${x.title}`, body: `${cn(x.courseId)?.name ?? 'Personal'}...`, channel: 'tasks', ... });
```

`sync()` schedules exactly that content (`notifications.ts:55`: `const content = (p: Planned, accent) => ({ title: p.title, body: p.body, ... })`), and the Android channels set no visibility:

```ts
src/services/notifications.ts:32-36
    await chan(CH.tasks, { name: 'Tasks & exams', description: ..., importance: N.AndroidImportance.HIGH, vibrationPattern: [0, 250, 120, 250], enableVibrate: true });
```

`HIGH` importance makes these heads-up notifications, and the platform default for
`lockscreenVisibility` is user-controlled, so a phone on a desk shows e.g.
`Lab report — set proofs` / `Discrete Mathematics · due 23:59` to anyone who looks. The API to change
this exists and is exported:

```
node_modules/expo-notifications/build/NotificationChannelManager.types.d.ts:5,78
export declare enum AndroidNotificationVisibility { ... }
    lockscreenVisibility: AndroidNotificationVisibility;
```

The app is otherwise careful about this (no network egress, local-only crash log — see "checked and
clean"), which is why this is called out.

**Fix (minimal).** Add `lockscreenVisibility: N.AndroidNotificationVisibility.SECRET` to the `classes` and
`tasks` channel configs (SECRET keeps the notification but hides its text until unlocked), and
optionally expose it as a Settings toggle next to `notif.enabled`.

---

# Medium

## M1. Two type holes make wrong tokens compile: `Field.p: string` and `c?: keyof Colors | string`

**Severity: medium** (type safety; no live bug today — checked below) — `src/ui/kit.tsx:97-99`,
`src/data/specs.ts:4,6`

```ts
src/ui/kit.tsx:97
export interface TxtProps extends TextProps { f?: FontKey; s?: number; c?: keyof Colors | string; ... }
src/ui/kit.tsx:99
  const { c: col } = useTheme(), color = (col as unknown as Record<string, string>)[c] ?? c;
```

`keyof Colors | string` collapses to `string`, so the union buys nothing; the double cast then defeats the
index signature as well, and `?? c` falls back to the raw token. A call site writing `c="inkk"` compiles,
renders `color: "inkk"`, and React Native drops the style silently. The 106 `c="…"` call sites were
enumerated — today all 7 distinct values (`acc bad ink mut ok paper warn`) are real keys, so this is a
latent hole, not a live defect. Same shape in the data layer:

```ts
src/data/specs.ts:4
export interface Field { p: string; c: string; k: Kind; nullable?: boolean }
```

`p` is the domain property name but is a plain `string`, so a typo in `SPECS` (e.g. `f('dueAtt', 'int')`)
compiles and silently reads/writes `null` for that column (`sqlite.ts:32,53` index the record by `x.p`).

**Fix (minimal).** `c?: keyof Colors` in `TxtProps`, and type the lookup as `Record<keyof Colors, string>`
with a dev-only `throw new Error(\`unknown colour token ${c}\`)` when the key is missing. In `specs.ts`,
make the spec table generic over the entity (`fields: { p: keyof EntityMap[K] & string; ... }[]`) so `p`
must name a real property of that entity.

## M2. `applySnapshot` rebuilds `settings` four times

**Severity: medium** (cost is small; the smell is that a derived value is recomputed per use)
`src/store/store.ts:132-133`

```ts
store.ts:132
  set({ courses: s.courses, ..., settings: withDefaults(s.settings),
    timer: initTimer({ planMin: withDefaults(s.settings).focusPresetMin, flow: withDefaults(s.settings).focusFlow, breakMs: withDefaults(s.settings).breakMin * 60_000, breaksAllowed: withDefaults(s.settings).breaksPerRound }) });
```

**Fix (minimal).** `const settings = withDefaults(s.settings);` on the line above and use it three times.

## M3. The full-data export is left in `Paths.cache` after sharing

**Severity: medium** (privacy / storage) — `src/services/exportFile.ts:23-26`

```ts
  const file = new File(Paths.cache, name); if (file.exists) file.delete(); file.create(); file.write(data);
  if (!(await Sharing.isAvailableAsync())) return { ok: false, where: file.uri, name };
  await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name, UTI: format === 'json' ? 'public.json' : undefined });
  return { ok: true, where: file.uri, name };
```

The xlsx/csv/json file — everything the student has — survives the share sheet in the app's cache
directory (Android: `…/cache/marginalia-…xlsx`) until the OS evicts it, and a later `backup`/`adb`-style
read of the app sandbox finds it. The `folder` path writes into a user-chosen directory, which is fine.

**Fix (minimal).** `try { … } finally { try { file.delete(); } catch {} }` around the share, keeping the
`where` string for the confirmation message.

## M4. `outbox` and `notif_log` grow without bound; nothing ever drains the outbox

**Severity: medium** — `src/data/sqlite.ts:27,33,39,45,79-86`, `src/data/repository.ts:24-26`

Every mutation appends an outbox row inside the same transaction:

```ts
sqlite.ts:27
  private async outbox(entity: string, id: string, op: OutboxRow['op']) { await this.db.runAsync('INSERT INTO outbox(entity,id,op,at) VALUES(?,?,?,?)', ...); }
```

`ackOutbox` / `pendingOutbox` are called **only from tests** — `src/test/repo.test.ts:57-60`,
`src/test/rev.test.ts:43-46`; grepping `src` outside `src/data` and `src/test` yields no caller. There is
no sync implementation, so the table is write-only: one extra INSERT per user action, forever, in the
same database as the data. `notif_log` is likewise never pruned (`refreshNotifLog` reads and trims to 12
*for display*, `store.ts:82`, while the table keeps every row), and reminder ids embed the planned minute
(`reminders.ts:176`), so a new row per rescheduling.

**Fix (minimal).** Cap both during `init()` (`DELETE FROM outbox WHERE seq <= (SELECT MAX(seq) - 500 FROM outbox)`
and a date-bound delete on `notif_log`), or put the outbox insert behind a `SYNC_ENABLED` flag until a
sync target exists — the port comment (`repository.ts:7-11`) promises a future drain that does not exist.

## M5. A mounted-but-hidden screen still re-renders on the once-a-minute clock tick

**Severity: medium** (perf; not in the lag diagnosis) — `src/ui/theme-context.tsx:25-33` with the
per-screen `useNow` calls

`src/ui/live.ts:5` documents the design: "Every route stays mounted for the whole session". Each screen
arms its own clock (`src/screens/Stats.tsx:20`, `Grades.tsx:15`, `Tasks.tsx:19`, `Week.tsx:19`,
`Today.tsx:268`, `Focus.tsx:176`, plus `ui/DayBar.tsx:51` and `ui/RunningTimer.tsx:43`). Every one of
those is a `useState` inside the screen, so automated memoization (`app.json:46` has
`reactCompiler: true`) cannot stop the subtree re-render. Probe F1, one minute of wall clock with the
route on Tasks:

```
F1 one minute behind Tasks (Today/Week/Grades/Stats/Focus hidden): StatsScreen×3(11.0ms)  Page×7(0.0ms)
Txt×608(11.0ms)  Icon×109(1.0ms)  HandBox×103(2.0ms)  Ring×12(2.0ms)  Heatmap×4(4.0ms)  Hist24×6(2.0ms)
HBars×9(3.0ms)  Section×7(1.0ms)  Chip×41(7.0ms)  Line2×3(1.0ms)  TodayScreen×1(3.0ms)
RunningTimer×3(1.0ms)  DayBar×1(0.0ms)  Btn×13(2.0ms)  TaskCard×37(1.0ms)  WeekScreen×1(4.0ms)
TasksScreen×2(2.0ms)  AttCell×119(7.0ms)  FocusScreen×2(2.0ms)
```

~600 text nodes, 119 grid cells, 103 card outlines and 37 task cards re-render in a minute the user spent
on a different page — and the tick is a 60 s *timer*, so it lands mid-scroll on whatever gesture happens
to be in flight.

**Fix (minimal).** Pass the navigator's `live` flag (already available via `ScreenLive`, `src/ui/live.ts:15`)
into these screens' `useNow` calls so a non-live screen stops ticking entirely and re-renders once when it
becomes live, instead of every minute in the background. `Today.tsx:177` and `DayBar`/`RunningTimer` read
`live` already — `Stats`, `Grades`, `Tasks` and `Week` do not.

## M6. `Overlay` subscribes to `s.route`, so every tab tap re-renders the overlay + FAB subtree

**Severity: medium** — `src/ui/Overlay.tsx:38,42`

```tsx
Overlay.tsx:38
  const sheet = useStore((s) => s.sheet), toast = useStore((s) => s.toast), route = useStore((s) => s.route), { c } = useTheme(), ins = useSafeAreaInsets();
Overlay.tsx:42
  const kbUp = useKeyboardUp(), showFab = !sheet && route !== 'Focus' && !kbUp;
```

`src/ui/live.ts:3-13` explains at length that screens must **not** subscribe to `s.route` because
"six pages watching one atom means every tap re-renders six screens before the first moving frame". The
overlay keeps doing exactly that for one boolean. Probe F2:

```
F2 tap Tasks→Stats: TasksScreen×1(0.0ms)  Page×1(0.0ms)  Txt×42(1.0ms)  RunningTimer×1(0.0ms)  Icon×8(1.0ms)
Chip×13(1.0ms)  Btn×1(0.0ms)  Ring×4(1.0ms)  Hist24×2(1.0ms)  HBars×3(0.0ms)  Line2×1(0.0ms)  HandBox×2(0.0ms)  Overlay×1(0.0ms)
F2 tap Stats→Today: ... Overlay×1(0.0ms) ...
```

The cost is small today, but the file is the last subscriber of an atom the codebase went out of its way
to remove, so a future route-dependent overlay grows back.

**Fix (minimal).** Move the FAB visibility to a selector that returns a primitive —
`const showFab = useStore((s) => !s.sheet && s.route !== 'Focus')` — so the overlay still re-renders but
the FAB (with its theme + inset + keyboard hooks) is its own component subscribed to that boolean; or
read the current route through the navigator state that already drives `ScreenLive`.

## M7. Sounds ship as uncompressed PCM WAV

**Severity: medium** (bundle) — `src/services/audio.ts:6-16`, `assets/sounds/`

```
$ du -c assets/sounds/*.wav | tail -1
832034  total          # 27 files
$ du -b node_modules/@expo-google-fonts/{caveat/500Medium/Caveat_500Medium.ttf,caveat/700Bold/Caveat_700Bold.ttf,newsreader/400Regular_Italic/Newsreader_400Regular_Italic.ttf,newsreader/600SemiBold_Italic/Newsreader_600SemiBold_Italic.ttf,permanent-marker/400Regular/PermanentMarker_400Regular.ttf,special-elite/400Regular/SpecialElite_400Regular.ttf}
257840 / 257316 / 127468 / 129720 / 73620 / 151068   # = 997,032 B of fonts (justified: 6 faces, used)
```

All 27 wavs are referenced by `SRC` (`audio.ts:6-15`) and are ≤ 0.95 s each (`audio.ts:18`), so
~832 KB of raw PCM carries roughly 10 s of audio. `expo-audio` plays compressed formats, so the
uncompressed choice is not a platform constraint; the generated `assets/sounds/manifest.json` (referenced
at `audio.ts:5`) is the pipeline already in place to re-encode and regenerate durations.

**Fix (minimal).** Re-encode the 27 files to `.m4a`/`.mp3` at ~96 kbps mono, update `SRC`, and regenerate
`SECONDS` from the manifest; expect ~10× reduction.

## M8. Production code requires an asset out of a `*-candidates` scratch directory

**Severity: medium** (hygiene / release hygiene) — `src/services/audio.ts:14`

```ts
audio.ts:12-14
  'break-start': require('../../assets/sounds/break-start.wav'), 'tape-peel': require('../../assets/sounds/tape-peel.wav'),
  /* Its own file, so muting the clock tick can never mute the off-track warning. Moved to assets/sounds/ when the candidate set is promoted. */
  nudge: require('../../assets/sounds-candidates/nudge.wav'),
```

`assets/sounds-candidates/` is 622,824 B over 8 files, of which exactly one (15,040 B) is reachable from
the bundle. Metro only bundles what is required, so the app is 15 KB worse off, not 600 KB — but the repo
carries a release-critical asset inside a directory whose name says "not shipped", and a cleanup pass that
deletes `*-candidates` breaks the app at runtime with a Metro resolution error.

**Fix (minimal).** `git mv assets/sounds-candidates/nudge.wav assets/sounds/nudge.wav`, update
`audio.ts:14`, and add `assets/sounds-candidates/` to `.gitignore` (or delete the directory).

---

# Low

## L1. Notification-log writes are swallowed on purpose; the consequence is a silent Delivery page

**Severity: low** (documented, defensible) — `src/store/store.ts:75,79,85`

```ts
store.ts:75
  try { void R().logNotif(id, kind, dueAt, event, at).catch(() => undefined).then(() => refreshNotifLog()); } catch { /* repository not open yet */ }
store.ts:79
  try { void R().schedNotif(id, kind, dueAt).catch(() => undefined); } catch { /* repository not open yet */ }
store.ts:85
  try { all = await R().notifLog(); } catch { return; }
```

The comment at `store.ts:67-69` argues the trade correctly (bookkeeping must never break delivery). The
residual consequence: with C1's interleaving, a rejected `schedNotif` means a reminder can exist in the OS
queue but not in the log, and `refreshNotifLog` returning early leaves the page showing the previous
snapshot — so "Delivery status" can claim "queued" for something that was delivered. **Fix:** append a
crash-log breadcrumb in the two `catch` arms so the silent path is at least reconstructible.

## L2. A 328 KB JPEG is required eagerly from the Focus screen's module scope

**Severity: low** (bundle) — `src/screens/Focus.tsx:19`

```ts
src/screens/Focus.tsx:19
const PAGE = require('../../assets/images/journal-page.jpg');
$ du -b assets/images/journal-page.jpg → 335785
```

Module-scope `require` means it is in the startup graph even for a session that never opens Focus (the
screen is always mounted per `live.ts`, so this may be intentional — in which case the *file* is the
lever). **Fix:** confirm the displayed size and re-encode at that density (or as WebP); at typical
phone widths a 328 KB JPEG is several times what the layer needs.

## L3. `seed()` deliberately skips `attendance`, `dayMarks` and `adjusts` in both adapters

**Severity: low** (latent contract gap; verified harmless today) — `src/data/sqlite.ts:66-76`,
`src/data/memory.ts:25-29`

```ts
sqlite.ts:66-75
  async seed(s: Snapshot) {
    await this.db.withTransactionAsync(async () => {
      for (const c of s.courses) await this.put('course', c); ... for (const [k, v] of Object.entries(s.settings)) ...
```

`memory.ts:25-29` has the same list. Both agree, so no adapter divergence. Checked against the only
caller: `seedSnapshot()` returns `attendance: {}, dayMarks: {}, adjusts: {}` (`src/data/seed.ts:52`), so
nothing is lost today. The gap is that `Repository.seed(snapshot)` silently ignores three of the nine
entities in `Snapshot`, so a future seed that carries attendance loses it at `resetAll()`
(`store.ts:234`). **Fix:** either seed the three maps, or state the omission in the port comment
(`src/data/repository.ts:7-33`).

## L4. `npm test` shells out to `curl` against `127.0.0.1:8081`

**Severity: low** (test hygiene) — `src/test/worklet-hosts.test.ts:155-170`

```ts
  const res = execFileSync('curl', ['-s', '--max-time', '40', `http://127.0.0.1:${port}/index.bundle?platform=android&dev=true&minify=false`], ...);
  bundle = res.startsWith('<') || res.length < 100_000 ? null : res;
```

`package.json:66-68` has `testMatch: ["<rootDir>/src/**/*.test.ts"]`, so this runs on every `npm test`. It
degrades to a `console.warn` when nothing answers (`:169`) — but anything else bound to 8081 (a colleague's
dev server, another Expo app, a proxy) gets fetched on a cold test run and, if it returns ≥ 100 KB of
JavaScript, is parsed by the assertions below. **Fix:** make the bundle check opt-in via
`BUNDLE_PORT`/`BUNDLE_URL` rather than defaulting to 8081.

---

# Checked and clean

Verified by reading the code and/or running the command; listed so later readers know the coverage. None
of these need action.

- **No network egress from app code.** No `fetch`, `XMLHttpRequest`, `WebSocket`, `axios` or `http` import
  anywhere under `src/`. The only outbound intents are `Linking.openSettings()` (`src/sheets/Settings.tsx:246`),
  the spreadsheet XML namespaces in `src/services/export.ts`, and `curl` inside a test (L4). The
  Diagnostics page's claim that there is no network call is accurate (`src/sheets/Diagnostics.tsx:44`).
- **Crash log is local-only and bounded.** `src/ui/crashlog.ts` writes JSONL to `Paths.document` with
  `MAX_ENTRIES = 50` / `MAX_BYTES = 256 * 1024`; no upload path exists.
- **No `console.*` in application source.** The single hit is `src/test/worklet-hosts.test.ts:169`.
- **No `@ts-ignore`, `@ts-expect-error` or `@ts-nocheck` anywhere.** Zero occurrences in `src/`.
- **The web-only `as never` casts are justified.** `src/ui/PaperBg.tsx:65,127` (`backgroundImage` /
  `mixBlendMode` in `ViewStyle`) and `src/ui/onboard/art.tsx:323` cast for CSS-only properties that RN's
  types do not carry; both sit behind `Platform.OS === 'web'` / `WEB` guards. The `as never` in
  `src/navigation/Book.tsx:56,112` bridges `useNavigationBuilder`'s untyped router generics — narrow and
  local. No *unchecked* cast into a domain type was found.
- **All six `eslint-disable` sites read and judged.** `src/sheets/forms.tsx:102` disables
  `react-hooks/exhaustive-deps` on a `workload(draft, …)` memo whose dep list is `[due, est, start]`;
  `workload` (`src/domain/reminders.ts:154-159`) reads exactly `dueAt`, `estimateMin`, `status`, `startAt`
  from the task plus `now`/`meetings`/`attendance`/`dayMarks`/`settings`, and every one of those inputs is
  frozen while the modal sheet is open — so the narrow list is correct, not stale.
  `src/screens/Focus.tsx:139,197,203` and `src/navigation/Book.tsx:77-78` are documented event-driven
  effects.
- **No commented-out code, no `TODO`/`FIXME`/`XXX`, no dead source files.** Each `.ts`/`.tsx` under
  `src/` is reachable; `src/data/sqliteExpo.web.ts` and `src/data/memoryBoot.ts` are resolved by Metro's
  platform extension, not dead.
- **`Repository` port coverage is total for the domain model.** Every field of `Course`, `Meeting`,
  `AttRecord`, `DayMark`, `Task`, `Notice`, `Mark`, `Adjust`, `FocusSession` in `src/domain/types.ts` is
  present in `SPECS` with a matching column; the intentional exceptions are documented in
  `src/data/specs.ts:14-17` (the dropped `read` flag leaves a nullable `is_read` column unbound, by design).
- **`putSettings` cannot currently be handed `undefined`.** `JSON.stringify(undefined)` would return
  `undefined` and bind a non-string parameter (`src/data/sqlite.ts:49`); every caller
  (`store.ts:160,163`) builds the patch from typed `Settings`/`NotifSettings` values, so no path exists
  today. Worth a `?? null` when the signature is next touched.
- **`app.json:46 experiments.reactCompiler: true` conflicts with nothing found** — the compiler is on
  alongside `newArchEnabled: true` (`app.json:9`) and the six disables above; no stale-closure bug was
  traced to it. Its interaction with M5 is the only reason it is mentioned.
- **The off-screen/perf and data-layer probes are reproducible and stored outside the repo** at
  `/tmp/opencode/audit-probe/`. Invocation (from the repo root):

  ```
  npx jest --config "{\"preset\":\"jest-expo\",\"rootDir\":\"$PWD\",\"roots\":[\"/tmp/opencode/audit-probe\"],\"testMatch\":[\"**/*.test.ts\"],\"testEnvironment\":\"node\",\"moduleDirectories\":[\"node_modules\",\"$PWD/node_modules\"],\"transform\":{\"^.+\\\\.[jt]sx?$\":[\"babel-jest\",{\"configFile\":\"$PWD/babel.config.js\"}]}}"
  ```

  All three probes pass (`tx-repro` 3/3, `offscreen` 2/2, `migration-window` 1/1) — they are probes, not
  regression tests; nothing was added to `src/test/`.
