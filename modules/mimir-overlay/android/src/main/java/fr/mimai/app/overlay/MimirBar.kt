package fr.mimai.app.overlay

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RectF
import android.graphics.Typeface
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Choreographer
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager

/* La barre Mìmir animée (design « La barre Mìmir », skin Île) :
   - une PILULE sombre autour de la caméra, qui change de forme avec un ressort (repos, notification, écoute, réflexion, activité) ;
   - l'ÉTOILE, un petit être avec des yeux et 156 animations (EtoileStage), qui vit dans la pilule et déborde quand elle saute.
   Deux fenêtres : la pilule (tactile, à la taille exacte de la barre : elle ne gêne jamais le reste de l'écran) et une fenêtre
   de dessin transparente et NON tactile pour l'étoile et ses effets. */
class MimirBar(
  private val ctx: Context,
  private val wm: WindowManager,
  private val data: EtoileData,
  private val camXpx: Float,
  private val camYpx: Float,
  private val onTap: () -> Unit,
  private val onLong: () -> Unit
) {
  private val ui = Handler(Looper.getMainLooper())
  private val dp = ctx.resources.displayMetrics.density
  private val screenW = ctx.resources.displayMetrics.widthPixels
  private val stage = EtoileStage(data)
  private var pill: PillView? = null
  private var fxv: FxView? = null
  private var pillLp: WindowManager.LayoutParams? = null
  private var fxLp: WindowManager.LayoutParams? = null
  private var fxLeft = 0

  /* ressorts de la pilule (pixels) */
  private val pl = Spr(0f); private val pt = Spr(0f); private val pw = Spr(0f); private val ph = Spr(0f); private val pr = Spr(0f)

  var state = "repos"; private set
  private var title = ""
  private var body = ""
  private var label = ""
  private var prog = 0f
  private var stateT0 = 0L
  private var autoBack: Runnable? = null
  private var running = false
  private var screenOn = true
  private var lastNs = 0L
  private var shiftDp = 0f
  private var lastW = -1
  private var lastH = -1
  private var lastX = -1
  private var lastY = -1

  private val dxDp: Float get() = camXpx / dp - 229f
  private val dyDp: Float get() = camYpx / dp - 29.5f

  /* mise en page de chaque état, en dp, dans le repère de la maquette (caméra en 229 ; 29,5) */
  private class Lay(val l: Float, val t: Float, val w: Float, val h: Float, val r: Float, val sx: Float, val sy: Float, val ss: Float)
  private fun layout(s: String): Lay = when (s) {
    "notif" -> Lay(16f, 9f, 358f, 74f, 37f, 50f, 46f, 30f)
    "ecoute", "reflexion" -> Lay(60f, 11f, 270f, 44f, 22f, 84f, 33f, 24f)
    "activite" -> Lay(40f, 11f, 310f, 44f, 22f, 62f + prog * 140f, 33f, 20f)
    else -> Lay(132f, 11f, 126f, 37f, 18.5f, 151f, 29.5f, 20f)
  }

  /* décalage horizontal éventuel pour que la pilule reste dans l'écran (marge 8 dp) */
  private fun shiftFor(l: Lay): Float {
    val wDp = screenW / dp
    val left = l.l + dxDp
    val right = left + l.w
    return if (left < 8f) 8f - left else if (right > wDp - 8f) (wDp - 8f) - right else 0f
  }

  private val screenReceiver = object : BroadcastReceiver() {
    override fun onReceive(c: Context?, i: Intent?) {
      screenOn = i?.action != Intent.ACTION_SCREEN_OFF
      if (screenOn) kick()
    }
  }

  /* ───────── fenêtres ───────── */
  fun show(): Boolean {
    return try {
      val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE
      val common = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED

      val fw = Math.min(screenW, (380f * dp).toInt())
      fxLeft = Math.max(0, Math.min(screenW - fw, (camXpx - fw / 2f).toInt()))
      val l = layout("repos")
      shiftDp = shiftFor(l)
      applyTarget(true)

      val p = PillView(ctx)
      val plp = WindowManager.LayoutParams(Math.max(1, pw.v.toInt()), Math.max(1, ph.v.toInt()), type, common, PixelFormat.TRANSLUCENT)
      plp.gravity = Gravity.TOP or Gravity.START
      plp.x = pl.v.toInt(); plp.y = pt.v.toInt()
      cutoutAlways(plp)
      pill = p; pillLp = plp

      val fx = FxView(ctx)
      val flp = WindowManager.LayoutParams(fw, (190f * dp).toInt(), type, common or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE, PixelFormat.TRANSLUCENT)
      flp.gravity = Gravity.TOP or Gravity.START
      flp.x = fxLeft; flp.y = 0
      cutoutAlways(flp)
      fxv = fx; fxLp = flp

      wm.addView(p, plp)
      wm.addView(fx, flp)
      stage.ambient = true
      stage.play("coucou")
      try { ctx.registerReceiver(screenReceiver, IntentFilter().also { it.addAction(Intent.ACTION_SCREEN_OFF); it.addAction(Intent.ACTION_SCREEN_ON) }) } catch (e: Exception) { /* facultatif */ }
      kick()
      true
    } catch (e: Exception) {
      Log.e(MimirOverlayService.TAG, "barre animée refusée : " + e.javaClass.simpleName + " " + (e.message ?: ""), e)
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
    pill?.let { try { wm.removeView(it) } catch (e: Exception) { /* déjà retirée */ } }
    fxv?.let { try { wm.removeView(it) } catch (e: Exception) { /* déjà retirée */ } }
    pill = null; fxv = null
  }

  /* bas de la pilule (pixels), pour ancrer la bulle de discussion juste en dessous */
  fun bottomPx(): Int { val l = layout("repos"); return ((l.t + dyDp + l.h) * dp).toInt() }

  /* ───────── états ───────── */
  fun setState(s: String, ttl: String, bd: String, lbl: String, p: Float) {
    ui.post {
      val changed = s != state
      title = ttl; body = bd; label = lbl; prog = Math.max(0f, Math.min(1f, p))
      autoBack?.let { ui.removeCallbacks(it) }
      if (changed) {
        state = s
        stateT0 = System.currentTimeMillis()
        shiftDp = shiftFor(layout(s))
        when (s) {
          "ecoute" -> { stage.switchMode("listen"); stage.play("ecoute") }
          "reflexion" -> { stage.switchMode("think"); stage.play("reflechit") }
          "notif" -> { stage.switchMode("idle"); stage.play("message") }
          "activite" -> { stage.switchMode("idle") }
          else -> stage.switchMode("idle")
        }
      }
      applyTarget(false)
      if (s == "notif") {
        val back = Runnable { setState("repos", "", "", "", 0f) }
        autoBack = back
        ui.postDelayed(back, 4200)
      }
      kick()
    }
  }

  fun play(id: String) { ui.post { stage.play(id); kick() } }

  /* cible des ressorts pour l'état courant */
  private fun applyTarget(snap: Boolean) {
    val l = layout(state)
    val sh = shiftDp
    pl.to((l.l + dxDp + sh) * dp, snap); pt.to((l.t + dyDp) * dp, snap)
    pw.to(l.w * dp, snap); ph.to(l.h * dp, snap); pr.to(l.r * dp, snap)
    stage.ax.to((l.sx + dxDp + sh) * dp - fxLeft, snap)
    stage.ay.to((l.sy + dyDp) * dp, snap)
    stage.asz.to(l.ss * dp, snap)
  }

  /* ───────── boucle d'animation ───────── */
  private val cb = Choreographer.FrameCallback { ns -> frame(ns) }

  private fun kick() {
    if (running || pill == null || !screenOn) return
    running = true
    lastNs = 0L
    Choreographer.getInstance().postFrameCallback(cb)
  }

  private fun frame(ns: Long) {
    if (pill == null) { running = false; return }
    val dt = if (lastNs == 0L) 0.016f else ((ns - lastNs) / 1_000_000_000f)
    lastNs = ns
    if (state == "activite") applyTarget(false)
    pl.step(dt); pt.step(dt); pw.step(dt); ph.step(dt); pr.step(dt)
    stage.tick(dt)
    val w = Math.max(1, Math.round(pw.v)); val h = Math.max(1, Math.round(ph.v))
    val x = Math.round(pl.v); val y = Math.round(pt.v)
    val lp = pillLp
    if (lp != null && (w != lastW || h != lastH || x != lastX || y != lastY)) {
      lp.width = w; lp.height = h; lp.x = x; lp.y = y
      lastW = w; lastH = h; lastX = x; lastY = y
      try { wm.updateViewLayout(pill, lp) } catch (e: Exception) { /* fenêtre retirée */ }
    }
    pill?.invalidate()
    fxv?.invalidate()
    val busy = stage.busy() || pl.moving() || pt.moving() || pw.moving() || ph.moving() || pr.moving() ||
      state != "repos" || (System.currentTimeMillis() - stateT0) < 800
    if (!screenOn) { running = false; return }
    if (busy) Choreographer.getInstance().postFrameCallback(cb)
    else ui.postDelayed({ if (running) Choreographer.getInstance().postFrameCallback(cb) }, 110)   /* au repos : ~9 images/s (respiration, clignement) */
  }

  /* ───────── dessin de la pilule et de son contenu ───────── */
  private val tfBold: Typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
  private val tfNorm: Typeface = Typeface.create("sans-serif", Typeface.NORMAL)
  private val bg = Paint(Paint.ANTI_ALIAS_FLAG).also { it.color = Color.parseColor("#201e1d") }
  private val ink = Paint(Paint.ANTI_ALIAS_FLAG)
  private val rr = RectF()
  private val clipPath = Path()
  private val cInk = Color.parseColor("#f5ead8")
  private val cSub = Color.parseColor("#a19786")
  private val cBars = Color.parseColor("#aebf92")
  private val cTrack = Color.parseColor("#474238")
  private val cFill = Color.parseColor("#8fa073")

  private fun ease(x: Float): Float { val v = Math.max(0f, Math.min(1f, x)); return v * v * (3f - 2f * v) }

  private inner class PillView(c: Context) : View(c) {
    private var downAt = 0L
    private var longFired = false
    private val longRun = Runnable { longFired = true; stage.play("ecoute"); onLong() }

    override fun onDraw(canvas: Canvas) {
      val w = width.toFloat(); val h = height.toFloat()
      rr.set(0f, 0f, w, h)
      val rad = Math.min(pr.v, Math.min(w, h) / 2f)
      canvas.drawRoundRect(rr, rad, rad, bg)
      clipPath.reset(); clipPath.addRoundRect(rr, rad, rad, Path.Direction.CW)
      canvas.save()
      canvas.clipPath(clipPath)
      // contenu : coordonnées de la maquette -> écran -> fenêtre (la pilule grandit derrière un contenu immobile)
      fun X(v: Float): Float = (v + dxDp + shiftDp) * dp - pl.v
      fun Y(v: Float): Float = (v + dyDp) * dp - pt.v
      val age = (System.currentTimeMillis() - stateT0) / 1000f
      val a = ease((age - 0.12f) / 0.3f)
      if (a > 0.01f) {
        ink.style = Paint.Style.FILL
        when (state) {
          "notif" -> {
            ink.typeface = tfBold
            ink.textAlign = Paint.Align.LEFT
            ink.textSize = 12.5f * dp; ink.color = fade(cInk, a); canvas.drawText(clip(title.ifEmpty { "Mìmir" }, 150f), X(84f), Y(21f) + 12f * dp, ink)
            ink.textSize = 11.5f * dp; ink.color = fade(cSub, a); ink.textAlign = Paint.Align.RIGHT; canvas.drawText("maintenant", X(352f), Y(21f) + 11f * dp, ink)
            ink.textAlign = Paint.Align.LEFT
            ink.typeface = tfNorm
            ink.textSize = 14f * dp; ink.color = fade(cInk, ease((age - 0.2f) / 0.3f)); canvas.drawText(clip(body, 268f), X(84f), Y(43f) + 14f * dp, ink)
          }
          "ecoute" -> {
            val per = floatArrayOf(0.9f, 0.7f, 1f, 0.8f, 0.95f); val del = floatArrayOf(0f, 0.15f, 0.3f, 0.1f, 0.25f)
            for (i in 0 until 5) {
              val s = 0.3f + 0.7f * (0.5f - 0.5f * Math.cos(2.0 * Math.PI * ((age - del[i]) / per[i])).toFloat())
              val bh = 24f * dp * s
              ink.color = fade(cBars, a)
              rr.set(X(112f + i * 15f), Y(33f) - bh / 2f, X(118f + i * 15f), Y(33f) + bh / 2f)
              canvas.drawRoundRect(rr, 3f * dp, 3f * dp, ink)
            }
            ink.typeface = tfBold; ink.textAlign = Paint.Align.LEFT
            ink.textSize = 12.5f * dp; ink.color = fade(cInk, a); canvas.drawText("J’écoute", X(246f), Y(25f) + 12f * dp, ink)
          }
          "reflexion" -> {
            ink.typeface = tfBold; ink.textAlign = Paint.Align.LEFT
            ink.textSize = 12.5f * dp; ink.color = fade(cInk, a); canvas.drawText("Je réfléchis", X(106f), Y(25f) + 12f * dp, ink)
            for (i in 0 until 3) {
              val pulse = 0.25f + 0.75f * (0.5f - 0.5f * Math.cos(2.0 * Math.PI * ((age - i * 0.2f) / 1.2f)).toFloat())
              ink.color = fade(cSub, a * pulse)
              canvas.drawCircle(X(253f + i * 12f), Y(33f), 3f * dp, ink)
            }
          }
          "activite" -> {
            ink.color = fade(cTrack, a)
            rr.set(X(62f), Y(31f), X(202f), Y(35f)); canvas.drawRoundRect(rr, 2f * dp, 2f * dp, ink)
            ink.color = fade(cFill, a)
            rr.set(X(62f), Y(31f), X(62f + prog * 140f), Y(35f)); canvas.drawRoundRect(rr, 2f * dp, 2f * dp, ink)
            ink.typeface = tfBold; ink.textAlign = Paint.Align.LEFT
            ink.textSize = 10.5f * dp; ink.color = fade(cSub, a); canvas.drawText(clip(label.ifEmpty { "En cours" }, 100f), X(246f), Y(18f) + 10f * dp, ink)
            ink.textSize = 13.5f * dp; ink.color = fade(cInk, a); canvas.drawText(Math.round(prog * 100f).toString() + " %", X(246f), Y(31f) + 13f * dp, ink)
          }
          else -> { /* repos : la pilule est vide, l'étoile y vit */ }
        }
      }
      canvas.restore()
    }

    private fun fade(color: Int, a: Float): Int = (color and 0x00FFFFFF) or ((Math.max(0f, Math.min(1f, a)) * 255f).toInt() shl 24)

    private fun clip(s: String, maxDp: Float): String {
      if (s.isEmpty()) return s
      val limit = maxDp * dp
      if (ink.measureText(s) <= limit) return s
      var n = s.length
      while (n > 1 && ink.measureText(s, 0, n) + ink.measureText("…") > limit) n--
      return s.substring(0, n).trimEnd() + "…"
    }

    override fun onTouchEvent(ev: MotionEvent): Boolean {
      when (ev.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          downAt = System.currentTimeMillis(); longFired = false
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

  private inner class FxView(c: Context) : View(c) {
    override fun onDraw(canvas: Canvas) { stage.draw(canvas, fxLeft.toFloat(), 0f) }
  }
}
