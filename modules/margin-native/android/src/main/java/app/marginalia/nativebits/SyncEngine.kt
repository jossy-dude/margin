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
import java.io.File
import java.net.InetAddress
import java.net.InetSocketAddress
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/**
 * Margin as the phone's sync hub (SYNC_ANDROID.md, SYNC_PROTOCOL.md "M"):
 *   · client of the desktop hub H (OkHttp WebSocket, sealed with the pair key);
 *   · server for phone Obsidian O on 127.0.0.1:7429 (Java-WebSocket, sealed even on loopback so another app on
 *     the phone can neither read nor inject frames), relaying O ⇄ H;
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
  /** Timers only (reconnect back-off, the phone-vault scan); each one hands its work to `exec`. */
  private val sched = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "margin-sync-timer").apply { isDaemon = true } }
  private const val SCAN_EVERY_S = 30L
  private const val MAX_PUSH_PER_SCAN = 200
  private const val MAX_FILE_BYTES = 20L * 1024 * 1024        // phone → desktop (read into memory to send)
  private const val MAX_IN_BYTES = 100L * 1024 * 1024          // desktop → phone (arrives in parts, streamed to disk)
  private const val PART_BYTES = 1024 * 1024                   // chunk.js PART_BYTES
  private const val QUEUE_MAX = 4L * 1024 * 1024               // OkHttp drops a link past 16 MiB queued: stay well under
  private const val DEL_LIMIT = 25
  private const val MAX_TRIES = 3
  private lateinit var app: Context
  private val http by lazy { OkHttpClient.Builder().pingInterval(30, TimeUnit.SECONDS).connectTimeout(3, TimeUnit.SECONDS).readTimeout(0, TimeUnit.MILLISECONDS).build() }

  /** Listeners in JS land (the module forwards these as events). */
  var onStatus: ((JSONObject) -> Unit)? = null
  var onBridgeRows: ((String) -> Unit)? = null
  var onTimer: ((String) -> Unit)? = null

  fun init(c: Context) { if (!::app.isInitialized) app = c.applicationContext }
  private val prefs get() = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  private val store get() = SyncStore.get(app)

  // ── identity and pairing ──────────────────────────────────────────────────────────────────────
  val deviceId: String get() = prefs.getString("deviceId", null) ?: Seal.newId().also { prefs.edit().putString("deviceId", it).apply() }
  val paired: Boolean get() = (prefs.getString("vaultId", null) != null && KeyVault.get(app, "hub") != null) || KeyVault.get(app, "hub-code") != null
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
      // "eight words" or "eight words @ 192.168.1.11:7428": the key needs the vault id, which the hub's
      // challenge carries, so the code waits until the first connection (see onHubFrame "challenge").
      val words = t.substringBefore('@').trim(); val at = t.substringAfter('@', "").trim()
      val code = Seal.wordsToCode(words) ?: return "Type the eight words the desktop showed, then @ and its address."
      if (at.isEmpty()) return "Add the desktop's address after the words, like: … @ 192.168.1.11"
      KeyVault.put(app, "hub-code", code); KeyVault.remove(app, "hub")
      prefs.edit().remove("vaultId").remove("hubId").putString("addrs", if (at.contains(':')) at else "$at:$PORT_HUB").apply()
      store.cursor = 0
      status("paired")
      return null
    }
    if (key == null || key.size != 32 || vault.isNullOrEmpty() || hub.isNullOrEmpty()) return "That code is not a Bone sync pairing code."
    KeyVault.put(app, "hub", key)
    prefs.edit().putString("vaultId", vault).putString("hubId", hub).putString("addrs", addrs).apply()
    store.cursor = 0
    status("paired")
    return null
  }
  fun forget() {
    KeyVault.remove(app, "hub"); KeyVault.remove(app, "hub-code"); KeyVault.remove(app, "obsidian")
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
    var sealOut: Seal.Sealer? = null; var sealIn: Seal.Sealer? = null; var ready = false; var mode: String? = null; var offset = 0L
    /** Phrase pairing: what the first challenge claimed, kept here until the welcome proves it. */
    var pendVault: String? = null; var pendHub: String? = null; var pendKey: ByteArray? = null
    /** Bytes the transport still holds (OkHttp's queue); 0 where it can't tell. */
    var queued: () -> Long = { 0L }
    /** Frames waiting for the transport to drain, sealed only when sent so the seal numbers stay in order. */
    val outQ = java.util.ArrayDeque<() -> String?>()
    var pumping = false
  }
  /** A link that has not finished the handshake in this time is closed, so a stranger can't hold the slot. */
  private const val HANDSHAKE_MS = 8_000L
  private fun handshakeDeadline(l: Link) {
    sched.schedule(Runnable { exec.execute { if (hub === l && !l.ready) { Log.w(TAG, "handshake timed out"); l.close(); dropHub("handshake timeout") } } }, HANDSHAKE_MS, TimeUnit.MILLISECONDS)
  }
  private var hub: Link? = null
  private var hubWs: WebSocket? = null
  private var dialing = false
  private var lastError: String? = null
  @Volatile private var wantLive = false
  private var lastFp: String? = null
  private var retryMs = 0L
  private var retryTask: ScheduledFuture<*>? = null
  private var scanTask: ScheduledFuture<*>? = null
  /** Frames Margin sent for its own files, by frame id, until the hub acks them (never persisted: a rescan
   *  rebuilds them from the disk, which is fresher than any queued copy). */
  private data class Inflight(val path: String, val h: String?, val kind: String, val tries: Int)
  private val inflight = HashMap<String, Inflight>()
  private val inflightPath = HashMap<String, String>()
  private val tries = HashMap<String, Int>()   // path → failed attempts this session
  val live: Boolean get() = hub?.ready == true

  /** Dial the hub: cached hint for this network first, then the addresses from pairing. */
  fun connect(fp: String?) = exec.execute {
    wantLive = true; lastFp = fp
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
    if (i >= list.size) { dialing = false; fail("The desktop did not answer (tried ${list.joinToString()}). Is bone-syncd running and the PC on this Wi-Fi?"); retryLater(); return }
    val addr = list[i]
    val req = Request.Builder().url("ws://$addr").build()
    store.count("connects")
    hubWs = http.newWebSocket(req, object : WebSocketListener() {
      override fun onOpen(webSocket: WebSocket, response: Response) {
        exec.execute {
          dialing = false
          hub = Link({ webSocket.send(it) }, { webSocket.close(1000, null) }, false).also { it.queued = { webSocket.queueSize() }; handshakeDeadline(it) }
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
    val wasReady = hub?.ready == true
    hub = null; hubWs = null; dialing = false
    stopScans(); inflight.clear(); inflightPath.clear(); pendingWant.clear(); manifestHead = 0; landedSeq = 0; dropParts()
    Log.i(TAG, "hub link down: $why")
    if (wasReady) store.count("err", 1, "link lost: $why")
    status("hub link down")
    retryLater()
  }
  /** The service still wants a link (screen on, home network): try again after 5 s, 10 s, 20 s … 2 min. */
  private fun retryLater() {
    if (!wantLive || !paired) return
    retryMs = if (retryMs == 0L) 5_000 else minOf(retryMs * 2, 120_000)
    retryTask?.cancel(false)
    retryTask = sched.schedule(Runnable { connect(lastFp) }, retryMs, TimeUnit.MILLISECONDS)
  }
  fun disconnect(why: String) = exec.execute {
    wantLive = false; retryTask?.cancel(false); retryTask = null; retryMs = 0
    stopScans(); inflight.clear(); inflightPath.clear()
    hub?.let { sendHub(frame("bye", JSONObject().put("reason", why))); it.close() }
    hubWs?.close(1000, why)
    hub = null; hubWs = null; dialing = false
    status("disconnected")
  }
  fun ping() = exec.execute { if (hub?.ready == true) sendHub(frame("ping", JSONObject())) }

  private fun frame(t: String, fields: JSONObject): JSONObject = fields.put("v", V).put("t", t).put("id", ulid())
    .put("vault", vaultId).put("from", deviceId)
  private fun ulid(): String = java.lang.Long.toString(System.currentTimeMillis(), 32).uppercase().padStart(10, '0') + Seal.newId().substring(0, 16)

  private fun sendHub(m: JSONObject) { val text = m.toString(); sendHubLazy { text } }
  /** Frames go out in order; while OkHttp holds more than QUEUE_MAX the rest wait here (a 20 MB file is 20 parts
   *  that would otherwise all queue at once and get the link dropped, report #6). `make` builds the frame only
   *  when it is sent, so a big file's parts are encoded one at a time. */
  private fun sendHubLazy(make: () -> String?) {
    val l = hub ?: return
    l.outQ.add(make)
    pump(l)
  }
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

  /** Before the hub proves it holds the pair key, only challenge, welcome and bye are looked at. Nothing is
   *  saved, written or forwarded on the word of a peer that has not proven itself (test report 2026-11-15, #1). */
  private fun onHandshake(l: Link, m: JSONObject) {
    when (m.optString("t")) {
      "challenge" -> {
        if (l.nonce != null) return
        var key = hubKey; var vault = vaultId; val hubIdNow = hubId
        if (vault == null) {
          // phrase pairing: the first challenge names the vault; the key is HKDF(code, vaultId), as on the desktop.
          // Kept on the link only: a fake hub's challenge must not overwrite what pairing stored.
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
          .put("deviceId", deviceId).put("name", "Margin").put("role", "phone-hub").put("app", "0.7.1")
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
        // The phone-to-desktop link always crosses the network, so it must be sealed: an unsealed welcome is a downgrade.
        if (!m.optBoolean("sealed") || m.optInt("seal") != Seal.SEAL_VERSION) {
          fail("The desktop's bone-syncd is older than this Margin (no seal 2). Update vault-sync on the desktop.")
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
        l.ready = true; l.mode = m.optString("mode"); l.offset = m.optLong("serverTime") - System.currentTimeMillis()
        prefs.edit().putLong("lastOk", System.currentTimeMillis()).apply()
        retryMs = 0; lastError = null
        status("live")
        flushOutbox()
        startScans()
      }
      "bye" -> onBye(l, m, preauth = true)
      else -> Log.w(TAG, "dropped ${m.optString("t")} before the hub proved itself")
    }
  }
  /** `preauth`: the peer has not proven it is the hub, so anyone could have said it. Then the error shows and
   *  Margin keeps trying (back-off up to 2 min) instead of switching sync off for good. */
  private fun onBye(l: Link, m: JSONObject, preauth: Boolean = false) {
    val r = m.optString("reason")
    fail(when (r) {
      "bad-proof" -> "The desktop does not know this phone any more. Pair again (Settings → Obsidian)."
      "other-vault" -> "This phone is paired with a different vault than the desktop's."
      "version" -> "The desktop's bone-syncd speaks a different version. Update both."
      else -> "The desktop closed the link ($r)."
    })
    if (!preauth && (r == "bad-proof" || r == "other-vault")) wantLive = false
    l.close()
  }

  private fun onHubFrame(l: Link, raw: String) {
    if (hub !== l) return
    store.count("rx", raw.length.toLong())
    val text = try { l.sealIn?.unseal(raw) ?: raw } catch (e: Exception) { Log.w(TAG, "bad sealed frame: ${e.message}"); store.count("err", 1, "bad sealed frame"); l.close(); dropHub("bad seal"); return }
    val m = try { JSONObject(text) } catch (e: Exception) { return }
    if (m.optString("v") != V) return
    if (!l.ready) { onHandshake(l, m); return }
    when (m.optString("t")) {
      "challenge", "welcome" -> return
      "manifest" -> onManifest(m)
      "put" -> onPut(m)
      "del" -> onDel(m)
      "mv" -> onMv(m)
      "ack" -> onAck(m)
      "bridge" -> { val rows = m.optJSONObject("rows")?.toString() ?: return; store.inbox("bridge", rows); onBridgeRows?.invoke(rows); toObsidian(m) }
      "timer" -> { store.inbox("timer", text); onTimer?.invoke(text); toObsidian(m) }
      "presence" -> { prefs.edit().putString("presence", m.optJSONArray("peers")?.toString() ?: "[]").apply(); toObsidian(m); status("presence") }
      "conflict" -> toObsidian(m)
      "hold" -> onHold(m)
      "restore" -> onRestore(m)
      "pong" -> l.offset = m.optLong("serverTime") - System.currentTimeMillis()
      "bye" -> onBye(l, m)
    }
  }

  // ── files ────────────────────────────────────────────────────────────────────────────────────
  /** Obsidian reports no events for its config folder, so phone Obsidian cannot see `.obsidian/` changes (plugin
   *  data.json: chess games, YT progress, …). Margin handles those files itself even while Obsidian is connected. */
  private fun mine(p: String) = obsidian == null || p.startsWith(".obsidian/")
  /** Tell phone Obsidian a file it cannot watch changed under it, so the plugin reloads its data. */
  private fun changed(p: String) { if (obsidian != null && p.startsWith(".obsidian/")) toObsidian(JSONObject().put("v", V).put("t", "changed").put("id", ulid()).put("p", p)) }
  /** The vault's ignore rules, refreshed with every scan; nothing ignored is written, whoever sends it. */
  private var ignore = SyncIgnore()
  private fun ignored(p: String) = p != ".bone-sync-ignore" && ignore.matches(p)
  private fun isText(p: String) = Regex("\\.(md|canvas|base|txt|css|js|mjs|py|csv|json)$", RegexOption.IGNORE_CASE).containsMatchIn(p)

  /** The hub's manifest. Read-only hub (rollout step 1): answer with ours so it can log the differences.
   *  Live: want what changed there, then push what changed here (H merges when both did). */
  private fun onManifest(m: JSONObject) {
    val all = m.optJSONArray("files") ?: JSONArray()
    if (obsidian != null) {
      // O is open: it reconciles its notes through the vault API; Margin keeps `.obsidian/`
      val theirs = JSONArray(); val ours = JSONArray()
      for (i in 0 until all.length()) { val f = all.getJSONObject(i); if (f.optString("p").startsWith(".obsidian/")) ours.put(f) else theirs.put(f) }
      toObsidian(JSONObject(m.toString()).put("files", theirs))
      m.put("files", ours)
    }
    val v = vault() ?: run { fail("Pick the vault folder in Settings → Obsidian so Margin can sync it."); return }
    val scanned = refreshLocalSafe(v)
    if (hub?.mode == "read-only") {
      if (!scanned) return
      val arr = JSONArray()
      for (r in store.files()) if (r.h != null) arr.put(JSONObject().put("p", r.path).put("h", r.h).put("s", r.size).put("m", r.mtime))
      sendHub(frame("manifest", JSONObject().put("full", true).put("files", arr)))
      return
    }
    val files = m.optJSONArray("files") ?: JSONArray()
    val want = JSONArray(); val wanted = HashSet<String>()
    for (i in 0 until files.length()) {
      val f = files.getJSONObject(i); val p = f.getString("p"); val h = if (f.isNull("h")) null else f.optString("h")
      val row = store.file(p)
      when {
        // deleted on the desktop: follow it unless the phone edited the file (an edit beats a delete; pushed below)
        ignored(p) -> {}
        h == null -> if (row != null && (row.h == row.base || row.h == null)) { v.delete(p); store.dropFile(p); changed(p) }
        row == null || row.h == null && row.base == null -> { want.put(p); wanted.add(p) }
        row.h == h -> store.putFile(row.copy(base = h, seq = f.optLong("seq")))
        // unchanged here, or deleted here while the desktop edited it: take the desktop's
        row.h == row.base || row.h == null -> { want.put(p); wanted.add(p) }
        else -> {}   // both changed: pushChanged sends ours with its base and the hub merges
      }
    }
    if (want.length() > 0) sendHub(frame("want", JSONObject().put("paths", want)))
    // the cursor moves to the manifest's head only once every file it asked for has landed (report #5): a link
    // lost halfway asks again from the old cursor
    pendingWant.addAll(wanted); manifestHead = maxOf(manifestHead, m.optLong("head"))
    advance(0)
    if (scanned) pushChanged(v, wanted)
  }
  private val pendingWant = HashSet<String>()
  private var manifestHead = 0L
  private var landedSeq = 0L
  /** A change is on the phone's disk (or needs nothing): move the cursor when nothing asked for is missing. */
  private fun advance(seq: Long, p: String? = null) {
    if (p != null) pendingWant.remove(p)
    landedSeq = maxOf(landedSeq, seq)
    if (pendingWant.isEmpty()) store.cursor = maxOf(store.cursor, manifestHead, landedSeq)
  }


  // ── the phone's own changes (the v0.7.1 fix: before this nothing ever sent them) ────────────────
  private fun startScans() {
    stopScans()
    scanTask = sched.scheduleWithFixedDelay(Runnable { exec.execute { scanAndPush() } }, SCAN_EVERY_S, SCAN_EVERY_S, TimeUnit.SECONDS)
  }
  private fun stopScans() { scanTask?.cancel(false); scanTask = null }
  /** Sync now (Settings button, the periodic tick, unlocking the phone). Connects first if needed. */
  fun scanNow() = exec.execute { if (hub?.ready == true) scanAndPush() else if (paired) connect(lastFp) }
  private fun scanAndPush() {
    val l = hub ?: return
    if (!l.ready || l.mode != "live") return
    val v = vault() ?: return
    if (refreshLocalSafe(v)) pushChanged(v, emptySet())
  }

  /** Re-hash only files whose size or mtime changed (the hash cache, §6). Returns false when the folder could
   *  not be read: then nothing is marked deleted, because a failed listing must never look like deletes. */
  private fun refreshLocalSafe(v: SyncVault): Boolean {
    val t0 = System.currentTimeMillis()
    return try {
      val ig = SyncIgnore(v.read(".bone-sync-ignore")?.let { String(it) } ?: SyncIgnore.DEFAULT)
      ignore = ig
      val entries = v.walk(ig)
      val known = store.files()
      if (entries.isEmpty() && known.count { it.h != null } > 20) throw IllegalStateException("the vault folder looks empty; is it still there and still allowed?")
      val seen = HashSet<String>(entries.size * 2)
      var hashed = 0
      for (e in entries) {
        seen.add(e.path)
        val row = store.file(e.path)
        if (row != null && row.h != null && row.size == e.size && row.mtime == e.mtime) continue
        if (e.size > MAX_FILE_BYTES) continue   // too big for one frame; reported once in pushChanged
        val bytes = v.read(e.path) ?: continue
        store.putFile(SyncStore.FileRow(e.path, Seal.hash(bytes), row?.base, e.size, e.mtime, row?.seq ?: 0)); hashed++
      }
      for (r in known) if (r.h != null && r.path !in seen) store.putFile(r.copy(h = null))
      prefs.edit().putLong("scanAt", System.currentTimeMillis()).putLong("scanMs", System.currentTimeMillis() - t0).putInt("scanFiles", entries.size).apply()
      true
    } catch (e: Exception) {
      fail("Couldn't read the phone vault: ${e.message ?: e.javaClass.simpleName}. Pick the folder again in Settings → Obsidian.")
      false
    }
  }

  /** Send every file the phone changed, added or deleted since the hub last agreed with it. */
  private fun pushChanged(v: SyncVault, skip: Set<String>) {
    val rows = store.files()
    val gone = rows.filter { it.h == null && it.base != null && mine(it.path) }
    // a mass delete is far more likely a broken folder permission than the owner's intent: stop and ask
    // (Settings → Sync and a notification: "Sync stopped: N files deleted on the phone. Sync them?")
    val delOk = gone.size <= DEL_LIMIT || allowDeletes
    if (!delOk) holdLocal(gone.map { it.path })
    if (delOk && allowDeletes && gone.isNotEmpty()) allowDeletes = false
    // the files came back by hand: the question is moot
    if (gone.size <= DEL_LIMIT && localHeld.isNotEmpty()) { localHeld = emptyList(); if (JSONObject(prefs.getString("hold", "{}")!!).optBoolean("local")) { prefs.edit().remove("hold").apply(); cancelHoldNote() } }
    var sent = 0
    for (r in rows) {
      if (sent >= MAX_PUSH_PER_SCAN) break
      if (!mine(r.path)) continue   // phone Obsidian sends its own notes while it is open
      if (r.path in skip || inflightPath.containsKey(r.path)) continue
      if ((tries[r.path] ?: 0) >= MAX_TRIES) continue
      when {
        r.h == null && r.base == null -> store.dropFile(r.path)
        r.h == null -> if (delOk) { sendDel(r.path, r.base!!); sent++ }
        r.h != r.base -> { if (pushLocal(v, r.path, r)) sent++ }
      }
    }
    if (sent > 0) { prefs.edit().putLong("pushedAt", System.currentTimeMillis()).apply(); status("sent $sent") }
  }
  private fun pushLocal(v: SyncVault, p: String, row: SyncStore.FileRow): Boolean {
    if (ignored(p)) return false
    if (row.size > MAX_FILE_BYTES) { if (tries[p] == null) { tries[p] = MAX_TRIES; fail("$p is over 20 MB, too big to sync from the phone.") }; return false }
    val bytes = v.read(p) ?: return false
    val h = Seal.hash(bytes)
    val f = JSONObject().put("p", p).put("h", h).put("base", row.base ?: JSONObject.NULL).put("s", bytes.size).put("m", row.mtime)
    if (!isText(p) && bytes.size > PART_BYTES) {
      // a big binary goes in 1 MB parts, each encoded only when the queue has room; the hub acks the transfer id
      val xfer = ulid(); val parts = (bytes.size + PART_BYTES - 1) / PART_BYTES
      track(xfer, Inflight(p, h, "put", tries[p] ?: 0))
      for (i in 0 until parts) sendHubLazy {
        val off = i * PART_BYTES
        frame("put", JSONObject(f.toString()).put("enc", "bin").put("xfer", xfer).put("part", i).put("parts", parts)
          .put("body", Base64.encodeToString(bytes, off, minOf(PART_BYTES, bytes.size - off), Base64.NO_WRAP))).toString()
      }
      return true
    }
    if (isText(p)) f.put("enc", "text").put("body", String(bytes)) else f.put("enc", "bin").put("body", Base64.encodeToString(bytes, Base64.NO_WRAP))
    val fr = frame("put", f)
    track(fr.getString("id"), Inflight(p, h, "put", tries[p] ?: 0))
    sendHub(fr)
    return true
  }
  private fun sendDel(p: String, base: String) {
    val fr = frame("del", JSONObject().put("p", p).put("base", base))
    track(fr.getString("id"), Inflight(p, null, "del", tries[p] ?: 0))
    sendHub(fr)
  }
  private fun track(id: String, i: Inflight) { inflight[id] = i; inflightPath[i.path] = id }

  // ── big files from the desktop, in parts (chunk.js): kept in the cache until the whole file checks out ──
  private class InPart(val file: File, val p: String, val h: String, val parts: Int, var next: Int = 0, var size: Long = 0)
  private val inParts = HashMap<String, InPart>()
  private fun partsDir() = File(app.cacheDir, "sync-in").apply { mkdirs() }
  private fun dropParts() { inParts.values.forEach { it.file.delete() }; inParts.clear() }
  /** One part; returns the finished file after the last one, else null. */
  private fun onPart(m: JSONObject): File? {
    val xfer = m.optString("xfer"); val part = m.optInt("part", -1); val parts = m.optInt("parts", 0); val p = m.optString("p")
    var x = inParts[xfer]
    if (part == 0 && x == null) {
      if (inParts.size >= 4) inParts.remove(inParts.keys.first())?.file?.delete()
      x = InPart(File(partsDir(), xfer.replace(Regex("[^A-Za-z0-9]"), "_")), p, m.optString("h"), parts).also { it.file.writeBytes(ByteArray(0)); inParts[xfer] = it }
    }
    if (x == null || part != x.next || p != x.p || parts != x.parts || m.optString("h") != x.h) {
      x?.let { it.file.delete(); inParts.remove(xfer) }
      sendHub(frame("want", JSONObject().put("paths", JSONArray().put(p)))); return null
    }
    val chunk = Base64.decode(m.optString("body"), Base64.NO_WRAP)
    x.size += chunk.size
    if (x.size > MAX_IN_BYTES) { x.file.delete(); inParts.remove(xfer); fail("$p is over 100 MB, too big to sync."); return null }
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

  /** Puts relayed to phone Obsidian, by frame (or transfer) id, until it acks: then Margin's file table learns
   *  what O wrote, so Margin never pushes from a stale base later (report #5, the stale-base duplicates). */
  private val toO = HashMap<String, Pair<String, String>>()

  private fun onPut(m: JSONObject) {
    val p = m.getString("p")
    if (ignored(p)) return
    if (!mine(p)) {
      if (m.has("xfer")) { if (m.optInt("part") == m.optInt("parts") - 1) toO[m.optString("xfer")] = p to m.optString("h") }
      else toO[m.optString("id")] = p to m.optString("h")
      toObsidian(m); return
    }
    val v = vault() ?: return
    val h = m.optString("h")
    val ref = if (m.has("xfer")) m.optString("xfer") else m.optString("id")
    var bytes: ByteArray? = null; var file: File? = null
    when {
      m.has("xfer") -> {
        file = onPart(m) ?: return
        if (fileHash(file) != h) { file.delete(); fail("A file arrived damaged ($p); asking again."); sendHub(frame("want", JSONObject().put("paths", JSONArray().put(p)))); return }
      }
      m.optString("enc") == "bin" -> bytes = Base64.decode(m.optString("body"), Base64.NO_WRAP)
      m.optString("enc") == "text" -> bytes = m.optString("body").toByteArray()
      // a patch: we keep no text bodies yet, so ask for the whole file (SYNC_PROTOCOL §5: patch only when the receiver has base)
      else -> { sendHub(frame("want", JSONObject().put("paths", JSONArray().put(p)))); return }
    }
    if (bytes != null && Seal.hash(bytes) != h) { fail("A file arrived damaged ($p); asking again."); sendHub(frame("want", JSONObject().put("paths", JSONArray().put(p)))); return }
    // the phone changed this file since the last agreement (or made the same new note): send ours with its base
    // instead; the hub merges both and sends the result back (before v0.7.1 the incoming copy overwrote it)
    val row = store.file(p); val st = v.stat(p)
    if (st != null) {
      val localH = if (row?.h != null && row.size == st.size && row.mtime == st.mtime) row.h else v.hashOf(p)
      if (localH == h) { file?.delete(); store.putFile(SyncStore.FileRow(p, h, h, st.size, st.mtime, m.optLong("seq"))); ackPut(ref, m, h); advance(m.optLong("seq"), p); return }
      // mid-send: the hub merges our copy with this one and sends the result; keep the phone's for now
      if (localH != row?.base && inflightPath.containsKey(p)) { file?.delete(); return }
      if (localH != null && localH != row?.base) {
        file?.delete()
        val mine = SyncStore.FileRow(p, localH, row?.base, st.size, st.mtime, row?.seq ?: 0)
        store.putFile(mine); pushLocal(v, p, mine); return
      }
    }
    try { if (file != null) v.writeFile(p, file) else v.write(p, bytes!!) } catch (e: Exception) { file?.delete(); fail("Couldn't write $p on the phone: ${e.message}"); return }
    file?.delete()
    // check it really landed before saying so (report #5)
    if (v.hashOf(p) != h) {
      val n = (tries[p] ?: 0) + 1; tries[p] = n
      fail("$p did not save correctly on the phone${if (n < MAX_TRIES) "; asking again" else ""}.")
      sendHub(frame("ack", JSONObject().put("ref", ref).put("ok", false).put("err", "write-failed")))
      if (n < MAX_TRIES) sendHub(frame("want", JSONObject().put("paths", JSONArray().put(p))))
      return
    }
    val now = v.stat(p)
    store.putFile(SyncStore.FileRow(p, h, h, now?.size ?: bytes?.size?.toLong() ?: 0L, now?.mtime ?: System.currentTimeMillis(), m.optLong("seq")))
    changed(p)
    ackPut(ref, m, h)
    advance(m.optLong("seq"), p)
  }
  private fun ackPut(ref: String, m: JSONObject, h: String) = sendHub(frame("ack", JSONObject().put("ref", ref).put("ok", true).put("seq", m.optLong("seq")).put("h", h)))
  private fun onDel(m: JSONObject) {
    val p = m.getString("p")
    if (ignored(p)) return
    if (!mine(p)) { toObsidian(m); return }
    val v = vault() ?: return
    val row = store.file(p)
    if (row != null && row.h != row.base) { advance(m.optLong("seq"), p); return }  // edited here: an edit beats a delete; pushed on the next manifest
    v.delete(p); store.dropFile(p); changed(p)
    advance(m.optLong("seq"), p)
  }
  private fun onMv(m: JSONObject) {
    val from = m.getString("from"); val to = m.getString("to")
    if (ignored(from) || ignored(to)) return
    if (!mine(from) && !mine(to)) {
      // phone Obsidian moves it; Margin's table follows so a later scan is not a delete plus a new file
      store.file(from)?.let { store.dropFile(from); store.putFile(it.copy(path = to)) }
      toObsidian(m); return
    }
    val v = vault() ?: return
    val bytes = v.read(from) ?: run { sendHub(frame("want", JSONObject().put("paths", JSONArray().put(to)))); return }
    try { v.write(to, bytes) } catch (e: Exception) { fail("Couldn't move $from to $to: ${e.message}"); return }
    if (v.hashOf(to) != Seal.hash(bytes)) { fail("Moving $from to $to did not save; asking again."); sendHub(frame("want", JSONObject().put("paths", JSONArray().put(to)))); return }
    v.delete(from)
    store.file(from)?.let { store.dropFile(from); store.putFile(it.copy(path = to)) }
    advance(m.optLong("seq"), to)
  }
  private fun onAck(m: JSONObject) {
    val ref = m.optString("ref")
    fromObsidian.remove(ref)?.let { sent -> obsidianAcked(sent, m); toObsidian(m); return }
    val inf = inflight.remove(ref)?.also { inflightPath.remove(it.path) }
    if (m.optBoolean("ok")) {
      store.acked(ref)
      if (inf == null) return
      tries.remove(inf.path)
      val row = store.file(inf.path)
      when (inf.kind) {
        // base = what we sent: if the hub merged, its merged copy follows and lands cleanly on top of it
        "put" -> if (row != null && row.h == inf.h) store.putFile(row.copy(base = inf.h))
        "del" -> if (row == null || row.h == null) store.dropFile(inf.path)
      }
      return
    }
    val err = m.optString("err")
    store.acked(ref)
    if (inf == null) { if (err != "read-only") fail("The desktop refused a change: $err"); return }
    when (err) {
      "read-only" -> fail("The desktop hub is in read-only mode, so phone changes wait. Set \"mode\": \"live\" in ~/.config/bone-sync/config.json.")
      "edited" -> {}                                         // a delete lost to a desktop edit; the file comes back
      "held" -> {}                                           // a big delete waits for the owner (onHold)
      "ignored" -> tries[inf.path] = MAX_TRIES               // the desktop never takes this path
      "need-full", "hash-mismatch" -> retry(inf, err)       // the file changed while sending: read it again
      else -> retry(inf, err)
    }
  }
  private fun retry(inf: Inflight, err: String) {
    val n = (tries[inf.path] ?: 0) + 1; tries[inf.path] = n
    if (n >= MAX_TRIES) { fail("${inf.path} did not sync after $n tries ($err). It stays on the phone; Sync now tries again."); return }
    val v = vault() ?: return
    val row = store.file(inf.path) ?: return
    if (inf.kind == "put" && row.h != null) pushLocal(v, inf.path, row) else if (inf.kind == "del" && row.base != null) sendDel(inf.path, row.base)
  }
  // ── big deletes (§9) ─────────────────────────────────────────────────────────────────────────────
  /** One-shot: the owner said "delete them on the desktop too" for the phone's own big delete. */
  private var allowDeletes = false
  private var localHeld: List<String> = emptyList()
  /** The phone lost more files than DEL_LIMIT at once: hold them and ask, here and in a notification. */
  private fun holdLocal(paths: List<String>) {
    val first = localHeld.isEmpty()
    localHeld = paths
    val o = JSONObject().put("holdId", "local").put("from", "phone").put("src", "phone").put("count", paths.size)
      .put("sample", JSONArray(paths.take(5))).put("local", true).put("at", System.currentTimeMillis())
    prefs.edit().putString("hold", o.toString()).apply()
    if (first) holdNote(paths.size, "on this phone")
    status("hold")
  }
  /** The hub held a big delete (from the desktop, or from phone Obsidian): show the question here too. */
  private fun onHold(m: JSONObject) {
    toObsidian(m)
    when (m.optString("op")) {
      "held" -> {
        val first = JSONObject(prefs.getString("hold", "{}")!!).optString("holdId") != m.optString("holdId")
        prefs.edit().putString("hold", m.toString()).apply()
        if (first) holdNote(m.optInt("count"), if (m.optString("src") == "desktop") "on the desktop" else "on the phone")
        status("hold")
      }
      "done" -> {
        if (JSONObject(prefs.getString("hold", "{}")!!).optString("holdId") == m.optString("holdId")) prefs.edit().remove("hold").apply()
        cancelHoldNote(); status("hold done")
      }
    }
  }
  /** The owner's answer from Settings → Sync (or the notification): "apply" deletes everywhere, "cancel" keeps. */
  fun answerHold(op: String) = exec.execute {
    val h = try { JSONObject(prefs.getString("hold", "{}")!!) } catch (e: Exception) { JSONObject() }
    prefs.edit().remove("hold").apply(); cancelHoldNote()
    if (h.optBoolean("local")) {
      val paths = localHeld; localHeld = emptyList()
      if (op == "apply") { allowDeletes = true; scanAndPush() }
      else {
        // keep: fetch the files back from the desktop
        for (p in paths) store.dropFile(p)
        if (paths.isNotEmpty() && hub?.ready == true) sendHub(frame("want", JSONObject().put("paths", JSONArray(paths))))
      }
    } else if (h.has("holdId") && hub?.ready == true) sendHub(frame("hold", JSONObject().put("op", op).put("holdId", h.optString("holdId"))))
    status("hold answered")
  }
  private const val HOLD_CHANNEL = "sync_alerts"
  private const val HOLD_NOTE = 7429
  private fun holdNote(count: Int, where: String) {
    try {
      val nm = app.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
      if (android.os.Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(HOLD_CHANNEL) == null)
        nm.createNotificationChannel(android.app.NotificationChannel(HOLD_CHANNEL, "Sync questions", android.app.NotificationManager.IMPORTANCE_HIGH))
      val open = app.packageManager.getLaunchIntentForPackage(app.packageName)?.let { android.app.PendingIntent.getActivity(app, HOLD_NOTE, it, android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT) }
      val b = if (android.os.Build.VERSION.SDK_INT >= 26) android.app.Notification.Builder(app, HOLD_CHANNEL) else android.app.Notification.Builder(app)
      b.setSmallIcon(android.R.drawable.stat_notify_sync).setContentTitle("Sync stopped: $count files deleted $where")
        .setContentText("Do you want to sync the deletes? Open Margin → Settings → Sync to choose.").setAutoCancel(true)
      open?.let { b.setContentIntent(it) }
      nm.notify(HOLD_NOTE, b.build())
    } catch (e: Exception) { Log.w(TAG, "hold notification: ${e.message}") }
  }
  private fun cancelHoldNote() { try { (app.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager).cancel(HOLD_NOTE) } catch (e: Exception) { } }
  /** The hub lost these files (a cancelled big delete on the desktop): push the phone's copies back. */
  private fun onRestore(m: JSONObject) {
    val paths = m.optJSONArray("paths") ?: return
    val v = vault()
    val forO = JSONArray()
    for (i in 0 until paths.length()) {
      val p = paths.optString(i)
      if (ignored(p)) continue
      if (!mine(p)) { forO.put(p); continue }
      val row = store.file(p) ?: continue
      if (v != null && row.h != null) { val r = row.copy(base = null); store.putFile(r); pushLocal(v, p, r) }
    }
    if (forO.length() > 0) toObsidian(JSONObject(m.toString()).put("paths", forO))
  }

  /** Queued frames: bridge rows, timer ops and phone Obsidian's edits. Margin's own file frames from older
   *  builds are dropped: the scan resends those files from the disk. */
  private fun flushOutbox() {
    for ((id, raw) in store.outbox()) {
      val fr = try { JSONObject(raw) } catch (e: Exception) { store.acked(id); continue }
      if (fr.optString("t") in setOf("put", "del", "mv") && fr.optString("from") == deviceId) { store.acked(id); continue }
      hub?.let { sendHub(fr) }
    }
  }

  /** Something went wrong: remember it for Settings (last 20, newest first) and tell JS. */
  private fun fail(msg: String) {
    lastError = msg
    Log.w(TAG, msg)
    if (!::app.isInitialized) return
    store.count("err", 1, msg)
    val old = try { JSONArray(prefs.getString("errors", "[]")) } catch (e: Exception) { JSONArray() }
    val out = JSONArray().put(JSONObject().put("at", System.currentTimeMillis()).put("msg", msg))
    for (i in 0 until minOf(old.length(), 19)) { val o = old.optJSONObject(i) ?: continue; if (o.optString("msg") != msg) out.put(o) }
    prefs.edit().putString("errors", out.toString()).apply()
    status("error")
  }
  fun clearErrors() = exec.execute { lastError = null; tries.clear(); prefs.edit().remove("errors").apply(); status("errors cleared") }

  /** Margin's own rows (tasks, events, sessions) from JS, debounced there (750 ms). */
  fun pushBridge(rowsJson: String) = exec.execute {
    val fr = frame("bridge", JSONObject().put("rows", JSONObject(rowsJson)))
    if (hub?.ready == true) sendHub(fr) else store.enqueue(fr.getString("id"), fr.toString())
    toObsidian(fr)
  }
  fun timer(json: String) = exec.execute {
    val fr = try { frame("timer", JSONObject(json)) } catch (e: Exception) { fail("Bad timer message from the app"); return@execute }
    if (hub?.ready == true) sendHub(fr) else status("timer offline")   // the hub decides; an old op must not replay later
    toObsidian(fr)
  }

  // ── phone Obsidian on loopback (and the desktop on the hotspot) ───────────────────────────────
  private var server: WebSocketServer? = null
  private var hotspot: WebSocketServer? = null
  private var obsidian: JWebSocket? = null
  /** One loopback connection: Margin plays the hub. Sealed both ways after the welcome. */
  private class OConn(val nonce: String) { var sealIn: Seal.Sealer? = null; var sealOut: Seal.Sealer? = null }
  /** O's frames relayed to the hub, by id (or transfer id): kind, path, hash. */
  private data class OSent(val kind: String, val p: String, val h: String?, val to: String? = null)
  private val fromObsidian = HashMap<String, OSent>()
  private var oFails = 0; private var oLastFail = 0L
  /** Margin's cursor when O connected: when O goes away, Margin catches up from here itself, so nothing O was
   *  sent but never wrote is lost (report #4). */
  private var oSince = -1L
  private var rekeyId: String? = null

  /** The 6-digit code phone Obsidian types once; its key is HKDF(code, "bone-sync/1 obsidian"), kept 10 min.
   *  A 6-digit key could be guessed from one recorded handshake, so on first contact Margin swaps it for a random
   *  256-bit key over the sealed link (`rekey`). */
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
          val oc = OConn(Seal.nonce())
          conn.setAttachment(oc)
          conn.send(JSONObject().put("v", V).put("t", "challenge").put("id", ulid()).put("vault", vaultId).put("from", deviceId)
            .put("nonce", oc.nonce).put("serverTime", System.currentTimeMillis() + (hub?.offset ?: 0)).put("hub", deviceId).toString())
        }
      }
      override fun onMessage(conn: JWebSocket, message: String) { exec.execute { onObsidianFrame(conn, message) } }
      override fun onClose(conn: JWebSocket, code: Int, reason: String?, remote: Boolean) { exec.execute { if (obsidian === conn) obsidianGone() } }
      override fun onError(conn: JWebSocket?, ex: Exception) { Log.w(TAG, "loopback: ${ex.message}") }
      override fun onStart() { Log.i(TAG, "loopback server on 127.0.0.1:$PORT_PHONE") }
    }.apply { isReuseAddr = true; connectionLostTimeout = 0; start() }
  }
  fun stopServers() {
    try { server?.stop(500) } catch (e: Exception) { }
    try { hotspot?.stop(500) } catch (e: Exception) { }
    server = null; hotspot = null; obsidian = null
  }
  /** O closed: Margin writes the vault itself again, starting from where O came in (it may have missed some). */
  private fun obsidianGone() {
    obsidian = null; toO.clear()
    if (oSince >= 0) { store.cursor = minOf(store.cursor, oSince); oSince = -1 }
    if (hub?.ready == true) sendHub(frame("manifest", JSONObject().put("files", JSONArray()).put("since", store.cursor)))
    status("obsidian closed")
  }
  private fun oKeys(): List<Pair<String, ByteArray>> = listOfNotNull(
    KeyVault.get(app, "obsidian")?.let { "current" to it },
    KeyVault.get(app, "obsidian-next")?.let { "next" to it },
    if (System.currentTimeMillis() < prefs.getLong("oCodeUntil", 0)) KeyVault.get(app, "obsidian-pending")?.let { "code" to it } else null)

  private fun onObsidianFrame(conn: JWebSocket, raw: String) {
    val oc = conn.getAttachment<OConn>() ?: return
    val text = try { oc.sealIn?.unseal(raw) ?: raw } catch (e: Exception) { Log.w(TAG, "bad sealed frame from Obsidian: ${e.message}"); conn.close(4003); if (obsidian === conn) obsidianGone(); return }
    val m = try { JSONObject(text) } catch (e: Exception) { return }
    if (m.optString("v") != V) return
    if (oc.sealIn == null) {
      if (m.optString("t") != "hello") { conn.close(4001); return }
      // no ban (a stranger's failures must not lock phone Obsidian out): after a wrong proof, hellos are turned
      // away as "busy" for a few seconds, which makes guessing a 6-digit code take weeks
      val now = System.currentTimeMillis()
      if (oFails > 0 && now - oLastFail < minOf(oFails, 30) * 1000L) { sendO(conn, JSONObject().put("v", V).put("t", "bye").put("id", ulid()).put("reason", "busy")); conn.close(4029); return }
      val dev = m.optString("deviceId")
      val hit = oKeys().firstOrNull { Seal.sameHex(m.optString("proof"), Seal.proof(it.second, oc.nonce, dev, vaultId ?: "")) }
      if (hit == null || m.optInt("seal") != Seal.SEAL_VERSION) {
        if (hit == null) { oFails++; oLastFail = now }
        sendO(conn, JSONObject().put("v", V).put("t", "bye").put("id", ulid()).put("reason", if (hit == null) "bad-proof" else "version")); conn.close(4003); return
      }
      oFails = 0
      val key = hit.second
      if (hit.first == "next") { KeyVault.put(app, "obsidian", key); KeyVault.remove(app, "obsidian-next") }
      if (hit.first == "code") KeyVault.remove(app, "obsidian-pending")
      obsidian?.let { if (it !== conn) try { it.close(4009) } catch (e: Exception) { } }
      obsidian = conn
      conn.send(JSONObject().put("v", V).put("t", "welcome").put("id", ulid()).put("vault", vaultId).put("from", deviceId)
        .put("sessionId", ulid()).put("head", store.cursor).put("serverTime", System.currentTimeMillis() + (hub?.offset ?: 0))
        .put("hub", deviceId).put("proof", Seal.proof(key, m.optString("nonce"), deviceId, vaultId ?: "")).put("sealed", true).put("seal", Seal.SEAL_VERSION)
        .put("mode", hub?.mode ?: "offline").put("hubOnline", hub?.ready == true).toString())
      val (c2h, h2c) = Seal.sessionKeys(key, oc.nonce, m.optString("nonce"))
      oc.sealIn = Seal.Sealer(c2h); oc.sealOut = Seal.Sealer(h2c)
      if (oSince < 0) oSince = store.cursor
      // a key that came from the 6-digit code is replaced by a random one now that the link is sealed
      if (hit.first == "code" || prefs.getBoolean("oKeyWeak", true)) {
        val next = Seal.random(32); KeyVault.put(app, "obsidian-next", next)
        if (hit.first == "code") KeyVault.put(app, "obsidian", key)
        val r = JSONObject().put("v", V).put("t", "rekey").put("id", ulid()).put("vault", vaultId).put("from", deviceId).put("key", Seal.hex(next))
        rekeyId = r.getString("id"); sendO(conn, r)
      }
      status("obsidian connected")
      // O reconciles from the hub's view: ask H for what changed since O's own cursor
      if (hub?.ready == true) sendHub(frame("manifest", JSONObject().put("files", JSONArray()).put("since", m.optLong("cursor"))))
      return
    }
    if (obsidian !== conn) { conn.close(4009); return }
    when (m.optString("t")) {
      "ping" -> sendO(conn, JSONObject().put("v", V).put("t", "pong").put("id", ulid()).put("serverTime", System.currentTimeMillis() + (hub?.offset ?: 0)))
      "ack" -> {
        val ref = m.optString("ref")
        if (ref == rekeyId && m.optBoolean("ok")) {
          // O saved the new key: it is the only one from now on
          KeyVault.get(app, "obsidian-next")?.let { KeyVault.put(app, "obsidian", it); KeyVault.remove(app, "obsidian-next") }
          prefs.edit().putBoolean("oKeyWeak", false).apply(); rekeyId = null; return
        }
        toO.remove(ref)?.let { (p, h) -> if (m.optBoolean("ok") && m.optString("h", h) == h) vault()?.stat(p)?.let { st -> store.putFile(SyncStore.FileRow(p, h, h, st.size, st.mtime, m.optLong("seq"))) } }
        if (hub?.ready == true) sendHub(m)
      }
      "hold" -> if (hub?.ready == true) sendHub(m)
      "put", "del", "mv", "want", "manifest", "timer", "bridge" -> {
        val t = m.optString("t")
        if (t == "put" && ignored(m.optString("p"))) return
        when (t) {
          "put" -> {
            val ref = if (m.has("xfer")) m.optString("xfer") else m.optString("id")
            if (!m.has("xfer") || m.optInt("part") == 0) fromObsidian[ref] = OSent("put", m.optString("p"), m.optString("h"))
            if (m.optString("enc") != "patch" && (!m.has("xfer") || m.optInt("part") == 0)) store.file(m.optString("p")).let { r ->
              store.putFile(SyncStore.FileRow(m.optString("p"), m.optString("h"), r?.base, m.optLong("s"), m.optLong("m"), r?.seq ?: 0))
            }
          }
          "del" -> fromObsidian[m.optString("id")] = OSent("del", m.optString("p"), null)
          "mv" -> fromObsidian[m.optString("id")] = OSent("mv", m.optString("from"), m.optString("h"), m.optString("to"))
          "bridge" -> m.optJSONObject("rows")?.let { store.inbox("bridge", it.toString()); onBridgeRows?.invoke(it.toString()) }
          "timer" -> { store.inbox("timer", text); onTimer?.invoke(text) }
        }
        if (hub?.ready == true) sendHub(m) else if (t != "want" && !m.has("xfer")) store.enqueue(m.optString("id"), m.toString())
      }
      "bye" -> conn.close()
    }
  }
  /** The hub accepted (or refused) a change O made: Margin's file table follows, so it never pushes O's notes
   *  later from a base that is out of date. */
  private fun obsidianAcked(sent: OSent, m: JSONObject) {
    if (!m.optBoolean("ok")) return
    when (sent.kind) {
      "put" -> { val p = m.optString("renamed").ifEmpty { sent.p }; store.file(sent.p)?.let { r -> if (r.h == sent.h) { store.dropFile(sent.p); store.putFile(r.copy(path = p, base = sent.h)) } } }
      "del" -> store.file(sent.p)?.let { if (it.h == null || it.h == it.base) store.dropFile(sent.p) }
      "mv" -> store.file(sent.p)?.let { store.dropFile(sent.p); store.putFile(it.copy(path = sent.to ?: return)) }
    }
  }
  private fun sendO(conn: JWebSocket, m: JSONObject) {
    val oc = conn.getAttachment<OConn>()
    val text = m.toString()
    try { conn.send(oc?.sealOut?.seal(text) ?: text) } catch (e: Exception) { }
  }
  private fun toObsidian(m: JSONObject) { obsidian?.let { sendO(it, m) } }

  /** The hotspot is on: listen on its address; the desktop dials ws://<gateway>:7429 and sends the challenge. */
  fun hotspotOn(addr: InetAddress) = exec.execute {
    if (hotspot != null || !paired) return@execute
    hotspot = object : WebSocketServer(InetSocketAddress(addr, PORT_PHONE)) {
      override fun onOpen(conn: JWebSocket, handshake: ClientHandshake) {
        exec.execute {
          if (hub != null) { conn.close(4009); return@execute }
          hub = Link({ conn.send(it) }, { conn.close() }, false).also { handshakeDeadline(it) }
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
    .put("errors", try { JSONArray(prefs.getString("errors", "[]")) } catch (e: Exception) { JSONArray() })
    .put("offset", hub?.offset ?: 0L).put("hubOnline", hub?.ready == true)
    .put("scanAt", prefs.getLong("scanAt", 0)).put("scanMs", prefs.getLong("scanMs", 0)).put("scanFiles", prefs.getInt("scanFiles", 0))
    .put("pushedAt", prefs.getLong("pushedAt", 0)).put("sending", inflight.size)
    .put("hold", prefs.getString("hold", null)?.let { try { JSONObject(it) } catch (e: Exception) { null } } ?: JSONObject.NULL)
}
