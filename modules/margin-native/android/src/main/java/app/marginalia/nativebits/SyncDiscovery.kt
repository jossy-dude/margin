package app.marginalia.nativebits

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.util.Log
import java.net.Inet4Address
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Where the desktop hub is (v0.8 SPEC §1.4). Order: the last address that worked → mDNS `_bone-sync._tcp`
 * (Android NSD, no internet or DNS server needed) → the LAN addresses from pairing → Tailscale (100.64/10) last.
 * The phone's own hotspot is not dialled: there the desktop dials the phone (SyncLocal.hotspotOn).
 */
object SyncDiscovery {
  private const val TAG = "MarginSync"
  private const val SERVICE = "_bone-sync._tcp."
  private const val NSD_MS = 2_500L

  /** One address to try, and what to call the path when it works ("Home Wi-Fi", "Tailscale", …). */
  data class Cand(val addr: String, val path: String)

  fun isTailscale(addr: String): Boolean {
    val host = addr.substringBefore(':')
    val m = Regex("^(\\d+)\\.(\\d+)\\.\\d+\\.\\d+$").find(host) ?: return false
    val a = m.groupValues[1].toInt(); val b = m.groupValues[2].toInt()
    return a == 100 && b in 64..127
  }
  fun pathOf(addr: String): String = if (isTailscale(addr)) "Tailscale" else "Wi-Fi"
  private fun withPort(a: String) = if (a.contains(':')) a else "$a:${SyncEngine.PORT_HUB}"

  /**
   * Builds the list, then calls `done` once (on the NSD thread or `sched`). `hubShort` = the first 8 characters of
   * the paired hub id: an mDNS answer from another hub (a friend's laptop on the same Wi-Fi) is not dialled.
   */
  fun candidates(c: Context, last: String?, paired: List<String>, manual: String?, hubShort: String?, sched: ScheduledExecutorService, done: (List<Cand>) -> Unit) {
    val found = ArrayList<String>()
    val fired = AtomicBoolean(false)
    val nsd = try { c.getSystemService(Context.NSD_SERVICE) as NsdManager } catch (e: Exception) { null }
    var listener: NsdManager.DiscoveryListener? = null
    fun finish() {
      if (!fired.compareAndSet(false, true)) return
      try { listener?.let { nsd?.stopServiceDiscovery(it) } } catch (e: Exception) { }
      val out = LinkedHashMap<String, Cand>()
      last?.takeIf { it.isNotBlank() }?.let { out[withPort(it)] = Cand(withPort(it), pathOf(it)) }
      synchronized(found) { for (a in found) out.getOrPut(a) { Cand(a, "Wi-Fi") } }
      manual?.takeIf { it.isNotBlank() }?.let { val a = withPort(it.trim()); out.getOrPut(a) { Cand(a, pathOf(a)) } }
      val lan = paired.map { withPort(it) }.filter { !isTailscale(it) }
      val ts = paired.map { withPort(it) }.filter { isTailscale(it) }
      for (a in lan) out.getOrPut(a) { Cand(a, "Wi-Fi") }
      // Tailscale goes last even when it worked last time: on the home network the LAN is faster and needs no VPN
      val ordered = out.values.filter { !isTailscale(it.addr) } + (out.values.filter { isTailscale(it.addr) } + ts.map { Cand(it, "Tailscale") }).distinctBy { it.addr }
      done(ordered)
    }
    if (nsd == null) { finish(); return }
    listener = object : NsdManager.DiscoveryListener {
      override fun onDiscoveryStarted(serviceType: String) {}
      override fun onDiscoveryStopped(serviceType: String) {}
      override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) { Log.w(TAG, "mDNS discovery failed ($errorCode)"); finish() }
      override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
      override fun onServiceLost(info: NsdServiceInfo) {}
      @Suppress("DEPRECATION")
      override fun onServiceFound(info: NsdServiceInfo) {
        try {
          nsd.resolveService(info, object : NsdManager.ResolveListener {
            override fun onResolveFailed(i: NsdServiceInfo, errorCode: Int) {}
            override fun onServiceResolved(i: NsdServiceInfo) {
              val host = i.host
              if (host !is Inet4Address) return
              val id = i.attributes?.get("id")?.let { String(it) }
              if (hubShort != null && id != null && id != hubShort) return
              synchronized(found) { found.add("${host.hostAddress}:${i.port}") }
            }
          })
        } catch (e: Exception) { }
      }
    }
    try { nsd.discoverServices(SERVICE, NsdManager.PROTOCOL_DNS_SD, listener) } catch (e: Exception) { finish(); return }
    sched.schedule(Runnable { finish() }, NSD_MS, TimeUnit.MILLISECONDS)
  }
}
