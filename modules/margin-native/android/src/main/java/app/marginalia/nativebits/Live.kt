package app.marginalia.nativebits

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle

/**
 * The pinned live countdown: one ongoing notification per running class or focus session, whose time is a
 * system chronometer counting down to `endAt` — the OS redraws it every second, so nothing in JS has to
 * keep posting it. On Android 16 it asks to be promoted to a Live Update (status-bar chip). It removes
 * itself a minute after the end. A swipe is respected: the dismissal is recorded and the same id is not
 * posted again.
 */
object Live {
  private const val CHANNEL = "live"
  private const val PREFS = "margin_native_live"
  /** `Notification.EXTRA_REQUEST_PROMOTED_ONGOING` on API 36; spelled out so this compiles on any SDK. */
  private const val EXTRA_PROMOTE = "android.requestPromotedOngoing"

  private fun nm(c: Context) = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  private fun tag(id: String) = id.hashCode()

  fun canPromote(c: Context): Boolean {
    if (Build.VERSION.SDK_INT < 36) return false
    return try {
      NotificationManager::class.java.getMethod("canPostPromotedNotifications").invoke(nm(c)) as? Boolean ?: false
    } catch (e: Exception) { false }
  }

  fun wasDismissed(c: Context, id: String) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(id, false)
  fun markDismissed(c: Context, id: String) { c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(id, true).apply() }

  private fun ensureChannel(c: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    if (nm(c).getNotificationChannel(CHANNEL) != null) return
    val ch = NotificationChannel(CHANNEL, "Live countdown", NotificationManager.IMPORTANCE_DEFAULT)
    ch.description = "The class or focus session that is running now, with its time left."
    ch.setSound(null, null)
    ch.enableVibration(false)
    ch.setShowBadge(false)
    nm(c).createNotificationChannel(ch)
  }

  private fun smallIcon(c: Context): Int {
    val res = c.resources.getIdentifier("notification_icon", "drawable", c.packageName)
    return if (res != 0) res else c.applicationInfo.icon
  }

  /** Returns false (and posts nothing) when the person already swiped this one away, or the end has passed. */
  fun show(c: Context, id: String, title: String, text: String, endAt: Long, link: String): Boolean {
    if (wasDismissed(c, id)) return false
    val now = System.currentTimeMillis()
    if (endAt <= now) return false
    ensureChannel(c)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val open = PendingIntent.getActivity(c, tag(id), Intent(Intent.ACTION_VIEW, Uri.parse(link)).setPackage(c.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), flags)
    val gone = PendingIntent.getBroadcast(c, tag(id), Intent(c, LiveDismissReceiver::class.java).putExtra("id", id), flags)
    @Suppress("DEPRECATION")
    val b = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(c, CHANNEL) else Notification.Builder(c)
    b.setSmallIcon(smallIcon(c))
      .setContentTitle(title)
      .setContentText(text)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(true)
      .setWhen(endAt)
      .setUsesChronometer(true)
      .setChronometerCountDown(true)
      .setCategory(Notification.CATEGORY_PROGRESS)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setContentIntent(open)
      .setDeleteIntent(gone)
      .addExtras(Bundle().apply { putBoolean(EXTRA_PROMOTE, true) })
    if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(endAt - now + 60_000L)
    return try { nm(c).notify(id, tag(id), b.build()); true } catch (e: SecurityException) { false }
  }

  fun hide(c: Context, id: String): Boolean {
    nm(c).cancel(id, tag(id))
    return true
  }
}

/** The swipe-away half: remember it, so the JS planner does not post the same countdown again. */
class LiveDismissReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra("id") ?: return
    Live.markDismissed(context, id)
  }
}
