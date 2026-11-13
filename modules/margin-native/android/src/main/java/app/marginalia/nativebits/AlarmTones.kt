package app.marginalia.nativebits

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject

/**
 * v0.7 N6/R10 — choosing what an alarm sounds like, and hearing it safely. The phone's own alarm tones are listed
 * (RingtoneManager, no permission, nothing bundled); the owner's choice is stored as a URI and used by AlarmService.
 * A preview plays inside the app for at most 10 s with the same 15 % → 100 % ramp as the real alarm, and
 * `stopPreview` ends it at once (the page also stops it on a double tap, a volume key, or leaving).
 */
object AlarmTones {
  private const val KEY = "tone"
  private val main = Handler(Looper.getMainLooper())
  private var preview: MediaPlayer? = null

  fun list(c: Context): String {
    val out = JSONArray()
    out.put(JSONObject().put("id", "default").put("title", "Phone's default alarm"))
    try {
      val rm = RingtoneManager(c).apply { setType(RingtoneManager.TYPE_ALARM) }
      val cur = rm.cursor
      while (cur.moveToNext() && out.length() < 40) {
        val uri = rm.getRingtoneUri(cur.position) ?: continue
        out.put(JSONObject().put("id", uri.toString()).put("title", cur.getString(RingtoneManager.TITLE_COLUMN_INDEX) ?: "Tone"))
      }
    } catch (e: Exception) { }
    return out.toString()
  }
  fun chosen(c: Context): String = c.getSharedPreferences(AlarmClock.PREFS, Context.MODE_PRIVATE).getString(KEY, "default") ?: "default"
  fun choose(c: Context, id: String) { c.getSharedPreferences(AlarmClock.PREFS, Context.MODE_PRIVATE).edit().putString(KEY, id).apply() }
  /** The URI AlarmService plays: the chosen tone, else the phone's alarm, ringtone, notification sound. */
  fun uri(c: Context): Uri? {
    val id = chosen(c)
    if (id != "default") return Uri.parse(id)
    return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
  }

  fun play(c: Context, id: String): Boolean {
    stop()
    return try {
      val u = if (id == "default") uri(c) else Uri.parse(id)
      val p = MediaPlayer()
      p.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
      p.setDataSource(c, u ?: return false)
      p.isLooping = true
      p.setOnPreparedListener { it.setVolume(0.15f, 0.15f); it.start() }
      p.prepareAsync()
      preview = p
      for (k in 1..3) main.postDelayed({ val v = 0.15f + 0.85f * k / 3; try { preview?.setVolume(v, v) } catch (e: Exception) { } }, k * 3_000L)
      main.postDelayed({ stop() }, 10_000L)
      true
    } catch (e: Exception) { stop(); false }
  }
  fun stop() {
    main.removeCallbacksAndMessages(null)
    try { preview?.stop() } catch (e: Exception) { }
    try { preview?.release() } catch (e: Exception) { }
    preview = null
  }
  val playing: Boolean get() = preview != null
}
