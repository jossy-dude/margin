package app.marginalia.nativebits

import android.util.Log
import org.java_websocket.WebSocket as JWebSocket
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.server.WebSocketServer
import org.json.JSONArray
import org.json.JSONObject
import java.net.InetAddress
import java.net.InetSocketAddress
import java.util.concurrent.Callable
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * The phone's own side (v0.8 SPEC §1.1, §1.5):
 *  · phone Obsidian on 127.0.0.1:7429 is a THIN client: it sends hints ("editing" / "saved" a path) and the shared
 *    timer; Margin tells it which files it rewrote ("changed") so Obsidian re-reads them, and when a plugin was
 *    updated so it reloads. It never sends or receives file contents any more (the two-writer bug, S1–S3, S7).
 *    Pairing needs no code: Margin writes a random key to `.obsidian/plugins/margin-bridge/link.local.json`
 *    (device-local class: never synced) and the plugin reads it;
 *  · the hotspot server: the desktop dials the phone when it joins the phone's hotspot;
 *  · the vault API for Margin's JS: task lines are read and patched here, through the one writer.
 */
internal object SyncLocal {
  private val E = SyncEngine
  private const val TAG = "MarginSync"
  const val LINK_FILE = ".obsidian/plugins/margin-bridge/link.local.json"
  private const val EDIT_QUIET_MS = 30_000L
  private val EXCLUDED = listOf("Conflicts/", "Templates/", ".trash/")

  private var server: WebSocketServer? = null
  private var hotspot: WebSocketServer? = null
  private var obsidian: JWebSocket? = null
  private class OConn(val nonce: String) { var sealIn: Seal.Sealer? = null; var sealOut: Seal.Sealer? = null }
  private var oFails = 0; private var oLastFail = 0L
  private var rekeyId: String? = null
  private var oldPluginNoted = false

  fun obsidianOpen() = obsidian != null
  fun hotspotUp() = hotspot != null

  // ── hints: phone Obsidian is typing in a note ─────────────────────────────────────────────────
  private val editing = HashMap<String, Long>()
  private val deferred = HashMap<String, JSONObject>()
  fun isEditing(p: String): Boolean { val t = editing[p] ?: return false; return System.currentTimeMillis() - t < EDIT_QUIET_MS }
  /** A change for a note being typed in waits (only the newest one per path is kept), then runs again. */
  fun defer(p: String, m: JSONObject) { deferred[p] = m; E.event("wait", "waiting for phone Obsidian to save $p") }
  private fun release(p: String) {
    editing.remove(p)
    // what phone Obsidian saved goes first: it is pushed with its base, so the hub merges it with the waiting change
    SyncFiles.scanPath(p)
    val m = deferred.remove(p) ?: return
    when (m.optString("t")) { "put" -> SyncFiles.onPut(m); "del" -> SyncFiles.onDel(m) }
  }
  /** Run by the scan tick: an "editing" hint with no "saved" after 30 s (Obsidian killed) lets the change through. */
  fun expireEditing() { for (p in editing.filterValues { System.currentTimeMillis() - it >= EDIT_QUIET_MS }.keys.toList()) release(p) }
  private fun onHint(op: String, p: String) {
    if (!SyncFiles.syncsHere(p)) return
    when (op) {
      "editing" -> editing[p] = System.currentTimeMillis()
      "saved", "closed" -> release(p)
    }
  }

  // ── telling the others: phone Obsidian re-reads, Margin's JS re-parses notes ─────────────────────
  /** Margin wrote `p` in the vault: phone Obsidian re-reads it (and Margin's JS re-parses it if it is a note). */
  fun changed(p: String) {
    obsidian?.let { sendO(it, JSONObject().put("v", SyncEngine.V).put("t", "changed").put("id", E.ulid()).put("p", p)) }
    if (SyncFiles.klass(p).cls == "note") vaultChanged(listOf(p))
  }
  fun pluginUpdated(id: String) {
    obsidian?.let { sendO(it, JSONObject().put("v", SyncEngine.V).put("t", "changed").put("id", E.ulid()).put("p", ".obsidian/plugins/$id/manifest.json").put("plugin", id)) }
  }
  private val vaultQueue = LinkedHashSet<String>()
  private var vaultTask: ScheduledFuture<*>? = null
  /** Notes changed: kept in sync.db for a JS that is not running, and an event 300 ms after the last one. */
  fun vaultChanged(paths: Collection<String>) {
    val notes = paths.filter { it.endsWith(".md", ignoreCase = true) && EXCLUDED.none { x -> it.startsWith(x) } }
    if (notes.isEmpty()) return
    E.store.noteVaultChange(notes)
    synchronized(vaultQueue) { vaultQueue.addAll(notes) }
    vaultTask?.cancel(false)
    vaultTask = E.sched.schedule(Runnable {
      val out = synchronized(vaultQueue) { val l = vaultQueue.toList(); vaultQueue.clear(); l }
      if (out.isNotEmpty()) E.onVaultChanged?.invoke(JSONArray(out).toString())
    }, 300, TimeUnit.MILLISECONDS)
  }
  fun toObsidian(m: JSONObject) { obsidian?.let { sendO(it, m) } }

  // ── phone Obsidian on loopback ─────────────────────────────────────────────────────────────────
  /** The key phone Obsidian proves itself with: made once, written where only this phone's vault has it. */
  private fun ensureLinkKey() {
    val key = KeyVault.get(E.app, "obsidian") ?: Seal.random(32).also { KeyVault.put(E.app, "obsidian", it); E.prefs.edit().putBoolean("oKeyWeak", false).apply() }
    val v = E.vault() ?: return
    val text = JSONObject().put("key", Seal.hex(key)).put("port", SyncEngine.PORT_PHONE).put("v", 1).put("note", "Written by Margin for phone Obsidian. Never synced.").toString()
    try { if (v.read(LINK_FILE)?.let { String(it) } != text) v.write(LINK_FILE, text.toByteArray()) } catch (e: Exception) { Log.w(TAG, "link file: ${e.message}") }
  }
  /** The 6-digit code from before v0.8 still works once (older margin-bridge on the phone). */
  fun obsidianCode(): String {
    val n = (java.security.SecureRandom().nextInt(900000) + 100000).toString()
    KeyVault.put(E.app, "obsidian-pending", Seal.hkdf(n.toByteArray(), "bone-sync/1 local".toByteArray(), "bone-sync/1 obsidian".toByteArray()))
    E.prefs.edit().putLong("oCodeUntil", System.currentTimeMillis() + 10 * 60_000).apply()
    return n
  }
  private fun oKeys(): List<Pair<String, ByteArray>> = listOfNotNull(
    KeyVault.get(E.app, "obsidian")?.let { "current" to it },
    KeyVault.get(E.app, "obsidian-next")?.let { "next" to it },
    if (System.currentTimeMillis() < E.prefs.getLong("oCodeUntil", 0)) KeyVault.get(E.app, "obsidian-pending")?.let { "code" to it } else null)

  fun startLoopback() {
    try { ensureLinkKey() } catch (e: Exception) { Log.w(TAG, "link key: ${e.message}") }
    if (server != null) return
    server = object : WebSocketServer(InetSocketAddress(InetAddress.getByName("127.0.0.1"), SyncEngine.PORT_PHONE)) {
      override fun onOpen(conn: JWebSocket, handshake: ClientHandshake) {
        E.exec.execute {
          if (!conn.isOpen) return@execute
          val oc = OConn(Seal.nonce())
          conn.setAttachment(oc)
          sendSafe(conn, JSONObject().put("v", SyncEngine.V).put("t", "challenge").put("id", E.ulid()).put("vault", E.vaultId).put("from", E.deviceId)
            .put("nonce", oc.nonce).put("serverTime", System.currentTimeMillis() + (E.hub?.offset ?: 0)).put("hub", E.deviceId).toString())
        }
      }
      override fun onMessage(conn: JWebSocket, message: String) { E.exec.execute { onObsidianFrame(conn, message) } }
      override fun onClose(conn: JWebSocket, code: Int, reason: String?, remote: Boolean) { E.exec.execute { if (obsidian === conn) obsidianGone() } }
      override fun onError(conn: JWebSocket?, ex: Exception) { Log.w(TAG, "loopback: ${ex.message}") }
      override fun onStart() { Log.i(TAG, "loopback server on 127.0.0.1:${SyncEngine.PORT_PHONE}") }
    }.apply { isReuseAddr = true; connectionLostTimeout = 60; start() }
  }
  fun stopServers() {
    try { server?.stop(500) } catch (e: Exception) { }
    try { hotspot?.stop(500) } catch (e: Exception) { }
    server = null; hotspot = null; obsidian = null
  }
  /** Phone Obsidian closed: nothing it was typing in is "being edited" any more, so waiting changes go through. */
  private fun obsidianGone() {
    obsidian = null
    for (p in editing.keys.toList() + deferred.keys.toList()) release(p)
    E.event("obsidian", "phone Obsidian closed")
    E.status("obsidian closed")
  }
  private fun onObsidianFrame(conn: JWebSocket, raw: String) {
    val oc = conn.getAttachment<OConn>() ?: return
    val text = try { oc.sealIn?.unseal(raw) ?: raw } catch (e: Exception) { Log.w(TAG, "bad sealed frame from Obsidian: ${e.message}"); conn.close(4003); if (obsidian === conn) obsidianGone(); return }
    val m = try { JSONObject(text) } catch (e: Exception) { return }
    if (m.optString("v") != SyncEngine.V) return
    if (oc.sealIn == null) { onObsidianHello(conn, oc, m); return }
    if (obsidian !== conn) { conn.close(4009); return }
    when (m.optString("t")) {
      "ping" -> sendO(conn, JSONObject().put("v", SyncEngine.V).put("t", "pong").put("id", E.ulid()).put("serverTime", System.currentTimeMillis() + (E.hub?.offset ?: 0)))
      "ack" -> if (m.optString("ref") == rekeyId && m.optBoolean("ok")) {
        KeyVault.get(E.app, "obsidian-next")?.let { KeyVault.put(E.app, "obsidian", it); KeyVault.remove(E.app, "obsidian-next") }
        E.prefs.edit().putBoolean("oKeyWeak", false).apply(); rekeyId = null
        try { ensureLinkKey() } catch (e: Exception) { }
      }
      "hint" -> onHint(m.optString("op"), m.optString("p"))
      "hold" -> if (E.hub?.ready == true) E.sendHub(m)
      "timer" -> {
        E.store.inbox("timer", text); E.onTimer?.invoke(text)
        if (E.hub?.ready == true) E.sendHub(m) else E.store.enqueue(m.optString("id"), m.toString())
      }
      // a margin-bridge from before v0.8 still sends files: Margin is the only writer now, so they are dropped
      "put", "del", "mv", "want", "manifest", "bridge" -> if (!oldPluginNoted) { oldPluginNoted = true; E.fail("Phone Obsidian runs an old Margin Bridge that still sends files. Update margin-bridge to 0.8 on the desktop; it reaches the phone by sync.") }
      "bye" -> conn.close()
    }
  }
  private fun onObsidianHello(conn: JWebSocket, oc: OConn, m: JSONObject) {
    if (m.optString("t") != "hello") { conn.close(4001); return }
    // no ban (a stranger's failures must not lock phone Obsidian out): after a wrong proof, hellos are turned away as
    // "busy" for a few seconds
    val now = System.currentTimeMillis()
    if (oFails > 0 && now - oLastFail < minOf(oFails, 30) * 1000L) { sendO(conn, JSONObject().put("v", SyncEngine.V).put("t", "bye").put("id", E.ulid()).put("reason", "busy")); conn.close(4029); return }
    val dev = m.optString("deviceId")
    val vid = E.vaultId ?: ""
    val hit = oKeys().firstOrNull { Seal.sameHex(m.optString("proof"), Seal.proof(it.second, oc.nonce, dev, vid)) }
    if (hit == null || m.optInt("seal") != Seal.SEAL_VERSION) {
      if (hit == null) { oFails++; oLastFail = now }
      sendO(conn, JSONObject().put("v", SyncEngine.V).put("t", "bye").put("id", E.ulid()).put("reason", if (hit == null) "bad-proof" else "version")); conn.close(4003); return
    }
    oFails = 0
    val key = hit.second
    if (hit.first == "next") { KeyVault.put(E.app, "obsidian", key); KeyVault.remove(E.app, "obsidian-next") }
    if (hit.first == "code") KeyVault.remove(E.app, "obsidian-pending")
    obsidian?.let { if (it !== conn) try { it.close(4009) } catch (e: Exception) { } }
    obsidian = conn
    sendSafe(conn, JSONObject().put("v", SyncEngine.V).put("t", "welcome").put("id", E.ulid()).put("vault", E.vaultId).put("from", E.deviceId)
      .put("sessionId", E.ulid()).put("head", E.store.cursor).put("serverTime", System.currentTimeMillis() + (E.hub?.offset ?: 0))
      .put("hub", E.deviceId).put("proof", Seal.proof(key, m.optString("nonce"), E.deviceId, vid)).put("sealed", true).put("seal", Seal.SEAL_VERSION)
      .put("mode", "hints").put("hubOnline", E.hub?.ready == true).put("files", false).toString())
    val (c2h, h2c) = Seal.sessionKeys(key, oc.nonce, m.optString("nonce"))
    oc.sealIn = Seal.Sealer(c2h); oc.sealOut = Seal.Sealer(h2c)
    // a key that came from the 6-digit code is replaced by a random one now that the link is sealed
    if (hit.first == "code") {
      val next = Seal.random(32); KeyVault.put(E.app, "obsidian-next", next); KeyVault.put(E.app, "obsidian", key)
      val r = JSONObject().put("v", SyncEngine.V).put("t", "rekey").put("id", E.ulid()).put("vault", E.vaultId).put("from", E.deviceId).put("key", Seal.hex(next))
      rekeyId = r.getString("id"); sendO(conn, r)
    }
    oldPluginNoted = false
    E.event("obsidian", "phone Obsidian connected (${m.optString("app", "?")})")
    E.status("obsidian connected")
    E.prefs.getString("presence", null)?.let { sendO(conn, JSONObject().put("v", SyncEngine.V).put("t", "presence").put("id", E.ulid()).put("peers", JSONArray(it))) }
  }
  private fun sendO(conn: JWebSocket, m: JSONObject) {
    val oc = conn.getAttachment<OConn>()
    val text = m.toString()
    sendSafe(conn, oc?.sealOut?.seal(text) ?: text)
  }
  /** The only place a Java-WebSocket socket is written: a socket that closed meanwhile is skipped, never thrown. */
  private fun sendSafe(conn: JWebSocket, text: String): Boolean {
    if (!conn.isOpen) return false
    return try { conn.send(text); true } catch (e: Exception) { Log.w(TAG, "send on a closed socket: ${e.message}"); false }
  }

  // ── the hotspot: the desktop dials ws://<phone>:7429 and plays the hub ─────────────────────────
  fun hotspotOn(addr: InetAddress) = E.exec.execute {
    if (hotspot != null || !E.paired) return@execute
    hotspot = object : WebSocketServer(InetSocketAddress(addr, SyncEngine.PORT_PHONE)) {
      override fun onOpen(conn: JWebSocket, handshake: ClientHandshake) {
        E.exec.execute {
          if (E.hub != null) { conn.close(4009); return@execute }
          val l = SyncEngine.Link({ sendSafe(conn, it) }, { try { conn.close() } catch (e: Exception) { } }, "Phone hotspot", conn.remoteSocketAddress?.address?.hostAddress ?: "?")
          E.hub = l
          conn.setAttachment(l)
          E.sched.schedule(Runnable { E.exec.execute { if (E.hub === l && !l.ready) { l.close(); E.dropHub("handshake timeout") } } }, 8, TimeUnit.SECONDS)
        }
      }
      override fun onMessage(conn: JWebSocket, message: String) { E.exec.execute { (conn.getAttachment<SyncEngine.Link>())?.let { if (it === E.hub) E.onHubFrame(it, message) } } }
      override fun onClose(conn: JWebSocket, code: Int, reason: String?, remote: Boolean) { E.exec.execute { if (conn.getAttachment<SyncEngine.Link>() === E.hub) E.dropHub("hotspot closed") } }
      override fun onError(conn: JWebSocket?, ex: Exception) { Log.w(TAG, "hotspot: ${ex.message}") }
      override fun onStart() { Log.i(TAG, "hotspot server on ${addr.hostAddress}:${SyncEngine.PORT_PHONE}"); E.event("link", "hotspot on: waiting for the desktop to join") }
    }.apply { isReuseAddr = true; connectionLostTimeout = 60; start() }
  }
  fun hotspotOff() = E.exec.execute { try { hotspot?.stop(500) } catch (e: Exception) { }; hotspot = null }

  // ── the vault API for Margin's JS (v0.8 §1.5): reads and writes go through the one phone writer ──
  /** Runs `f` on the sync thread and waits (the JS side calls these from Expo's background queue). */
  private fun <T> onSync(f: () -> T): T = E.pool.submit(Callable { f() }).get(30, TimeUnit.SECONDS)
  private fun excluded(p: String) = EXCLUDED.any { p.startsWith(it) }

  /**
   * Notes for the task parser: `known` = {path: hash} JS already parsed; `only` = paths to look at (empty = all
   * notes). Returns {files: [{p, h, text?}], gone: [p]}; text is sent only when the hash differs from `known`.
   * Hashes come from sync.db when size and mtime match, so an unchanged vault reads almost nothing.
   */
  fun vaultFiles(knownJson: String, onlyJson: String): String {
    val v = E.vault() ?: return JSONObject().put("error", "no vault").toString()
    val known = try { JSONObject(knownJson) } catch (e: Exception) { JSONObject() }
    val only = try { JSONArray(onlyJson) } catch (e: Exception) { JSONArray() }
    val out = JSONArray(); val gone = JSONArray()
    val list: List<SyncVault.Entry> = if (only.length() > 0) {
      (0 until only.length()).mapNotNull { i -> val p = only.optString(i); val st = v.stat(p); if (st == null) { gone.put(p); null } else SyncVault.Entry(p, st.size, st.mtime) }
    } else v.walk(SyncIgnore(v.read(".bone-sync-ignore")?.let { String(it) } ?: SyncIgnore.DEFAULT))
    val seen = HashSet<String>()
    for (e in list) {
      if (!e.path.endsWith(".md", ignoreCase = true) || excluded(e.path) || e.path.startsWith(".obsidian/") || SyncFiles.klass(e.path).cls != "note") continue
      seen.add(e.path)
      val row = E.store.file(e.path)
      val cached = if (row?.h != null && row.size == e.size && row.mtime == e.mtime) row.h else null
      if (cached != null && known.optString(e.path) == cached) { out.put(JSONObject().put("p", e.path).put("h", cached)); continue }
      val bytes = v.read(e.path) ?: continue
      val h = Seal.hash(bytes)
      out.put(if (known.optString(e.path) == h) JSONObject().put("p", e.path).put("h", h) else JSONObject().put("p", e.path).put("h", h).put("text", String(bytes)))
    }
    if (only.length() == 0) { val it = known.keys(); while (it.hasNext()) { val p = it.next(); if (p !in seen) gone.put(p) } }
    return JSONObject().put("files", out).put("gone", gone).toString()
  }
  fun vaultRead(p: String): String? = E.vault()?.read(p)?.let { String(it) }
  /**
   * Compare-and-swap write of a note (a task patch, a new task, a generated note). `expect` = the hash JS read
   * ("" = the file must not exist yet, "*" = any: Margin's own single-writer notes). Answers "ok:<hash>",
   * "changed:<hash>" (re-read and patch again), "deferred" (phone Obsidian is typing in it; try after the next
   * vault event) or "error:<why>". The write goes out to the desktop at once.
   */
  fun vaultEdit(p: String, expect: String, text: String): String = onSync {
    val v = E.vault() ?: return@onSync "error:no vault folder"
    val k = SyncFiles.klass(p)
    if (k.cls != "note" && k.cls != "single" && k.cls != "file") return@onSync "error:not a note"
    if (excluded(p) || p.contains("..")) return@onSync "error:bad path"
    if (isEditing(p)) return@onSync "deferred"
    val cur = v.read(p); val curH = cur?.let { Seal.hash(it) }
    if (expect != "*" && expect != (curH ?: "")) return@onSync "changed:${curH ?: ""}"
    val bytes = text.toByteArray()
    val h = Seal.hash(bytes)
    if (h == curH) return@onSync "ok:$h"
    try { v.write(p, bytes) } catch (e: Exception) { return@onSync "error:${e.message ?: "write failed"}" }
    if (v.hashOf(p) != h) return@onSync "error:did not save"
    val st = v.stat(p); val row = E.store.file(p)
    E.store.putFile(SyncStore.FileRow(p, h, row?.base, st?.size ?: bytes.size.toLong(), st?.mtime ?: System.currentTimeMillis(), row?.seq ?: 0))
    obsidian?.let { sendO(it, JSONObject().put("v", SyncEngine.V).put("t", "changed").put("id", E.ulid()).put("p", p)) }
    SyncFiles.scanPath(p)
    "ok:$h"
  }
  fun vaultChanges(): String = JSONArray(E.store.takeVaultChanges()).toString()
}
