# The Margin ↔ Obsidian bridge

Status: **v0.6 = foundation (built, tested, not switched on). v0.7 = the transport and the Bone-plugin half.**
Owner's ask (Plugin backlog, 2026-11-09): *connect Margin and Obsidian in real time, so tasks can be created and
managed on both sides and Margin can send notifications for Obsidian tasks.* Also: merge Bone Tasks' timer with
Margin's.

## Shape

Both apps live on the same phone. The vault is already synced to the desktop by Obsidian Git, so the bridge does
not need a network: it is **two files in a folder inside the vault**.

```
<vault>/.margin/
  margin.json     written ONLY by Margin   (Bone plugins read it)
  obsidian.json   written ONLY by Bone      (Margin reads it)
```

One writer per file means neither app ever edits a file the other is writing, and Git never sees a conflict
inside one. The folder is a dot-folder so it stays out of Obsidian's file list; plugins read it through
`app.vault.adapter`. On Android, Margin gets the vault folder once through the Storage Access Framework
(`expo-file-system` `StorageAccessFramework.requestDirectoryPermissionsAsync`), which the OS remembers.

"Real time" = each side re-reads the other's file when it comes to the foreground and every 30 s while open,
and writes its own within a second of a change. Both are local file reads of a few KB.

## The envelope (`margin-bridge/1`)

```jsonc
{
  "format": "margin-bridge/1",
  "app": "margin" | "bone",
  "writtenAt": 1794200000000,
  "tasks":    [ { "id": "ab12", "origin": "obsidian", "updatedAt": 1794..., "deleted": false, "data": { …BridgeTask } } ],
  "events":   [ { "id": "c-2026-11-09-08:30-db", "origin": "margin", "updatedAt": …, "data": { …BridgeEvent } } ],
  "sessions": [ { "id": "f1", "origin": "margin", "updatedAt": …, "data": { …BridgeSession } } ]
}
```

Types and the reader are in `src/domain/bridge.ts` (`BridgeTask`, `BridgeEvent`, `BridgeSession`,
`parseEnvelope`). Rules:

- **ids.** A task keeps the id of the app that made it. Obsidian's id is the line's block id (`^ab12`); Margin's
  is its row id. Margin stores an Obsidian task as `ob-<blockId>` with `origin: 'obsidian'`, `extId`, `extPath`
  (migration 6), so re-reading never duplicates it. When Bone writes a Margin task into a note it ends the line
  with `^<marginId>`.
- **Last writer wins, per row,** on `updatedAt`. A row not newer than the reader's own copy is ignored, so
  re-reading the same file is a no-op. A tombstone (`deleted: true`) removes the row if the reader has it.
- **Tasks in Bone's terms.** Dates are `YYYY-MM-DD`, `time` is `HH:MM` (Bone's ⏰), priority is Bone's 0–5,
  the subject travels by **name** (Obsidian has no subject table). `taskLine()` / `parseTaskLine()` in
  `bridge.ts` are Bone Tasks' own grammar, tested against its lines.
- **Events are Margin's, read-only in Obsidian:** the next 14 days of class occurrences (struck through when
  cancelled) and notices. Class events are re-sent whole each time (they are derived from the timetable, not
  stored), so the reader replaces its class events wholesale.
- **Sessions** are focus time from either side; `task` is the other side's task id when there is one.
- A row the reader cannot understand is named and skipped; the rest still land. Nothing ever throws.

## Notifications

On the phone **Margin is the notifier**. An Obsidian task with a ⏰ time arrives in Margin with an at-due-time
reminder, and Margin's planner schedules it like any other task (`fromBridgeTask`). The Bone side should turn
its own phone reminders off while the bridge is connected, so nothing rings twice.

## What v0.6 built (Margin side)

| Piece | Where |
|---|---|
| `why` on attendance; `origin` / `ext_id` / `ext_path` on tasks, `origin` / `ext_id` on notices and focus; indexes on `updated_at` | migration 6, `src/data/specs.ts` |
| Change feed: every row changed after a moment, tombstones included | `Repository.changes(entity, since)` (SQLite + memory) |
| Envelope build / parse, LWW merge plan, task-line codec, priority mapping | `src/domain/bridge.ts` |
| `act.bridgeOut()` (cursor `bridge.outAt`) and `act.bridgeIn(text)` (writes through the repository, reloads, re-plans reminders) | `src/store/bridge.ts` |
| Tests | `bridge.test.ts`, `store-bridge.test.ts`, `migration-v06.test.ts` |

Why `updated_at` and not the outbox: the outbox is pruned to its last 500 rows, and a sync that missed a week
must still see every change.

## What v0.6 added after the foundation (2026-11-11)

| Piece | Where |
|---|---|
| The Obsidian half as its own plugin (beside Bone Tasks, same task-line grammar): Margin's tasks into `Margin/Tasks.md`, the timetable into `Margin/Timetable.md`, open dated `#school` tasks out to `obsidian.json` | `obsidian-plugin/margin-bridge/` |
| Vault folder through the Storage Access Framework | `src/services/vaultFiles.ts` |
| Sync on foreground, every 30 s and on demand; `margin.json` is the whole state and is rewritten only when it changes, so git does not commit on every sync | `src/store/vault.ts` |
| Settings → Obsidian | `src/sheets/Obsidian.tsx` |
| The two halves tested against each other | `obsidian-plugin.test.ts` |

Not verified on a phone yet. Still open from the list below: the vault mark on Obsidian tasks, sending a
Margin task to a chosen note, timer merge (`⏱`), sessions, and turning Bone's own phone reminders off.

## v0.7 work

**Margin:** Settings → Obsidian: pick the vault folder (SAF), on/off, last sync, problems; read on foreground
and every 30 s; write `margin.json` after changes (debounced); show Obsidian tasks with a small vault mark; a
task created in Margin can be sent to a chosen note (Bone files it). Merge timers: a Margin focus round on an
Obsidian task adds `⏱` minutes to its line via `spentMin`.

**Bone plugins (bone-tasks, bone-calendar):**
1. On load and every 30 s (and on `visibilitychange`), read `.margin/margin.json` with `app.vault.adapter.read`.
2. Tasks with `origin: 'margin'`: write/update their line in the chosen note (setting; default today's daily
   note), ending in `^<id>`; tick, untick and edit them like any task. Tombstones remove the line.
3. Write `.margin/obsidian.json`: every task line that has a block id (give new ones a `^id` when they get a
   date), plus tombstones for lines removed since the last write; `updatedAt` = the file's mtime for changed
   lines. Sessions from `data.json.sessions`.
4. bone-calendar: draw `events` (classes on the week/agenda views, cancelled ones struck through).
5. bone-tasks: when the bridge file is present and fresh (< 1 day), skip its own phone notifications.
