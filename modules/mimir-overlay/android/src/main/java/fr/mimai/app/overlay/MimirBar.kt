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

/* Mìmir près de la caméra — design « La barre Mìmir », TOUR 2 : plus de barre, l'étoile seule vit à côté de la caméra
   (petit être avec des yeux et 156 animations). Un toucher sur elle l'« ouvre » : elle s'éveille puis vole vers sa place
   (trois ouvertures : 2a Bond, 2b Éclosion, 2c Chute) et la bulle de discussion s'ouvre à côté d'elle. Fermer la bulle
   renvoie l'étoile à sa place, à côté de la caméra.
   Deux fenêtres : une petite fenêtre TACTILE autour de l'étoile au repos (rien d'autre n'est capté) et une fenêtre de
   dessin transparente et NON tactile où l'étoile vole et lance ses effets.
   Les états se lisent sur l'étoile : écoute (verte, yeux en l'air), réflexion (elle se balance), progression (anneau),
   notification (pastille). */
class MimirBar(
  private val ctx: Context,
  private val wm: WindowManager,
  private val data: EtoileData,
  private val camXpx: Float,
  private val camYpx: Float,
  private val topPx: Float,
  private val below: Boolean,
  private val onTap: () -> Unit,
  private val onLong: () -> Unit
) {
  private val ui = Handler(Looper.getMainLooper())
  private val dp = ctx.resources.displayMetrics.density
  private val screenW = ctx.resources.displayMetrics.widthPixels
  private val stage = EtoileStage(data)
  private var touchV: TouchView? = null
  private var touchLp: WindowManager.LayoutParams? = null
  private var touchFlags = 0
  private var fxv: FxView? = null
  private var fxLeft = 0

  var state = "repos"; private set
  var isOpen = false; private set
  private var prog = 0f
  private var stateT0 = 0L
  private var autoBack: Runnable? = null
  private var seq = ArrayList<Runnable>()
  private var running = false
  private var screenOn = true
  private var lastNs = 0L
  private var skip = false

  /* repère de la maquette : la caméra y est en (194,5 ; 24) ; tout est converti autour de la vraie caméra */
  private fun mx(m: Float): Float = camXpx + (m - 194.5f) * dp
  private fun my(m: Float): Float = camYpx + (m - 24f) * dp

  /* place de repos : à côté de la caméra, côté batterie (petite) — ou juste sous la barre d'état sur les téléphones où
     le système y garde les touchers (Samsung) ; l'étoile y est alors un peu plus grande */
  private val restX: Float get() = if (below) Math.max(34f * dp, Math.min(screenW - 34f * dp, camXpx)) else mx(219f)
  private val restY: Float get() = if (below) topPx + 20f * dp else my(24f)
  private val restS: Float get() = if (below) 24f * dp else 16f * dp

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

      // fenêtre de dessin (non tactile) : toute la largeur, assez haute pour les vols de l'étoile
      fxLeft = 0
      val fh = Math.min(ctx.resources.displayMetrics.heightPixels, (330f * dp).toInt())
      stage.place(restX - fxLeft, restY, restS)
      val fx = FxView(ctx)
      val flp = WindowManager.LayoutParams(screenW, fh, type, common or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE, PixelFormat.TRANSLUCENT)
      flp.gravity = Gravity.TOP or Gravity.START
      flp.x = 0; flp.y = 0
      cutoutAlways(flp)
      fxv = fx

      // fenêtre tactile : un carré autour de l'étoile au repos
      val side = (46f * dp).toInt()
      val tv = TouchView(ctx)
      val tlp = WindowManager.LayoutParams(side, side, type, common, PixelFormat.TRANSLUCENT)
      tlp.gravity = Gravity.TOP or Gravity.START
      tlp.x = Math.max(0, (restX - side / 2f).toInt())
      tlp.y = Math.max(0, (restY - side / 2f).toInt())
      cutoutAlways(tlp)
      touchV = tv; touchLp = tlp; touchFlags = tlp.flags

      wm.addView(fx, flp)
      wm.addView(tv, tlp)    // ajoutée en dernier : elle reçoit les touchers
      MimirOverlayService.lastEvent = "Mìmir affiché au repos en (" + restX.toInt() + "," + restY.toInt() + "), zone tactile " + side + " px"
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
    cancelSeq()
    try { ctx.unregisterReceiver(screenReceiver) } catch (e: Exception) { /* pas enregistré */ }
    touchV?.let { try { wm.removeView(it) } catch (e: Exception) { /* déjà retirée */ } }
    fxv?.let { try { wm.removeView(it) } catch (e: Exception) { /* déjà retirée */ } }
    touchV = null; fxv = null
  }

  /* la zone tactile n'existe qu'au repos : pendant l'ouverture, l'étoile vole et la bulle a ses propres boutons */
  private fun setHit(on: Boolean) {
    val v = touchV ?: return
    val lp = touchLp ?: return
    lp.flags = if (on) touchFlags else (touchFlags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE)
    try { wm.updateViewLayout(v, lp) } catch (e: Exception) { /* fenêtre retirée */ }
  }

  /* ───────── ouverture / fermeture (tour 2) ───────── */
  private class Step(val at: Float, val clip: String, val fly: FloatArray?, val ease: Array<String>?, val bubble: Boolean)

  /* position finale de l'étoile quand la bulle est ouverte : x, y, taille (pixels) */
  fun openStar(variant: String): FloatArray = when (variant) {
    "2a" -> floatArrayOf(mx(52f), my(100f), 40f * dp)
    "2b" -> floatArrayOf(mx(330f), my(96f), 40f * dp)
    else -> floatArrayOf(mx(195f), my(104f), 40f * dp)
  }

  private fun stepsFor(variant: String): List<Step> = when (variant) {
    "2a" -> listOf(
      Step(0f, "eveil", null, null, false),
      Step(0.45f, "envol", floatArrayOf(0.7f, mx(150f), my(-30f)), arrayOf("io", "io", "ob"), false),
      Step(1.15f, "atterrit", null, null, true),
      Step(1.75f, "salut", null, null, false)
    )
    "2b" -> listOf(
      Step(0f, "eveil", null, null, false),
      Step(0.45f, "eclot", null, null, false),
      Step(1.05f, "plane", floatArrayOf(0.55f, mx(300f), my(30f)), arrayOf("io", "io", "ob"), false),
      Step(1.6f, "atterrit", null, null, true),
      Step(2.1f, "clin", null, null, false)
    )
    else -> listOf(
      Step(0f, "eveil", null, null, false),
      Step(0.45f, "chute", floatArrayOf(1.0f, mx(207f), my(64f)), arrayOf("io", "bo", "oc"), false),
      Step(1.45f, "salut", null, null, true)
    )
  }

  private fun cancelSeq() { for (r in seq) ui.removeCallbacks(r); seq.clear() }

  /* l'étoile s'éveille, vole vers sa place d'ouverture ; onBubble est appelé au moment où la bulle doit s'ouvrir */
  fun open(variant: String, onBubble: () -> Unit) {
    ui.post {
      if (isOpen) return@post
      isOpen = true
      cancelSeq()
      setHit(false)
      val end = openStar(variant)
      for (st in stepsFor(variant)) {
        val r = Runnable {
          stage.play(st.clip)
          val f = st.fly
          val e = st.ease
          if (f != null && e != null) stage.fly(end[0], end[1], end[2], f[1], f[2], f[0], e[0], e[1], e[2], null)
          if (st.bubble) onBubble()
          kick()
        }
        seq.add(r)
        ui.postDelayed(r, (st.at * 1000f).toLong())
      }
      kick()
    }
  }

  /* la bulle se ferme : l'étoile rebondit jusqu'à sa place, à côté de la caméra */
  fun close(variant: String) {
    ui.post {
      if (!isOpen) return@post
      cancelSeq()
      val s = openStar(variant)
      val r1 = Runnable {
        stage.play("envol")
        stage.fly(restX - fxLeft + 0f, restY, restS, (s[0] + restX) / 2f, Math.min(s[1], restY) - 36f * dp, 0.6f, "io", "io", "io", null)
        kick()
      }
      val r2 = Runnable { stage.play("pose"); kick() }
      val r3 = Runnable { isOpen = false; setHit(true); stage.switchMode("idle"); MimirOverlayService.lastEvent = "Mìmir revenu à sa place"; kick() }
      seq.add(r1); seq.add(r2); seq.add(r3)
      ui.postDelayed(r1, 200); ui.postDelayed(r2, 820); ui.postDelayed(r3, 1250)
      kick()
    }
  }

  /* bas de la zone de l'étoile au repos (pixels) */
  fun bottomPx(): Int = (restY + 30f * dp).toInt()

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
          "reflexion" -> { stage.switchMode("think"); stage.play(if (isOpen) "compris" else "reflechit") }
          "notif" -> { stage.switchMode("idle"); stage.play("message") }
          else -> stage.switchMode(if (isOpen) "read" else "idle")   // bulle ouverte : elle « lit » la réponse
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
    // 60 images/s pendant une animation, 30 pour les états longs (progression, écoute…), ~9 au repos
    skip = !skip
    val longState = state == "activite" || state == "ecoute" || state == "reflexion"
    if (longState && !stage.busy() && skip) { Choreographer.getInstance().postFrameCallback(cb); return }
    val dt = if (lastNs == 0L) 0.016f else ((ns - lastNs) / 1_000_000_000f)
    lastNs = ns
    var left = Math.min(dt, 0.5f)
    while (left > 0.0001f) { val step = Math.min(0.05f, left); stage.tick(step); left -= step }
    fxv?.invalidate()
    if (!screenOn) { running = false; return }
    val busy = stage.busy() || state != "repos" || isOpen || (System.currentTimeMillis() - stateT0) < 800
    if (busy) Choreographer.getInstance().postFrameCallback(cb)
    else ui.postDelayed({ if (running) Choreographer.getInstance().postFrameCallback(cb) }, 110)
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
        val r = s * 0.95f
        ring.strokeWidth = 2.4f * dp
        ring.color = Color.argb(70, 245, 234, 216)
        canvas.drawCircle(cx, cy, r, ring)
        ring.color = Color.parseColor("#8fa073")
        rr.set(cx - r, cy - r, cx + r, cy + r)
        canvas.drawArc(rr, -90f, 360f * prog, false, ring)
      } else if (state == "notif") {
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
          MimirOverlayService.lastEvent = "toucher reçu sur Mìmir (" + ev.x.toInt() + "," + ev.y.toInt() + ")"
          longFired = false
          if (!isOpen) { stage.playRandomTap(); kick() }
          ui.postDelayed(longRun, 500)
          return true
        }
        MotionEvent.ACTION_UP -> {
          ui.removeCallbacks(longRun)
          if (!longFired) { MimirOverlayService.lastEvent = "toucher court : ouverture"; onTap() }
          return true
        }
        MotionEvent.ACTION_CANCEL -> { ui.removeCallbacks(longRun); return true }
      }
      return super.onTouchEvent(ev)
    }
  }
}
