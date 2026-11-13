package app.marginalia.nativebits

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager

/**
 * The phone's sync connection (SYNC_ANDROID.md §2, §4). Always running once paired, but DORMANT (no socket, no
 * wakelock, no timer) unless on home Wi-Fi or the hotspot; LIVE only while the screen is on, Obsidian/Margin is
 * visible, something is waiting to go, or a timer runs. Screen off for 60 s with nothing pending → READY.
 *
 * Type `connectedDevice`: no daily time limit and it may start from BOOT_COMPLETED (unlike `dataSync` on
 * Android 15). It cannot be started by a network change from the background, which is why it stays up.
 */
class SyncService : Service() {
  companion object {
    private const val CHANNEL = "sync_status"
    private const val NOTE_ID = 7429
    const val ACTION_CATCHUP = "app.marginalia.sync.CATCHUP"
    private const val JOB_ID = 7428

    /** Start (or nudge) the service. Safe to call from the app, the boot/TICK receivers and alarms. */
    fun ensure(c: Context, catchup: Boolean = false) {
      SyncEngine.init(c)
      if (!SyncEngine.paired) return
      val i = Intent(c, SyncService::class.java).apply { if (catchup) action = ACTION_CATCHUP }
      try { if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i) else c.startService(i) } catch (e: Exception) { /* background start refused */ }
    }
    fun stop(c: Context) { c.stopService(Intent(c, SyncService::class.java)); (c.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler).cancel(JOB_ID) }
  }

  private val main = Handler(Looper.getMainLooper())
  private var cm: ConnectivityManager? = null
  private var homeFp: String? = null          // fingerprint of the Wi-Fi we are on (null = none)
  private var hotspotUp = false
  private var screenOn = true
  private var liveSince = 0L
  private val goReady = Runnable { if (!keepLive()) { SyncEngine.disconnect("idle"); setState("ready") } }

  private val net = object : ConnectivityManager.NetworkCallback() {
    override fun onLinkPropertiesChanged(network: Network, lp: LinkProperties) { main.post { homeFp = SyncNet.fingerprint(lp); evaluate("wifi") } }
    override fun onLost(network: Network) { main.post { homeFp = null; SyncEngine.disconnect("wifi lost"); evaluate("wifi lost") } }
  }
  private val screen = object : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
      when (i.action) {
        Intent.ACTION_SCREEN_OFF -> { screenOn = false; main.removeCallbacks(goReady); main.postDelayed(goReady, 60_000) }
        Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT -> { screenOn = true; main.removeCallbacks(goReady); evaluate("screen"); SyncEngine.ping() }
      }
    }
  }
  private val ap = object : BroadcastReceiver() {
    override fun onReceive(c: Context, i: Intent) {
      val st = i.getIntExtra("wifi_state", -1)
      main.postDelayed({
        val addr = SyncNet.hotspotAddress()
        hotspotUp = st != 11 && addr != null
        if (hotspotUp && addr != null) SyncEngine.hotspotOn(addr) else SyncEngine.hotspotOff()
        evaluate("hotspot")
      }, 1500) // the interface gets its address a moment after the broadcast
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    SyncEngine.init(this)
    startInForeground()
    cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    try {
      cm?.registerNetworkCallback(NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
        .removeCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN).build(), net)
    } catch (e: Exception) { }
    listen(screen, IntentFilter().apply { addAction(Intent.ACTION_SCREEN_ON); addAction(Intent.ACTION_SCREEN_OFF); addAction(Intent.ACTION_USER_PRESENT) })
    listen(ap, IntentFilter("android.net.wifi.WIFI_AP_STATE_CHANGED"))
    screenOn = (getSystemService(Context.POWER_SERVICE) as PowerManager).isInteractive
    SyncNet.hotspotAddress()?.let { hotspotUp = true; SyncEngine.hotspotOn(it) }
    SyncEngine.exec.execute { SyncEngine.startLoopback() }
    scheduleJob()
    setState("dormant")
  }

  /** System broadcasts only; NOT_EXPORTED still receives them from the system (required flag on Android 14+). */
  private fun listen(r: BroadcastReceiver, f: IntentFilter) {
    if (Build.VERSION.SDK_INT >= 33) registerReceiver(r, f, Context.RECEIVER_NOT_EXPORTED) else registerReceiver(r, f)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startInForeground()
    if (intent?.action == ACTION_CATCHUP) catchUp() else evaluate("start")
    return START_STICKY
  }

  override fun onDestroy() {
    try { cm?.unregisterNetworkCallback(net) } catch (e: Exception) { }
    try { unregisterReceiver(screen) } catch (e: Exception) { }
    try { unregisterReceiver(ap) } catch (e: Exception) { }
    main.removeCallbacksAndMessages(null)
    SyncEngine.disconnect("service stopped")
    SyncEngine.exec.execute { SyncEngine.stopServers() }
    super.onDestroy()
  }

  private fun near() = homeFp != null || hotspotUp
  /** LIVE is kept with the screen off only while something is pending (outbox) or a timer runs. */
  private fun keepLive() = screenOn || SyncStore.get(this).outboxSize() > 0

  private fun evaluate(why: String) {
    when {
      !SyncEngine.paired -> { stopSelf(); return }
      !near() -> setState("dormant")
      screenOn || keepLive() -> { setState("live"); if (!hotspotUp) SyncEngine.connect(homeFp) }
      else -> setState("ready")
    }
  }

  /** A short connect while asleep (TICK, alarms, the 2 h job): sync, then close. 10 s wakelock at most. */
  private fun catchUp() {
    if (!near()) return
    val wl = (getSystemService(Context.POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "margin:sync-catchup")
    wl.acquire(10_000)
    SyncStore.get(this).count("catchups")
    SyncEngine.connect(homeFp)
    main.postDelayed({ if (!screenOn && SyncStore.get(this).outboxSize() == 0) SyncEngine.disconnect("catch-up done"); if (wl.isHeld) wl.release() }, 8_000)
  }

  private fun setState(s: String) {
    if (SyncEngine.state == s) return
    val now = System.currentTimeMillis()
    if (SyncEngine.state == "live" && liveSince > 0) SyncStore.get(this).count("live_ms", now - liveSince)
    liveSince = if (s == "live") now else 0
    SyncEngine.state = s
    SyncEngine.status(s)
    updateNote()
  }

  private fun note(): Notification {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
      nm.createNotificationChannel(NotificationChannel(CHANNEL, "Sync with your desktop", NotificationManager.IMPORTANCE_MIN).apply {
        description = "Keeps Margin ready to sync with Obsidian on your desktop. Silent."; setShowBadge(false)
      })
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val text = when (SyncEngine.state) { "live" -> "Connected to your desktop"; "ready" -> "Home network: syncs when you look"; else -> "Waiting for home Wi-Fi or the hotspot" }
    val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
    return b.setSmallIcon(applicationInfo.icon).setContentTitle("Margin").setContentText(text).setOngoing(true)
      .setContentIntent(open).setShowWhen(false).setCategory(Notification.CATEGORY_SERVICE).build()
  }
  private fun startInForeground() {
    if (Build.VERSION.SDK_INT >= 29) startForeground(NOTE_ID, note(), ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
    else startForeground(NOTE_ID, note())
  }
  private fun updateNote() { (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTE_ID, note()) }

  /** At most every 2 h, unmetered network, battery not low: wakes the service for a catch-up. */
  private fun scheduleJob() {
    val js = getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler
    if (js.getPendingJob(JOB_ID) != null) return
    js.schedule(JobInfo.Builder(JOB_ID, ComponentName(this, SyncJob::class.java))
      .setPeriodic(2 * 3600_000L).setRequiredNetworkType(JobInfo.NETWORK_TYPE_UNMETERED).setRequiresBatteryNotLow(true).setPersisted(true).build())
  }
}

/** The 2-hourly opportunistic catch-up (SYNC_ANDROID §4). */
class SyncJob : JobService() {
  override fun onStartJob(params: JobParameters?): Boolean { SyncService.ensure(this, catchup = true); return false }
  override fun onStopJob(params: JobParameters?): Boolean = false
}
