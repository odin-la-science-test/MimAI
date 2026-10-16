package fr.mimai.app.overlay

import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface

/* une image calculée de l'esprit : les 39 champs de EspritData (position, ailes, capuche, runes, yeux, couleur…) */
class EsFr {
  val v = FloatArray(EspritData.N)
  var anim: EspritAnim? = null
  var p = 0f

  fun set(o: EsFr) { System.arraycopy(o.v, 0, v, 0, v.size); anim = o.anim; p = o.p }

  fun zero(base: FloatArray, eyeOpen: Int) {
    for (i in 0 until EspritData.ADD_END) v[i] = 0f
    for (i in EspritData.ADD_END until EspritData.MUL_END) v[i] = 1f
    v[EspritData.HOLD] = 0f
    v[EspritData.C0] = base[0]; v[EspritData.C1] = base[1]; v[EspritData.C2] = base[2]
    v[EspritData.EYES] = eyeOpen.toFloat()
    anim = null; p = 0f
  }
}

/* L'esprit gardien : le personnage du mode en ligne. Port Kotlin du moteur de la maquette « L'esprit gardien » ; les animations
   elles-mêmes sont lues dans esprit.json (voir scripts/bake-esprit.mjs). Il ne rebondit jamais : il plane, bat des ailes, dresse sa
   capuche et parle avec ses runes. Les capteurs de mouvement ne sont pas repris (la barre reste immobile). */
class EspritStage(private val d: EspritData, val orange: Boolean = false) : Being {
  private class ESpr(var v: Float) {
    var t = v
    var dd = 0f
    fun to(x: Float, snap: Boolean = false) { t = x; if (snap) { v = x; dd = 0f } }
    fun step(dt: Float): Float { val a = (t - v) * 120f - dd * 22f; dd += a * dt; v += dd * dt; return v }
    fun moving(): Boolean = Math.abs(t - v) > 0.15f || Math.abs(dd) > 1.5f
  }

  var t = 0f
  private val ax = ESpr(0f)
  private val ay = ESpr(0f)
  private val asz = ESpr(30f)
  var mode = "idle"
  private var mPrev = "idle"
  private var mT0 = -9f
  private var clip: EspritAnim? = null
  private var clipT0 = 0f
  private var hasSnap = false
  private val snap = EsFr()
  val cur = EsFr()
  private val fr = EsFr()
  private val fa = EsFr()
  private val cf = EsFr()
  private val f2 = EsFr()
  private val f3 = EsFr()
  private var blinkAt = 1.2f + Math.random().toFloat() * 2.5f
  private var ambAt = 7f + Math.random().toFloat() * 6f
  private var lookAt = 2f
  private val look = floatArrayOf(0f, 0f)
  private val lookT = floatArrayOf(0f, 0f)
  override var ambient = true
  var onEnd: ((String) -> Unit)? = null

  private class Flight(
    val x0: Float, val y0: Float, val s0: Float, val x1: Float, val y1: Float, val s1: Float,
    val cx: Float, val cy: Float, val d: Float, val ex: String, val ey: String, val es: String, val t0: Float, val cb: (() -> Unit)?
  )
  private var flight: Flight? = null

  var X = 0f; var Y = 0f; var S = 30f
  override val posX: Float get() = X
  override val posY: Float get() = Y
  override val sizePx: Float get() = S
  override val offX: Float get() = cur.v[EspritData.X]
  override val offY: Float get() = cur.v[EspritData.Y]

  private val tau = (2.0 * Math.PI).toFloat()
  private val pi = Math.PI.toFloat()

  /* palette (Oklab) */
  private val base = d.lab("c5", orange)
  private val labCy = d.lab("cy", orange)
  private val labIn = d.lab("in", orange)
  private val labC8 = d.lab("c8", orange)
  private val labC1 = d.lab("c1", orange)
  private val labC2 = d.lab("c2", orange)
  private val labWh = d.lab("wh", orange)
  private val labVd = d.lab("vd", orange)
  private val labPu = d.lab("pu", orange)
  private val labH = arrayOf(d.lab("h1", orange), d.lab("h2", orange), d.lab("h3", orange), d.lab("h4", orange))
  private val labR = arrayOf(d.lab("r1", orange), d.lab("r2", orange), d.lab("r3", orange))
  private val eyeKeys = d.eyeKeys
  private val eyeOpen = Math.max(0, eyeKeys.indexOf("open"))
  private val eyeOff = Math.max(0, eyeKeys.indexOf("eteint"))

  /* trajectoire / historique pour le sillage */
  private val hX = FloatArray(16); private val hY = FloatArray(16); private val hPr = FloatArray(16)
  private val hR = FloatArray(16); private val hSX = FloatArray(16); private val hSY = FloatArray(16)
  private var hN = 0

  private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
  private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).also { it.style = Paint.Style.STROKE; it.strokeCap = Paint.Cap.ROUND; it.strokeJoin = Paint.Join.ROUND }
  private val txt = Paint(Paint.ANTI_ALIAS_FLAG).also { it.textAlign = Paint.Align.CENTER; it.typeface = Typeface.create("sans-serif-medium", Typeface.BOLD) }
  private val rect = RectF()
  private val bounds = RectF()
  private val mat = Matrix()
  private val hood = Path()
  private val shade = Path()
  private var lastTip = ""

  private fun ss(x: Float): Float = x * x * (3f - 2f * x)
  private fun cl(v: Float, a: Float, b: Float): Float = if (v < a) a else if (v > b) b else v
  private fun nA(r: Float): Float = (((r % 360f) + 540f) % 360f) - 180f
  private fun bell(p: Float, c: Float, w: Float): Float {
    val u = (p - c) / w
    return if (Math.abs(u) >= 1f) 0f else 0.5f + 0.5f * Math.cos((pi * u).toDouble()).toFloat()
  }
  private fun sin(x: Float): Float = Math.sin(x.toDouble()).toFloat()

  private fun ez(name: String, q: Float): Float = when (name) {
    "oc" -> 1f - Math.pow((1f - q).toDouble(), 3.0).toFloat()
    "ss" -> q * q * (3f - 2f * q)
    "sn" -> 0.5f - 0.5f * Math.cos((pi * q).toDouble()).toFloat()
    "lin" -> q
    else -> if (q < 0.5f) 4f * q * q * q else 1f - (Math.pow((-2f * q + 2f).toDouble(), 3.0).toFloat()) / 2f
  }

  override fun fly(x1: Float, y1: Float, s1: Float, cx: Float?, cy: Float?, d: Float, ex: String, ey: String?, es: String, cb: (() -> Unit)?) {
    flight = Flight(ax.v, ay.v, asz.v, x1, y1, if (s1 > 0f) s1 else asz.v, cx ?: ((ax.v + x1) / 2f), cy ?: ((ay.v + y1) / 2f), if (d > 0f) d else 0.6f, ex, ey ?: ex, es, t, cb)
  }

  override fun place(x: Float, y: Float, size: Float) { flight = null; ax.to(x, true); ay.to(y, true); asz.to(size, true) }

  override fun has(id: String): Boolean = d.byId.containsKey(id)

  override fun play(id: String) {
    val a = d.byId[id] ?: return
    hasSnap = true
    snap.set(cur)
    clip = a
    clipT0 = t
  }

  override fun playRandomTap() { val l = d.tap; if (l.isNotEmpty()) play(l[(Math.random() * l.size).toInt()]) }

  override fun switchMode(m: String) {
    if (m == mode) return
    if (m != "idle" && m != "listen" && m != "think" && m != "read" && m != "sleep") return
    mPrev = mode; mode = m; mT0 = t
  }

  override fun busy(): Boolean = clip != null || flight != null || (t - mT0) < 0.5f || ax.moving() || ay.moving() || asz.moving()

  override fun clipFor(role: String): String = when (role) {
    "hello" -> "coucou"
    "listen" -> "scrute"
    "think" -> "pensif"
    "thinkOpen" -> "pensif"
    "notif" -> "message"
    "roam" -> "papillon"
    "land" -> "pose_bulle"
    "grab" -> "frisson"
    "arrive" -> "arrivee"
    "leave" -> "depart"
    else -> "coucou"
  }

  /* ───────── calcul ───────── */
  private fun mixCol(o: EsFr, a: FloatArray, b: FloatArray, w: Float) {
    val k = cl(w, 0f, 1f)
    o.v[EspritData.C0] = a[0] + (b[0] - a[0]) * k; o.v[EspritData.C1] = a[1] + (b[1] - a[1]) * k; o.v[EspritData.C2] = a[2] + (b[2] - a[2]) * k
  }

  private fun modeFrame(m: String, tt: Float, out: EsFr) {
    out.zero(base, eyeOpen)
    val v = out.v
    when (m) {
      "idle" -> {
        v[EspritData.Y] = -0.035f * sin(tau * tt / 2.6f)
        val w = 7f * sin(tau * tt / 1.3f)
        v[EspritData.WL] = w; v[EspritData.WR] = w
        v[EspritData.HT] = 1.4f * sin(tau * tt / 3.1f)
        v[EspritData.RG] = 0.12f * sin(tau * tt / 2.2f)
        v[EspritData.EX] = look[0]; v[EspritData.EY] = look[1]
      }
      "listen" -> {
        v[EspritData.Y] = -0.02f * sin(tau * tt / 1.6f)
        val w = 16f + 4f * sin(tau * tt / 0.5f)
        v[EspritData.WL] = w; v[EspritData.WR] = w
        v[EspritData.HH] = 3.5f
        v[EspritData.HT] = 1.2f * sin(tau * tt / 0.8f)
        v[EspritData.RG] = 0.5f + 0.4f * sin(tau * tt / 0.6f)
        v[EspritData.EY] = -0.35f
        v[EspritData.BL] = 0.5f; v[EspritData.BR] = 0.5f
        mixCol(out, base, labCy, 0.45f)
        v[EspritData.EG] = 0.3f
      }
      "think" -> {
        v[EspritData.Y] = -0.03f * sin(tau * tt / 2f)
        val w = 5f * sin(tau * tt / 1.1f)
        v[EspritData.WL] = w; v[EspritData.WR] = w
        v[EspritData.RG] = -0.45f
        for (i in 0 until 3) {
          val q = (((tt / 1.2f - i / 3f) % 1f) + 1f) % 1f
          v[EspritData.R1 + i] = 1.3f * bell(q, 0.2f, 0.2f)
        }
        v[EspritData.EX] = -0.45f; v[EspritData.EY] = -0.6f
        mixCol(out, base, labIn, 0.2f)
      }
      "read" -> {
        val w = 3f * sin(tau * tt / 2.4f)
        v[EspritData.WL] = w; v[EspritData.WR] = w
        val q = (tt % 2.8f) / 2.8f
        v[EspritData.EX] = -0.55f + 1.1f * ss(Math.min(1f, q * 1.15f))
        v[EspritData.EY] = 0.5f
      }
      "sleep" -> {
        v[EspritData.Y] = 0.05f - 0.02f * sin(tau * tt / 4.5f)
        val w = -26f + 2f * sin(tau * tt / 4.5f)
        v[EspritData.WL] = w; v[EspritData.WR] = w
        v[EspritData.WS] = 0.82f
        v[EspritData.RG] = -0.65f
        v[EspritData.EYES] = eyeOff.toFloat()
        mixCol(out, base, labC8, 0.4f)
      }
    }
  }

  private fun lerpF(a: EsFr, b: EsFr, w: Float, out: EsFr) {
    if (w >= 1f) { out.set(b); return }
    if (w <= 0f) { out.set(a); return }
    out.set(b)
    for (q in 0 until EspritData.MUL_END) out.v[q] = a.v[q] + (b.v[q] - a.v[q]) * w
    for (q in EspritData.C0..EspritData.C2) out.v[q] = a.v[q] + (b.v[q] - a.v[q]) * w
    out.v[EspritData.EYES] = if (w < 0.5f) a.v[EspritData.EYES] else b.v[EspritData.EYES]
  }

  /* image d'une animation à la position p (0..1), lue dans les images cuites (interpolation linéaire entre deux images) */
  private fun evalClip(a: EspritAnim, p: Float, out: EsFr) {
    val pos = cl(p, 0f, 0.9999f) * a.frames
    val i0 = Math.min(a.frames - 1, pos.toInt())
    val i1 = Math.min(a.frames - 1, i0 + 1)
    val w = pos - i0
    val o0 = i0 * EspritData.N
    val o1 = i1 * EspritData.N
    val f = a.f
    for (k in 0 until EspritData.EYES) out.v[k] = f[o0 + k] + (f[o1 + k] - f[o0 + k]) * w
    out.v[EspritData.EYES] = f[o0 + EspritData.EYES]
    if (orange) {   /* version orange : couleurs calculées par le moteur avec la palette orange */
      val c = a.colAlt
      for (k in 0 until 3) out.v[EspritData.C0 + k] = c[i0 * 3 + k] + (c[i1 * 3 + k] - c[i0 * 3 + k]) * w
    }
    out.anim = a; out.p = p
  }

  private val holdTargets = intArrayOf(EspritData.Y, EspritData.WL, EspritData.WR, EspritData.HT, EspritData.RG, EspritData.EX, EspritData.EY)

  private fun compose(m: EsFr, c: EsFr, w: Float, out: EsFr) {
    out.set(m)
    val hold = c.v[EspritData.HOLD] * w
    if (hold != 0f) for (q in holdTargets) out.v[q] = out.v[q] * (1f - hold)
    for (q in 0 until EspritData.ADD_END) {
      val v = if (q == EspritData.R || q == EspritData.PR || q == EspritData.RR) nA(c.v[q]) else c.v[q]
      out.v[q] = out.v[q] + v * w
    }
    for (q in EspritData.ADD_END until EspritData.MUL_END) out.v[q] = out.v[q] * (1f + (c.v[q] - 1f) * w)
    for (q in EspritData.C0..EspritData.C2) out.v[q] = m.v[q] + (c.v[q] - m.v[q]) * cl(w, 0f, 1f)
    val ce = c.v[EspritData.EYES].toInt()
    if (ce != eyeOpen && w > 0.5f) out.v[EspritData.EYES] = ce.toFloat()
    out.anim = c.anim; out.p = c.p
  }

  override fun tick(dtRaw: Float) {
    val dt = Math.min(0.05f, Math.max(0f, dtRaw))
    t += dt
    val fl = flight
    if (fl != null) {
      val q = cl((t - fl.t0) / fl.d, 0f, 1f)
      val ex = ez(fl.ex, q); val ey = ez(fl.ey, q)
      val u = 1f - ex; val w = 1f - ey
      ax.to(u * u * fl.x0 + 2f * u * ex * fl.cx + ex * ex * fl.x1, true)
      ay.to(w * w * fl.y0 + 2f * w * ey * fl.cy + ey * ey * fl.y1, true)
      asz.to(fl.s0 + (fl.s1 - fl.s0) * ez(fl.es, q), true)
      if (q >= 1f) { flight = null; fl.cb?.invoke() }
    }
    X = ax.step(dt); Y = ay.step(dt); S = Math.max(4f, asz.step(dt))
    if (mode == "idle") {
      if (t > lookAt) {
        lookAt = t + 2.2f + Math.random().toFloat() * 3f
        if (Math.random() < 0.4) { lookT[0] = 0f; lookT[1] = 0f } else { lookT[0] = (Math.random().toFloat() - 0.5f) * 1.4f; lookT[1] = (Math.random().toFloat() - 0.5f) * 0.8f }
      }
      val kk = 1f - Math.exp((-dt * 6f).toDouble()).toFloat()
      look[0] += (lookT[0] - look[0]) * kk; look[1] += (lookT[1] - look[1]) * kk
    }
    modeFrame(mode, t, fr)
    if (t - mT0 < 0.5f) {
      modeFrame(mPrev, t, fa)
      lerpF(fa, fr, ss((t - mT0) / 0.5f), f3)
      fr.set(f3)
    }
    if (clip == null && mode != "sleep" && t >= blinkAt) {
      val ph = (t - blinkAt) / 0.15f
      if (ph >= 1f) blinkAt = t + (if (Math.random() < 0.2) 0.25f else 2.2f + Math.random().toFloat() * 3.5f)
      else fr.v[EspritData.BLINK] = sin(pi * ph)
    }
    if (ambient && clip == null && mode == "idle" && t > ambAt && d.amb.isNotEmpty()) {
      ambAt = t + 9f + Math.random().toFloat() * 8f
      play(d.amb[(Math.random() * d.amb.size).toInt()])
    }
    val a = clip
    if (a != null) {
      val tc = t - clipT0
      val p = tc / a.d
      if (p >= 1f) { clip = null; hasSnap = false; onEnd?.invoke(a.id) }
      else {
        evalClip(a, p, cf)
        val w = if (a.hard) 1f else ss(cl(Math.min(tc / 0.08f, (a.d - tc) / 0.08f), 0f, 1f))
        compose(fr, cf, w, f2)
        if (hasSnap && tc < 0.16f && !a.hard) { lerpF(snap, f2, ss(tc / 0.16f), f3); fr.set(f3) } else fr.set(f2)
      }
    }
    cur.set(fr)
    // historique du sillage
    val v = fr.v
    val kS = S / 114f
    val sx = v[EspritData.S] * v[EspritData.SX] * kS
    val sy = v[EspritData.S] * v[EspritData.SY] * kS
    if (hN == 16) { for (i in 0 until 15) { hX[i] = hX[i + 1]; hY[i] = hY[i + 1]; hPr[i] = hPr[i + 1]; hR[i] = hR[i + 1]; hSX[i] = hSX[i + 1]; hSY[i] = hSY[i + 1] }; hN = 15 }
    hX[hN] = X + v[EspritData.X] * S; hY[hN] = Y + v[EspritData.Y] * S; hPr[hN] = v[EspritData.PR]; hR[hN] = v[EspritData.R]; hSX[hN] = sx; hSY[hN] = sy
    hN++
  }

  /* ───────── dessin ───────── */
  private fun argb(c: Int, alpha: Float): Int = (c and 0x00FFFFFF) or ((Math.max(0f, Math.min(1f, alpha)) * 255f).toInt() shl 24)

  private fun lab2(l: Float, a: Float, b: Float): Int = EtoileData.labToArgbRaw(l, a, b)

  /* mélange (a -> b) de deux couleurs Oklab, rendu en ARGB */
  private fun mix(a0: Float, a1: Float, a2: Float, b: FloatArray, w: Float): Int {
    val k = cl(w, 0f, 1f)
    return lab2(a0 + (b[0] - a0) * k, a1 + (b[1] - a1) * k, a2 + (b[2] - a2) * k)
  }
  private fun mixL(a: FloatArray, b: FloatArray, w: Float): Int = mix(a[0], a[1], a[2], b, w)

  private fun applyTf(c: Canvas, x: Float, y: Float, pr: Float, r: Float, sx: Float, sy: Float) {
    c.translate(x, y)
    if (Math.abs(pr) > 0.01f) { val tp = -57f * sy; c.translate(0f, tp); c.rotate(pr); c.translate(0f, -tp) }
    c.rotate(r)
    c.scale(if (Math.abs(sx) < 0.0005f) 0.0005f else sx, if (Math.abs(sy) < 0.0005f) 0.0005f else sy)
  }

  private fun buildHood(p: Path, tx: Float, th: Float) {
    val ty = -57f - th
    p.reset()
    p.moveTo(tx - 5f, ty + 3f)
    p.quadTo(tx, ty - 1.5f, tx + 5f, ty + 3f)
    p.cubicTo(tx + 14f, ty + 11f, 32f + tx * 0.25f, -35f, 44f, -22f)
    p.cubicTo(54f, -12f, 59f, 8f, 58f, 24f)
    p.cubicTo(57f, 36f, 48f, 44f, 38f, 48f)
    p.lineTo(4f, 57f)
    p.quadTo(0f, 58.5f, -4f, 57f)
    p.lineTo(-38f, 48f)
    p.cubicTo(-48f, 44f, -57f, 36f, -58f, 24f)
    p.cubicTo(-59f, 8f, -54f, -12f, -44f, -22f)
    p.cubicTo(-32f + tx * 0.25f, -35f, tx - 14f, ty + 11f, tx - 5f, ty + 3f)
    p.close()
  }

  private fun buildShade(p: Path, tx: Float, th: Float) {
    val ty = -57f - th
    p.reset()
    p.moveTo(tx, ty - 0.5f)
    p.cubicTo(tx + 14f, ty + 11f, 32f + tx * 0.25f, -35f, 44f, -22f)
    p.cubicTo(54f, -12f, 59f, 8f, 58f, 24f)
    p.cubicTo(57f, 36f, 48f, 44f, 38f, 48f)
    p.lineTo(4f, 57f)
    p.lineTo(0f, -30f)
    p.close()
  }

  /* dessine l'esprit et ses effets ; (ox, oy) = origine de la vue dans le repère de l'esprit */
  override fun draw(c: Canvas, ox: Float, oy: Float) {
    val f = cur
    val v = f.v
    val u = S / d.scale
    val axv = X - ox
    val ayv = Y - oy
    val x0 = axv + v[EspritData.X] * S
    val y0 = ayv + v[EspritData.Y] * S
    val op = cl(v[EspritData.OP], 0f, 1f)
    if (op <= 0.003f && f.anim == null) return
    val a = f.anim
    val fi = if (a != null) Math.min(a.frames - 1, (cl(f.p, 0f, 0.9999f) * a.frames).toInt()) else 0
    val items = if (a != null && a.fx != null) a.fx!![fi] else null
    val c0 = v[EspritData.C0]; val c1 = v[EspritData.C1]; val c2 = v[EspritData.C2]
    val acc = lab2(c0, c1, c2)
    val kS = S / 114f
    val sx = v[EspritData.S] * v[EspritData.SX] * kS
    val sy = v[EspritData.S] * v[EspritData.SY] * kS

    // halo (derrière tout)
    val ag = v[EspritData.AG]
    if (ag > 0.01f) {
      val rad = S * (0.75f + 0.35f * Math.min(1f, ag))
      fill.shader = RadialGradient(x0, y0 + S * 0.05f, rad, argb(acc, 0.5f), argb(acc, 0f), Shader.TileMode.CLAMP)
      fill.alpha = (Math.min(1f, ag) * 0.85f * op * 255f).toInt()
      c.drawCircle(x0, y0 + S * 0.05f, rad, fill)
      fill.shader = null; fill.alpha = 255
    }

    // fantômes : dédoublement (effet) et sillage
    var used = 0
    if (items != null) {
      val n = items.size / EspritData.STRIDE
      for (q in 0 until n) {
        val o = q * EspritData.STRIDE
        if (items[o].toInt() != 4 || used >= 3) continue
        c.save()
        c.translate(items[o + 2] * u, 0f)
        applyTf(c, x0, y0, v[EspritData.PR], v[EspritData.R], sx, sy)
        fill.color = argb(acc, items[o + 7] * op)
        c.drawPath(d.ghost, fill)
        c.restore()
        used++
      }
    }
    if (a != null && a.trail > 0) {
      var i = 0
      while (i < a.trail && used < 3) {
        val h = hN - 1 - (i + 1) * 4
        if (h < 0) break
        c.save()
        applyTf(c, hX[h] - ox, hY[h] - oy, hPr[h], hR[h], hSX[h], hSY[h])
        fill.color = argb(acc, (0.28f - i * 0.08f) * op)
        c.drawPath(d.ghost, fill)
        c.restore()
        used++; i++
      }
    }

    if (items != null) { drawFx(c, items, 1, axv, ayv, u, acc); drawFx(c, items, 2, axv, ayv, u, acc) }

    // personnage
    val layered = op < 0.995f
    if (layered) c.saveLayerAlpha(0f, 0f, c.width.toFloat(), c.height.toFloat(), (op * 255f).toInt())
    c.save()
    applyTf(c, x0, y0, v[EspritData.PR], v[EspritData.R], sx, sy)

    val bop = cl(v[EspritData.BOP], 0f, 1f)
    val bodyLayer = bop < 0.995f
    if (bodyLayer) c.saveLayerAlpha(-220f, -220f, 220f, 220f, (bop * 255f).toInt())

    val ht = cl(v[EspritData.HT], -14f, 14f)
    val hh = cl(v[EspritData.HH], -9f, 10f)
    val key = ht.toString() + "," + hh.toString()
    if (key != lastTip) { lastTip = key; buildHood(hood, ht, hh); buildShade(shade, ht, hh) }

    val front = v[EspritData.WF] > 0.5f
    if (!front) drawWings(c, v, acc, c0, c1, c2)

    // capuche : dégradé de teintes, qui prend la couleur de l'humeur (hc > 0) ou s'assombrit (hc < 0)
    val hc = v[EspritData.HC]
    val tgA: Float; val tg0: Float; val tg1: Float; val tg2: Float
    if (hc >= 0f) { tgA = hc * 0.55f; tg0 = c0; tg1 = c1; tg2 = c2 } else { tgA = -hc * 0.85f; tg0 = labVd[0]; tg1 = labVd[1]; tg2 = labVd[2] }
    val tgl = floatArrayOf(tg0, tg1, tg2)
    hood.computeBounds(bounds, true)
    fill.shader = LinearGradient(bounds.left, bounds.top, bounds.right, bounds.bottom,
      intArrayOf(mixL(labH[0], tgl, tgA), mixL(labH[1], tgl, tgA), mixL(labH[2], tgl, tgA)), floatArrayOf(0f, 0.55f, 1f), Shader.TileMode.CLAMP)
    c.drawPath(hood, fill)
    fill.shader = null
    fill.color = argb(mixL(labH[3], tgl, tgA), 0.42f)
    c.drawPath(shade, fill)

    // runes
    val rg = v[EspritData.RG]
    val cyc = mix(c0, c1, c2, labCy, 0.35f)
    val rpx = floatArrayOf(-17f + ht * 0.18f, ht * 0.35f, 17f + ht * 0.18f)
    val rpy = floatArrayOf(-30f, -42f - hh * 0.25f, -30f)
    for (i in 0 until 3) {
      val rv = cl(0.78f + rg + v[EspritData.R1 + i], 0f, 2f)
      c.save()
      c.translate(rpx[i], rpy[i])
      if (i == 1) { c.rotate(v[EspritData.RR]); val rs = Math.max(0.2f, v[EspritData.RS]); c.scale(rs, rs) }
      stroke.strokeWidth = 4.6f; stroke.color = argb(cyc, cl(0.1f + 0.3f * rv, 0f, 0.8f))
      c.drawPath(d.runes[i], stroke)
      stroke.strokeWidth = 1.9f; stroke.color = argb(cyc, cl(0.25f + 0.75f * rv, 0f, 1f))
      c.drawPath(d.runes[i], stroke)
      c.restore()
    }

    // bord clair et vide sombre du visage
    d.rim.computeBounds(bounds, true)
    fill.shader = LinearGradient(bounds.left, bounds.top, bounds.right, bounds.bottom,
      intArrayOf(lab2(labR[0][0], labR[0][1], labR[0][2]), lab2(labR[1][0], labR[1][1], labR[1][2]), lab2(labR[2][0], labR[2][1], labR[2][2])), floatArrayOf(0f, 0.6f, 1f), Shader.TileMode.CLAMP)
    c.drawPath(d.rim, fill)
    d.void.computeBounds(bounds, true)
    val vw = bounds.width(); val vh = bounds.height()
    val vg = RadialGradient(0f, 0f, 1f, intArrayOf(0xFF0B0D14.toInt(), lab2(labVd[0], labVd[1], labVd[2])), floatArrayOf(0f, 1f), Shader.TileMode.CLAMP)
    mat.reset(); mat.setScale(0.7f * vw, 0.7f * vh); mat.postTranslate(bounds.left + 0.5f * vw, bounds.top + 0.38f * vh)
    vg.setLocalMatrix(mat)
    fill.shader = vg
    c.drawPath(d.void, fill)
    fill.shader = null
    if (bodyLayer) c.restore()

    drawFace(c, v, acc, c0, c1, c2, cyc)

    if (front) drawWings(c, v, acc, c0, c1, c2)
    c.restore()
    if (layered) c.restore()

    if (items != null) { drawFx(c, items, 0, axv, ayv, u, acc); drawFx(c, items, 3, axv, ayv, u, acc) }
  }

  private fun drawWings(c: Canvas, v: FloatArray, acc: Int, c0: Float, c1: Float, c2: Float) {
    val ws = Math.max(0.2f, v[EspritData.WS])
    val wgo = 0.35f + 0.5f * cl(v[EspritData.WG], 0f, 1.5f)
    val top = mix(c0, c1, c2, labWh, 0.82f)
    val mid = mix(c0, c1, c2, labC2, 0.5f)
    for (side in 0 until 2) {
      c.save()
      if (side == 0) { c.translate(-45f, -15f); c.rotate(v[EspritData.WL]); c.scale(ws, ws) }
      else { c.translate(45f, -15f); c.scale(-1f, 1f); c.rotate(v[EspritData.WR]); c.scale(ws, ws) }
      // lueur de l'aile : ellipse inclinée au dégradé doux
      c.save()
      c.translate(-17f, 8f); c.rotate(22f); c.scale(27f, 15f)
      fill.shader = RadialGradient(0f, 0f, 1f, argb(acc, 0.5f), argb(acc, 0f), Shader.TileMode.CLAMP)
      fill.alpha = (wgo * 255f).toInt()
      c.drawCircle(0f, 0f, 1f, fill)
      fill.shader = null; fill.alpha = 255
      c.restore()
      // trois plumes
      val lg = LinearGradient(-36f, 10f, 2f, 0f, intArrayOf(top, mid, acc), floatArrayOf(0f, 0.5f, 1f), Shader.TileMode.CLAMP)
      val alphas = floatArrayOf(1f, 0.92f, 0.85f)
      for (i in 0 until d.feath.size) {
        fill.shader = lg
        fill.alpha = (alphas[Math.min(i, 2)] * 255f).toInt()
        c.drawPath(d.feath[i], fill)
      }
      fill.shader = null; fill.alpha = 255
      c.restore()
    }
  }

  private fun resolveEye(idx: Int, sd: Int): Pair<List<EyePrim>, Float> {
    val key = eyeKeys.getOrNull(idx) ?: "open"
    val name: String; var sc = 1f
    when (key) {
      "wide" -> { name = "open"; sc = 1.16f }
      "small" -> { name = "open"; sc = 0.7f }
      "clin" -> name = if (sd < 0) "open" else "happy"
      else -> name = if (d.eyes.containsKey(key)) key else "open"
    }
    return Pair(d.eyes[name] ?: emptyList(), sc)
  }

  private fun drawFace(c: Canvas, v: FloatArray, acc: Int, c0: Float, c1: Float, c2: Float, cyc: Int) {
    val ex = cl(v[EspritData.EX], -1.2f, 1.2f)
    val ey = cl(v[EspritData.EY], -1.2f, 1.2f)
    val bright = mix(c0, c1, c2, labC1, 0.4f)
    val pupil = mix(c0, c1, c2, labPu, 0.7f)
    val irisA = mix(c0, c1, c2, labC2, 0.55f)
    val irisC = mix(c0, c1, c2, labCy, 0.4f)
    val vd = lab2(labVd[0], labVd[1], labVd[2])
    c.save()
    c.translate(ex * 2.2f, ey * 1.6f)
    for (e in 0 until 2) {
      val sd = if (e == 0) -1 else 1
      val xp = resolveEye(v[EspritData.EYES].toInt(), sd)
      val sc = cl(v[EspritData.ES], 0.05f, 2f) * xp.second
      val bl = cl(v[EspritData.BLINK], 0f, 1f)
      c.save()
      c.translate(sd * 21f, 18f); c.rotate(-sd * 6f); c.scale(sc, sc * (1f - 0.92f * bl))
      // halo de l'œil
      val eg = v[EspritData.EG]
      val gr = 17f + 5f * cl(eg, 0f, 1.5f)
      fill.shader = RadialGradient(0f, 0f, gr, argb(acc, 0.55f), argb(acc, 0f), Shader.TileMode.CLAMP)
      fill.alpha = (cl(0.45f + 0.55f * eg, 0f, 1f) * 255f).toInt()
      c.drawCircle(0f, 0f, gr, fill)
      fill.shader = null; fill.alpha = 255
      for (pr in xp.first) {
        c.save()
        if (pr.pupil) c.translate(ex * 2.3f, ey * 2.2f)
        drawEyePrim(c, pr, acc, bright, pupil, irisA, irisC)
        c.restore()
      }
      val lid = cl(v[EspritData.LID], 0f, 1f)
      if (lid > 0.001f) { fill.color = vd; c.drawRect(-13f, -15f, 13f, -15f + lid * 26f, fill) }
      c.restore()
    }
    // sourcils
    val bo = cl(v[EspritData.BO], 0f, 1f)
    if (bo > 0.003f) {
      for (e in 0 until 2) {
        val sd = if (e == 0) -1 else 1
        val raise = if (sd < 0) v[EspritData.BL] else v[EspritData.BR]
        c.save()
        c.translate(sd * 19f, -3f - raise * 3.6f); c.scale(if (sd < 0) 1f else -1f, 1f); c.rotate(v[EspritData.BA] * 14f)
        stroke.strokeWidth = 2.6f; stroke.color = argb(cyc, bo)
        c.drawPath(d.brow, stroke)
        c.restore()
      }
    }
    c.restore()
  }

  private fun drawEyePrim(c: Canvas, pr: EyePrim, acc: Int, bright: Int, pupil: Int, irisA: Int, irisC: Int) {
    // formes : 0 iris, 1 pupille, 2 reflet, 3 petit reflet, 4 trait, 5 anneau, 6 remplissage, 7 éteint
    val isStroke = pr.kind == 4 || pr.kind == 5
    when (pr.kind) {
      0 -> {
        shapeBounds(pr)
        val w = bounds.width(); val h = bounds.height()
        val sh = RadialGradient(0f, 0f, 1f, intArrayOf(irisA, acc, irisC), floatArrayOf(0f, 0.62f, 1f), Shader.TileMode.CLAMP)
        mat.reset(); mat.setScale(0.72f * w, 0.72f * h); mat.postTranslate(bounds.left + 0.38f * w, bounds.top + 0.66f * h)
        sh.setLocalMatrix(mat)
        fill.shader = sh; fill.alpha = 255
        drawShape(c, pr, fill)
        fill.shader = null
        return
      }
      1 -> fill.color = pupil
      2 -> fill.color = 0xFFFFFFFF.toInt()
      3 -> fill.color = argb(0xFFFFFFFF.toInt(), 0.8f)
      4, 5 -> { stroke.color = bright; stroke.strokeWidth = pr.stroke }
      6 -> fill.color = bright
      else -> fill.color = argb(bright, 0.5f)
    }
    drawShape(c, pr, if (isStroke) stroke else fill)
  }

  private fun shapeBounds(pr: EyePrim) {
    when (pr.type) {
      0 -> bounds.set(pr.a[0] - pr.a[2], pr.a[1] - pr.a[3], pr.a[0] + pr.a[2], pr.a[1] + pr.a[3])
      1 -> bounds.set(pr.a[0] - pr.a[2], pr.a[1] - pr.a[2], pr.a[0] + pr.a[2], pr.a[1] + pr.a[2])
      3 -> bounds.set(pr.a[0], pr.a[1], pr.a[0] + pr.a[2], pr.a[1] + pr.a[3])
      else -> pr.path?.computeBounds(bounds, true)
    }
  }

  private fun drawShape(c: Canvas, pr: EyePrim, p: Paint) {
    when (pr.type) {
      0 -> { rect.set(pr.a[0] - pr.a[2], pr.a[1] - pr.a[3], pr.a[0] + pr.a[2], pr.a[1] + pr.a[3]); c.drawOval(rect, p) }
      1 -> c.drawCircle(pr.a[0], pr.a[1], pr.a[2], p)
      3 -> { rect.set(pr.a[0], pr.a[1], pr.a[0] + pr.a[2], pr.a[1] + pr.a[3]); c.drawRoundRect(rect, pr.a[4], pr.a[4], p) }
      else -> pr.path?.let { c.drawPath(it, p) }
    }
  }

  /* couches : 0 = formes devant, 1 = formes derrière, 2 = anneaux, 3 = textes */
  private fun drawFx(c: Canvas, it: FloatArray, kind: Int, cx: Float, cy: Float, u: Float, acc: Int) {
    val n = it.size / EspritData.STRIDE
    for (q in 0 until n) {
      val o = q * EspritData.STRIDE
      val layer = it[o].toInt()
      if (layer != kind) continue
      val op = it[o + 7]
      if (op <= 0.003f) continue
      val pal = if (orange) d.argbAlt else d.argb
      val color = argb(pal[Math.max(0, Math.min(pal.size - 1, it[o + 8].toInt()))], op)
      val x = cx + it[o + 2] * u
      val y = cy + it[o + 3] * u
      when (layer) {
        0, 1 -> {
          val sh = d.shapes.getOrNull(it[o + 1].toInt()) ?: continue
          c.save()
          c.translate(x, y); c.rotate(it[o + 5]); val z = Math.max(0.001f, it[o + 4] * u / 10f); c.scale(z, z)
          fill.color = color
          c.drawPath(sh, fill)
          c.restore()
        }
        2 -> {
          val rx = Math.max(0.1f, it[o + 4] * u); val ry = Math.max(0.1f, it[o + 5] * u)
          stroke.color = color; stroke.strokeWidth = Math.max(1f, it[o + 6] * u)
          val dash = it[o + 9]
          if (dash > 0f) stroke.pathEffect = DashPathEffect(floatArrayOf(dash * u, dash * 0.8f * u), it[o + 10] * u)
          rect.set(x - rx, y - ry, x + rx, y + ry)
          c.drawOval(rect, stroke)
          stroke.pathEffect = null
        }
        3 -> {
          val tx = d.texts.getOrNull(it[o + 1].toInt()) ?: continue
          txt.color = color; txt.textSize = Math.max(6f, it[o + 4] * u)
          c.drawText(tx, x, y + txt.textSize * 0.35f, txt)
        }
      }
    }
  }
}
