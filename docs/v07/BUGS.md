# v0.7 bug diagnoses: items 3, 7, 11

Diagnosed 2026-11-12 from the code at `a8a83b3` (v0.6.0, versionCode 5), the owner's phone over adb (read-only) and the
web build in Plain at 412×915. Screens are in `docs/v07/screens/`. Nothing here is fixed yet; each section ends with the
exact change and the test that proves it.

| # | Bug | Root cause (one line) | Fix size | Can ship as OTA on 0.6? |
|---|---|---|---|---|
| 11 | "native database reject" | JS kept using a SQLite handle after the native side was torn down; nothing reconnects, and the toast cuts the cause off | M | yes (JS only) |
| 3a | Plain: first class card "doubles up" | the hero card and the first row of the Today list are the same class, drawn as the same rounded card in Plain | S | yes |
| 3b | Plain: big gap between clock and class title | `Txt` sizes the line box from the requested size, but Plain draws the title in Syne at 0.8×; plus a fixed 68-px countdown slot sized for another font | S | yes |
| 7 | the "All" filter looks unprofessional | three rows of identical chips; two different groups each have a filled chip; the label is the raw key capitalised | S | yes |

---

## 11. "Native database reject"

### What the owner sees

A toast: `Couldn't save: Call to function 'NativeDatabase.prepareAsync' has been reje` (the toast is cut at 60 characters
in `src/store/persist.ts:24`, so the cause never shows).

### Evidence

| Source | What it shows |
|---|---|
| Settings → Diagnostics on the phone (`screens/v06-diagnostics-1.png`) | "8 crashes recorded". Newest: **While saving · 2026-11-12 22:51 · `Call to function 'NativeDatabase.prepareAsync' has been rejected. → Caused by: java.lang.NullPointerException`** |
| `adb shell uptime` at 23:13 | up 22 min, so the phone **booted at 22:51**: the failed save happened as the phone went down / came back |
| logcat after boot (pid 6412) | no SQLite error since boot; the app opened the database fine (`[margin-boot] data=849 ms`) |
| `node_modules/expo-sqlite/android/.../SQLiteModule.kt` | `prepareAsync` runs on `Dispatchers.IO`; a closed database throws `AccessClosedResourceException` ("Access to closed resource"), an SQL problem throws `SQLiteErrorException`. **An NPE comes from neither**: it is thrown before the function body, while the module turns the JS `NativeDatabase`/`NativeStatement` objects back into native ones, which fails when the native object is gone |
| `OnDestroy { removeAllCachedDatabases().forEach { closeDatabase(it) } }` (same file) | when the React host/app context is destroyed, every cached connection is closed and the shared objects are released |
| [expo/expo#50432](https://github.com/expo/expo/issues/50432) (SDK 57, RN 0.86, new architecture) | same signature: the React host is destroyed while JS keeps running, and "every statement afterwards fails with `Call to function 'NativeDatabase.prepareAsync' … NullPointerException`, once a second, until the process is restarted" |

### Root cause

The JS repository holds **one** `SQLiteDatabase` for the life of the JS runtime (`src/data/sqliteExpo.ts:24`) and has no
way to notice that its native half died. When Android tears the React host down while JS is still alive (shutdown and
reboot, the OS reclaiming the activity, a headless start racing the activity start as in #50432), every later write
goes to a dead handle and fails with this NPE. The queue in `SqliteRepository.ser()` (sqlite.ts:84) serialises jobs
correctly, so this is **not** a concurrency bug; it is a lost connection with no reconnect.

Three things make it worse in Margin:

| Amplifier | Where |
|---|---|
| Writes keep firing on timers: the 30 s Obsidian sync (`src/store/vault.ts:55`), reminder re-plans (`resync`), notification bookkeeping | each one becomes another "crash" in the log (8 recorded) |
| The toast slices the message at 60 chars, so the useful "Caused by" line is never shown | `persist.ts:24` |
| Diagnostics lists each failure separately, so one lost connection looks like 8 crashes | `services/problems.ts` |

### The fix

| Step | File | Change |
|---|---|---|
| 1 | `src/data/sqlite.ts` | Add `reopen?(): Promise<void>` to `SqlDb`. In `ser()`, when a job fails with a **lost-connection error**, call `reopen()` once and run the job again. Jobs are whole transactions (`BEGIN…COMMIT` inside `withTransactionAsync`), so a failed one left nothing behind and a retry is safe. A second failure is reported as today. |
| 2 | `src/data/sqlite.ts` | `export const isLostConnection = (e) => /has been rejected/.test(msg) && /NullPointerException|Access to closed resource|closed/.test(msg)` (pure, unit-tested). |
| 3 | `src/data/sqliteExpo.ts` | Keep the handle in a `let`; `reopen = async () => { try { await db.closeAsync(); } catch {} db = await openDatabaseAsync('marginalia.db', { useNewConnection: true }); await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;'); }`. Every `SqlDb` method reads the current `db`, never a captured one. `useNewConnection` makes sure the native side does not hand back the dead cached object. |
| 4 | `src/store/persist.ts` | `reportSaveFailure`: if `isLostConnection(e)` → toast "Couldn't save. Reconnecting to your data…" and log **one** Problems entry per minute ("lost the database connection ×N"). For other errors show the `→ Caused by` line, not the first 60 chars. |
| 5 | `src/services/problems.ts` + `src/sheets/Diagnostics.tsx` | Group identical messages (same first line) into one row with a count and first/last time. |
| 6 | `src/store/vault.ts` | Do not start the 30 s interval at all once v0.7's sync service exists (SYNC_ANDROID.md); until then, skip the tick while `AppState !== 'active'` (already) **and** while a reconnect is running. |

```ts
// sqlite.ts, inside SqliteRepository
private async run<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); }
  catch (e) {
    if (!isLostConnection(e) || !this.db.reopen) throw e;
    await this.db.reopen();
    return f();                       // one retry; a second failure propagates to persist.ts
  }
}
private ser<T>(f: () => Promise<T>): Promise<T> {
  const run = () => (this.closed ? Promise.reject(new Error('The database was closed by a reset; it has to be re-opened.')) : this.run(f));
  const r = this.q.then(run, run);
  this.q = r.then(() => undefined, () => undefined);
  return r;
}
```

### Proof

| Check | How |
|---|---|
| Unit | `src/test/store-failures.test.ts`: a fake `SqlDb` whose `runAsync` throws `Error("Call to function 'NativeDatabase.prepareAsync' has been rejected.\n→ Caused by: java.lang.NullPointerException")` once → the write lands after `reopen` is called once; throwing twice → one Problems entry, the optimistic change is reverted |
| Unit | `isLostConnection` true for the NPE and "Access to closed resource" texts, false for `SQLITE_CONSTRAINT` and "no such table" |
| Phone | the owner taps **Diagnostics → Copy all** and pastes it (confirms all 8 entries are this signature and when they happened). After the fix: reboot the phone with Margin open, reopen it, change a mark: no toast, no new crash row |

---

## 3. Plain style: the first class card doubles up, and the clock-to-title gap

Captured on the web build in Plain during a class (`screens/v06-web-plain-today-inclass.png`, dark:
`v06-web-plain-dark-today.png`).

### 3a. The card that doubles up

| What | Where |
|---|---|
| The hero card (`ActiveCard`) shows the running or next class: "Now · Database Systems · L-4 · 29:44 min left" | `src/screens/Today.tsx:461` |
| Directly under the week strip, the "Today" list starts with **the same class**: "09:00–09:50 Database Systems · L-4 · Nkemi" | `Today.tsx:487-497` |
| In Collage the two look unrelated (hatched slab vs torn paper slip). In Plain both are `HandBox`, which Plain renders as the same view: radius 14, 1-px border, soft shadow (`src/ui/kit.tsx:127-136`). The live row also gets a 2.4-px accent border. So in Plain the screen reads as the first card printed twice | |

**Fix (v0.6.x, OTA):**

| Step | Change |
|---|---|
| 1 | `TodayScreen`: compute `heroKey` = the `occKey` of the class the hero shows (`cur ?? next` for today; first class for a picked day). Pass it to the list. |
| 2 | The list renders that row **compact** in Plain: no box (`fill="transparent"`, no border), a 3-dp accent bar at the left, the time and room only, and the label "In the card above" read by TalkBack. The attendance square stays on the row, so marking still works from the list. |
| 3 | Collage and Notebook keep today's rendering (they do not double up visually). |

v0.7 replaces this: the hero becomes the only place the current class appears, with its own attendance control, and
the list is titled "Later today" (DESIGN.md → Today).

### 3b. The gap between the clock and the class title

Measured at 412 dp, Plain, title "Database Systems" (`s = headingSize(...)` ≈ 40):

| Cause | Where | Effect |
|---|---|---|
| `Txt` sets `lineHeight = round(s × 1.25)` for `marker` from the **requested** size (`kit.tsx:106`), but Plain maps `marker` to Syne ExtraBold at `k = 0.8` (`src/tokens/theme.ts:157`) | the glyph is 32 px, the line box 50 px | ~18 px of empty leading per title line (two lines → 36 px) |
| The header row (pill, "Period 1 …", room) is pushed right by `headPad = CLOCK + 8 − 16 = 130` and sits beside the clock's lower half; the title starts below it with `marginTop: 8` | `Today.tsx:349, 452, 461` | the title can only start below the clock bezel |
| `COUNT_H = 68` was sized for Special Elite at 42 (`Today.tsx:188`). Plain's `type` face is Hanken Grotesk Medium at 0.9 (38 px), centred in 68 px | `Today.tsx:371` | ~15 px of dead space above and below the countdown |
| "Period 1 of 3" clips to "Period 1 …" in Plain: the 412-dp budget in the comment was measured in the Collage fonts | `Today.tsx:331` | |

**Fix (v0.6.x, OTA):**

```ts
// kit.tsx, Txt: in Plain, the line box follows the glyph actually drawn
const lhBase = th.look === 'plain' ? s * fc.k : s;
lineHeight: Math.round(lhBase * (f === 'marker' ? 1.1 : 1.18))
```

| Step | Change |
|---|---|
| 1 | The `Txt` change above (Plain only, so Collage keeps the measured heights its tests pin). |
| 2 | `Today.tsx`: `const COUNT_H = look === 'plain' ? 50 : 68`; title `marginTop: look === 'plain' ? 2 : 8`. |
| 3 | In Plain, drop the overlap: clock `marginBottom: 8` (no −26), `headPad = 0`. The clock sits on the page with its status line; the card starts below, so the header row gets the full card width and "Period 1 of 3" fits. |
| 4 | `src/test/card.test.ts`: pin `COUNT_H` per look and the Plain line-height formula, with a rationale comment (they are source-string tests). |

**Proof:** re-shoot Today in Plain light and dark at 412×915 and at 320 dp; the title's top sits ≤ 12 dp under the
header row; "Period 1 of 3" unclipped.

---

## 7. The filter where "All" is listed

### Where

To-do, `src/screens/Tasks.tsx:46-48` (`screens/v06-web-plain-dark-tasks.png`).

### What is wrong

| Problem | Detail |
|---|---|
| Three rows of controls before the first task | search field, then `All · Open · Done` and `By date · By priority · Newest` in **one** `Row` that wraps onto a second line at 412 dp, then a subject strip `Every subject · Personal · Intro to Economics …`. About 170 dp of chrome |
| Two groups that look like one | status and sort chips are the same `Chip`; "All" and "By date" are both filled in the same row, so it reads as two selected answers to one question |
| Raw labels | `f[0].toUpperCase() + f.slice(1)` turns the key `all` into "All": all *what*? |
| A third filled chip | "Every subject" is filled too, so three accent chips shout at once |
| "All" mixes done and open | done tasks are sorted to the bottom of a list the user is scanning for work |
| The subject choice is forgotten | `cid` is component state, reset on every visit |

### The fix

One quiet row, three controls with different shapes for different jobs:

```
[ Open  |  Done ]            [ All subjects ▾ ]   [ ⇅ Due ]
```

| Control | Type | Behaviour |
|---|---|---|
| `Open | Done` | segmented control (two segments, one selected) | Open is the default. "All" is removed: done tasks are an archive, not a mode of the to-do list. Done shows them newest first |
| `All subjects ▾` | dropdown chip (outlined until a subject is chosen, then filled with the subject's tint and an ×) | opens a bottom sheet: All subjects, Personal, Obsidian, then each subject with its colour dot and open count |
| `⇅ Due` | icon button with the current sort as its label | menu: Due date, Priority, Newest |
| Search | moves into the page header as an icon; tapping expands the field over the title | |

| File | Change |
|---|---|
| `src/screens/Tasks.tsx` | replace lines 46-48 with the row above; `cid` persists in `settings.taskSubject` |
| `src/domain/types.ts`, `defaults.ts` | `taskFilter: 'open' | 'done'`; `withDefaults` reads a stored `'all'` as `'open'` (no SQL migration, the KV row is rewritten on next save) |
| `src/ui/kit.tsx` | new `Segmented` and `DropChip` components (also used by Grades and Week in v0.7) |
| tests | `tasks-filter.test.ts`: `'all'` maps to `'open'`; the subject choice survives a remount |

**Proof:** web shot at 412 dp, light and dark: one row of controls, at most one filled accent element in it, first
task card at y ≤ 230 dp.
