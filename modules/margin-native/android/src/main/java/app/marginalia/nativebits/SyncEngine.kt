package app.marginalia.nativebits

import android.content.Context
import android.provider.DocumentsContract
import android.util.Base64
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Margin as the phone's sync node (v0.8 SPEC §1.1): the ONLY thing on the phone that reads or writes synced files.
 *   · client of the desktop hub (OkHttp WebSocket, sealed with the pair key), found by SyncDiscovery;
 *   · server for phone Obsidian on 127.0.0.1:7429: hints and the shared timer only, no file contents (SyncLocal);
 *   · server on the hotspot address while the hotspot is on: the desktop dials in (SyncLocal);
 *   · writer of the phone vault, with the true base of every file in sync.db (SyncFiles);
 *   · the vault API Margin's JS uses for task lines and its generated notes (SyncLocal).
 * All protocol work runs on one single-thread executor, so frames are handled in order without locks.
 * Split across SyncEngine (link) / SyncFiles / SyncLocal as extension functions on this object.
 */
object SyncEngine {
  internal const val TAG = "MarginSync"
  const val PORT_HUB = 7428
  const val PORT_PHONE = 7429
  internal const val V = "bone-sync/1"
  internal const val APP = "0.8.0"
  private const val PREFS = "margin_sync"

  internal val pool = Executors.newSingleThreadExecutor { r -> Thread(r, "margin-sync").apply { isDaemon = true } }
  /** Every sync task runs here, one at a time. A task that throws is logged and noted, never rethrown: on Android
   *  an uncaught exception on ANY thread kills the whole app (crash 2026-11-15). */
  val exec: java.util.concurrent.Executor = java.util.concurrent.Executor { r ->
    try {
      pool.execute {
        try { r.run() } catch (t: Throwable) {
          Log.e(TAG, "sync task failed", t)
          if (t !is org.java_websocket.exceptions.WebsocketNotConnectedException) try { fail("Sync hiccup (${t.javaClass.simpleName}); carrying on") } catch (e2: Throwable) { }
        }
      }
    } catch (e: java.util.concurrent.RejectedExecutionException) { Log.w(TAG, "sync executor is shut down") }
  }
  /** Timers only (back-off, pings, scans); each one hands its work to `exec`. */
  internal val sched = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "margin-sync-timer").apply { isDaemon = true } }
  internal const val PING_MS = 20_000L
  internal const val PONG_MS = 10_000L
  private val BACKOFF_S = longArrayOf(1, 2, 4, 8, 16, 32, 60)
  internal lateinit var app: Context
  private val http by lazy { OkHttpClient.Builder().connectTimeout(3, TimeUnit.SECONDS).readTimeout(0, TimeUnit.MILLISECONDS).build() }

  /** Listeners in JS land (the module forwards these as events). */
  var onStatus: ((JSONObject) -> Unit)? = null
  var onBridgeRows: ((String) -> Unit)? = null
  var onTimer: ((String) -> Unit)? = null
  /** v0.8 §1.5: notes changed in the vault (landed from the desktop, or saved by phone Obsidian). */
  var onVaultChanged: ((String) -> Unit)? = null

  fun init(c: Context) {
    if (::app.isInitialized) return
    app = c.applicationContext
    try { adoptVault() } catch (e: Exception) { Log.w(TAG, "adopt vault: ${e.message}") }
  }
  internal val prefs get() = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  internal val store get() = SyncStore.get(app)

  // ── identity and pairing ──────────────────────────────────────────────────────────────────────
  val deviceId: String get() = prefs.getString("deviceId", null) ?: Seal.newId().also { prefs.edit().putString("deviceId", it).apply() }
  val paired: Boolean get() = (prefs.getString("vaultId", null) != null && KeyVault.get(app, "hub") != null) || KeyVault.get(app, "hub-code") != null
  internal val vaultId get() = prefs.getString("vaultId", null)
  private val hubId get() = prefs.getString("hubId", null)
  private val hubKey get() = KeyVault.get(app, "hub")

  /** Pair from the QR text (`bone-sync://pair?...&key=`) or "eight words @ address". Null on success, else a sentence. */
  fun pair(text: String): String? {
    val t = text.trim()
    var key: ByteArray? = null; var vault: String? = null; var hub: String? = null; var addrs = ""
    if (t.startsWith("bone-sync://pair")) {
      val u = android.net.Uri.parse(t)
      vault = u.getQueryParameter("vault"); hub = u.getQueryParameter("hub"); addrs = u.getQueryParameter("addr") ?: ""
      key = u.getQueryParameter("key")?.let { Base64.decode(it, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING) }
    } else {
      val words = t.substringBefore('@').trim(); val at = t.substringAfter('@', "").trim()
      val code = Seal.wordsToCode(words) ?: return "Type the eight words the desktop showed, then @ and its address."
      if (at.isEmpty()) return "Add the desktop's address after the words, like: … @ 192.168.1.11"
      KeyVault.put(app, "hub-code", code); KeyVault.remove(app, "hub")
      prefs.edit().remove("vaultId").remove("hubId").remove("lastAddr").putString("addrs", if (at.contains(':')) at else "$at:$PORT_HUB").apply()
      store.resetCursor(); event("pair", "paired with words")
      status("paired")
      return null
    }
    if (key == null || key.size != 32 || vault.isNullOrEmpty() || hub.isNullOrEmpty()) return "That code is not a Bone sync pairing code."
    KeyVault.put(app, "hub", key)
    prefs.edit().putString("vaultId", vault).putString("hubId", hub).putString("addrs", addrs).remove("lastAddr").apply()
    store.resetCursor(); event("pair", "paired with the desktop")
    status("paired")
    return null
  }
  fun forget() {
    KeyVault.remove(app, "hub"); KeyVault.remove(app, "hub-code"); KeyVault.remove(app, "obsidian")
    prefs.edit().remove("vaultId").remove("hubId").remove("addrs").remove("lastAddr").remove("hints").apply()
    store.resetCursor()
    disconnect("forget")
  }

  // ── the vault folder: Kotlin owns it (v0.8 §1.5, S9) ──────────────────────────────────────────
  fun vaultUri(): String? = prefs.getString("vaultUri", null)
  /** The owner chose a folder (Settings). JS never sends "no folder" at start-up any more: that erased the grant. */
  fun setVault(uri: String, name: String?) {
    prefs.edit().putString("vaultUri", uri).putString("vaultName", name).apply()
    event("vault", "vault folder set${name?.let { " ($it)" } ?: ""}")
    status("vault")
  }
  /** Kotlin's pref is missing but Android still holds a grant (an update, cleared app prefs): adopt it. */
  private fun adoptVault() {
    if (prefs.getString("vaultUri", null) != null) return
    val name = prefs.getString("vaultName", null)
    val trees = app.contentResolver.persistedUriPermissions.filter { it.isWritePermission && DocumentsContract.isTreeUri(it.uri) }.map { it.uri.toString() }
    val pick = trees.firstOrNull { name != null && android.net.Uri.decode(it).trimEnd('/').endsWith(name) }
      ?: trees.firstOrNull { try { SyncVault(app, it).stat(".obsidian/app.json") != null || SyncVault(app, it).stat(".obsidian/community-plugins.json") != null } catch (e: Exception) { false } }
      ?: return
    prefs.edit().putString("vaultUri", pick).apply()
    store.event("vault", "kept the vault folder Android still allows")
  }
  internal fun vault(): SyncVault? = vaultUri()?.let { try { SyncVault(app, it) } catch (e: Exception) { null } }

  // ── the desktop link ──────────────────────────────────────────────────────────────────────────
  internal class Link(val send: (String) -> Unit, val close: () -> Unit, val path: String, val addr: String) {
    var nonce: String? = null; var serverNonce: String? = null
    var sealOut: Seal.Sealer? = null; var sealIn: Seal.Sealer? = null; var ready = false; var mode: String? = null; var offset = 0L
    var resume = false
    var pendVault: String? = null; var pendHub: String? = null; var pendKey: ByteArray? = null
    var queued: () -> Long = { 0L }
    val outQ = java.util.ArrayDeque<() -> String?>()
    var pumping = false
    var pingTask: ScheduledFuture<*>? = null
    var lastIn = System.currentTimeMillis()
  }
  private const val HANDSHAKE_MS = 8_000L
  private fun handshakeDeadline(l: Link) {
    sched.schedule(Runnable { exec.execute { if (hub === l && !l.ready) { Log.w(TAG, "handshake timed out"); l.close(); dropHub("handshake timeout") } } }, HANDSHAKE_MS, TimeUnit.MILLISECONDS)
  }
  internal var hub: Link? = null
  private var hubWs: WebSocket? = null
  private var dialing = false
  internal var lastError: String? = null
  @Volatile private var wantLive = false
  private var lastFp: String? = null
  private var retryStep = 0
  private var retryTask: ScheduledFuture<*>? = null
  val live: Boolean get() = hub?.ready == true

  /** Dial the hub, single-flight: one attempt at a time, through the candidates SyncDiscovery finds. */
  fun connect(fp: String?) = exec.execute {
    wantLive = true; lastFp = fp
    if (!paired || hub != null || dialing) return@execute
    dialing = true
    val addrs = prefs.getString("addrs", "")!!.split(",").map { it.trim() }.filter { it.isNotEmpty() }
    SyncDiscovery.candidates(app, prefs.getString("lastAddr", null), addrs, prefs.getString("manualAddr", null), hubId?.take(8), sched) { list ->
      exec.execute {
        if (list.isEmpty()) { dialing = false; status("no hub address"); retryLater(); return@execute }
        tryDial(list, 0)
      }
    }
  }
  private fun tryDial(list: List<SyncDiscovery.Cand>, i: Int) {
    if (i >= list.size) {
      dialing = false
      fail("The desktop was not found on this network (tried ${list.joinToString { it.addr }}). Is bone-syncd running and the computer awake?")
      retryLater(); return
    }
    val c = list[i]
    store.count("connects")
    hubWs = http.newWebSocket(Request.Builder().url("ws://${c.addr}").build(), object : WebSocketListener() {
      override fun onOpen(webSocket: WebSocket, response: Response) {
        exec.execute {
          dialing = false
          hub = Link({ webSocket.send(it) }, { webSocket.close(1000, null) }, c.path, c.addr).also { it.queued = { webSocket.queueSize() }; handshakeDeadline(it) }
        }
      }
      override fun onMessage(webSocket: WebSocket, text: String) { exec.execute { hub?.let { onHubFrame(it, text) } } }
      override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { exec.execute { dropHub("closed $code") } }
      override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
        exec.execute { if (hub == null && dialing) tryDial(list, i + 1) else dropHub(t.message ?: "failure") }
      }
    })
  }
  internal fun dropHub(why: String) {
    if (hub == null && !dialing) return
    val wasReady = hub?.ready == true
    hub?.pingTask?.cancel(false)
    hub = null; hubWs = null; dialing = false
    SyncFiles.stopScans(); SyncFiles.linkLost()
    Log.i(TAG, "hub link down: $why")
    if (wasReady) { store.count("err", 1, "link lost: $why"); event("link", "link lost: $why") }
    status("hub link down")
    retryLater()
  }
  /** Back-off 1-2-4-8-…-60 s with ±20 % jitter, reset by a network change or a working link. */
  private fun retryLater() {
    if (!wantLive || !paired) return
    val s = BACKOFF_S[minOf(retryStep, BACKOFF_S.size - 1)]; retryStep++
    val ms = (s * 1000 * (0.8 + Math.random() * 0.4)).toLong()
    retryTask?.cancel(false)
    retryTask = sched.schedule(Runnable { connect(lastFp) }, ms, TimeUnit.MILLISECONDS)
  }
  /** The network changed (Wi-Fi joined, hotspot up, VPN): try at once, from the first step. */
  fun networkChanged(fp: String?) = exec.execute {
    retryStep = 0; retryTask?.cancel(false); lastFp = fp
    if (hub == null && !dialing && wantLive) connect(fp)
  }
  fun disconnect(why: String) = exec.execute {
    wantLive = false; retryTask?.cancel(false); retryTask = null; retryStep = 0
    SyncFiles.stopScans(); SyncFiles.linkLost()
    hub?.let { it.pingTask?.cancel(false); sendHub(frame("bye", JSONObject().put("reason", why))); it.close() }
    hubWs?.close(1000, why)
    hub = null; hubWs = null; dialing = false
    status("disconnected")
  }
  /** Screen on / unlocked: a quick check that the link is alive (the pong deadline closes a dead one). */
  fun ping() = exec.execute { hub?.let { if (it.ready) sendPing(it) } }
  private fun sendPing(l: Link) {
    val sent = System.currentTimeMillis()
    sendHub(frame("ping", JSONObject()))
    sched.schedule(Runnable { exec.execute { if (hub === l && l.lastIn < sent) { Log.w(TAG, "no answer in 10 s"); l.close(); dropHub("no answer to ping") } } }, PONG_MS, TimeUnit.MILLISECONDS)
  }

  internal fun frame(t: String, fields: JSONObject): JSONObject = fields.put("v", V).put("t", t).put("id", ulid())
    .put("vault", vaultId).put("from", deviceId)
  internal fun ulid(): String = java.lang.Long.toString(System.currentTimeMillis(), 32).uppercase().padStart(10, '0') + Seal.newId().substring(0, 16)

  internal fun sendHub(m: JSONObject) { val text = m.toString(); sendHubLazy { text } }
  /** Frames go out in order; while OkHttp holds more than QUEUE_MAX the rest wait here (report #6). */
  internal fun sendHubLazy(make: () -> String?) { val l = hub ?: return; l.outQ.add(make); pump(l) }
  private const val QUEUE_MAX = 4L * 1024 * 1024
  private fun pump(l: Link) {
    if (hub !== l) { l.outQ.clear(); return }
    while (l.outQ.isNotEmpty()) {
      if (l.queued() > QUEUE_MAX) {
        if (!l.pumping) { l.pumping = true; sched.schedule(Runnable { exec.execute { l.pumping = false; pump(l) } }, 50, TimeUnit.MILLISECONDS) }
        return
      }
      val text = l.outQ.poll()?.invoke() ?: continue
      store.count("tx", text.length.toLong())
      l.send(l.sealOut?.seal(text) ?: text)
    }
  }

  /** Before the hub proves it holds the pair key, only challenge, welcome and bye are looked at (report 2026-11-15 #1). */
  private fun onHandshake(l: Link, m: JSONObject) {
    when (m.optString("t")) {
      "challenge" -> {
        if (l.nonce != null) return
        var key = hubKey; var vault = vaultId; val hubIdNow = hubId
        if (vault == null) {
          val code = KeyVault.get(app, "hub-code") ?: return
          val v = m.optString("vault"); val h = m.optString("hub")
          if (v.isEmpty() || h.isEmpty()) { l.close(); return }
          key = Seal.keyFromCode(code, v); vault = v
          l.pendVault = v; l.pendHub = h; l.pendKey = key
        } else if (hubIdNow != null && m.optString("hub", hubIdNow) != hubIdNow) { l.close(); return }
        val k = key ?: return
        val vlt = vault ?: return
        val sn = m.optString("nonce").takeIf { it.length == 32 } ?: run { l.close(); return }
        l.serverNonce = sn; l.nonce = Seal.nonce()
        val hello = JSONObject().put("v", V).put("t", "hello").put("id", ulid()).put("vault", vlt).put("from", deviceId)
          .put("deviceId", deviceId).put("name", "Margin").put("role", "phone-hub").put("app", APP)
          .put("proof", Seal.proof(k, sn, deviceId, vlt)).put("nonce", l.nonce).put("cursor", store.cursor)
          .put("seal", Seal.SEAL_VERSION).put("clientTime", System.currentTimeMillis())
        l.send(hello.toString())
      }
      "welcome" -> {
        val nonce = l.nonce ?: run { l.close(); return }
        val key = l.pendKey ?: hubKey ?: return
        val vault = l.pendVault ?: vaultId ?: return
        val wantHub = l.pendHub ?: hubId
        val want = Seal.proof(key, nonce, m.optString("hub"), vault)
        if (!Seal.sameHex(m.optString("proof"), want) || m.optString("hub") != wantHub) {
          Log.w(TAG, "hub failed its proof"); store.count("err", 1, "hub failed its proof"); l.close(); dropHub("hub failed its proof"); return
        }
        if (!m.optBoolean("sealed") || m.optInt("seal") != Seal.SEAL_VERSION) {
          fail("The desktop's bone-syncd is older than this Marrow (no seal 2). Update vault-sync on the desktop.")
          l.close(); dropHub("unsealed"); return
        }
        if (l.pendKey != null) {
          KeyVault.put(app, "hub", key); KeyVault.remove(app, "hub-code")
          prefs.edit().putString("vaultId", l.pendVault).putString("hubId", l.pendHub).apply()
          l.pendKey = null; l.pendVault = null; l.pendHub = null
        }
        val sn = l.serverNonce ?: run { l.close(); return }
        val (c2h, h2c) = Seal.sessionKeys(key, sn, nonce)
        l.sealOut = Seal.Sealer(c2h); l.sealIn = Seal.Sealer(h2c)
        l.ready = true; l.mode = m.optString("mode"); l.offset = m.optLong("serverTime") - System.currentTimeMillis(); l.resume = m.optBoolean("resume")
        // the hub's numbering went backwards (its state.db was reset): our cursor means nothing there any more
        if (m.optLong("head") < store.cursor) { store.resetCursor(); event("link", "the desktop's history was reset; comparing every file") }
        prefs.edit().putLong("lastOk", System.currentTimeMillis()).putString("lastAddr", l.addr).putString("path", l.path).apply()
        retryStep = 0; lastError = null
        l.pingTask = sched.scheduleWithFixedDelay(Runnable { exec.execute { if (hub === l && l.ready) sendPing(l) } }, PING_MS, PING_MS, TimeUnit.MILLISECONDS)
        event("link", "connected · ${l.path} · desktop at ${l.addr.substringBefore(':')}")
        status("live")
        flushOutbox()
        SyncFiles.startScans()
      }
      "bye" -> onBye(l, m, preauth = true)
      else -> Log.w(TAG, "dropped ${m.optString("t")} before the hub proved itself")
    }
  }
  private fun onBye(l: Link, m: JSONObject, preauth: Boolean = false) {
    val r = m.optString("reason")
    fail(when (r) {
      "bad-proof" -> "The desktop does not know this phone any more. Pair again (Settings → Obsidian & sync)."
      "other-vault" -> "This phone is paired with a different vault than the desktop's."
      "version" -> "The desktop's bone-syncd speaks a different version. Update both."
      else -> "The desktop closed the link ($r)."
    })
    if (!preauth && (r == "bad-proof" || r == "other-vault")) wantLive = false
    l.close()
  }

  /** Every frame from the hub (the dialled socket or the hotspot one). */
  internal fun onHubFrame(l: Link, raw: String) {
    if (hub !== l) return
    l.lastIn = System.currentTimeMillis()
    store.count("rx", raw.length.toLong())
    val text = try { l.sealIn?.unseal(raw) ?: raw } catch (e: Exception) { Log.w(TAG, "bad sealed frame: ${e.message}"); store.count("err", 1, "bad sealed frame"); l.close(); dropHub("bad seal"); return }
    val m = try { JSONObject(text) } catch (e: Exception) { return }
    if (m.optString("v") != V) return
    if (!l.ready) { onHandshake(l, m); return }
    when (m.optString("t")) {
      "challenge", "welcome" -> return
      "manifest" -> SyncFiles.onManifest(m)
      "put" -> SyncFiles.onPut(m)
      "del" -> SyncFiles.onDel(m)
      "mv" -> SyncFiles.onMv(m)
      "ack" -> SyncFiles.onAck(m)
      // v0.8 (D4): bridge rows are retired as a transport; task lines travel in the notes themselves
      "bridge" -> {}
      "timer" -> {
        m.optString("ref").takeIf { it.isNotEmpty() }?.let { store.acked(it) }
        store.inbox("timer", text); onTimer?.invoke(text); SyncLocal.toObsidian(m)
      }
      "presence" -> { prefs.edit().putString("presence", m.optJSONArray("peers")?.toString() ?: "[]").apply(); SyncLocal.toObsidian(m); status("presence") }
      "conflict" -> {
        if (m.optString("resolution") == "conflicts-note") event("conflict", "clash in ${m.optString("p")}: the other version is in ${m.optString("file")}")
        SyncLocal.toObsidian(m)
      }
      "hold" -> SyncFiles.onHold(m)
      "restore" -> SyncFiles.onRestore(m)
      "pong" -> l.offset = m.optLong("serverTime") - System.currentTimeMillis()
      "bye" -> onBye(l, m)
    }
  }

  /** Queued frames: timer ops. Margin's own file frames are never queued: the scan resends files from the disk. */
  private fun flushOutbox() {
    for ((id, raw) in store.outbox()) {
      val fr = try { JSONObject(raw) } catch (e: Exception) { store.acked(id); continue }
      if (fr.optString("t") != "timer") { store.acked(id); continue }
      hub?.let { sendHub(fr) }
    }
  }

  /** Something went wrong: remember it for the sync page (last 20, newest first) and tell JS. */
  internal fun fail(msg: String) {
    lastError = msg
    Log.w(TAG, msg)
    if (!::app.isInitialized) return
    store.count("err", 1, msg); store.event("problem", msg)
    val old = try { JSONArray(prefs.getString("errors", "[]")) } catch (e: Exception) { JSONArray() }
    val out = JSONArray().put(JSONObject().put("at", System.currentTimeMillis()).put("msg", msg))
    for (i in 0 until minOf(old.length(), 19)) { val o = old.optJSONObject(i) ?: continue; if (o.optString("msg") != msg) out.put(o) }
    prefs.edit().putString("errors", out.toString()).apply()
    status("error")
  }
  internal fun event(kind: String, msg: String) { if (::app.isInitialized) store.event(kind, msg) }
  fun clearErrors() = exec.execute { lastError = null; SyncFiles.tries.clear(); prefs.edit().remove("errors").apply(); status("errors cleared") }

  fun timer(json: String) = exec.execute {
    val fr = try { frame("timer", JSONObject(json)) } catch (e: Exception) { fail("Bad timer message from the app"); return@execute }
    if (hub?.ready == true) sendHub(fr) else { store.enqueue(fr.getString("id"), fr.toString()); status("timer queued") }
    SyncLocal.toObsidian(fr)
  }

  // ── status ───────────────────────────────────────────────────────────────────────────────────
  var state: String = "off"
  /** What is happening now, in words, for the sync page ("Comparing files", "Receiving 3 changes"). */
  @Volatile internal var stage: String = ""
  @Volatile internal var stageDone = 0
  @Volatile internal var stageOf = 0
  internal fun setStage(s: String, done: Int = 0, of: Int = 0) { stage = s; stageDone = done; stageOf = of; status("stage") }
  fun status(note: String) {
    if (!::app.isInitialized) return
    onStatus?.invoke(statusJson().put("note", note))
  }
  fun statusJson(): JSONObject = JSONObject()
    .put("paired", paired).put("state", state).put("live", hub?.ready == true).put("mode", hub?.mode)
    .put("obsidian", SyncLocal.obsidianOpen()).put("hotspot", SyncLocal.hotspotUp()).put("deviceId", deviceId)
    .put("lastOk", prefs.getLong("lastOk", 0)).put("cursor", store.cursor).put("head", store.head).put("outbox", store.outboxSize())
    .put("presence", JSONArray(prefs.getString("presence", "[]"))).put("lastError", lastError)
    .put("vault", vaultUri() != null).put("vaultName", prefs.getString("vaultName", null)).put("fast", vault()?.fast == true)
    .put("stats", JSONArray(store.statsJson()))
    .put("errors", try { JSONArray(prefs.getString("errors", "[]")) } catch (e: Exception) { JSONArray() })
    .put("offset", hub?.offset ?: 0L).put("hubOnline", hub?.ready == true)
    .put("path", if (hub?.ready == true) hub?.path else null).put("addr", if (hub?.ready == true) hub?.addr else null)
    .put("lastPath", prefs.getString("path", null)).put("lastAddr", prefs.getString("lastAddr", null))
    .put("dialing", dialing)
    .put("stage", stage).put("stageDone", stageDone).put("stageOf", stageOf)
    .put("pending", store.pendingCount()).put("skipped", store.skippedJson())
    .put("scanAt", prefs.getLong("scanAt", 0)).put("scanMs", prefs.getLong("scanMs", 0)).put("scanFiles", prefs.getInt("scanFiles", 0))
    .put("pushedAt", prefs.getLong("pushedAt", 0)).put("sending", SyncFiles.inflightCount())
    .put("hold", prefs.getString("hold", null)?.let { try { JSONObject(it) } catch (e: Exception) { null } } ?: JSONObject.NULL)
}
