package app.marginalia.nativebits

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream

/**
 * `sync.db`, owned by Kotlin (SYNC_ANDROID.md §9). Separate from expo-sqlite's `marginalia.db`, so the service
 * never shares the JS runtime's connection (BUGS.md #11).
 *
 * v2 (v0.8 SPEC §1.3): the base BODY of every text file (gzip), so the phone always knows the real common ancestor;
 * `pending` = changes the hub announced that have not landed yet; `skipped` = changes that cannot land, with why.
 * The cursor is recomputed inside the same transaction that lands or skips a change: no in-memory gate, no rewind.
 */
class SyncStore private constructor(c: Context) : SQLiteOpenHelper(c.applicationContext, "sync.db", null, 2) {
  companion object {
    @Volatile private var inst: SyncStore? = null
    fun get(c: Context): SyncStore = inst ?: synchronized(this) { inst ?: SyncStore(c).also { inst = it } }
    const val BASE_MAX = 2 * 1024 * 1024
    const val EVENTS_KEEP = 200
    fun gzip(b: ByteArray): ByteArray = ByteArrayOutputStream().also { o -> GZIPOutputStream(o).use { it.write(b) } }.toByteArray()
    fun gunzip(b: ByteArray): ByteArray = GZIPInputStream(ByteArrayInputStream(b)).use { it.readBytes() }
  }

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL("CREATE TABLE peer(device_id TEXT PRIMARY KEY, role TEXT, name TEXT, net_fp TEXT, last_addr TEXT, last_ok_at INTEGER)")
    db.execSQL("CREATE TABLE kv(k TEXT PRIMARY KEY, v TEXT)")
    db.execSQL("CREATE TABLE file(path TEXT PRIMARY KEY, h TEXT, base TEXT, size INTEGER, mtime INTEGER, seq INTEGER)")
    db.execSQL("CREATE TABLE outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT, frame TEXT, created_at INTEGER, tries INTEGER DEFAULT 0)")
    db.execSQL("CREATE TABLE inbox(seq INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, json TEXT, applied INTEGER DEFAULT 0)")
    db.execSQL("CREATE TABLE stats(day TEXT PRIMARY KEY, live_ms INTEGER DEFAULT 0, connects INTEGER DEFAULT 0, catchups INTEGER DEFAULT 0, rx INTEGER DEFAULT 0, tx INTEGER DEFAULT 0, err INTEGER DEFAULT 0, last_err TEXT)")
    v2(db)
  }
  override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) { if (old < 2) v2(db) }
  private fun v2(db: SQLiteDatabase) {
    db.execSQL("CREATE TABLE IF NOT EXISTS base_body(path TEXT PRIMARY KEY, h TEXT, body BLOB)")
    db.execSQL("CREATE TABLE IF NOT EXISTS pending(path TEXT PRIMARY KEY, seq INTEGER, asks INTEGER DEFAULT 0, at INTEGER)")
    db.execSQL("CREATE TABLE IF NOT EXISTS skipped(path TEXT PRIMARY KEY, seq INTEGER, reason TEXT, at INTEGER)")
    db.execSQL("CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, kind TEXT, msg TEXT)")
    db.execSQL("CREATE TABLE IF NOT EXISTS vault_changes(path TEXT PRIMARY KEY, at INTEGER)")
  }

  private fun <T> tx(f: (SQLiteDatabase) -> T): T {
    val db = writableDatabase
    db.beginTransaction()
    try { val r = f(db); db.setTransactionSuccessful(); return r } finally { db.endTransaction() }
  }

  // ── kv ──
  fun kv(k: String): String? = readableDatabase.rawQuery("SELECT v FROM kv WHERE k=?", arrayOf(k)).use { if (it.moveToFirst()) it.getString(0) else null }
  fun kv(k: String, v: String?) { setKv(writableDatabase, k, v) }
  private fun setKv(db: SQLiteDatabase, k: String, v: String?) {
    if (v == null) db.delete("kv", "k=?", arrayOf(k))
    else db.insertWithOnConflict("kv", null, ContentValues().apply { put("k", k); put("v", v) }, SQLiteDatabase.CONFLICT_REPLACE)
  }
  private fun longKv(db: SQLiteDatabase, k: String): Long = db.rawQuery("SELECT v FROM kv WHERE k=?", arrayOf(k)).use { if (it.moveToFirst()) it.getString(0)?.toLongOrNull() ?: 0L else 0L }
  /** Everything up to here has landed (or was skipped). Sent in hello: the hub replays only what came after. */
  var cursor: Long
    get() = kv("cursor")?.toLongOrNull() ?: 0L
    set(v) = kv("cursor", v.toString())
  /** The highest sequence number the hub has announced. */
  val head: Long get() = kv("head")?.toLongOrNull() ?: 0L

  /** cursor = head when nothing is pending, else just below the oldest pending change; never backwards. */
  private fun recompute(db: SQLiteDatabase, seenSeq: Long) {
    val head = maxOf(longKv(db, "head"), seenSeq)
    setKv(db, "head", head.toString())
    val oldest: Long? = db.rawQuery("SELECT MIN(seq) FROM pending", null).use { if (it.moveToFirst() && !it.isNull(0)) it.getLong(0) else null }
    val cur = longKv(db, "cursor")
    val next = if (oldest == null) head else maxOf(cur, oldest - 1)
    if (next > cur) setKv(db, "cursor", next.toString())
  }

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
  fun putFile(r: FileRow) { putFileIn(writableDatabase, r) }
  private fun putFileIn(db: SQLiteDatabase, r: FileRow) {
    db.insertWithOnConflict("file", null, ContentValues().apply {
      put("path", r.path); put("h", r.h); put("base", r.base); put("size", r.size); put("mtime", r.mtime); put("seq", r.seq)
    }, SQLiteDatabase.CONFLICT_REPLACE)
  }
  fun dropFile(p: String) { tx { db -> db.delete("file", "path=?", arrayOf(p)); db.delete("base_body", "path=?", arrayOf(p)) } }
  fun moveFile(from: String, to: String) {
    tx { db ->
      db.execSQL("DELETE FROM file WHERE path=?", arrayOf(to)); db.execSQL("DELETE FROM base_body WHERE path=?", arrayOf(to))
      db.execSQL("UPDATE file SET path=? WHERE path=?", arrayOf(to, from)); db.execSQL("UPDATE base_body SET path=? WHERE path=?", arrayOf(to, from))
    }
  }

  // ── base bodies (text files): the real common ancestor for a merge ──
  fun baseBody(p: String, h: String?): ByteArray? {
    if (h == null) return null
    return readableDatabase.rawQuery("SELECT h, body FROM base_body WHERE path=?", arrayOf(p)).use {
      if (it.moveToFirst() && it.getString(0) == h) (try { gunzip(it.getBlob(1)) } catch (e: Exception) { null }) else null
    }
  }
  private fun putBaseIn(db: SQLiteDatabase, p: String, h: String, body: ByteArray?) {
    if (body == null || body.size > BASE_MAX) { db.delete("base_body", "path=?", arrayOf(p)); return }
    db.insertWithOnConflict("base_body", null, ContentValues().apply { put("path", p); put("h", h); put("body", gzip(body)) }, SQLiteDatabase.CONFLICT_REPLACE)
  }
  fun putBase(p: String, h: String, body: ByteArray?) { putBaseIn(writableDatabase, p, h, body) }

  // ── landing (one transaction each) ──
  /** A change from the hub is on the phone's disk (or needs nothing): file row, base body, pending row and cursor
   *  together. `row` null = the path is gone. */
  fun land(p: String, row: FileRow?, seq: Long, body: ByteArray?) {
    tx { db ->
      if (row == null) { db.delete("file", "path=?", arrayOf(p)); db.delete("base_body", "path=?", arrayOf(p)) }
      else {
        putFileIn(db, row)
        val b = row.base
        // a body is kept for text files; without one, a body stored for an older base is dropped (it would mislead)
        if (b != null && body != null) putBaseIn(db, p, b, body)
        else if (b != null) db.rawQuery("SELECT h FROM base_body WHERE path=?", arrayOf(p)).use { if (it.moveToFirst() && it.getString(0) != b) db.delete("base_body", "path=?", arrayOf(p)) }
      }
      db.delete("pending", "path=? AND seq<=?", arrayOf(p, seq.toString()))
      db.delete("skipped", "path=?", arrayOf(p))
      recompute(db, seq)
    }
  }
  /** A change that cannot land (ignored, too big, write failed three times): noted with the reason, cursor moves. */
  fun skip(p: String, seq: Long, reason: String) {
    tx { db ->
      db.insertWithOnConflict("skipped", null, ContentValues().apply { put("path", p); put("seq", seq); put("reason", reason.take(300)); put("at", System.currentTimeMillis()) }, SQLiteDatabase.CONFLICT_REPLACE)
      db.delete("pending", "path=?", arrayOf(p))
      recompute(db, seq)
    }
  }
  /** The hub announced a change to `p` at `seq` that has to come in. Returns how often it was asked for. */
  fun expect(p: String, seq: Long): Int = tx { db ->
    val asks = db.rawQuery("SELECT asks FROM pending WHERE path=?", arrayOf(p)).use { if (it.moveToFirst()) it.getInt(0) else 0 } + 1
    db.insertWithOnConflict("pending", null, ContentValues().apply { put("path", p); put("seq", seq); put("asks", asks); put("at", System.currentTimeMillis()) }, SQLiteDatabase.CONFLICT_REPLACE)
    recompute(db, seq)
    asks
  }
  /** Nothing to fetch for `p` at `seq` (the phone's own edit beats it, or it needs nothing): settled. */
  fun settle(p: String, seq: Long) { tx { db -> db.delete("pending", "path=? AND seq<=?", arrayOf(p, seq.toString())); recompute(db, seq) } }
  /** A manifest (or the hub's head) with nothing to fetch for these seqs: the cursor may move. */
  fun seen(seq: Long) { tx { db -> recompute(db, seq) } }
  /** Pending rows the latest manifest no longer lists are settled already (a later change replaced them). */
  fun keepPending(paths: Set<String>) {
    tx { db ->
      val all = db.rawQuery("SELECT path FROM pending", null).use { val o = ArrayList<String>(); while (it.moveToNext()) o.add(it.getString(0)); o }
      for (p in all) if (p !in paths) db.delete("pending", "path=?", arrayOf(p))
      recompute(db, 0)
    }
  }
  fun pendingCount(): Int = readableDatabase.rawQuery("SELECT COUNT(*) FROM pending", null).use { if (it.moveToFirst()) it.getInt(0) else 0 }
  fun skippedJson(limit: Int = 50): org.json.JSONArray {
    val arr = org.json.JSONArray()
    readableDatabase.rawQuery("SELECT path, seq, reason, at FROM skipped ORDER BY at DESC LIMIT $limit", null).use {
      while (it.moveToNext()) arr.put(org.json.JSONObject().put("p", it.getString(0)).put("seq", it.getLong(1)).put("reason", it.getString(2)).put("at", it.getLong(3)))
    }
    return arr
  }
  /** Forget the hub's numbering (a new pairing, a hub whose state was reset). */
  fun resetCursor() { tx { db -> setKv(db, "cursor", "0"); setKv(db, "head", "0"); db.delete("pending", null, null) } }

  // ── the event log for the sync page (last 200) ──
  fun event(kind: String, msg: String) {
    tx { db ->
      db.insert("events", null, ContentValues().apply { put("at", System.currentTimeMillis()); put("kind", kind); put("msg", msg.take(500)) })
      db.execSQL("DELETE FROM events WHERE id <= (SELECT MAX(id) FROM events) - $EVENTS_KEEP")
    }
  }
  fun eventsJson(limit: Int = EVENTS_KEEP): String {
    val arr = org.json.JSONArray()
    readableDatabase.rawQuery("SELECT at, kind, msg FROM events ORDER BY id DESC LIMIT $limit", null).use {
      while (it.moveToNext()) arr.put(org.json.JSONObject().put("at", it.getLong(0)).put("kind", it.getString(1)).put("msg", it.getString(2)))
    }
    return arr.toString()
  }

  // ── vault changes JS has not seen yet (it drains them on start and on every event) ──
  fun noteVaultChange(paths: Collection<String>) {
    if (paths.isEmpty()) return
    tx { db -> val now = System.currentTimeMillis(); for (p in paths) db.insertWithOnConflict("vault_changes", null, ContentValues().apply { put("path", p); put("at", now) }, SQLiteDatabase.CONFLICT_REPLACE) }
  }
  fun takeVaultChanges(): List<String> = tx { db ->
    val out = db.rawQuery("SELECT path FROM vault_changes ORDER BY at", null).use { val o = ArrayList<String>(); while (it.moveToNext()) o.add(it.getString(0)); o }
    db.delete("vault_changes", null, null)
    out
  }

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
