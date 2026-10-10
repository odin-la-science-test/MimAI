package fr.mimai.app.overlay

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.RectF
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Choreographer
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager

/* Mìmir sous la caméra : SEUL le petit être est affiché (pas de barre) — une étoile avec des yeux et 156 animations
   (EtoileStage). Un toucher ouvre la bulle de discussion ; un appui long ouvre la bulle et lance l'écoute.
   Deux fenêtres : une petite fenêtre TACTILE à la taille de l'étoile (elle ne gêne jamais le reste de l'écran) et une
   fenêtre de dessin transparente et NON tactile, où l'étoile saute et lance ses effets.
   Les états se lisent sur l'étoile elle-même : écoute (vert, yeux en l'air), réflexion (elle se balance), progression
   (anneau autour de l'étoile), notification (petite pastille). */
class MimirBar(
  private val ctx: Context,
  private val wm: WindowManager,
  private val data: EtoileData,
  private val camXpx: Float,
  private val topPx: Float,
  private val onTap: () -> Unit,
  private val onLong: () -> Unit
) {
  private val ui = Handler(Looper.getMainLooper())
  private val dp = ctx.resources.displayMetrics.density
  private val screenW = ctx.resources.displayMetrics.widthPixels
  private val stage = EtoileStage(data)
  private var touchV: TouchView? = null
  private var fxv: FxView? = null
  private var fxLeft = 0

  var state = "repos"; private set
  private var prog = 0f
  private var stateT0 = 0L
  private var autoBack: Runnable? = null
  private var running = false
  private var screenOn = true
  private var lastNs = 0L
  private var skip = false

  /* position de l'étoile : sous la caméra, JUSTE EN DESSOUS de la barre d'état. Les fenêtres « par-dessus les autres applis »
     sont placées sous la barre d'état du système, qui garde les touchers de sa zone (Samsung notamment) : une étoile placée
     dans la barre d'état s'afficherait mais ne pourrait pas être touchée. */
  private val starX: Float get() = Math.max(34f * dp, Math.min(screenW - 34f * dp, camXpx))
  private val starY: Float get() = topPx + 18f * dp
  private val starSize: Float get() = 26f * dp

  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(c: Context?, i: Intent?) {
      screenOn = i?.action != Intent.ACTION_SCREEN_OFF
      if (screenOn) kick()
    }
  }

  fun show(): Boolean {
    return try {
      val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE
      val common = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED

      // fenêtre de dessin (non tactile) : assez grande pour les sauts et les effets
      val fw = Math.min(screenW, (300f * dp).toInt())
      fxLeft = Math.max(0, Math.min(screenW - fw, (starX - fw / 2f).toInt()))
      stage.ax.to(starX - fxLeft, true); stage.ay.to(starY, true); stage.asz.to(starSize, true)
      val fx = FxView(ctx)
      val flp = WindowManager.LayoutParams(fw, (170f * dp).toInt(), type, common or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE, PixelFormat.TRANSLUCENT)
      flp.gravity = Gravity.TOP or Gravity.START
      flp.x = fxLeft; flp.y = 0
      cutoutAlways(flp)
      fxv = fx

      // fenêtre tactile : un carré autour de l'étoile, rien d'autre
      val side = (52f * dp).toInt()
      val tv = TouchView(ctx)
      val tlp = WindowManager.LayoutParams(side, side, type, common, PixelFormat.TRANSLUCENT)
      tlp.gravity = Gravity.TOP or Gravity.START
      tlp.x = Math.max(0, (starX - side / 2f).toInt())
      tlp.y = Math.max(0, (starY - side / 2f).toInt())
      cutoutAlways(tlp)
      touchV = tv

      wm.addView(fx, flp)
      wm.addView(tv, tlp)    // ajoutée en dernier : elle reçoit les touchers
      stage.ambient = true
      stage.play("coucou")
      try { ctx.registerReceiver(screenReceiver, IntentFilter().also { it.addAction(Intent.ACTION_SCREEN_OFF); it.addAction(Intent.ACTION_SCREEN_ON) }) } catch (e: Exception) { /* facultatif */ }
      kick()
      true
    } catch (e: Exception) {
      Log.e(MimirOverlayService.TAG, "Mìmir près de la caméra refusé : " + e.javaClass.simpleName + " " + (e.message ?: ""), e)
      dispose()
      false
    }
  }

  private fun cutoutAlways(lp: WindowManager.LayoutParams) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
    else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
  }

  fun dispose() {
    running = false
    autoBack?.let { ui.removeCallbacks(it) }
    try { ctx.unregisterReceiver(screenReceiver) } catch (e: Exception) { /* pas enregistré */ }
    touchV?.let { try { wm.removeView(it) } catch (e: Exception) { /* déjà retirée */ } }
    fxv?.let { try { wm.removeView(it) } catch (e: Exception) { /* déjà retirée */ } }
    touchV = null; fxv = null
  }

  /* bas de la zone de l'étoile (pixels) : la bulle de discussion s'ouvre juste en dessous */
  fun bottomPx(): Int = (starY + 30f * dp).toInt()

  /* ───────── états (repos, notif, ecoute, reflexion, activite) ───────── */
  fun setState(s: String, p: Float) {
    ui.post {
      val changed = s != state
      prog = Math.max(0f, Math.min(1f, p))
      autoBack?.let { ui.removeCallbacks(it) }
      if (changed) {
        state = s
        stateT0 = System.currentTimeMillis()
        when (s) {
          "ecoute" -> { stage.switchMode("listen"); stage.play("ecoute") }
          "reflexion" -> { stage.switchMode("think"); stage.play("reflechit") }
          "notif" -> { stage.switchMode("idle"); stage.play("message") }
          else -> stage.switchMode("idle")
        }
      }
      if (s == "notif") {
        val back = Runnable { setState("repos", 0f) }
        autoBack = back
        ui.postDelayed(back, 4200)
      }
      kick()
    }
  }

  fun play(id: String) { ui.post { stage.play(id); kick() } }

  /* ───────── boucle d'animation ───────── */
  private val cb = Choreographer.FrameCallback { ns -> frame(ns) }

  private fun kick() {
    if (running || fxv == null || !screenOn) return
    running = true
    lastNs = 0L
    Choreographer.getInstance().postFrameCallback(cb)
  }

  private fun frame(ns: Long) {
    if (fxv == null) { running = false; return }
    // 60 images/s pendant une animation, 30 images/s pour les états longs (progression, écoute…), ~9 au repos
    skip = !skip
    val longState = state == "activite" || state == "ecoute" || state == "reflexion"
    if (longState && !stage.busy() && skip) { Choreographer.getInstance().postFrameCallback(cb); return }
    val dt = if (lastNs == 0L) 0.016f else ((ns - lastNs) / 1_000_000_000f)
    lastNs = ns
    stage.tick(dt)
    fxv?.invalidate()
    if (!screenOn) { running = false; return }
    val busy = stage.busy() || state != "repos" || (System.currentTimeMillis() - stateT0) < 800
    if (busy) Choreographer.getInstance().postFrameCallback(cb)
    else ui.postDelayed({ if (running) { lastNs = 0L; Choreographer.getInstance().postFrameCallback(cb) } }, 110)
  }

  /* ───────── vues ───────── */
  private val ring = Paint(Paint.ANTI_ALIAS_FLAG).also { it.style = Paint.Style.STROKE; it.strokeCap = Paint.Cap.ROUND }
  private val dot = Paint(Paint.ANTI_ALIAS_FLAG)
  private val rr = RectF()

  private inner class FxView(c: Context) : View(c) {
    override fun onDraw(canvas: Canvas) {
      stage.draw(canvas, fxLeft.toFloat(), 0f)
      val s = stage.S
      val cx = stage.X + stage.cur.x * s - fxLeft
      val cy = stage.Y + stage.cur.y * s
      if (state == "activite") {
        // anneau de progression autour de l'étoile
        val r = s * 0.95f
        ring.strokeWidth = 2.4f * dp
        ring.color = Color.argb(70, 245, 234, 216)
        canvas.drawCircle(cx, cy, r, ring)
        ring.color = Color.parseColor("#8fa073")
        rr.set(cx - r, cy - r, cx + r, cy + r)
        canvas.drawArc(rr, -90f, 360f * prog, false, ring)
      } else if (state == "notif") {
        // petite pastille de notification
        dot.color = Color.WHITE; canvas.drawCircle(cx + s * 0.58f, cy - s * 0.58f, 5f * dp, dot)
        dot.color = Color.parseColor("#c67139"); canvas.drawCircle(cx + s * 0.58f, cy - s * 0.58f, 3.6f * dp, dot)
      }
    }
  }

  private inner class TouchView(c: Context) : View(c) {
    private var longFired = false
    private val longRun = Runnable { longFired = true; stage.play("ecoute"); kick(); onLong() }

    override fun onTouchEvent(ev: MotionEvent): Boolean {
      when (ev.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          longFired = false
          stage.playRandomTap(); kick()
          ui.postDelayed(longRun, 500)
          return true
        }
        MotionEvent.ACTION_UP -> {
          ui.removeCallbacks(longRun)
          if (!longFired) onTap()
          return true
        }
        MotionEvent.ACTION_CANCEL -> { ui.removeCallbacks(longRun); return true }
      }
      return super.onTouchEvent(ev)
    }
  }
}
