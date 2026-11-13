package app.marginalia.nativebits

import android.os.SystemClock
import android.view.KeyEvent
import android.view.MotionEvent
import android.app.Activity
import android.app.AlarmManager
import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import java.util.Calendar

/**
 * Alarms. A rule is a time of day on chosen weekdays, or a list of concrete instants (an alarm that follows
 * the timetable, or one that rings once). The earliest one is handed to the system as a real alarm clock
 * (`setAlarmClock`: exact, exempt from Doze, shown in the status bar); when it fires, the next is armed.
 * Nothing here needs the app to be running.
 */
object AlarmClock {
  const val ACTION_FIRE = "app.marginalia.nativebits.ALARM_FIRE"
  const val PREFS = "margin_native_alarm"
  private const val CODE = 61

  /** When this rule rings next after `now`; 0 when it never does. */
  fun nextFor(r: AlarmRule, now: Long): Long {
    if (!r.on) return 0L
    if (r.at.isNotEmpty()) return r.at.filter { it > now }.minOrNull() ?: 0L
    if (r.days.none { it }) return 0L
    val c = Calendar.getInstance()
    for (d in 0..7) {
      c.timeInMillis = now
      c.add(Calendar.DAY_OF_YEAR, d)
      c.set(Calendar.HOUR_OF_DAY, r.hour); c.set(Calendar.MINUTE, r.minute); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0)
      val weekday = (c.get(Calendar.DAY_OF_WEEK) + 5) % 7 // Monday = 0, the app's own numbering
      if (r.days[weekday] && c.timeInMillis > now) return c.timeInMillis
    }
    return 0L
  }

  class Due(val at: Long, val id: String, val label: String, val snoozeMin: Int, val vibrate: Boolean)

  /** The next thing to ring: the earliest rule, or a snooze that is still pending. */
  fun next(c: Context, now: Long): Due? {
    var best: Due? = null
    for (r in Agenda.read(c).alarms) {
      val at = nextFor(r, now)
      if (at > 0L && (best == null || at < best.at)) best = Due(at, r.id, r.label, r.snoozeMin, r.vibrate)
    }
    val p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val sAt = p.getLong("snoozeAt", 0L)
    if (sAt > now && (best == null || sAt < best.at)) best = Due(sAt, p.getString("snoozeId", "") ?: "", p.getString("snoozeLabel", "") ?: "", p.getInt("snoozeMin", 10), p.getBoolean("snoozeVib", true))
    return best
  }

  private fun fire(c: Context, d: Due?): PendingIntent {
    val i = Intent(c, AlarmReceiver::class.java).setAction(ACTION_FIRE)
    if (d != null) i.putExtra("id", d.id).putExtra("label", d.label).putExtra("snooze", d.snoozeMin).putExtra("vib", d.vibrate).putExtra("at", d.at)
    return PendingIntent.getBroadcast(c, CODE, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  /** Hand the next alarm to the system, or withdraw the one that was there. Returns when it will ring (0 = none). */
  fun arm(c: Context): Long {
    val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val d = next(c, System.currentTimeMillis())
    if (d == null) { am.cancel(fire(c, null)); return 0L }
    val pi = fire(c, d)
    return try {
      am.setAlarmClock(AlarmManager.AlarmClockInfo(d.at, Surfaces.open(c, "marginalia://alarms", 62)), pi)
      d.at
    } catch (e: SecurityException) {
      /* No exact-alarm permission: the best the system will give is a window around the minute. */
      try { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, d.at, pi); d.at } catch (e2: Exception) { 0L }
    }
  }

  fun snooze(c: Context, id: String, label: String, minutes: Int, vibrate: Boolean): Long {
    val at = System.currentTimeMillis() + minutes * 60_000L
    c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putLong("snoozeAt", at).putString("snoozeId", id).putString("snoozeLabel", label).putInt("snoozeMin", minutes).putBoolean("snoozeVib", vibrate).apply()
    arm(c)
    return at
  }
  fun clearSnooze(c: Context) { c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove("snoozeAt").apply(); arm(c) }

  fun canExact(c: Context): Boolean {
    if (Build.VERSION.SDK_INT < 31) return true
    return (c.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
  }
  fun canFullScreen(c: Context): Boolean {
    if (Build.VERSION.SDK_INT < 34) return true
    return (c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).canUseFullScreenIntent()
  }
}

/** The alarm's moment: start ringing, and arm whatever comes next. */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != AlarmClock.ACTION_FIRE) return
    val c = context.applicationContext
    val p = c.getSharedPreferences(AlarmClock.PREFS, Context.MODE_PRIVATE)
    /* a snooze that has now rung is spent */
    if (p.getLong("snoozeAt", 0L) <= System.currentTimeMillis()) p.edit().remove("snoozeAt").apply()
    val ring = Intent(c, AlarmService::class.java).setAction(AlarmService.ACTION_RING)
    intent.extras?.let { ring.putExtras(it) }
    try {
      if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(ring) else c.startService(ring)
    } catch (e: Exception) {
      /* The service could not start (a restriction this build did not foresee): still say so, loudly. */
      AlarmService.fallbackNotify(c, intent.getStringExtra("label") ?: "")
    }
    try { AlarmClock.arm(c) } catch (e: Exception) { }
  }
}

/**
 * Rings until answered. A foreground service, because the sound has to outlive the broadcast that started
 * it; its notification carries Snooze and Dismiss and, on a locked phone, opens the full-screen alarm.
 * It gives up after five minutes and leaves a note that the alarm was missed.
 */
class AlarmService : Service() {
  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private var wake: PowerManager.WakeLock? = null
  private val handler = Handler(Looper.getMainLooper())
  private var id = ""
  private var label = ""
  private var snoozeMin = 10
  private var vibrate = true
  private val giveUp = Runnable { missed() }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_RING -> {
        id = intent.getStringExtra("id") ?: ""
        label = intent.getStringExtra("label") ?: ""
        snoozeMin = intent.getIntExtra("snooze", 10)
        vibrate = intent.getBooleanExtra("vib", true)
        ring()
      }
      ACTION_SNOOZE -> { val at = AlarmClock.snooze(this, id, label, snoozeMin, vibrate); quiet(); snoozedNote(at); finish() }
      ACTION_DISMISS -> { quiet(); finish() }
      // N6: the volume keys, a double tap or "Silence" stop the sound and the buzz; the alarm still waits for
      // Snooze or Dismiss (its screen and notification stay). A test ring has nothing to wait for: it ends.
      ACTION_SILENCE -> { quiet(); if (id == "preview") finish() }
      else -> { if (player == null) finish() }
    }
    return START_NOT_STICKY
  }

  private fun ring() {
    val n = notification()
    try {
      if (Build.VERSION.SDK_INT >= 34) startForeground(NOTE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED) else startForeground(NOTE, n)
    } catch (e: Exception) {
      fallbackNotify(this, label); stopSelf(); return
    }
    quiet()
    try {
      val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
      wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "margin:alarm").apply { acquire(RING_MS + 10_000L) }
    } catch (e: Exception) { }
    try {
      // N6: the tone chosen on the Alarms page (the phone's default alarm until one is chosen)
      val uri = AlarmTones.uri(this) ?: throw IllegalStateException("no alarm tone on this phone")
      val p = MediaPlayer()
      p.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
      p.setDataSource(this, uri)
      p.isLooping = true
      p.setOnPreparedListener { it.setVolume(RAMP_FROM, RAMP_FROM); it.start(); ramp(0) }
      p.setOnErrorListener { _, _, _ -> true }
      p.prepareAsync()
      player = p
    } catch (e: Exception) { player = null }
    if (vibrate) {
      try {
        @Suppress("DEPRECATION")
        val v = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        val pattern = longArrayOf(0L, 600L, 500L, 600L, 1400L)
        if (Build.VERSION.SDK_INT >= 26) {
          val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()
          @Suppress("DEPRECATION")
          v.vibrate(VibrationEffect.createWaveform(pattern, 0), attrs)
        } else {
          @Suppress("DEPRECATION")
          v.vibrate(pattern, 0)
        }
        vibrator = v
      } catch (e: Exception) { }
    }
    handler.removeCallbacks(giveUp)
    handler.postDelayed(giveUp, RING_MS)
  }

  /** N6: 15 % → 100 % over 45 s, so an alarm starts soft and the owner has time to reach it. */
  private fun ramp(step: Int) {
    val steps = RAMP_MS / RAMP_TICK
    if (step >= steps) return
    handler.postDelayed({
      val v = RAMP_FROM + (1f - RAMP_FROM) * (step + 1) / steps
      try { player?.setVolume(v, v) } catch (e: Exception) { }
      if (player != null) ramp(step + 1)
    }, RAMP_TICK)
  }

  private fun quiet() {
    handler.removeCallbacksAndMessages(null)
    try { player?.stop() } catch (e: Exception) { }
    try { player?.release() } catch (e: Exception) { }
    player = null
    try { vibrator?.cancel() } catch (e: Exception) { }
    vibrator = null
    try { if (wake?.isHeld == true) wake?.release() } catch (e: Exception) { }
    wake = null
  }

  private fun finish() {
    sendBroadcast(Intent(ACTION_DONE).setPackage(packageName))
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun missed() {
    quiet()
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val b = builder(this, CHANNEL_NOTE)
      .setSmallIcon(Live.smallIcon(this))
      .setContentTitle("Missed alarm")
      .setContentText(titleLine())
      .setAutoCancel(true)
      .setContentIntent(Surfaces.open(this, "marginalia://alarms", 66))
    try { nm.notify(NOTE_MISSED, b.build()) } catch (e: Exception) { }
    finish()
  }

  private fun snoozedNote(at: Long) {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val cancel = PendingIntent.getBroadcast(this, 67, Intent(this, SnoozeCancelReceiver::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val b = builder(this, CHANNEL_NOTE)
      .setSmallIcon(Live.smallIcon(this))
      .setContentTitle("Snoozed until ${Fmt.time(at, Agenda.read(this).hour12)}")
      .setContentText(if (label.isNotEmpty()) label else "Alarm")
      .setOngoing(true)
      .setContentIntent(Surfaces.open(this, "marginalia://alarms", 66))
      .addAction(Notification.Action.Builder(null, "Cancel snooze", cancel).build())
    if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(at - System.currentTimeMillis())
    try { nm.notify(NOTE_SNOOZED, b.build()) } catch (e: Exception) { }
  }

  private fun titleLine(): String {
    val t = Fmt.time(System.currentTimeMillis(), Agenda.read(this).hour12)
    return if (label.isNotEmpty()) "$t · $label" else t
  }

  private fun notification(): Notification {
    channels(this)
    (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTE_SNOOZED)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val full = PendingIntent.getActivity(this, 63, Intent(this, AlarmActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION).putExtra("id", id).putExtra("label", label).putExtra("snooze", snoozeMin), flags)
    val snooze = PendingIntent.getService(this, 64, Intent(this, AlarmService::class.java).setAction(ACTION_SNOOZE), flags)
    val dismiss = PendingIntent.getService(this, 65, Intent(this, AlarmService::class.java).setAction(ACTION_DISMISS), flags)
    val b = builder(this, CHANNEL_RING)
      .setSmallIcon(Live.smallIcon(this))
      .setContentTitle(if (label.isNotEmpty()) label else "Alarm")
      .setContentText(Fmt.time(System.currentTimeMillis(), Agenda.read(this).hour12))
      .setCategory(Notification.CATEGORY_ALARM)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setShowWhen(false)
      .setColor(getColor(R.color.mg_acc))
      .setContentIntent(full)
      .setFullScreenIntent(full, true)
      .addAction(Notification.Action.Builder(null, "Silence", PendingIntent.getService(this, 66, Intent(this, AlarmService::class.java).setAction(ACTION_SILENCE), flags)).build())
      .addAction(Notification.Action.Builder(null, "Snooze $snoozeMin min", snooze).build())
      .addAction(Notification.Action.Builder(null, "Dismiss", dismiss).build())
    if (Build.VERSION.SDK_INT < 26) {
      @Suppress("DEPRECATION")
      b.setPriority(Notification.PRIORITY_MAX)
    }
    return b.build()
  }

  override fun onDestroy() { quiet(); super.onDestroy() }

  companion object {
    const val ACTION_RING = "app.marginalia.nativebits.ALARM_RING"
    const val ACTION_SNOOZE = "app.marginalia.nativebits.ALARM_SNOOZE"
    const val ACTION_DISMISS = "app.marginalia.nativebits.ALARM_DISMISS"
    const val ACTION_SILENCE = "app.marginalia.nativebits.ALARM_SILENCE"
    private const val RAMP_FROM = 0.15f
    private const val RAMP_MS = 45_000L
    private const val RAMP_TICK = 3_000L
    const val ACTION_DONE = "app.marginalia.nativebits.ALARM_DONE"
    private const val CHANNEL_RING = "alarm"
    private const val CHANNEL_NOTE = "alarm_note"
    private const val NOTE = 7101
    private const val NOTE_MISSED = 7102
    const val NOTE_SNOOZED = 7103
    private const val RING_MS = 5 * 60_000L

    private fun builder(c: Context, channel: String): Notification.Builder {
      @Suppress("DEPRECATION")
      return if (Build.VERSION.SDK_INT >= 26) Notification.Builder(c, channel) else Notification.Builder(c)
    }

    fun channels(c: Context) {
      if (Build.VERSION.SDK_INT < 26) return
      val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(CHANNEL_RING) == null) {
        /* Silent on purpose: the service plays the alarm sound itself, on the alarm stream, and loops it. */
        val ch = NotificationChannel(CHANNEL_RING, "Alarms", NotificationManager.IMPORTANCE_HIGH)
        ch.description = "An alarm that is ringing now."
        ch.setSound(null, null)
        ch.enableVibration(false)
        ch.setBypassDnd(true)
        ch.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        nm.createNotificationChannel(ch)
      }
      if (nm.getNotificationChannel(CHANNEL_NOTE) == null) {
        val ch = NotificationChannel(CHANNEL_NOTE, "Alarm notes", NotificationManager.IMPORTANCE_LOW)
        ch.description = "A snoozed or missed alarm."
        nm.createNotificationChannel(ch)
      }
    }

    /** When the ringing service cannot start: a plain high-priority notification, so the alarm is not lost in silence. */
    fun fallbackNotify(c: Context, label: String) {
      channels(c)
      val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val b = builder(c, CHANNEL_RING)
        .setSmallIcon(Live.smallIcon(c))
        .setContentTitle(if (label.isNotEmpty()) label else "Alarm")
        .setContentText(Fmt.time(System.currentTimeMillis(), Agenda.read(c).hour12))
        .setCategory(Notification.CATEGORY_ALARM)
        .setAutoCancel(true)
        .setContentIntent(Surfaces.open(c, "marginalia://alarms", 66))
      try { nm.notify(NOTE_MISSED, b.build()) } catch (e: Exception) { }
    }
  }
}

class SnoozeCancelReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    AlarmClock.clearSnooze(context.applicationContext)
    (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(AlarmService.NOTE_SNOOZED)
  }
}

/** The alarm, full screen, over the lock screen: the time, what it is for, and two large answers. */
class AlarmActivity : Activity() {
  private val done = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) { finish() }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= 27) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      (getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).requestDismissKeyguard(this, null)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD)
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    setContentView(R.layout.mg_alarm)
    val label = intent.getStringExtra("label") ?: ""
    val snooze = intent.getIntExtra("snooze", 10)
    val a = Agenda.read(this)
    val now = System.currentTimeMillis()
    findViewById<TextView>(R.id.mg_al_time).text = Fmt.time(now, a.hour12)
    findViewById<TextView>(R.id.mg_al_date).text = Fmt.date(now)
    findViewById<TextView>(R.id.mg_al_label).text = if (label.isNotEmpty()) label else "Alarm"
    /* What the day starts with: the reason most of these alarms exist. */
    val first = a.today(now).firstOrNull { it.end > now }
    val hint = findViewById<TextView>(R.id.mg_al_hint)
    if (first != null) {
      hint.text = "First class: ${first.title} at ${Fmt.time(first.start, a.hour12)}${if (first.room.isNotEmpty()) " · ${first.room}" else ""}"
      hint.visibility = View.VISIBLE
    } else hint.visibility = View.GONE
    val snoozeBtn = findViewById<TextView>(R.id.mg_al_snooze)
    snoozeBtn.text = "Snooze $snooze min"
    snoozeBtn.setOnClickListener { answer(AlarmService.ACTION_SNOOZE) }
    findViewById<TextView>(R.id.mg_al_dismiss).setOnClickListener { answer(AlarmService.ACTION_DISMISS) }
    val filter = IntentFilter(AlarmService.ACTION_DONE)
    if (Build.VERSION.SDK_INT >= 33) {
      registerReceiver(done, filter, Context.RECEIVER_NOT_EXPORTED)
    } else {
      registerReceiver(done, filter)
    }
  }

  private fun answer(action: String) {
    try { startService(Intent(this, AlarmService::class.java).setAction(action)) } catch (e: Exception) { }
    finish()
  }

  override fun onDestroy() {
    try { unregisterReceiver(done) } catch (e: Exception) { }
    super.onDestroy()
  }

  /** N6: either volume key silences the alarm (it still waits for Snooze or Dismiss). */
  override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
    if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN || keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_MUTE) {
      silence(); return true
    }
    return super.onKeyDown(keyCode, event)
  }
  private var lastTap = 0L
  /** N6: a double tap anywhere on the alarm screen silences it. */
  override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
    if (ev.actionMasked == MotionEvent.ACTION_DOWN) {
      val now = SystemClock.uptimeMillis()
      if (now - lastTap < 350) silence()
      lastTap = now
    }
    return super.dispatchTouchEvent(ev)
  }
  private fun silence() {
    try { startService(Intent(this, AlarmService::class.java).setAction(AlarmService.ACTION_SILENCE)) } catch (e: Exception) { }
    if (intent.getStringExtra("id") == "preview") finish()
  }
  /** A test ring ends when you leave its screen; a real alarm keeps ringing until it is answered. */
  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    if (intent.getStringExtra("id") == "preview") answer(AlarmService.ACTION_DISMISS)
  }

  /** Back does not silence an alarm by accident; it has to be answered. */
  @Deprecated("Deprecated in Java")
  override fun onBackPressed() { }
}
