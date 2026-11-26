package app.marginalia.nativebits

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import java.io.File
import java.util.Calendar

/**
 * v0.7.7.9 (SPEC §5, §9.9): a task ticked on a widget is done at once, with Marrow closed and no JS:
 *  1. the tick is recorded for JS (`WidgetTicks`), which applies it on its next start, as before;
 *  2. the task's row in Marrow's database is marked done, so the app is right even before JS runs;
 *  3. a task that lives in a note has its line patched (`[ ]` → `[x]` + `✅ date`), byte for byte what JS's
 *     `patchLine` writes (shared fixtures: tick-lines.json, run by Jest and by TaskTickTest), and the note goes out
 *     through the sync engine.
 * Each step that fails is left to JS, which does the same work on its next start; none of them depends on another.
 */
object TaskTick {
  /* JS's regexes, with JS's meanings spelled out: `\s` is Unicode whitespace, `\d` and `\w` are ASCII, `.` stops at
     line terminators, and the line must match whole (JS `^…$` without the m flag). */
  private const val WS = "[\\t\\n\\u000B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]"
  private const val DOT = "[^\\n\\r\\u2028\\u2029]"
  private val LINE = Regex("($WS*)([-*+]|[0-9]+[.)])$WS+\\[($DOT)\\]$WS?($DOT*)")
  private val ID = Regex("$WS\\^([A-Za-z0-9_-]+)$WS*\\z")
  private const val YMD = "[0-9]{4}-[0-9]{2}-[0-9]{2}"
  private val DONE_DATE = Regex("✅\\uFE0F?$WS*($YMD)")
  private val CANCELLED = Regex("$WS*❌\\uFE0F?$WS*$YMD")
  private val TRAILING = Regex("$WS+\\z")

  private fun isDone(s: String) = s == "x" || s == "X"

  /** JS `appendField`: a field goes before the block id, or at the end. */
  private fun append(s: String, f: String): String {
    val m = ID.find(s) ?: return "${s.replace(TRAILING, "")} $f"
    return "${s.substring(0, m.range.first).replace(TRAILING, "")} $f ^${m.groupValues[1]}"
  }

  /** JS `patchLine(raw, { status: 'x', today })`. */
  fun done(raw: String, today: String): String {
    val m = LINE.matchEntire(raw) ?: return raw
    val (indent, bullet, status0, body0) = m.destructured
    var status = status0
    var body = body0
    if (!isDone(status) && status != "x") {
      status = "x"
      body = body.replaceFirst(CANCELLED, "")
      if (!DONE_DATE.containsMatchIn(body)) body = append(body, "✅ $today")
    }
    return "$indent$bullet [$status] ${body.replace(TRAILING, "")}"
  }

  /** The note with the line of `blockId` ticked, or null when the line isn't there or nothing changes. */
  fun inNote(text: String, blockId: String, today: String): String? {
    val lines = text.split("\n").toMutableList()
    val i = lines.indexOfFirst { ID.find(it)?.groupValues?.get(1) == blockId }
    if (i < 0) return null
    val next = done(lines[i], today)
    if (next == lines[i]) return null
    lines[i] = next
    return lines.joinToString("\n")
  }

  fun ymd(ms: Long): String {
    val c = Calendar.getInstance(); c.timeInMillis = ms
    return "%04d-%02d-%02d".format(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
  }

  /** Steps 1–3 for one task. Runs off the main thread (the widget's ActionCallback). */
  fun tick(c: Context, id: String, now: Long = System.currentTimeMillis()) {
    val app = c.applicationContext
    WidgetTicks.add(app, id)
    try { markDone(app, id, now) } catch (e: Exception) { }
    val t = Agenda.read(app).todos.firstOrNull { it.id == id } ?: return
    if (t.block.isEmpty() || t.note.isEmpty()) return
    try { patchNote(app, t.note, t.block, ymd(now)) } catch (e: Exception) { }
  }

  /** Marrow's own database (expo-sqlite keeps it at files/SQLite/marginalia.db): the task's row, done now. */
  private fun markDone(c: Context, id: String, now: Long) {
    val f = File(File(c.filesDir, "SQLite"), "marginalia.db")
    if (!f.exists()) return
    SQLiteDatabase.openDatabase(f.path, null, SQLiteDatabase.OPEN_READWRITE).use { db ->
      val v = ContentValues().apply { put("status", 2); put("completed_at", now); put("updated_at", now) }
      db.update("task", v, "id = ? AND (status IS NULL OR status <> 2)", arrayOf(id))
      db.execSQL("UPDATE task SET rev = COALESCE(rev, 0) + 1 WHERE id = ? AND updated_at = ?", arrayOf<Any>(id, now))
    }
  }

  /** The note's line, through the same compare-and-swap write JS uses (`vaultEdit`); one retry if the note moved. */
  private fun patchNote(c: Context, path: String, blockId: String, today: String) {
    SyncEngine.init(c)
    for (attempt in 0 until 2) {
      val cur = SyncLocal.vaultRead(path) ?: return
      val next = inNote(cur, blockId, today) ?: return
      val r = SyncLocal.vaultEdit(path, Seal.hash(cur.toByteArray()), next)
      if (!r.startsWith("changed:")) return
    }
  }
}
