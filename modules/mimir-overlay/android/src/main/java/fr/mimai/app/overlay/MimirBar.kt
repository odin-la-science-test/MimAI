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
  private var esprit: EspritData?,
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
  /* hors ligne : l'étoile de Mìmir ; en mode en ligne : l'esprit gardien (si ses animations sont chargées) */
  private var stage: Being = if (MimirTheme.online && esprit != null) EspritStage(esprit!!) else EtoileStage(data)
  private var swapping = false
  private var dragging = false
  private var roam = true
  private var touchSide = 0
  private val roamRun = Runnable { roamTick() }
  private val prefs = ctx.getSharedPreferences("mimai_overlay", Context.MODE_PRIVATE)
  private var pendingSwap = false
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
  private var homeX = -1f
  private var homeY = -1f
  private val screenH: Int get() = ctx.resources.displayMetrics.heightPixels
  private fun clampX(x: Float): Float = Math.max(30f * dp, Math.min(screenW - 30f * dp, x))
  private fun clampY(y: Float): Float = Math.max(topPx + 16f * dp, Math.min(screenH - 110f * dp, y))
  private val restX: Float get() = if (homeX >= 0f) homeX else clampX(camXpx)
  private val restY: Float get() = if (homeY >= 0f) homeY else topPx + (if (stage is EspritStage) 24f else 20f) * dp
  private fun sizeFor(b: Being): Float = (if (b is EspritStage) 30f else 24f) * dp
  private val restS: Float get() = sizeFor(stage)

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

      // position posée par l'utilisateur (mémorisée) ; sinon sous la caméra
      if (prefs.contains("home_fx")) { homeX = clampX(prefs.getFloat("home_fx", 0.5f) * screenW); homeY = clampY(prefs.getFloat("home_fy", 0.05f) * screenH) }
      roam = prefs.getBoolean("roam", true)
      // fenêtre de dessin (non tactile) : tout l'écran, pour que Mìmir puisse aller partout
      fxLeft = 0
      val fh = screenH
      stage.place(restX - fxLeft, restY, restS)
      val fx = FxView(ctx)
      val flp = WindowManager.LayoutParams(screenW, fh, type, common or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE, PixelFormat.TRANSLUCENT)
      flp.gravity = Gravity.TOP or Gravity.START
      flp.x = 0; flp.y = 0
      cutoutAlways(flp)
      fxv = fx

      // fenêtre tactile : un carré autour de l'étoile au repos
      touchSide = (52f * dp).toInt()
      val side = touchSide
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
      stage.play(stage.clipFor("hello"))
      try { ctx.registerReceiver(screenReceiver, IntentFilter().also { it.addAction(Intent.ACTION_SCREEN_OFF); it.addAction(Intent.ACTION_SCREEN_ON) }) } catch (e: Exception) { /* facultatif */ }
      kick()
      if (roam) ui.postDelayed(roamRun, 15000)
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
    ui.removeCallbacks(roamRun)
    autoBack?.let { ui.removeCallbacks(it) }
    cancelSeq()
    try { ctx.unregisterReceiver(screenReceiver) } catch (e: Exception) { /* pas enregistré */ }
    touchV?.let { try { wm.removeView(it) } catch (e: Exception) { /* déjà retirée */ } }
    fxv?.let { try { wm.removeView(it) } catch (e: Exception) { /* déjà retirée */ } }
    touchV = null; fxv = null
  }

  /* ───────── déplacement : glisser avec le doigt, et promenade autonome ───────── */
  private fun moveTouch() {
    val v = touchV ?: return
    val lp = touchLp ?: return
    lp.x = Math.max(0, (restX - touchSide / 2f).toInt())
    lp.y = Math.max(0, (restY - touchSide / 2f).toInt())
    try { wm.updateViewLayout(v, lp) } catch (e: Exception) { /* fenêtre retirée */ }
  }

  private fun moveHome(x: Float, y: Float) {
    homeX = clampX(x); homeY = clampY(y)
    stage.place(homeX - fxLeft, homeY, restS)
    moveTouch()
    kick()
  }

  private fun saveHome() {
    prefs.edit().putFloat("home_fx", restX / screenW).putFloat("home_fy", restY / screenH).apply()
  }

  fun setRoam(on: Boolean) {
    ui.post {
      roam = on
      ui.removeCallbacks(roamRun)
      if (on && fxv != null) ui.postDelayed(roamRun, 12000)
    }
  }

  /* de temps en temps, Mìmir se promène tout seul : il vole jusqu'à un autre endroit de l'écran et s'y pose */
  private fun roamTick() {
    ui.removeCallbacks(roamRun)
    if (!roam || fxv == null) return
    if (isOpen || swapping || pendingSwap || dragging || !screenOn || stage.busy() || state != "repos") { ui.postDelayed(roamRun, 8000); return }
    val tx = clampX(36f * dp + Math.random().toFloat() * (screenW - 72f * dp))
    val ty = clampY(topPx + 24f * dp + Math.random().toFloat() * (screenH - topPx - 170f * dp))
    val x0 = restX
    val y0 = restY
    val dist = Math.hypot((tx - x0).toDouble(), (ty - y0).toDouble()).toFloat()
    val dur = Math.max(1.3f, Math.min(3.4f, dist / (230f * dp)))
    setHit(false)
    stage.play(stage.clipFor("roam"))
    stage.fly(tx - fxLeft, ty, restS, (x0 + tx) / 2f + (Math.random().toFloat() - 0.5f) * 120f * dp, Math.min(y0, ty) - 60f * dp * Math.random().toFloat(), dur, "io", "io", "io") {
      homeX = tx; homeY = ty
      moveTouch(); setHit(true)
      stage.play(stage.clipFor("land"))
      kick()
    }
    kick()
    ui.postDelayed(roamRun, (22000 + Math.random() * 38000).toLong())
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
  fun openStar(variant: String): FloatArray {
    val big = (if (stage is EspritStage) 46f else 40f) * dp
    return when (variant) {
      "2a" -> floatArrayOf(mx(52f), my(100f), big)
      "2b" -> floatArrayOf(mx(330f), my(96f), big)
      else -> floatArrayOf(mx(195f), my(104f), big)
    }
  }

  private fun stepsFor(variant: String): List<Step> = if (stage is EspritStage) listOf(
    /* l'esprit gardien (maquette « L'esprit gardien », 1b) : il vole en battant des ailes, puis se pose à côté de sa bulle */
    Step(0f, "vole_bulle", floatArrayOf(0.8f, mx(255f), my(36f)), arrayOf("io", "io", "io"), false),
    Step(0.8f, "pose_bulle", null, null, true)
  ) else when (variant) {
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
      val esp = stage is EspritStage
      val r1 = Runnable {
        stage.play(if (esp) "rentre" else "envol")
        stage.fly(restX - fxLeft + 0f, restY, restS, (s[0] + restX) / 2f, Math.min(s[1], restY) - 36f * dp, if (esp) 0.7f else 0.6f, "io", "io", "io", null)
        kick()
      }
      val r2 = Runnable { if (!esp) stage.play("pose"); kick() }
      val r3 = Runnable {
        isOpen = false; setHit(true); stage.switchMode("idle"); MimirOverlayService.lastEvent = "Mìmir revenu à sa place"; kick()
        if (pendingSwap) { pendingSwap = false; setOnline(MimirTheme.online) }
      }
      seq.add(r1); seq.add(r2); seq.add(r3)
      ui.postDelayed(r1, 200); ui.postDelayed(r2, 820); ui.postDelayed(r3, if (esp) 1000 else 1250)
      kick()
    }
  }

  /* bas de la zone de l'étoile au repos (pixels) */
  fun bottomPx(): Int = (restY + (if (stage is EspritStage) 36f else 30f) * dp).toInt()

  /* mode en ligne : l'étoile s'efface, l'esprit gardien prend sa place (et inversement) */
  fun attachEsprit(e: EspritData) { ui.post { esprit = e; setOnline(MimirTheme.online) } }

  fun setOnline(on: Boolean) {
    ui.post {
      val wantEsprit = on && esprit != null
      if ((stage is EspritStage) == wantEsprit || swapping) return@post
      if (isOpen) { pendingSwap = true; return@post }   /* pas de changement pendant que la bulle est ouverte */
      swapping = true
      val old = stage
      old.play(if (old is EspritStage) "depart" else "eveil")
      kick()
      ui.postDelayed({
        val ns: Being = if (wantEsprit) EspritStage(esprit!!) else EtoileStage(data)
        stage = ns
        ns.place(restX - fxLeft, restY, sizeFor(ns))
        ns.ambient = true
        ns.play(ns.clipFor("arrive"))
        swapping = false
        kick()
      }, 700)
    }
  }

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
          "ecoute" -> { stage.switchMode("listen"); stage.play(stage.clipFor("listen")) }
          "reflexion" -> { stage.switchMode("think"); stage.play(stage.clipFor(if (isOpen) "thinkOpen" else "think")) }
          "notif" -> { stage.switchMode("idle"); stage.play(stage.clipFor("notif")) }
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
      val st = stage
      val s = st.sizePx
      val cx = st.posX + st.offX * s - fxLeft
      val cy = st.posY + st.offY * s
      if (state == "activite") {
        val r = s * 0.95f
        ring.strokeWidth = 2.4f * dp
        ring.color = MimirTheme.shift(Color.argb(70, 245, 234, 216))
        canvas.drawCircle(cx, cy, r, ring)
        ring.color = MimirTheme.pc("#8fa073")
        rr.set(cx - r, cy - r, cx + r, cy + r)
        canvas.drawArc(rr, -90f, 360f * prog, false, ring)
      } else if (state == "notif") {
        dot.color = Color.WHITE; canvas.drawCircle(cx + s * 0.58f, cy - s * 0.58f, 5f * dp, dot)
        dot.color = MimirTheme.pc("#c67139"); canvas.drawCircle(cx + s * 0.58f, cy - s * 0.58f, 3.6f * dp, dot)
      }
    }
  }

  private inner class TouchView(c: Context) : View(c) {
    private var longFired = false
    private var downX = 0f
    private var downY = 0f
    private var startHX = 0f
    private var startHY = 0f
    private val longRun = Runnable { longFired = true; stage.play(stage.clipFor("listen")); kick(); onLong() }
    /* mode en ligne : rester appuyé 5 secondes sur le personnage repasse en mode hors ligne */
    private val offRun = Runnable {
      longFired = true
      performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS)
      MimirOverlayService.instance?.goOffline()
    }

    override fun onTouchEvent(ev: MotionEvent): Boolean {
      when (ev.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          MimirOverlayService.lastEvent = "toucher reçu sur Mìmir (" + ev.x.toInt() + "," + ev.y.toInt() + ")"
          longFired = false
          dragging = false
          downX = ev.rawX; downY = ev.rawY; startHX = restX; startHY = restY
          if (!isOpen) { stage.playRandomTap(); kick() }
          if (MimirTheme.online) ui.postDelayed(offRun, 5000) else ui.postDelayed(longRun, 500)
          return true
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = ev.rawX - downX
          val dy = ev.rawY - downY
          if (!dragging && !isOpen && Math.hypot(dx.toDouble(), dy.toDouble()) > 12f * dp) {
            dragging = true
            ui.removeCallbacks(longRun); ui.removeCallbacks(offRun)
            ui.removeCallbacks(roamRun)
            stage.play(stage.clipFor("grab"))
          }
          if (dragging) moveHome(startHX + dx, startHY + dy)
          return true
        }
        MotionEvent.ACTION_UP -> {
          ui.removeCallbacks(longRun); ui.removeCallbacks(offRun)
          if (dragging) {
            dragging = false
            saveHome()
            stage.play(stage.clipFor("land"))
            MimirOverlayService.lastEvent = "Mìmir posé en (" + restX.toInt() + "," + restY.toInt() + ")"
            if (roam) ui.postDelayed(roamRun, 30000)
            kick()
          } else if (!longFired) { MimirOverlayService.lastEvent = "toucher court : ouverture"; onTap() }
          return true
        }
        MotionEvent.ACTION_CANCEL -> { ui.removeCallbacks(longRun); ui.removeCallbacks(offRun); if (dragging) { dragging = false; saveHome() }; return true }
      }
      return super.onTouchEvent(ev)
    }
  }
}
