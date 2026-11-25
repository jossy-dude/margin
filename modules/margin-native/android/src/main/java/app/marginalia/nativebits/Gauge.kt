package app.marginalia.nativebits

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF

/**
 * The widget's class gauge (v0.7.6): the in-app deck's bar, drawn as an instrument rather than a stock ProgressBar.
 * A ruled track with a tick every five minutes and a taller one every fifteen, the elapsed part filled in the deck's
 * ink, and a small pointer standing at now. Drawn small (one strip, a few kilobytes) so it travels to the launcher in
 * one piece; the card itself stays a crisp tinted shape.
 */
object Gauge {
  fun draw(wPx: Int, hPx: Int, totalMin: Int, doneMin: Int, ink: Int, mut: Int): Bitmap {
    val w = wPx.coerceIn(40, 1400); val h = hPx.coerceIn(8, 80)
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val cv = Canvas(bmp)
    val p = Paint(Paint.ANTI_ALIAS_FLAG)
    val u = h / 13f                        // one "dp" of the 13 dp strip
    val trackY = h * 0.62f
    val frac = if (totalMin <= 0) 0f else (doneMin.toFloat() / totalMin).coerceIn(0f, 1f)
    val x = 1.5f * u + (w - 3f * u) * frac
    // ticks under the track: every 5 min short, every 15 min taller
    p.color = mut; p.strokeWidth = 1.1f * u; p.strokeCap = Paint.Cap.ROUND
    if (totalMin in 1..600) for (m in 5 until totalMin step 5) {
      val tx = 1.5f * u + (w - 3f * u) * (m.toFloat() / totalMin)
      val long = m % 15 == 0
      p.alpha = if (tx <= x) 90 else 150
      cv.drawLine(tx, trackY + 2f * u, tx, trackY + (if (long) 5.2f else 3.6f) * u, p)
    }
    // the track and what has gone
    p.alpha = 255; p.color = mut; p.alpha = 110; p.strokeWidth = 1.6f * u
    cv.drawLine(1.5f * u, trackY, w - 1.5f * u, trackY, p)
    p.color = ink; p.alpha = 255
    cv.drawRoundRect(RectF(0f, trackY - 2.4f * u, x, trackY + 2.4f * u), 2.4f * u, 2.4f * u, p)
    // the pointer at now
    val tri = Path().apply { moveTo(x - 3.2f * u, 0.4f * u); lineTo(x + 3.2f * u, 0.4f * u); lineTo(x, trackY - 2.8f * u); close() }
    cv.drawPath(tri, p)
    return bmp
  }
}
