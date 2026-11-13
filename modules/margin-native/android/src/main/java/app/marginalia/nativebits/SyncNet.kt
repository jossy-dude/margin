package app.marginalia.nativebits

import android.net.LinkProperties
import android.os.Build
import java.net.Inet4Address
import java.net.NetworkInterface

/**
 * Where the phone is, without the location permission (SYNC_ANDROID.md §3).
 *
 * Home Wi-Fi is recognised by a fingerprint of its `LinkProperties` (subnet, gateway, DNS, search domain, DHCP
 * server), never by SSID/BSSID, which need location. The fingerprint is only a hint for which address to dial
 * first: the hub's handshake proof is the truth.
 *
 * The phone's own hotspot is not a network the phone "joins"; it is found from the AP-state broadcast plus
 * an interface named like an access point with a private IPv4 address.
 */
object SyncNet {
  fun fingerprint(lp: LinkProperties?): String? {
    if (lp == null) return null
    val v4 = lp.linkAddresses.firstOrNull { it.address is Inet4Address } ?: return null
    val a = v4.address.address
    val p = v4.prefixLength.coerceIn(0, 32)
    val mask = if (p == 0) 0 else (-1 shl (32 - p))
    val ip = ((a[0].toInt() and 0xff) shl 24) or ((a[1].toInt() and 0xff) shl 16) or ((a[2].toInt() and 0xff) shl 8) or (a[3].toInt() and 0xff)
    val net = ip and mask
    val subnet = "${(net ushr 24) and 0xff}.${(net ushr 16) and 0xff}.${(net ushr 8) and 0xff}.${net and 0xff}/$p"
    val gw = lp.routes.firstOrNull { it.isDefaultRoute && it.gateway != null }?.gateway?.hostAddress ?: ""
    val dns = lp.dnsServers.joinToString(",") { it.hostAddress ?: "" }
    val dhcp = if (Build.VERSION.SDK_INT >= 30) lp.dhcpServerAddress?.hostAddress ?: "" else ""
    return Seal.hash("$subnet|$gw|$dns|${lp.domains ?: ""}|$dhcp".toByteArray()).substring(0, 16)
  }

  private val AP_NAMES = Regex("^(swlan\\d*|ap\\d+|wlan1|softap.*)$")

  /** Our address on the hotspot, when one is up; null otherwise. Re-checked on each AP broadcast, never polled. */
  fun hotspotAddress(): Inet4Address? = try {
    NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()
      .filter { it.isUp && !it.isLoopback && AP_NAMES.matches(it.name) }
      .flatMap { it.inetAddresses.toList() }
      .firstOrNull { it is Inet4Address && it.isSiteLocalAddress } as Inet4Address?
  } catch (e: Exception) { null }

  /** Every interface, for the Diagnostics → Sync page and spike P0.3. */
  fun describe(): String = try {
    NetworkInterface.getNetworkInterfaces()?.toList().orEmpty().filter { it.isUp }.joinToString("\n") { n ->
      "${n.name}: " + n.inetAddresses.toList().joinToString(", ") { it.hostAddress ?: "?" }
    }
  } catch (e: Exception) { "?" }
}
