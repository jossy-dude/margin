package app.marginalia.nativebits

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * `sync.db`, owned by Kotlin (SYNC_ANDROID.md §9). Separate from expo-sqlite's `marginalia.db`, so the service
 * never shares the JS runtime's connection (BUGS.md #11).
 */
class SyncStore private constructor(c: Context) : SQLiteOpenHelper(c.applicationContext, "sync.db", null, 1) {
  companion object {
    @Volatile private var inst: SyncStore? = null
    fun get(c: Context): SyncStore = inst ?: synchronized(this) { inst ?: SyncStore(c).also { inst = it } }
  }

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL("CREATE TABLE peer(device_id TEXT PRIMARY KEY, role TEXT, name TEXT, net_fp TEXT, last_addr TEXT, last_ok_at INTEGER)")
    db.execSQL("CREATE TABLE kv(k TEXT PRIMARY KEY, v TEXT)")
    db.execSQL("CREATE TABLE file(path TEXT PRIMARY KEY, h TEXT, base TEXT, size INTEGER, mtime INTEGER, seq INTEGER)")
    db.execSQL("CREATE TABLE outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT, frame TEXT, created_at INTEGER, tries INTEGER DEFAULT 0)")
    db.execSQL("CREATE TABLE inbox(seq INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, json TEXT, applied INTEGER DEFAULT 0)")
    db.execSQL("CREATE TABLE ext_reminder(id TEXT PRIMARY KEY, title TEXT, due_at INTEGER, path TEXT, line INTEGER, done INTEGER DEFAULT 0, updated_at INTEGER)")
    db.execSQL("CREATE TABLE stats(day TEXT PRIMARY KEY, live_ms INTEGER DEFAULT 0, connects INTEGER DEFAULT 0, catchups INTEGER DEFAULT 0, rx INTEGER DEFAULT 0, tx INTEGER DEFAULT 0, err INTEGER DEFAULT 0, last_err TEXT)")
  }
  override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) {}

  // ── kv ──
  fun kv(k: String): String? = readableDatabase.rawQuery("SELECT v FROM kv WHERE k=?", arrayOf(k)).use { if (it.moveToFirst()) it.getString(0) else null }
  fun kv(k: String, v: String?) {
    if (v == null) writableDatabase.delete("kv", "k=?", arrayOf(k))
    else writableDatabase.insertWithOnConflict("kv", null, ContentValues().apply { put("k", k); put("v", v) }, SQLiteDatabase.CONFLICT_REPLACE)
  }
  var cursor: Long
    get() = kv("cursor")?.toLongOrNull() ?: 0L
    set(v) = kv("cursor", v.toString())

  // ── files: h = what is on the phone now, base = last hash both sides agreed on ──
  data class FileRow(val path: String, val h: String?, val base: String?, val size: Long, val mtime: Long, val seq: Long)
  fun file(p: String): FileRow? = readableDatabase.rawQuery("SELECT path,h,base,size,mtime,seq FROM file WHERE path=?", arrayOf(p)).use {
    if (it.moveToFirst()) FileRow(it.getString(0), it.getString(1), it.getString(2), it.getLong(3), it.getLong(4), it.getLong(5)) else null
  }
  fun files(): List<FileRow> = readableDatabase.rawQuery("SELECT path,h,base,size,mtime,seq FROM file", null).use {
    val out = ArrayList<FileRow>(it.count)
    while (it.moveToNext()) out.add(FileRow(it.getString(0), it.getString(1), it.getString(2), it.getLong(3), it.getLong(4), it.getLong(5)))
    out
  }
  fun putFile(r: FileRow) {
    writableDatabase.insertWithOnConflict("file", null, ContentValues().apply {
      put("path", r.path); put("h", r.h); put("base", r.base); put("size", r.size); put("mtime", r.mtime); put("seq", r.seq)
    }, SQLiteDatabase.CONFLICT_REPLACE)
  }
  fun dropFile(p: String) { writableDatabase.delete("file", "path=?", arrayOf(p)) }

  // ── outbox: dropped only on ack ok ──
  fun enqueue(id: String, frame: String) {
    writableDatabase.insert("outbox", null, ContentValues().apply { put("id", id); put("frame", frame); put("created_at", System.currentTimeMillis()) })
  }
  fun outbox(limit: Int = 200): List<Pair<String, String>> = readableDatabase.rawQuery("SELECT id, frame FROM outbox ORDER BY seq LIMIT $limit", null).use {
    val out = ArrayList<Pair<String, String>>(); while (it.moveToNext()) out.add(it.getString(0) to it.getString(1)); out
  }
  fun acked(id: String) { writableDatabase.delete("outbox", "id=?", arrayOf(id)) }
  fun outboxSize(): Int = readableDatabase.rawQuery("SELECT COUNT(*) FROM outbox", null).use { if (it.moveToFirst()) it.getInt(0) else 0 }

  // ── inbox: rows that arrived while JS was not running; JS reads and marks them ──
  fun inbox(kind: String, json: String) { writableDatabase.insert("inbox", null, ContentValues().apply { put("kind", kind); put("json", json) }) }
  fun takeInbox(): List<Pair<String, String>> {
    val db = writableDatabase
    val rows = db.rawQuery("SELECT seq, kind, json FROM inbox WHERE applied=0 ORDER BY seq", null).use {
      val out = ArrayList<Triple<Long, String, String>>(); while (it.moveToNext()) out.add(Triple(it.getLong(0), it.getString(1), it.getString(2))); out
    }
    if (rows.isNotEmpty()) db.execSQL("DELETE FROM inbox WHERE seq <= ${rows.last().first}")
    return rows.map { it.second to it.third }
  }

  // ── Obsidian reminders that are not school tasks (PLAN item 4) ──
  data class Ext(val id: String, val title: String, val dueAt: Long, val path: String, val line: Int, val done: Boolean)
  fun putExt(e: Ext, updatedAt: Long) {
    writableDatabase.insertWithOnConflict("ext_reminder", null, ContentValues().apply {
      put("id", e.id); put("title", e.title); put("due_at", e.dueAt); put("path", e.path); put("line", e.line); put("done", if (e.done) 1 else 0); put("updated_at", updatedAt)
    }, SQLiteDatabase.CONFLICT_REPLACE)
  }
  fun ext(id: String): Ext? = readableDatabase.rawQuery("SELECT id,title,due_at,path,line,done FROM ext_reminder WHERE id=?", arrayOf(id)).use {
    if (it.moveToFirst()) Ext(it.getString(0), it.getString(1), it.getLong(2), it.getString(3) ?: "", it.getInt(4), it.getInt(5) == 1) else null
  }
  fun upcomingExt(now: Long, limit: Int): List<Ext> = readableDatabase.rawQuery(
    "SELECT id,title,due_at,path,line,done FROM ext_reminder WHERE done=0 AND due_at > ? ORDER BY due_at LIMIT $limit", arrayOf(now.toString())).use {
    val out = ArrayList<Ext>(); while (it.moveToNext()) out.add(Ext(it.getString(0), it.getString(1), it.getLong(2), it.getString(3) ?: "", it.getInt(4), it.getInt(5) == 1)); out
  }

  // ── per-day counters for Diagnostics → Sync ──
  private fun today() = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())
  fun count(col: String, by: Long = 1, err: String? = null) {
    val d = today()
    writableDatabase.execSQL("INSERT OR IGNORE INTO stats(day) VALUES(?)", arrayOf(d))
    writableDatabase.execSQL("UPDATE stats SET $col = $col + ? WHERE day=?", arrayOf<Any>(by, d))
    if (err != null) writableDatabase.execSQL("UPDATE stats SET last_err=? WHERE day=?", arrayOf(err.take(300), d))
  }
  fun statsJson(days: Int = 7): String {
    val arr = org.json.JSONArray()
    readableDatabase.rawQuery("SELECT day,live_ms,connects,catchups,rx,tx,err,last_err FROM stats ORDER BY day DESC LIMIT $days", null).use {
      while (it.moveToNext()) arr.put(org.json.JSONObject().put("day", it.getString(0)).put("liveMs", it.getLong(1)).put("connects", it.getLong(2))
        .put("catchups", it.getLong(3)).put("rx", it.getLong(4)).put("tx", it.getLong(5)).put("err", it.getLong(6)).put("lastErr", it.getString(7)))
    }
    return arr.toString()
  }
}
