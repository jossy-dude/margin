package app.marginalia.nativebits

import android.content.Context
import android.util.Base64
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.java_websocket.WebSocket as JWebSocket
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.server.WebSocketServer
import org.json.JSONArray
import org.json.JSONObject
import java.net.InetAddress
import java.net.InetSocketAddress
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Margin as the phone's sync hub (SYNC_ANDROID.md, SYNC_PROTOCOL.md "M"):
 *   · client of the desktop hub H (OkHttp WebSocket, sealed with the pair key);
 *   · server for phone Obsidian O on 127.0.0.1:7429 (Java-WebSocket, plain on loopback), relaying O ⇄ H;
 *   · server on the hotspot address while the hotspot is on: the desktop dials in and H sends the challenge,
 *     so on that socket Margin plays the client;
 *   · writer of the phone vault (SyncVault) for changes that arrive while O is not connected.
 * All protocol work runs on one single-thread executor, so frames are handled in order without locks.
 */
object SyncEngine {
  private const val TAG = "MarginSync"
  const val PORT_HUB = 7428
  const val PORT_PHONE = 7429
  private const val V = "bone-sync/1"
  private const val PREFS = "margin_sync"

  val exec = Executors.newSingleThreadExecutor { r -> Thread(r, "margin-sync").apply { isDaemon = true } }
  private lateinit var app: Context
  private val http by lazy { OkHttpClient.Builder().pingInterval(0, TimeUnit.MILLISECONDS).connectTimeout(3, TimeUnit.SECONDS).readTimeout(0, TimeUnit.MILLISECONDS).build() }

  /** Listeners in JS land (the module forwards these as events). */
  var onStatus: ((JSONObject) -> Unit)? = null
  var onBridgeRows: ((String) -> Unit)? = null
  var onTimer: ((String) -> Unit)? = null

  fun init(c: Context) { if (!::app.isInitialized) app = c.applicationContext }
  private val prefs get() = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private val store get() = SyncStore.get(app)

  // ── identity and pairing ──────────────────────────────────────────────────────────────────────
  val deviceId: String get() = prefs.getString("deviceId", null) ?: Seal.newId().also { prefs.edit().putString("deviceId", it).apply() }
  val paired: Boolean get() = prefs.getString("vaultId", null) != null && KeyVault.get(app, "hub") != null
  private val vaultId get() = prefs.getString("vaultId", null)
  private val hubId get() = prefs.getString("hubId", null)
  private val hubKey get() = KeyVault.get(app, "hub")

  /** Pair from the QR text (`bone-sync://pair?...&key=`) or 8 words + the hub/vault ids from the QR-less form
   *  `words|vaultId|hubId|addr`. Returns null on success, else a sentence for the owner. */
  fun pair(text: String): String? {
    val t = text.trim()
    var key: ByteArray? = null; var vault: String? = null; var hub: String? = null; var addrs = ""
    if (t.startsWith("bone-sync://pair")) {
      val u = android.net.Uri.parse(t)
      vault = u.getQueryParameter("vault"); hub = u.getQueryParameter("hub"); addrs = u.getQueryParameter("addr") ?: ""
      key = u.getQueryParameter("key")?.let { Base64.decode(it, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING) }
    } else {
      val parts = t.split("|")
      if (parts.size >= 3) {
        vault = parts[1].trim(); hub = parts[2].trim(); addrs = parts.getOrNull(3)?.trim() ?: ""
        key = Seal.wordsToCode(parts[0])?.let { Seal.keyFromCode(it, vault) }
      }
    }
    if (key == null || key.size != 32 || vault.isNullOrEmpty() || hub.isNullOrEmpty()) return "That code is not a Bone sync pairing code."
    KeyVault.put(app, "hub", key)
    prefs.edit().putString("vaultId", vault).putString("hubId", hub).putString("addrs", addrs).apply()
    store.cursor = 0
    status("paired")
    return null
  }
  fun forget() {
    KeyVault.remove(app, "hub"); KeyVault.remove(app, "obsidian")
    prefs.edit().remove("vaultId").remove("hubId").remove("addrs").remove("hints").apply()
    store.cursor = 0
    disconnect("forget")
  }
  /** The vault folder (SAF tree) and its Obsidian name, from JS settings. */
  fun configure(vaultUri: String?, vaultName: String?) {
    prefs.edit().putString("vaultUri", vaultUri).putString("vaultName", vaultName).apply()
  }
  private fun vault(): SyncVault? = prefs.getString("vaultUri", null)?.let { try { SyncVault(app, it) } catch (e: Exception) { null } }

  // ── the desktop link ──────────────────────────────────────────────────────────────────────────
  private class Link(val send: (String) -> Unit, val close: () -> Unit, val loopback: Boolean) {
    var nonce: String? = null; var serverNonce: String? = null
    var sealKey: ByteArray? = null; var ready = false; var mode: String? = null; var offset = 0L
  }
  private var hub: Link? = null
  private var hubWs: WebSocket? = null
  private var dialing = false
  private var lastError: String? = null
  val live: Boolean get() = hub?.ready == true

  /** Dial the hub: cached hint for this network first, then the addresses from pairing. */
  fun connect(fp: String?) = exec.execute {
    if (!paired || hub != null || dialing) return@execute
    val hints = JSONObject(prefs.getString("hints", "{}")!!)
    val cands = LinkedHashSet<String>()
    if (fp != null) hints.optString(fp).takeIf { it.isNotEmpty() }?.let { cands.add(it) }
    prefs.getString("addrs", "")!!.split(",").map { it.trim() }.filter { it.isNotEmpty() }.forEach { cands.add(it) }
    prefs.getString("manualAddr", null)?.let { if (it.isNotBlank()) cands.add(it.trim()) }
    if (cands.isEmpty()) { status("no hub address"); return@execute }
    dialing = true
    tryDial(cands.toList(), 0, fp)
  }
  private fun tryDial(list: List<String>, i: Int, fp: String?) {
    if (i >= list.size) { dialing = false; store.count("err", 1, "no hub answered"); status("hub not found"); return }
    val addr = list[i]
    val req = Request.Builder().url("ws://$addr").build()
    store.count("connects")
    hubWs = http.newWebSocket(req, object : WebSocketListener() {
      override fun onOpen(webSocket: WebSocket, response: Response) {
        exec.execute {
          dialing = false
          hub = Link({ webSocket.send(it) }, { webSocket.close(1000, null) }, false)
          if (fp != null) { val h = JSONObject(prefs.getString("hints", "{}")!!); h.put(fp, addr); prefs.edit().putString("hints", h.toString()).apply() }
        }
      }
      override fun onMessage(webSocket: WebSocket, text: String) { exec.execute { hub?.let { onHubFrame(it, text) } } }
      override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { exec.execute { dropHub("closed $code") } }
      override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
        exec.execute {
          if (hub == null && dialing) tryDial(list, i + 1, fp) else dropHub(t.message ?: "failure")
        }
      }
    })
  }
  private fun dropHub(why: String) {
    if (hub == null && !dialing) return
    hub = null; hubWs = null; dialing = false
    Log.i(TAG, "hub link down: $why")
    status("hub link down")
  }
  fun disconnect(why: String) = exec.execute {
    hub?.let { sendHub(frame("bye", JSONObject().put("reason", why))); it.close() }
    hubWs?.close(1000, why)
    hub = null; hubWs = null; dialing = false
    status("disconnected")
  }
  fun ping() = exec.execute { if (hub?.ready == true) sendHub(frame("ping", JSONObject())) }

  private fun frame(t: String, fields: JSONObject): JSONObject = fields.put("v", V).put("t", t).put("id", ulid())
    .put("vault", vaultId).put("from", deviceId)
  private fun ulid(): String = java.lang.Long.toString(System.currentTimeMillis(), 32).uppercase().padStart(10, '0') + Seal.newId().substring(0, 16)

  private fun sendHub(m: JSONObject) {
    val l = hub ?: return
    val text = m.toString()
    store.count("tx", text.length.toLong())
    l.send(l.sealKey?.let { Seal.seal(it, text) } ?: text)
  }

  private fun onHubFrame(l: Link, raw: String) {
    store.count("rx", raw.length.toLong())
    val text = try { l.sealKey?.let { Seal.unseal(it, raw) } ?: raw } catch (e: Exception) { Log.w(TAG, "bad seal"); l.close(); return }
    val m = try { JSONObject(text) } catch (e: Exception) { return }
    if (m.optString("v") != V) return
    val key = hubKey ?: return
    when (m.optString("t")) {
      "challenge" -> {
        if (hubId != null && m.optString("hub", hubId!!) != hubId) { l.close(); return }
        l.serverNonce = m.getString("nonce"); l.nonce = Seal.nonce()
        val hello = frame("hello", JSONObject().put("deviceId", deviceId).put("name", "Margin").put("role", "phone-hub").put("app", "0.7.0")
          .put("proof", Seal.proof(key, l.serverNonce!!, deviceId, vaultId!!)).put("nonce", l.nonce).put("cursor", store.cursor).put("clientTime", System.currentTimeMillis()))
        l.send(hello.toString())
      }
      "welcome" -> {
        val want = Seal.proof(key, l.nonce ?: return, m.optString("hub"), vaultId!!)
        if (!Seal.sameHex(m.optString("proof"), want) || m.optString("hub") != hubId) { Log.w(TAG, "hub failed its proof"); store.count("err", 1, "hub failed its proof"); l.close(); return }
        if (m.optBoolean("sealed")) l.sealKey = Seal.sessionKey(key, l.serverNonce!!, l.nonce!!)
        l.ready = true; l.mode = m.optString("mode"); l.offset = m.optLong("serverTime") - System.currentTimeMillis()
        prefs.edit().putLong("lastOk", System.currentTimeMillis()).apply()
        status("live")
        flushOutbox()
      }
      "manifest" -> onManifest(m)
      "put" -> onPut(m)
      "del" -> onDel(m)
      "mv" -> onMv(m)
      "ack" -> onAck(m)
      "bridge" -> { val rows = m.optJSONObject("rows")?.toString() ?: return; store.inbox("bridge", rows); onBridgeRows?.invoke(rows); toObsidian(m) }
      "timer" -> { store.inbox("timer", text); onTimer?.invoke(text); toObsidian(m) }
      "presence" -> { prefs.edit().putString("presence", m.optJSONArray("peers")?.toString() ?: "[]").apply(); toObsidian(m); status("presence") }
      "conflict" -> toObsidian(m)
      "pong" -> l.offset = m.optLong("serverTime") - System.currentTimeMillis()
      "bye" -> { lastError = m.optString("reason"); store.count("err", 1, "bye: $lastError"); l.close() }
    }
  }

  // ── files ────────────────────────────────────────────────────────────────────────────────────
  private fun isText(p: String) = Regex("\\.(md|canvas|base|txt|css|js|mjs|py|csv|json)$", RegexOption.IGNORE_CASE).containsMatchIn(p)

  /** The hub's manifest. Read-only hub (rollout step 1): answer with ours so it can log the differences.
   *  Live: want what changed there; push what changed here (H merges if both did). */
  private fun onManifest(m: JSONObject) {
    if (obsidian != null) { toObsidian(m); return }   // O is open: it reconciles through the vault API
    val v = vault() ?: run { status("pick the vault folder"); return }
    val files = m.optJSONArray("files") ?: JSONArray()
    if (hub?.mode == "read-only" || m.optBoolean("full")) refreshLocal(v)
    if (hub?.mode == "read-only") {
      val arr = JSONArray()
      for (r in store.files()) arr.put(JSONObject().put("p", r.path).put("h", r.h).put("s", r.size).put("m", r.mtime))
      sendHub(frame("manifest", JSONObject().put("full", true).put("files", arr)))
      return
    }
    val want = JSONArray()
    for (i in 0 until files.length()) {
      val f = files.getJSONObject(i); val p = f.getString("p"); val h = if (f.isNull("h")) null else f.optString("h")
      val row = store.file(p)
      when {
        h == null -> if (row != null && row.h == row.base) { v.delete(p); store.dropFile(p) }
        row == null -> want.put(p)
        row.h == h -> store.putFile(row.copy(base = h, seq = f.optLong("seq")))
        row.h == row.base -> want.put(p)
        else -> pushLocal(v, p, row)
      }
    }
    if (want.length() > 0) sendHub(frame("want", JSONObject().put("paths", want)))
    store.cursor = maxOf(store.cursor, m.optLong("head"))
  }
  /** Re-hash only files whose size or mtime changed (the hash cache, §6). */
  private fun refreshLocal(v: SyncVault) {
    val ig = SyncIgnore(v.read(".bone-sync-ignore")?.let { String(it) } ?: SyncIgnore.DEFAULT)
    val seen = HashSet<String>()
    for (e in v.walk(ig)) {
      seen.add(e.path)
      val row = store.file(e.path)
      if (row != null && row.size == e.size && row.mtime == e.mtime) continue
      val bytes = v.read(e.path) ?: continue
      store.putFile(SyncStore.FileRow(e.path, Seal.hash(bytes), row?.base, e.size, e.mtime, row?.seq ?: 0))
    }
    for (r in store.files()) if (r.path !in seen) store.putFile(r.copy(h = null))
  }
  private fun pushLocal(v: SyncVault, p: String, row: SyncStore.FileRow) {
    val bytes = v.read(p) ?: return
    val f = JSONObject().put("p", p).put("h", Seal.hash(bytes)).put("base", row.base ?: JSONObject.NULL).put("s", bytes.size).put("m", row.mtime)
    if (isText(p)) f.put("enc", "text").put("body", String(bytes)) else f.put("enc", "bin").put("body", Base64.encodeToString(bytes, Base64.NO_WRAP))
    val fr = frame("put", f)
    store.enqueue(fr.getString("id"), fr.toString())
    sendHub(fr)
  }
  private fun onPut(m: JSONObject) {
    store.cursor = maxOf(store.cursor, m.optLong("seq"))
    if (obsidian != null) { toObsidian(m); return }
    val v = vault() ?: return
    val p = m.getString("p")
    val bytes: ByteArray = when (m.optString("enc")) {
      "bin" -> Base64.decode(m.optString("body"), Base64.NO_WRAP)
      "text" -> m.optString("body").toByteArray()
      else -> { // a patch: we keep no text bodies yet, so ask for the whole file (SYNC_PROTOCOL §5: patch only when the receiver has base)
        sendHub(frame("want", JSONObject().put("paths", JSONArray().put(p)))); return
      }
    }
    val h = m.optString("h")
    if (Seal.hash(bytes) != h) { store.count("err", 1, "hash mismatch on $p"); return }
    try { v.write(p, bytes) } catch (e: Exception) { store.count("err", 1, "write $p: ${e.message}"); return }
    val st = v.stat(p)
    store.putFile(SyncStore.FileRow(p, h, h, st?.size ?: bytes.size.toLong(), st?.mtime ?: System.currentTimeMillis(), m.optLong("seq")))
    sendHub(frame("ack", JSONObject().put("ref", m.optString("id")).put("ok", true).put("seq", m.optLong("seq")).put("h", h)))
  }
  private fun onDel(m: JSONObject) {
    store.cursor = maxOf(store.cursor, m.optLong("seq"))
    if (obsidian != null) { toObsidian(m); return }
    val v = vault() ?: return
    val p = m.getString("p"); val row = store.file(p)
    if (row != null && row.h != row.base) return  // edited here: an edit beats a delete; it is pushed on the next manifest
    v.delete(p); store.dropFile(p)
  }
  private fun onMv(m: JSONObject) {
    store.cursor = maxOf(store.cursor, m.optLong("seq"))
    if (obsidian != null) { toObsidian(m); return }
    val v = vault() ?: return
    val from = m.getString("from"); val to = m.getString("to")
    val bytes = v.read(from) ?: run { sendHub(frame("want", JSONObject().put("paths", JSONArray().put(to)))); return }
    v.write(to, bytes); v.delete(from)
    store.file(from)?.let { store.dropFile(from); store.putFile(it.copy(path = to)) }
  }
  private fun onAck(m: JSONObject) {
    val ref = m.optString("ref")
    if (fromObsidian.remove(ref)) { toObsidian(m); return }
    if (m.optBoolean("ok")) store.acked(ref)
    else if (m.optString("err") == "read-only") store.acked(ref)  // read-only hub: nothing to retry
  }
  private fun flushOutbox() { for ((_, frame) in store.outbox()) hub?.let { sendHub(JSONObject(frame)) } }

  /** Margin's own rows (tasks, events, sessions) from JS, debounced there (750 ms). */
  fun pushBridge(rowsJson: String) = exec.execute {
    val fr = frame("bridge", JSONObject().put("rows", JSONObject(rowsJson)))
    if (hub?.ready == true) sendHub(fr) else store.enqueue(fr.getString("id"), fr.toString())
    toObsidian(fr)
  }
  fun timer(json: String) = exec.execute {
    val fr = frame("timer", JSONObject(json))
    if (hub?.ready == true) sendHub(fr) else store.enqueue(fr.getString("id"), fr.toString())
  }

  // ── phone Obsidian on loopback (and the desktop on the hotspot) ───────────────────────────────
  private var server: WebSocketServer? = null
  private var hotspot: WebSocketServer? = null
  private var obsidian: JWebSocket? = null
  private var oPending: String? = null     // challenge nonce sent to O
  private val fromObsidian = HashSet<String>()
  private var oFails = 0; private var oBanUntil = 0L

  /** The 6-digit code phone Obsidian types once; its key is HKDF(code, "bone-sync/1 obsidian"), kept 10 min. */
  fun obsidianCode(): String {
    val n = (java.security.SecureRandom().nextInt(900000) + 100000).toString()
    KeyVault.put(app, "obsidian-pending", Seal.hkdf(n.toByteArray(), "bone-sync/1 local".toByteArray(), "bone-sync/1 obsidian".toByteArray()))
    prefs.edit().putLong("oCodeUntil", System.currentTimeMillis() + 10 * 60_000).apply()
    return n
  }

  fun startLoopback() {
    if (server != null) return
    server = object : WebSocketServer(InetSocketAddress(InetAddress.getByName("127.0.0.1"), PORT_PHONE)) {
      override fun onOpen(conn: JWebSocket, handshake: ClientHandshake) {
        exec.execute {
          if (System.currentTimeMillis() < oBanUntil) { conn.close(4003); return@execute }
          oPending = Seal.nonce()
          conn.send(JSONObject().put("v", V).put("t", "challenge").put("id", ulid()).put("vault", vaultId).put("from", deviceId)
            .put("nonce", oPending).put("serverTime", System.currentTimeMillis() + (hub?.offset ?: 0)).put("hub", deviceId).toString())
          conn.setAttachment(oPending)
        }
      }
      override fun onMessage(conn: JWebSocket, message: String) { exec.execute { onObsidianFrame(conn, message) } }
      override fun onClose(conn: JWebSocket, code: Int, reason: String?, remote: Boolean) { exec.execute { if (obsidian === conn) { obsidian = null; status("obsidian closed") } } }
      override fun onError(conn: JWebSocket?, ex: Exception) { Log.w(TAG, "loopback: ${ex.message}") }
      override fun onStart() { Log.i(TAG, "loopback server on 127.0.0.1:$PORT_PHONE") }
    }.apply { isReuseAddr = true; connectionLostTimeout = 0; start() }
  }
  fun stopServers() {
    try { server?.stop(500) } catch (e: Exception) { }
    try { hotspot?.stop(500) } catch (e: Exception) { }
    server = null; hotspot = null; obsidian = null
  }

  private fun onObsidianFrame(conn: JWebSocket, text: String) {
    val m = try { JSONObject(text) } catch (e: Exception) { return }
    if (m.optString("v") != V) return
    if (obsidian !== conn) {
      if (m.optString("t") != "hello") { conn.close(4001); return }
      val nonce = conn.getAttachment<String>() ?: return
      val dev = m.optString("deviceId")
      val keys = listOfNotNull(KeyVault.get(app, "obsidian"),
        if (System.currentTimeMillis() < prefs.getLong("oCodeUntil", 0)) KeyVault.get(app, "obsidian-pending") else null)
      val hit = keys.firstOrNull { Seal.sameHex(m.optString("proof"), Seal.proof(it, nonce, dev, vaultId ?: "")) }
      if (hit == null) {
        if (++oFails >= 5) { oBanUntil = System.currentTimeMillis() + 10 * 60_000; oFails = 0 }
        conn.send(JSONObject().put("v", V).put("t", "bye").put("id", ulid()).put("reason", "bad-proof").toString()); conn.close(4003); return
      }
      oFails = 0
      if (KeyVault.get(app, "obsidian") == null || !hit.contentEquals(KeyVault.get(app, "obsidian")!!)) { KeyVault.put(app, "obsidian", hit); KeyVault.remove(app, "obsidian-pending") }
      obsidian = conn
      conn.send(JSONObject().put("v", V).put("t", "welcome").put("id", ulid()).put("vault", vaultId).put("from", deviceId)
        .put("sessionId", ulid()).put("head", store.cursor).put("serverTime", System.currentTimeMillis() + (hub?.offset ?: 0))
        .put("hub", deviceId).put("proof", Seal.proof(hit, m.optString("nonce"), deviceId, vaultId ?: "")).put("sealed", false)
        .put("mode", hub?.mode ?: "offline").put("hubOnline", hub?.ready == true).toString())
      status("obsidian connected")
      // O reconciles from the hub's view: ask H for a manifest since O's cursor by re-sending hello is not
      // possible on a live link, so relay a want-everything-changed request as a manifest compare.
      if (hub?.ready == true) sendHub(frame("manifest", JSONObject().put("files", JSONArray()).put("since", m.optLong("cursor"))))
      return
    }
    when (m.optString("t")) {
      "ping" -> conn.send(JSONObject().put("v", V).put("t", "pong").put("id", ulid()).put("serverTime", System.currentTimeMillis() + (hub?.offset ?: 0)).toString())
      "put", "del", "mv", "want", "manifest", "timer", "bridge", "ack" -> {
        if (m.optString("t") in setOf("put", "del", "mv")) fromObsidian.add(m.optString("id"))
        if (m.optString("t") == "bridge") m.optJSONObject("rows")?.let { store.inbox("bridge", it.toString()); onBridgeRows?.invoke(it.toString()) }
        if (m.optString("t") == "timer") { store.inbox("timer", text); onTimer?.invoke(text) }
        if (m.optString("t") == "put" && m.optString("enc") != "patch") store.file(m.optString("p")).let { r ->
          val h = m.optString("h"); store.putFile(SyncStore.FileRow(m.optString("p"), h, r?.base, m.optLong("s"), m.optLong("m"), r?.seq ?: 0))
        }
        if (hub?.ready == true) sendHub(m) else if (m.optString("t") != "ack" && m.optString("t") != "want") store.enqueue(m.optString("id"), m.toString())
      }
      "bye" -> conn.close()
    }
  }
  private fun toObsidian(m: JSONObject) { try { obsidian?.send(m.toString()) } catch (e: Exception) { } }

  /** The hotspot is on: listen on its address; the desktop dials ws://<gateway>:7429 and sends the challenge. */
  fun hotspotOn(addr: InetAddress) = exec.execute {
    if (hotspot != null || !paired) return@execute
    hotspot = object : WebSocketServer(InetSocketAddress(addr, PORT_PHONE)) {
      override fun onOpen(conn: JWebSocket, handshake: ClientHandshake) {
        exec.execute {
          if (hub != null) { conn.close(4009); return@execute }
          hub = Link({ conn.send(it) }, { conn.close() }, false)
          conn.setAttachment(hub)
        }
      }
      override fun onMessage(conn: JWebSocket, message: String) { exec.execute { (conn.getAttachment<Link>())?.let { if (it === hub) onHubFrame(it, message) } } }
      override fun onClose(conn: JWebSocket, code: Int, reason: String?, remote: Boolean) { exec.execute { if (conn.getAttachment<Link>() === hub) dropHub("hotspot closed") } }
      override fun onError(conn: JWebSocket?, ex: Exception) { Log.w(TAG, "hotspot: ${ex.message}") }
      override fun onStart() { Log.i(TAG, "hotspot server on ${addr.hostAddress}:$PORT_PHONE") }
    }.apply { isReuseAddr = true; connectionLostTimeout = 0; start() }
  }
  fun hotspotOff() = exec.execute { try { hotspot?.stop(500) } catch (e: Exception) { }; hotspot = null }

  // ── status ───────────────────────────────────────────────────────────────────────────────────
  var state: String = "off"
  fun status(note: String) {
    if (!::app.isInitialized) return
    val o = statusJson().put("note", note)
    onStatus?.invoke(o)
  }
  fun statusJson(): JSONObject = JSONObject()
    .put("paired", paired).put("state", state).put("live", hub?.ready == true).put("mode", hub?.mode)
    .put("obsidian", obsidian != null).put("hotspot", hotspot != null).put("deviceId", deviceId)
    .put("lastOk", prefs.getLong("lastOk", 0)).put("cursor", store.cursor).put("outbox", store.outboxSize())
    .put("presence", JSONArray(prefs.getString("presence", "[]"))).put("lastError", lastError)
    .put("vault", prefs.getString("vaultUri", null) != null).put("fast", vault()?.fast == true)
    .put("stats", JSONArray(store.statsJson()))
}
