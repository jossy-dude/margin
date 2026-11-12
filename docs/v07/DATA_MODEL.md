# v0.7 data model: course components (item 5) and the reinstall move (item 8)

---

# Part 1. Courses made of components

## The problem

Database and the Database lab are **two classes**: separate sessions, separate attendance, a separate teacher, each
marked out of 100. But the course grade is one number, and the lab is only part of it (about 30 % here; another
course might be 60/40, or lecture + lab + tutorial). Today:

| Today (v0.6) | Where | Why it is wrong |
|---|---|---|
| A lab is a **variant** of the subject: its own room, teacher, note, meetings (`meeting.variant_id`), marks (`mark.variant_id`), attendance keys (`date|start|course~variantId`) | `src/domain/types.ts` `SubjectVariant`, migrations 4–5 | the data is already split per class |
| The grade pools every mark of the subject with its raw weight | `src/domain/grades.ts` `total()`, `needed()` | a lab quiz worth "10" counts the same as a lecture quiz worth "10"; the 70/30 split exists nowhere |
| Attendance stats pool both classes | `domain/analytics.ts`, Stats "By subject", Grades "Attendance · 100 %" | missing three labs looks like missing three of all classes |
| The teacher's absence count is per subject | `settings.teacherAbsent[courseId]` | the lab teacher keeps a different register |

So the fix is mostly **maths and UI**, plus a few columns. The variant rows already are the components.

## The model

A **course** has one or more **components**. Each component is a class with its own meetings, attendance, marks,
teacher and room, and a **share** of the course grade. Shares are editable per course, any number of components, any
split, and any component can be renamed, re-weighted, merged or have its classes moved to another.

```
Course  Database Systems                       goal 85 %
 ├─ Component  Lecture   share 70 %   Nkemi · L-4    att. goal 80 %   (is_base: meetings/marks with variant_id NULL)
 └─ Component  Lab       share 30 %   Abebe · Lab-2  att. goal 90 %   (variant_id = 'v-db-lab')
```

| Field | Table / column | Type | Default for old rows | Meaning |
|---|---|---|---|---|
| component id | `subject_variants.id` | TEXT | as today | the base component's id is `<courseId>~base` |
| course | `subject_variants.subject_id` | TEXT | as today | |
| name | `subject_variants.name` | TEXT | as today; base row: "Lecture" | shown everywhere the class appears |
| **kind** | `subject_variants.kind` (new) | TEXT | `'lecture'` for base, `'lab'` if name matches /lab/i, else `'other'` | lecture, lab, tutorial, seminar, practical, other: picks an icon, nothing else |
| **share** | `subject_variants.weight` (new) | REAL NULL | NULL | % of the course grade. NULL on every component of a course = **v0.6 behaviour (pooled)**, so nothing changes until the owner sets a split |
| **base** | `subject_variants.is_base` (new) | INTEGER 0/1 | 1 for the created base row | the component that owns meetings/marks/attendance with `variant_id IS NULL`. Exactly one per course that has components |
| **marked out of** | `subject_variants.scale` (new) | REAL | 100 | a lab marked out of 20 still reads as % |
| **attendance goal** | `subject_variants.att_goal` (new) | REAL NULL | NULL (falls back to the app-wide 80 %) | labs often require more |
| teacher, room, note, ord | existing columns | | as today | per component |
| teacher's own absence count | `settings.teacherAbsent` key becomes `<courseId>` or `<courseId>~<componentId>` | | old keys stay = the base component | |

Why keep the table name `subject_variants`: renaming a table is a risky migration for no user value; the code type
becomes `Component` with a `toComponent()` reader, and the word "variant" leaves the UI.

### Why a real base row, not "the course is the base"

Attendance keys of base meetings have **no** suffix (`2026-11-09|09:00|db`). Giving the base an explicit row with
`is_base = 1` lets it carry a share, teacher and attendance goal **without rewriting a single attendance key**. Moving a
meeting between components later rewrites only that meeting's future keys (past marks stay where they were taken; the
move sheet says so).

## The maths

Every mark gets an **effective weight**. For a mark `m` in component `c`:

```
W_c   = Σ weight of the counted marks in c (scored or not)
e_m   = share_c × (m.weight / W_c)            when shares are set
e_m   = m.weight                              when every share is NULL (v0.6, pooled)

course %   = Σ_scored e_m × pct(m)  /  Σ_scored e_m            (+ curve)
needed avg = (goal × Σ_all e − Σ_scored e × pct(m)) / Σ_unscored e
pct(m)     = m.score / scale_c × 100
```

| Case | Rule |
|---|---|
| A component with a share but no marks entered yet | its whole share counts as **unscored** (it is still to come): `needed` includes it, `course %` ignores it |
| Shares that do not add to 100 | normalised (divide by their sum). The editor shows "adds to 90 %, counted as 100 %" and a one-tap "Fix" that puts the remainder on the base |
| One component only | identical to `total()` / `needed()` today (a test pins this) |
| Curve (`adjust`) | stays per course, applied to the course % |
| Letter grade | from the course %, as today |

`src/domain/grades.ts` gains `courseGrade(course, components, marks, adj)` and `courseNeeded(...)`; `total()` and
`needed()` stay as the one-component special case so every existing test keeps meaning what it meant.

Attendance per component: `attendanceOf(componentId)` filters occurrences by `parseOccKey(key).variantId` (NULL = the
base). The course card shows each component's rate; Stats "By subject" shows the course row with its components
indented under it, each against its own goal. "You can miss N more" is computed per component.

## Migration 7 (one transaction, like every migration)

```sql
ALTER TABLE subject_variants ADD COLUMN kind TEXT;
ALTER TABLE subject_variants ADD COLUMN weight REAL;
ALTER TABLE subject_variants ADD COLUMN is_base INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subject_variants ADD COLUMN scale REAL NOT NULL DEFAULT 100;
ALTER TABLE subject_variants ADD COLUMN att_goal REAL;
CREATE INDEX IF NOT EXISTS idx_meeting_variant ON meeting(variant_id);
CREATE INDEX IF NOT EXISTS idx_mark_variant ON mark(variant_id);
```

`BACKFILL[6]` (same transaction):

| Step | SQL / rule |
|---|---|
| 1 | for every course that has at least one live variant row: `INSERT INTO subject_variants(id, subject_id, name, room, teacher, note, ord, kind, is_base, …) VALUES ('<id>~base', '<id>', 'Lecture', <first course room>, <course teacher>, '', -1, 'lecture', 1, …)` with `updated_at = now`, `rev = 1` |
| 2 | `UPDATE subject_variants SET kind = CASE WHEN name LIKE '%lab%' THEN 'lab' WHEN name LIKE '%tut%' THEN 'tutorial' ELSE 'other' END WHERE kind IS NULL AND is_base = 0` |
| 3 | weights stay NULL: **no grade changes on upgrade**. The first launch shows one quiet card on Grades: "Database has a Lab. Set how much each is worth?" → the split editor |
| 4 | courses with no variants get no rows; adding a lab later creates the base row on the fly (`ensureBase()`) |

Safety: the pre-migration safety copy (`services/safety.ts`) runs first, as for every migration; `migration-v07.test.ts`
runs it on a v6 fixture with a variant, a NULL-variant meeting, marks on both and attendance on both, and asserts
every attendance key and every mark is untouched.

### If DB and the lab are two separate *subjects* today

`makeVariantChange` (`src/domain/variants.ts`) already turns one subject into a component of another, moving its
meetings, marks, tasks, notes, focus and attendance, as one undoable change. v0.7 exposes it as "Make this part of
another course…" in the subject sheet, then opens the split editor.

## Import / export / archive

| Path | Change |
|---|---|
| `margin/2` export (`services/export.ts`) | the `raw.variants` rows carry the new fields (they are spread, so this is automatic); the readable "Variants" table becomes "Components" with share, kind, scale, attendance goal |
| Import (`domain/importPlan.ts`) | accepts the new fields, all optional; a v0.6 file imports with NULL shares (pooled), same as an upgrade |
| Archive snapshot (`ARCHIVE_VERSION`) | bump to 11; archived terms keep their grades because the snapshot carries the components |
| Obsidian bridge events | class events carry `component` (name) so the vault timetable says "Database · Lab" |

## UI (layouts in DESIGN.md → Grades, Course sheet)

| Surface | What changes |
|---|---|
| Grades | one card per course: course %, letter, goal line; under it one row per component: name + kind icon, share, its %, attendance bubbles and rate, teacher. Tap a component → its marks and attendance |
| Course sheet (edit) | "Parts of this course" list: drag to reorder, tap to edit, "+ Add a part" (Lab, Tutorial, …) |
| Split editor | a single horizontal bar divided into segments, one per component; drag a divider to change the split; each segment shows its %; presets 70/30 · 60/40 · 50/50 · Equal; typing a number is also possible |
| Mark sheet | "Part" picker (defaults to the component of the class that just ended) and "out of" (defaults to the component's scale) |
| Class sheet | "Part" picker; moving a class to another part asks "From now on" (past attendance stays) |
| Today / Week | the class name shows the component: "Database · Lab" and its teacher/room |
| Stats | per component under each course, each against its own attendance goal |

---

# Part 2. v0.7 is a fresh install: why, and how the data comes along

## Why v0.7 cannot install over v0.6

| Check | Result |
|---|---|
| Installed app (`adb shell dumpsys package app.marginalia.planner`) | versionCode 5, versionName 0.6.0, first installed 2026-11-02, updated 2026-11-11, `signatures:[51ed3f60]`, `ALLOW_BACKUP` |
| Which key is that? | `51ed3f60` is Java's `Signature.hashCode()` of the signing certificate. Computed from `android/app/debug.keystore` (alias `androiddebugkey`): **`0x51ed3f60`, a match**. v0.6 on the phone is signed with the public debug key committed in the repo |
| What v0.7 is planned to be | the first `release`-variant APK (`release-apk.yml`: a `v*` tag always builds `release`; `android/app/build.gradle:154-158` signs it with the owner's own keystore from the `ANDROID_KEYSTORE_*` secrets) |
| What Android does | refuses an update whose signer differs from the installed one: **`INSTALL_FAILED_UPDATE_INCOMPATIBLE: signatures do not match`**. The only way in is uninstall → install, which deletes the app's data |
| Not the cause (checked) | package id is the same (`app.marginalia.planner`; only the `dev` variant adds `.dev`); minSdk 24; versionCode must rise 5 → 6 (enforced by `native-config.test.ts`) |
| Secrets status | the v0.6 tag's release build failed on purpose: `ANDROID_KEYSTORE_BASE64` was not set (STATE.md). The PAT in this session cannot list secrets (HTTP 403), so the owner checks with `gh secret list` |
| Auto Backup | will **not** carry the data across: a restore is matched against the app's signing certificate, so a release-key install does not receive the debug-key app's backup. It is also off-device and slow to trigger. Do not rely on it for this move |

## The move, step by step (recommended: path A)

| Step | Who | What | Time |
|---|---|---|---|
| 0 | owner | `gh secret list` shows the four `ANDROID_*` secrets; keystore has two offline copies (RELEASING.md §1) | once |
| 1 | owner | v0.6 → **Settings → Export before uninstalling** → saves `margin-backup-<date>.json` (`margin/2`: every table, settings incl. alarms, archived terms with snapshots) to **Documents/Margin/** (pick the folder; not Downloads, which some cleaners empty) | 10 s |
| 2 | owner | also in v0.6: Settings → Data → Safety copies, note the newest one (belt and braces) | |
| 3 | owner | uninstall Margin 0.6 | |
| 4 | owner | install `margin-v0.7.0-release-android.apk` | |
| 5 | app | first launch on an empty database: onboarding page 1 offers **"Bring my data back"** before anything else → file picker → preview with counts ("6 subjects, 312 classes, 41 marks, 2 archived terms…") → Restore. It uses the existing merge-only importer (`importSnapshot`), which on an empty database is a full restore | 30 s |
| 6 | app | after restore: re-ask the permissions an install loses (notifications, exact alarms, full-screen alarm, Do Not Disturb access), and re-pick the Obsidian vault folder (SAF grants never survive an uninstall) | 1 min |
| 7 | owner | spot-check: Today, one course grade, one attendance rate, an alarm, the archived term | |

What does **not** come back, by design: notification history (`notif_log`), the outbox, the OTA marker, the vault
folder grant and Android permissions. Widgets must be re-added to the home screen (the launcher drops them on
uninstall).

### Path B (most faithful, needs one v0.6.1 OTA first)

If the owner wants a byte-exact copy: a JS-only v0.6.1 update (runtime 0.6.0, so it reaches the installed APK) adds
"Save a full copy" that uses `expo-sqlite`'s `backupDatabaseAsync` into a cache file and writes it to Documents/Margin
via SAF. v0.7's restore accepts either the JSON or the `.db` (it attaches the file read-only, runs migrations 6→7 on
a copy, then swaps it in). Recommended only if Path A's preview counts ever disagree.

## Never again

| Measure | Where | Effect |
|---|---|---|
| Sign every APK with the release key from v0.7 on; the build fails without it (exists) | `build.gradle`, `release-apk.yml` | every later version installs over the last |
| Pin the certificate: CI prints `apksigner verify --print-certs` and fails if the SHA-256 is not the pinned one | `release-apk.yml` + a fingerprint in `docs/RELEASING.md` | a build signed with the wrong key can never be released by mistake |
| Keep the keystore safe: 2 offline copies + password manager; never in the repo (`*.keystore` is ignored) | RELEASING.md §1 | losing it would force another reinstall |
| If the key ever has to change: APK Signature Scheme v3 **key rotation** (`apksigner rotate` + `--lineage`) | RELEASING.md | a new key without a reinstall |
| Automatic weekly backup: Margin writes `margin-backup-<date>.json` into a folder the owner picks once (Documents/Margin), keeps the last 4, and onboarding's "Bring my data back" looks there first | `services/backup.ts` (new), Settings → Backup | any future reinstall, phone change or wipe is a 30 s restore |
| `dev` APKs stay `.dev` (install beside, never over) | exists | testing never touches real data |
| versionCode +1 every release (exists, `native-config.test.ts`) | | no downgrade refusals |
