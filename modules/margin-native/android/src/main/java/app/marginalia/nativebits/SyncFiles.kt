package app.marginalia.nativebits

import android.content.Context
import android.util.Base64
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * The phone vault's files (v0.8 SPEC §1.2–1.3). Everything here runs on SyncEngine.exec.
 *  · incoming: written, verified by hash, then landed in ONE sync.db transaction (row, base body, pending, cursor);
 *    a change that cannot land is skipped with its reason, never acked; plugin code lands as a batch, then a reload;
 *  · outgoing: the scan finds what changed here and sends it with its true base (and the base body when the hub
 *    lacks it); plugin code, device-local files and the desktop's single-writer files are never sent.
 */
internal object SyncFiles {
  private val E = SyncEngine
  private const val TAG = "MarginSync"
  private const val SCAN_EVERY_S = 30L
  private const val MAX_PUSH_PER_SCAN = 200
  private const val MAX_FILE_BYTES = 20L * 1024 * 1024        // phone → desktop (read into memory to send)
  private const val MAX_IN_BYTES = 100L * 1024 * 1024          // desktop → phone (arrives in parts, streamed to disk)
  private const val PART_BYTES = 1024 * 1024
  private const val DEL_LIMIT = 25
  private const val MAX_TRIES = 3
  private const val MAX_ASKS = 3
  private val TEXT_RE = Regex("\\.(md|canvas|base|txt|css|js|mjs|py|csv|json)$", RegexOption.IGNORE_CASE)

  private data class Inflight(val path: String, val h: String?, val kind: String, val tries: Int, val body: ByteArray? = null)
  private val inflight = HashMap<String, Inflight>()
  private val inflightPath = HashMap<String, String>()
  val tries = HashMap<String, Int>()
  private var scanTask: ScheduledFuture<*>? = null
  private var ignore = SyncIgnore()
  private var classes = FileClasses.Table()

  fun inflightCount() = inflight.size
  fun linkLost() { inflight.clear(); inflightPath.clear(); dropParts() }
  fun ignored(p: String) = p != ".bone-sync-ignore" && p != ".bone-sync-classes" && ignore.matches(p)
  fun klass(p: String) = classes.of(p)
  /** Synced at all on this phone (not ignored, not device-local). */
  fun syncsHere(p: String) = !ignored(p) && klass(p).cls != "local"
  fun isText(p: String) = TEXT_RE.containsMatchIn(p)
  private fun mayPush(p: String) = FileClasses.mayWrite(klass(p), "phone")
  private fun bodyFor(p: String, bytes: ByteArray?): ByteArray? = if (bytes != null && isText(p) && bytes.size <= SyncStore.BASE_MAX) bytes else null
  private fun live() = E.hub?.ready == true && E.hub?.mode == "live"
  private fun want(paths: List<String>) { for (chunk in paths.chunked(500)) E.sendHub(E.frame("want", JSONObject().put("paths", JSONArray(chunk)))) }
  /** Ask the hub again; after MAX_ASKS the change is skipped with its reason and the cursor moves past it. */
  private fun ask(p: String, seq: Long, why: String) {
    if (E.store.expect(p, seq) > MAX_ASKS) { E.store.skip(p, seq, why); E.fail("$p did not arrive after $MAX_ASKS tries ($why); skipped. Sync now asks again."); return }
    want(listOf(p))
  }

  // ── the rules files ──────────────────────────────────────────────────────────────────────────
  private fun refreshRules(v: SyncVault) {
    ignore = SyncIgnore(v.read(".bone-sync-ignore")?.let { String(it) } ?: SyncIgnore.DEFAULT)
    classes = FileClasses.Table(v.read(".bone-sync-classes")?.let { String(it) } ?: "")
  }

  // ── the hub's manifest ───────────────────────────────────────────────────────────────────────
  /** Want what changed there, settle what is the same, leave what changed on both sides to the push (the hub
   *  merges it against the base we send). The cursor moves in sync.db as each change lands. */
  fun onManifest(m: JSONObject) {
    val v = E.vault() ?: run { E.fail("Pick the vault folder in Settings → Obsidian & sync so Margin can sync it."); return }
    E.setStage("Comparing files")
    val scanned = refreshLocalSafe(v)
    if (E.hub?.mode == "read-only") {
      if (!scanned) return
      val arr = JSONArray()
      for (r in E.store.files()) if (r.h != null) arr.put(JSONObject().put("p", r.path).put("h", r.h).put("s", r.size).put("m", r.mtime))
      E.sendHub(E.frame("manifest", JSONObject().put("full", true).put("files", arr)))
      E.setStage(""); return
    }
    val files = m.optJSONArray("files") ?: JSONArray()
    val listed = HashSet<String>(); val wanted = ArrayList<String>()
    for (i in 0 until files.length()) {
      if (i % 200 == 0) E.setStage("Comparing files", i, files.length())
      val f = files.getJSONObject(i); val p = f.getString("p"); val h = if (f.isNull("h")) null else f.optString("h"); val seq = f.optLong("seq")
      listed.add(p)
      if (!syncsHere(p)) { E.store.settle(p, seq); continue }
      val row = E.store.file(p)
      when {
        h == null -> when {
          row == null -> E.store.settle(p, seq)
          // deleted on the desktop: follow it unless the phone edited the file (an edit beats a delete; pushed below)
          row.h == row.base || row.h == null -> { v.delete(p); E.store.land(p, null, seq, null); SyncLocal.changed(p) }
          else -> E.store.settle(p, seq)
        }
        row == null || (row.h == null && row.base == null) -> { if (E.store.expect(p, seq) > MAX_ASKS) E.store.skip(p, seq, "never arrived") else wanted.add(p) }
        row.h == h -> E.store.land(p, row.copy(base = h, seq = seq), seq, if (isText(p) && E.store.baseBody(p, h) == null) bodyFor(p, v.read(p)) else null)
        // unchanged here, or deleted here while the desktop edited it: take the desktop's
        row.h == row.base || row.h == null -> { if (E.store.expect(p, seq) > MAX_ASKS) E.store.skip(p, seq, "never arrived") else wanted.add(p) }
        // both changed: our copy goes with its base, the hub merges and sends the result
        else -> E.store.expect(p, seq)
      }
    }
    E.store.keepPending(listed)
    E.store.seen(m.optLong("head"))
    if (wanted.isNotEmpty()) { E.setStage("Receiving ${wanted.size} change${if (wanted.size == 1) "" else "s"}", 0, wanted.size); want(wanted) } else E.setStage("")
    if (scanned) pushChanged(v, wanted.toHashSet())
    E.status("manifest")
  }

  // ── the phone's own changes ──────────────────────────────────────────────────────────────────
  fun startScans() {
    stopScans()
    scanTask = E.sched.scheduleWithFixedDelay(Runnable { E.exec.execute { scanAndPush(); SyncLocal.expireEditing() } }, SCAN_EVERY_S, SCAN_EVERY_S, TimeUnit.SECONDS)
  }
  fun stopScans() { scanTask?.cancel(false); scanTask = null }
  /** Sync now (the button, the periodic tick, unlocking the phone). Connects first if needed. */
  fun scanNow() = E.exec.execute { if (E.hub?.ready == true) scanAndPush() else if (E.paired) E.connect(null) }
  private fun scanAndPush() {
    if (!live()) return
    val v = E.vault() ?: return
    if (refreshLocalSafe(v)) pushChanged(v, emptySet())
  }
  /** One path, right away (phone Obsidian said it saved it, or Margin's JS edited it): re-hash and send. */
  fun scanPath(p: String) {
    val v = E.vault() ?: return
    if (!syncsHere(p)) return
    val st = v.stat(p); val row = E.store.file(p)
    if (st == null) { if (row?.h != null) E.store.putFile(row.copy(h = null)) }
    else if (row?.h == null || row.size != st.size || row.mtime != st.mtime) {
      val bytes = v.read(p) ?: return
      val h = Seal.hash(bytes)
      if (row != null && h == row.h) { E.store.putFile(row.copy(size = st.size, mtime = st.mtime)); return }
      E.store.putFile(SyncStore.FileRow(p, h, row?.base, st.size, st.mtime, row?.seq ?: 0))
      if (klass(p).cls == "note") SyncLocal.vaultChanged(listOf(p))
    } else return
    val now = E.store.file(p) ?: return
    if (live() && mayPush(p) && !inflightPath.containsKey(p)) {
      when {
        now.h == null && now.base != null -> sendDel(p, now.base)
        now.h != null && now.h != now.base -> pushLocal(v, p, now)
      }
    }
  }

  /** Re-hash only files whose size or mtime changed (the hash cache, §6). False when the folder could not be read:
   *  then nothing is marked deleted, because a failed listing must never look like deletes. */
  private fun refreshLocalSafe(v: SyncVault): Boolean {
    val t0 = System.currentTimeMillis()
    return try {
      refreshRules(v)
      val entries = v.walk(ignore).filter { syncsHere(it.path) }
      val known = E.store.files()
      if (entries.isEmpty() && known.count { it.h != null } > 20) throw IllegalStateException("the vault folder looks empty; is it still there and still allowed?")
      val seen = HashSet<String>(entries.size * 2)
      val notes = ArrayList<String>()
      for (e in entries) {
        seen.add(e.path)
        val row = E.store.file(e.path)
        if (row != null && row.h != null && row.size == e.size && row.mtime == e.mtime) continue
        if (e.size > MAX_FILE_BYTES) continue
        val bytes = v.read(e.path) ?: continue
        val h = Seal.hash(bytes)
        E.store.putFile(SyncStore.FileRow(e.path, h, row?.base, e.size, e.mtime, row?.seq ?: 0))
        if (h != row?.h && klass(e.path).cls == "note") notes.add(e.path)
      }
      for (r in known) {
        if (!syncsHere(r.path)) { E.store.dropFile(r.path); continue }   // became device-local: forget, never delete
        if (r.h != null && r.path !in seen) { E.store.putFile(r.copy(h = null)); if (klass(r.path).cls == "note") notes.add(r.path) }
      }
      SyncLocal.vaultChanged(notes)
      E.prefs.edit().putLong("scanAt", System.currentTimeMillis()).putLong("scanMs", System.currentTimeMillis() - t0).putInt("scanFiles", entries.size).apply()
      true
    } catch (e: Exception) {
      E.fail("Couldn't read the phone vault: ${e.message ?: e.javaClass.simpleName}. Choose the folder again in Settings → Obsidian & sync.")
      false
    }
  }

  /** Send every file the phone changed, added or deleted since the hub last agreed with it. */
  private fun pushChanged(v: SyncVault, skip: Set<String>) {
    val rows = E.store.files()
    val gone = rows.filter { it.h == null && it.base != null && mayPush(it.path) }
    // a mass delete is far more likely a broken folder permission than the owner's intent: stop and ask
    val delOk = gone.size <= DEL_LIMIT || allowDeletes
    if (!delOk) holdLocal(gone.map { it.path })
    if (delOk && allowDeletes && gone.isNotEmpty()) allowDeletes = false
    if (gone.size <= DEL_LIMIT && localHeld.isNotEmpty()) { localHeld = emptyList(); if (JSONObject(E.prefs.getString("hold", "{}")!!).optBoolean("local")) { E.prefs.edit().remove("hold").apply(); cancelHoldNote() } }
    var sent = 0
    for (r in rows) {
      if (sent >= MAX_PUSH_PER_SCAN) break
      if (!mayPush(r.path)) continue
      if (r.path in skip || inflightPath.containsKey(r.path)) continue
      if ((tries[r.path] ?: 0) >= MAX_TRIES) continue
      when {
        r.h == null && r.base == null -> E.store.dropFile(r.path)
        r.h == null -> if (delOk) { sendDel(r.path, r.base!!); sent++ }
        r.h != r.base -> { if (pushLocal(v, r.path, r)) sent++ }
      }
    }
    if (sent > 0) { E.prefs.edit().putLong("pushedAt", System.currentTimeMillis()).apply(); E.setStage("Sending $sent change${if (sent == 1) "" else "s"}"); E.event("send", "sending $sent change${if (sent == 1) "" else "s"}") }
  }
  private fun pushLocal(v: SyncVault, p: String, row: SyncStore.FileRow, withBase: Boolean = false): Boolean {
    if (!syncsHere(p) || !mayPush(p)) return false
    if (row.size > MAX_FILE_BYTES) { if (tries[p] == null) { tries[p] = MAX_TRIES; E.fail("$p is over 20 MB, too big to sync from the phone.") }; return false }
    val bytes = v.read(p) ?: return false
    val h = Seal.hash(bytes)
    val f = JSONObject().put("p", p).put("h", h).put("base", row.base ?: JSONObject.NULL).put("s", bytes.size).put("m", row.mtime)
    if (withBase) { val b = E.store.baseBody(p, row.base); if (b != null) f.put("baseBody", String(b)) else f.put("noBase", true) }
    // a move or copy of media (a new file with the bytes of one deleted in this scan): the hub places it from its copy
    if (!isText(p) && row.base == null && bytes.size > 64 * 1024 && (tries[p] ?: 0) == 0 && E.hub?.resume == true && E.store.files().any { it.h == null && it.base == h }) {
      val fr = E.frame("put", JSONObject(f.toString()).put("enc", "have"))
      track(fr.getString("id"), Inflight(p, h, "put", 0)); E.sendHub(fr); return true
    }
    if (!isText(p) && bytes.size > PART_BYTES) {
      val xfer = E.ulid(); val parts = (bytes.size + PART_BYTES - 1) / PART_BYTES
      track(xfer, Inflight(p, h, "put", tries[p] ?: 0))
      val resumable = E.hub?.resume == true
      for (i in 0 until (if (resumable) 1 else parts)) E.sendHubLazy {
        val off = i * PART_BYTES
        E.frame("put", JSONObject(f.toString()).put("enc", "bin").put("xfer", xfer).put("part", i).put("parts", parts)
          .put("body", Base64.encodeToString(bytes, off, minOf(PART_BYTES, bytes.size - off), Base64.NO_WRAP))
          .apply { if (resumable) put("resumable", true) }).toString()
      }
      return true
    }
    if (isText(p)) f.put("enc", "text").put("body", String(bytes)) else f.put("enc", "bin").put("body", Base64.encodeToString(bytes, Base64.NO_WRAP))
    val fr = E.frame("put", f)
    track(fr.getString("id"), Inflight(p, h, "put", tries[p] ?: 0, bodyFor(p, bytes)))
    E.sendHub(fr)
    return true
  }
  private fun resumeParts(xfer: String, inf: Inflight, from: Int) {
    val v = E.vault() ?: return
    val bytes = v.read(inf.path) ?: run { inflight.remove(xfer); return }
    if (Seal.hash(bytes) != inf.h) { inflight.remove(xfer); inflightPath.remove(inf.path); return }
    val row = E.store.file(inf.path)
    val f = JSONObject().put("p", inf.path).put("h", inf.h).put("base", row?.base ?: JSONObject.NULL).put("s", bytes.size).put("m", row?.mtime ?: 0L)
    val parts = (bytes.size + PART_BYTES - 1) / PART_BYTES
    for (i in maxOf(1, from) until parts) E.sendHubLazy {
      val off = i * PART_BYTES
      E.frame("put", JSONObject(f.toString()).put("enc", "bin").put("xfer", xfer).put("part", i).put("parts", parts)
        .put("body", Base64.encodeToString(bytes, off, minOf(PART_BYTES, bytes.size - off), Base64.NO_WRAP))).toString()
    }
  }
  private fun sendDel(p: String, base: String) {
    val fr = E.frame("del", JSONObject().put("p", p).put("base", base))
    track(fr.getString("id"), Inflight(p, null, "del", tries[p] ?: 0))
    E.sendHub(fr)
  }
  private fun track(id: String, i: Inflight) { inflight[id] = i; inflightPath[i.path] = id }

  // ── big files from the desktop, in parts (chunk.js): kept in the cache until the whole file checks out ──
  private class InPart(val file: File, val p: String, val h: String, val parts: Int, var next: Int = 0, var size: Long = 0)
  private val inParts = HashMap<String, InPart>()
  private fun cacheDir(name: String) = File(E.app.cacheDir, name).apply { mkdirs() }
  private fun dropParts() { inParts.values.forEach { it.file.delete() }; inParts.clear() }
  private fun onPart(m: JSONObject): File? {
    val xfer = m.optString("xfer"); val part = m.optInt("part", -1); val parts = m.optInt("parts", 0); val p = m.optString("p")
    var x = inParts[xfer]
    if (part == 0 && x == null) {
      if (inParts.size >= 4) inParts.remove(inParts.keys.first())?.file?.delete()
      x = InPart(File(cacheDir("sync-in"), xfer.replace(Regex("[^A-Za-z0-9]"), "_")), p, m.optString("h"), parts).also { it.file.writeBytes(ByteArray(0)); inParts[xfer] = it }
    }
    if (x == null || part != x.next || p != x.p || parts != x.parts || m.optString("h") != x.h) {
      x?.let { it.file.delete(); inParts.remove(xfer) }
      ask(p, m.optLong("seq"), "a part went missing"); return null
    }
    val chunk = Base64.decode(m.optString("body"), Base64.NO_WRAP)
    x.size += chunk.size
    if (x.size > MAX_IN_BYTES) { x.file.delete(); inParts.remove(xfer); E.store.skip(p, m.optLong("seq"), "over 100 MB"); E.fail("$p is over 100 MB, too big to sync."); return null }
    x.file.appendBytes(chunk); x.next++
    if (x.next < x.parts) return null
    inParts.remove(xfer)
    return x.file
  }
  private fun fileHash(f: File): String {
    val md = java.security.MessageDigest.getInstance("SHA-256")
    f.inputStream().use { s -> val buf = ByteArray(256 * 1024); while (true) { val n = s.read(buf); if (n < 0) break; md.update(buf, 0, n) } }
    return Seal.hex(md.digest()).substring(0, 32)
  }

  // ── incoming ─────────────────────────────────────────────────────────────────────────────────
  fun onPut(m: JSONObject) {
    val p = m.getString("p"); val seq = m.optLong("seq"); val h = m.optString("h")
    if (!syncsHere(p)) { if (!m.has("xfer") || m.optInt("part") == m.optInt("parts") - 1) E.store.settle(p, seq); return }
    // phone Obsidian is typing in this note: the write waits until it says it saved (or goes quiet), then re-runs
    if (!m.has("xfer") && SyncLocal.isEditing(p)) { SyncLocal.defer(p, m); E.store.expect(p, seq); return }
    val v = E.vault() ?: return
    val ref = if (m.has("xfer")) m.optString("xfer") else m.optString("id")
    var bytes: ByteArray? = null; var file: File? = null
    when {
      m.has("xfer") -> {
        file = onPart(m) ?: return
        if (fileHash(file) != h) { file.delete(); ask(p, seq, "arrived damaged"); return }
      }
      m.optString("enc") == "bin" -> bytes = Base64.decode(m.optString("body"), Base64.NO_WRAP)
      m.optString("enc") == "text" -> bytes = m.optString("body").toByteArray()
      // a patch: ask for the whole file (SYNC_PROTOCOL §5)
      else -> { ask(p, seq, "patch"); return }
    }
    if (bytes != null && Seal.hash(bytes) != h) { ask(p, seq, "arrived damaged"); return }
    if (klass(p).cls == "plugin") { stagePlugin(p, h, seq, ref, bytes, file); return }
    val row = E.store.file(p); val st = v.stat(p)
    if (st != null) {
      val localH = if (row?.h != null && row.size == st.size && row.mtime == st.mtime) row.h else v.hashOf(p)
      if (localH == h) {
        file?.delete()
        E.store.land(p, SyncStore.FileRow(p, h, h, st.size, st.mtime, seq), seq, bodyFor(p, bytes ?: if (isText(p)) v.read(p) else null))
        ackPut(ref, seq, h); return
      }
      // the phone changed this file since the last agreement: our copy goes with its base, the hub merges and
      // sends the result, which lands on top (before v0.7.1 the incoming copy overwrote it)
      if (localH != null && localH != row?.base) {
        file?.delete()
        E.store.expect(p, seq)
        if (!inflightPath.containsKey(p)) {
          val mine = SyncStore.FileRow(p, localH, row?.base, st.size, st.mtime, row?.seq ?: 0)
          E.store.putFile(mine)
          if (live()) pushLocal(v, p, mine)
        }
        return
      }
    }
    try { if (file != null) v.writeFile(p, file) else v.write(p, bytes!!) } catch (e: Exception) { file?.delete(); failWrite(p, seq, ref, e.message ?: "write failed"); return }
    file?.delete()
    if (v.hashOf(p) != h) { failWrite(p, seq, ref, "did not save correctly"); return }
    val now = v.stat(p)
    E.store.land(p, SyncStore.FileRow(p, h, h, now?.size ?: bytes?.size?.toLong() ?: 0L, now?.mtime ?: System.currentTimeMillis(), seq), seq, bodyFor(p, bytes))
    tries.remove(p)
    SyncLocal.changed(p)
    ackPut(ref, seq, h)
    if (E.store.pendingCount() == 0 && E.stage.startsWith("Receiving")) E.setStage("")
  }
  private fun failWrite(p: String, seq: Long, ref: String, why: String) {
    val n = (tries[p] ?: 0) + 1; tries[p] = n
    E.sendHub(E.frame("ack", JSONObject().put("ref", ref).put("ok", false).put("err", "write-failed")))
    if (n < MAX_TRIES) { E.fail("$p $why on the phone; asking again."); ask(p, seq, why) }
    else { E.store.skip(p, seq, "could not be written: $why"); E.fail("$p could not be written on the phone ($why); skipped. Sync now tries again.") }
  }
  private fun ackPut(ref: String, seq: Long, h: String) = E.sendHub(E.frame("ack", JSONObject().put("ref", ref).put("ok", true).put("seq", seq).put("h", h)))

  /** Plugin code lands as a batch (v0.8 §1.2): its files wait in the cache until none came for 2 s, then all are
   *  written and phone Obsidian is told to reload the plugin, so it never runs a half-updated copy. */
  private class Staged(val p: String, val h: String, val seq: Long, val ref: String, val file: File)
  private val staged = HashMap<String, ArrayList<Staged>>()
  private val stageTasks = HashMap<String, ScheduledFuture<*>>()
  private fun pluginOf(p: String) = if (p.startsWith(".obsidian/plugins/")) p.removePrefix(".obsidian/plugins/").substringBefore('/') else p.substringBeforeLast('/')
  private fun stagePlugin(p: String, h: String, seq: Long, ref: String, bytes: ByteArray?, file: File?) {
    val id = pluginOf(p)
    val f = File(cacheDir("plugin-stage"), E.ulid())
    if (file != null) { if (!file.renameTo(f)) { file.copyTo(f, true); file.delete() } } else f.writeBytes(bytes ?: ByteArray(0))
    E.store.expect(p, seq)
    val list = staged.getOrPut(id) { ArrayList() }
    list.filter { it.p == p }.forEach { it.file.delete() }
    list.removeAll { it.p == p }
    list.add(Staged(p, h, seq, ref, f))
    stageTasks[id]?.cancel(false)
    stageTasks[id] = E.sched.schedule(Runnable { E.exec.execute { flushPlugin(id) } }, 2, TimeUnit.SECONDS)
  }
  private fun flushPlugin(id: String) {
    val list = staged.remove(id) ?: return
    stageTasks.remove(id)
    val v = E.vault() ?: run { list.forEach { it.file.delete() }; return }
    var ok = 0
    for (s in list) {
      try { v.writeFile(s.p, s.file) } catch (e: Exception) { s.file.delete(); failWrite(s.p, s.seq, s.ref, e.message ?: "write failed"); continue }
      s.file.delete()
      if (v.hashOf(s.p) != s.h) { failWrite(s.p, s.seq, s.ref, "did not save correctly"); continue }
      val st = v.stat(s.p)
      E.store.land(s.p, SyncStore.FileRow(s.p, s.h, s.h, st?.size ?: 0L, st?.mtime ?: System.currentTimeMillis(), s.seq), s.seq, null)
      ackPut(s.ref, s.seq, s.h); ok++
    }
    if (ok > 0) { SyncLocal.pluginUpdated(id); E.event("plugin", "updated $id from the desktop ($ok file${if (ok == 1) "" else "s"})") }
  }

  fun onDel(m: JSONObject) {
    val p = m.getString("p"); val seq = m.optLong("seq")
    if (!syncsHere(p)) { E.store.settle(p, seq); return }
    if (SyncLocal.isEditing(p)) { SyncLocal.defer(p, m); E.store.expect(p, seq); return }
    val v = E.vault() ?: return
    val row = E.store.file(p)
    // edited here: an edit beats a delete; the push sends it back
    if (row != null && row.h != row.base && klass(p).cls != "plugin") { E.store.settle(p, seq); return }
    v.delete(p); E.store.land(p, null, seq, null); SyncLocal.changed(p)
  }
  fun onMv(m: JSONObject) {
    val from = m.getString("from"); val to = m.getString("to"); val seq = m.optLong("seq")
    if (!syncsHere(from) || !syncsHere(to)) { E.store.settle(to, seq); return }
    val v = E.vault() ?: return
    val bytes = v.read(from) ?: run { ask(to, seq, "moved file missing here"); return }
    try { v.write(to, bytes) } catch (e: Exception) { E.fail("Couldn't move $from to $to: ${e.message}"); ask(to, seq, "move failed"); return }
    if (v.hashOf(to) != Seal.hash(bytes)) { E.fail("Moving $from to $to did not save; asking again."); ask(to, seq, "move did not save"); return }
    v.delete(from)
    if (E.store.file(from) != null) E.store.moveFile(from, to)
    val st = v.stat(to); val h = Seal.hash(bytes)
    E.store.land(to, SyncStore.FileRow(to, h, h, st?.size ?: bytes.size.toLong(), st?.mtime ?: System.currentTimeMillis(), seq), seq, bodyFor(to, bytes))
    SyncLocal.changed(from); SyncLocal.changed(to)
  }
  fun onAck(m: JSONObject) {
    val ref = m.optString("ref")
    if (m.optString("err") == "resume") { inflight[ref]?.let { resumeParts(ref, it, m.optInt("have", 1)) }; return }
    val inf = inflight.remove(ref)?.also { inflightPath.remove(it.path) }
    if (m.optBoolean("ok")) {
      E.store.acked(ref)
      if (inf == null) return
      tries.remove(inf.path)
      val row = E.store.file(inf.path)
      when (inf.kind) {
        // base = what we sent: if the hub merged, its merged copy follows and lands on top of it
        "put" -> if (row != null && row.h == inf.h && inf.h != null) { E.store.putFile(row.copy(base = inf.h)); inf.body?.let { E.store.putBase(inf.path, inf.h, it) } }
        "del" -> if (row == null || row.h == null) E.store.dropFile(inf.path)
      }
      // our own change has its place in the hub's numbering: never replay it to ourselves
      if (!m.optBoolean("merged") && m.optLong("seq") > 0) E.store.seen(m.optLong("seq"))
      return
    }
    val err = m.optString("err")
    E.store.acked(ref)
    if (inf == null) { if (err != "read-only") E.fail("The desktop refused a change: $err"); return }
    when (err) {
      "read-only" -> E.fail("The desktop hub is in read-only mode, so phone changes wait. Set \"mode\": \"live\" in ~/.config/bone-sync/config.json.")
      "edited", "held" -> {}
      "ignored", "one-way" -> { tries[inf.path] = MAX_TRIES; E.event("refused", "${inf.path}: the desktop keeps its own copy ($err)") }
      // the hub no longer has the base this edit was made on: send it along so the merge has the real ancestor
      "need-base" -> { val v = E.vault(); val row = E.store.file(inf.path); if (v != null && row?.h != null) pushLocal(v, inf.path, row, withBase = true) }
      else -> retry(inf, err)
    }
  }
  private fun retry(inf: Inflight, err: String) {
    val n = (tries[inf.path] ?: 0) + 1; tries[inf.path] = n
    if (n >= MAX_TRIES) { E.fail("${inf.path} did not sync after $n tries ($err). It stays on the phone; Sync now tries again."); return }
    val v = E.vault() ?: return
    val row = E.store.file(inf.path) ?: return
    if (inf.kind == "put" && row.h != null) pushLocal(v, inf.path, row) else if (inf.kind == "del" && row.base != null) sendDel(inf.path, row.base)
  }

  // ── big deletes (§9) ─────────────────────────────────────────────────────────────────────────────
  private var allowDeletes = false
  private var localHeld: List<String> = emptyList()
  private fun holdLocal(paths: List<String>) {
    val first = localHeld.isEmpty()
    localHeld = paths
    val o = JSONObject().put("holdId", "local").put("from", "phone").put("src", "phone").put("count", paths.size)
      .put("sample", JSONArray(paths.take(5))).put("local", true).put("at", System.currentTimeMillis())
    E.prefs.edit().putString("hold", o.toString()).apply()
    if (first) { holdNote(paths.size, "on this phone"); E.event("hold", "${paths.size} files deleted on the phone: waiting for your answer") }
    E.status("hold")
  }
  fun onHold(m: JSONObject) {
    SyncLocal.toObsidian(m)
    when (m.optString("op")) {
      "held" -> {
        val first = JSONObject(E.prefs.getString("hold", "{}")!!).optString("holdId") != m.optString("holdId")
        E.prefs.edit().putString("hold", m.toString()).apply()
        if (first) { holdNote(m.optInt("count"), if (m.optString("src") == "desktop") "on the desktop" else "on the phone"); E.event("hold", "${m.optInt("count")} files deleted ${m.optString("src")}: waiting for your answer") }
        E.status("hold")
      }
      "done" -> {
        if (JSONObject(E.prefs.getString("hold", "{}")!!).optString("holdId") == m.optString("holdId")) E.prefs.edit().remove("hold").apply()
        cancelHoldNote(); E.status("hold done")
      }
    }
  }
  /** The owner's answer: "apply" deletes everywhere, "cancel" keeps. */
  fun answerHold(op: String) = E.exec.execute {
    val h = try { JSONObject(E.prefs.getString("hold", "{}")!!) } catch (e: Exception) { JSONObject() }
    E.prefs.edit().remove("hold").apply(); cancelHoldNote()
    if (h.optBoolean("local")) {
      val paths = localHeld; localHeld = emptyList()
      if (op == "apply") { allowDeletes = true; scanAndPush() }
      else { for (p in paths) E.store.dropFile(p); if (paths.isNotEmpty() && E.hub?.ready == true) want(paths) }
    } else if (h.has("holdId") && E.hub?.ready == true) E.sendHub(E.frame("hold", JSONObject().put("op", op).put("holdId", h.optString("holdId"))))
    E.event("hold", if (op == "apply") "you chose: delete everywhere" else "you chose: keep the files")
    E.status("hold answered")
  }
  private const val HOLD_CHANNEL = "sync_alerts"
  private const val HOLD_NOTE = 7429
  private fun holdNote(count: Int, where: String) {
    try {
      val app = E.app
      val nm = app.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
      if (android.os.Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(HOLD_CHANNEL) == null)
        nm.createNotificationChannel(android.app.NotificationChannel(HOLD_CHANNEL, "Sync questions", android.app.NotificationManager.IMPORTANCE_HIGH))
      val open = app.packageManager.getLaunchIntentForPackage(app.packageName)?.let { android.app.PendingIntent.getActivity(app, HOLD_NOTE, it, android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT) }
      val b = if (android.os.Build.VERSION.SDK_INT >= 26) android.app.Notification.Builder(app, HOLD_CHANNEL) else android.app.Notification.Builder(app)
      b.setSmallIcon(Live.smallIcon(app)).setContentTitle("Sync stopped: $count files deleted $where")
        .setContentText("Do you want to sync the deletes? Open Margin → Settings → Obsidian & sync to choose.").setAutoCancel(true)
      open?.let { b.setContentIntent(it) }
      nm.notify(HOLD_NOTE, b.build())
    } catch (e: Exception) { Log.w(TAG, "hold notification: ${e.message}") }
  }
  private fun cancelHoldNote() { try { (E.app.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager).cancel(HOLD_NOTE) } catch (e: Exception) { } }
  /** The hub lost these files (a cancelled big delete on the desktop): push the phone's copies back. */
  fun onRestore(m: JSONObject) {
    val paths = m.optJSONArray("paths") ?: return
    val v = E.vault() ?: return
    for (i in 0 until paths.length()) {
      val p = paths.optString(i)
      if (!syncsHere(p) || !mayPush(p)) continue
      val row = E.store.file(p) ?: continue
      if (row.h != null) { val r = row.copy(base = null); E.store.putFile(r); pushLocal(v, p, r) }
    }
  }
}
