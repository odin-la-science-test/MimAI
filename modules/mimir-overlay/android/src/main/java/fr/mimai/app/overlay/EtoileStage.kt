package fr.mimai.app.overlay

import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface

/* Ressort amorti du moteur d'origine (raideur 170, amortissement 20) : les déplacements « rebondissent » légèrement. */
class Spr(var v: Float) {
  var t = v
  var d = 0f
  fun to(x: Float, snap: Boolean = false) { t = x; if (snap) { v = x; d = 0f } }
  fun step(dt: Float): Float { val a = (t - v) * 170f - d * 20f; d += a * dt; v += d * dt; return v }
  fun moving(): Boolean = Math.abs(t - v) > 0.15f || Math.abs(d) > 1.5f
}

/* une image calculée (mêmes champs que le moteur d'origine) */
class Fr {
  var x = 0f; var y = 0f; var r = 0f; var s = 1f; var sx = 1f; var sy = 1f; var fy = 1f; var op = 1f
  var glow = 0f; var ex = 0f; var ey = 0f; var blink = 0f
  val col = FloatArray(3)
  var hasGrad = false
  val grad = FloatArray(7)
  var eyes = 0
  var anim: Anim? = null
  var p = 0f

  fun set(o: Fr) {
    x = o.x; y = o.y; r = o.r; s = o.s; sx = o.sx; sy = o.sy; fy = o.fy; op = o.op; glow = o.glow; ex = o.ex; ey = o.ey; blink = o.blink
    col[0] = o.col[0]; col[1] = o.col[1]; col[2] = o.col[2]
    hasGrad = o.hasGrad
    for (i in 0 until 7) grad[i] = o.grad[i]
    eyes = o.eyes; anim = o.anim; p = o.p
  }

  fun reset(base: FloatArray, eyesIdx: Int) {
    x = 0f; y = 0f; r = 0f; s = 1f; sx = 1f; sy = 1f; fy = 1f; op = 1f; glow = 0f; ex = 0f; ey = 0f; blink = 0f
    col[0] = base[0]; col[1] = base[1]; col[2] = base[2]
    hasGrad = false; eyes = eyesIdx; anim = null; p = 0f
  }
}

/* L'étoile de Mìmir : un petit être (corps en étoile, yeux, 156 animations). Port Kotlin du moteur de la maquette ;
   les animations elles-mêmes sont lues dans etoile.json (voir scripts/bake-etoile.mjs). Les capteurs de mouvement
   (roulis, vertige) ne sont pas repris : la barre reste immobile. */
class EtoileStage(private val d: EtoileData) {
  var t = 0f
  val ax = Spr(0f)
  val ay = Spr(0f)
  val asz = Spr(20f)
  var mode = "idle"
  private var mPrev = "idle"
  private var mT0 = -9f
  var clip: Anim? = null
  private var clipT0 = 0f
  private var hasSnap = false
  private val snap = Fr()
  val cur = Fr()
  private val fr = Fr()
  private val fa = Fr()
  private val cf = Fr()
  private val f2 = Fr()
  private val f3 = Fr()
  private var blinkAt = 1.5f + Math.random().toFloat() * 3f
  private var ambAt = 6f + Math.random().toFloat() * 6f
  var ambient = true
  var onEnd: ((String) -> Unit)? = null

  /* vol de l'étoile (maquette « tour 2 ») : trajet en courbe de Bézier entre la place actuelle et (x1, y1), avec une courbe
     d'accélération par axe (ex, ey) et pour la taille (es) ; cb est appelé à l'arrivée. Positions en pixels, repère de la vue. */
  private class Flight(
    val x0: Float, val y0: Float, val s0: Float, val x1: Float, val y1: Float, val s1: Float,
    val cx: Float, val cy: Float, val d: Float, val ex: String, val ey: String, val es: String, val t0: Float, val cb: (() -> Unit)?
  )
  private var flight: Flight? = null

  fun fly(x1: Float, y1: Float, s1: Float, cx: Float?, cy: Float?, d: Float, ex: String, ey: String?, es: String, cb: (() -> Unit)?) {
    flight = Flight(ax.v, ay.v, asz.v, x1, y1, if (s1 > 0f) s1 else asz.v, cx ?: ((ax.v + x1) / 2f), cy ?: ((ay.v + y1) / 2f), if (d > 0f) d else 0.6f, ex, ey ?: ex, es, t, cb)
  }

  /* place l'étoile tout de suite (sans ressort) */
  fun place(x: Float, y: Float, size: Float) { flight = null; ax.to(x, true); ay.to(y, true); asz.to(size, true) }

  private fun ez(name: String, q: Float): Float = when (name) {
    "oc" -> 1f - Math.pow((1f - q).toDouble(), 3.0).toFloat()
    "ob" -> { val c = 1.70158f; 1f + (c + 1f) * Math.pow((q - 1f).toDouble(), 3.0).toFloat() + c * Math.pow((q - 1f).toDouble(), 2.0).toFloat() }
    "oe" -> if (q <= 0f) 0f else if (q >= 1f) 1f else (Math.pow(2.0, -10.0 * q) * Math.sin((q * 10.0 - 0.75) * 2.0 * Math.PI / 3.0)).toFloat() + 1f
    "bo" -> {
      val n = 7.5625f; val dd = 2.75f; var u = q
      if (u < 1f / dd) n * u * u
      else if (u < 2f / dd) { u -= 1.5f / dd; n * u * u + 0.75f }
      else if (u < 2.5f / dd) { u -= 2.25f / dd; n * u * u + 0.9375f }
      else { u -= 2.625f / dd; n * u * u + 0.984375f }
    }
    "ss" -> q * q * (3f - 2f * q)
    "lin" -> q
    else -> if (q < 0.5f) 4f * q * q * q else 1f - (Math.pow((-2f * q + 2f).toDouble(), 3.0).toFloat()) / 2f
  }

  private val qA = d.labs[d.key("a")]
  private val qA3 = d.labs[d.key("a3")]
  private val qG5 = d.labs[d.key("g5")]
  private val base = qA
  private val eyeOpen = d.eyeIndex("open")
  private val eyeUp = d.eyeIndex("up")
  private val eyeDown = d.eyeIndex("down")
  private val eyeClosed = d.eyeIndex("closed")
  private val cW = d.argb[d.key("w")]
  private val cK = d.argb[d.key("k")]
  private val cG3 = d.argb[d.key("g3")]

  /* position / taille affichées (pixels, dans le repère de la vue) après ressorts */
  var X = 0f; var Y = 0f; var S = 20f
  private var curR = 0f; private var curSX = 1f; private var curSY = 1f
  private val histX = FloatArray(16); private val histY = FloatArray(16); private val histR = FloatArray(16)
  private val histSX = FloatArray(16); private val histSY = FloatArray(16)
  private var histN = 0

  private val body = Paint(Paint.ANTI_ALIAS_FLAG)
  private val pFill = Paint(Paint.ANTI_ALIAS_FLAG)
  private val pStroke = Paint(Paint.ANTI_ALIAS_FLAG).also { it.style = Paint.Style.STROKE; it.strokeCap = Paint.Cap.ROUND; it.strokeJoin = Paint.Join.ROUND }
  private val pText = Paint(Paint.ANTI_ALIAS_FLAG).also { it.textAlign = Paint.Align.CENTER; it.typeface = Typeface.create("sans-serif-medium", Typeface.BOLD) }
  private val rect = RectF()

  private fun ss(x: Float): Float = x * x * (3f - 2f * x)
  private fun cl(v: Float, a: Float, b: Float): Float = if (v < a) a else if (v > b) b else v
  private fun mixTo(a: FloatArray, b: FloatArray, t: Float, out: FloatArray) {
    if (t <= 0f) { out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; return }
    if (t >= 1f) { out[0] = b[0]; out[1] = b[1]; out[2] = b[2]; return }
    out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t
  }

  fun play(id: String) {
    val a = d.byId[id] ?: return
    hasSnap = true
    snap.set(cur)
    clip = a
    clipT0 = t
  }

  fun playRandomTap() { val l = d.tap; if (l.isNotEmpty()) play(l[(Math.random() * l.size).toInt()]) }

  fun switchMode(m: String) {
    if (m == mode) return
    if (m != "idle" && m != "listen" && m != "think" && m != "read" && m != "sleep") return
    mPrev = mode; mode = m; mT0 = t
  }

  /* vrai tant que quelque chose bouge : la barre garde alors la cadence maximale */
  fun busy(): Boolean = clip != null || flight != null || (t - mT0) < 0.5f || ax.moving() || ay.moving() || asz.moving()

  private fun modeFrame(m: String, tt: Float, out: Fr) {
    out.reset(base, eyeOpen)
    val tau = (2 * Math.PI).toFloat()
    when (m) {
      "listen" -> {
        val q = Math.sin(Math.PI * tt / 1.1).toFloat()
        out.s = 1f + 0.05f * q * q; mixTo(base, qG5, 0.55f, out.col); out.eyes = eyeUp; out.glow = 0.25f
      }
      "think" -> {
        out.r = 7f * Math.sin(tau * tt / 1.5).toFloat()
        out.s = 1f + 0.04f * Math.sin(tau * tt / 0.75).toFloat()
        mixTo(base, qA3, 0.25f + 0.2f * Math.sin(tau * tt / 1.5).toFloat(), out.col); out.eyes = eyeUp
      }
      "read" -> {
        val q = (tt % 2.6f) / 2.6f
        out.s = 1f + 0.012f * Math.sin(tau * tt / 4.4).toFloat(); out.eyes = eyeDown
        out.ex = -0.55f + 1.1f * ss(Math.min(1f, q * 1.15f)); out.ey = 0.2f
      }
      "sleep" -> {
        out.s = 1f + 0.035f * Math.sin(tau * tt / 4.8).toFloat(); out.y = 0.03f
        mixTo(base, qA3, 0.5f, out.col); out.eyes = eyeClosed
      }
      else -> {
        val k = Math.sin(tau * tt / 3.6).toFloat()
        out.s = 1f + 0.03f * k; out.y = -0.02f * k
      }
    }
  }

  private fun lerpF(a: Fr, b: Fr, w: Float, out: Fr) {
    if (w >= 1f) { out.set(b); return }
    if (w <= 0f) { out.set(a); return }
    out.set(b)
    out.x = a.x + (b.x - a.x) * w; out.y = a.y + (b.y - a.y) * w; out.s = a.s + (b.s - a.s) * w
    out.sx = a.sx + (b.sx - a.sx) * w; out.sy = a.sy + (b.sy - a.sy) * w; out.fy = a.fy + (b.fy - a.fy) * w
    out.op = a.op + (b.op - a.op) * w; out.glow = a.glow + (b.glow - a.glow) * w
    out.ex = a.ex + (b.ex - a.ex) * w; out.ey = a.ey + (b.ey - a.ey) * w; out.blink = a.blink + (b.blink - a.blink) * w
    var dr = norm(b.r) - norm(a.r)
    if (dr > 180f) dr -= 360f
    if (dr < -180f) dr += 360f
    out.r = norm(a.r) + dr * w
    mixTo(a.col, b.col, w, out.col)
    if (a.hasGrad || b.hasGrad) {
      val ga0 = if (a.hasGrad) 0 else -1
      out.hasGrad = true
      for (i in 0 until 3) {
        val a0 = if (a.hasGrad) a.grad[i] else a.col[i]; val a1 = if (a.hasGrad) a.grad[3 + i] else a.col[i]
        val b0 = if (b.hasGrad) b.grad[i] else b.col[i]; val b1 = if (b.hasGrad) b.grad[3 + i] else b.col[i]
        out.grad[i] = a0 + (b0 - a0) * w; out.grad[3 + i] = a1 + (b1 - a1) * w
      }
      val aa = if (a.hasGrad) a.grad[6] else b.grad[6]
      val ba = if (b.hasGrad) b.grad[6] else a.grad[6]
      out.grad[6] = aa + (ba - aa) * w
      if (ga0 < -1) out.hasGrad = false
    }
    out.eyes = if (w < 0.5f) a.eyes else b.eyes
  }

  private fun norm(r: Float): Float = (((r % 360f) + 540f) % 360f) - 180f

  /* image d'une animation à la position p (0..1), lue dans les images cuites (interpolation linéaire entre deux images) */
  private fun evalClip(a: Anim, p: Float, out: Fr) {
    val pos = cl(p, 0f, 0.9999f) * a.frames
    val i0 = Math.min(a.frames - 1, pos.toInt())
    val i1 = Math.min(a.frames - 1, i0 + 1)
    val w = pos - i0
    val o0 = i0 * 15
    val o1 = i1 * 15
    val f = a.f
    fun lp(k: Int): Float = f[o0 + k] + (f[o1 + k] - f[o0 + k]) * w
    out.x = lp(0); out.y = lp(1); out.r = lp(2); out.s = lp(3); out.sx = lp(4); out.sy = lp(5); out.fy = lp(6); out.op = lp(7)
    out.glow = lp(8); out.ex = lp(9); out.ey = lp(10)
    out.col[0] = lp(11); out.col[1] = lp(12); out.col[2] = lp(13)
    out.eyes = Math.max(0, f[o0 + 14].toInt())
    out.blink = 0f
    out.hasGrad = false
    val g = a.grad
    if (g != null && g[i0 * 8] > 0.5f) {
      out.hasGrad = true
      for (k in 0 until 7) out.grad[k] = g[i0 * 8 + 1 + k]
    }
    out.anim = a; out.p = p
  }

  private fun compose(m: Fr, c: Fr, w: Float, out: Fr) {
    out.set(m)
    out.x = m.x + c.x * w; out.y = m.y + c.y * w; out.r = m.r + c.r * w
    out.s = m.s * (1f + (c.s - 1f) * w); out.sx = m.sx * (1f + (c.sx - 1f) * w); out.sy = m.sy * (1f + (c.sy - 1f) * w)
    out.fy = 1f + (c.fy - 1f) * w; out.op = m.op * (1f + (c.op - 1f) * w)
    out.glow = m.glow + c.glow * w; out.ex = m.ex + c.ex * w; out.ey = m.ey + c.ey * w
    val colored = c.anim?.colored == true
    if (colored) mixTo(m.col, c.col, w, out.col)
    if (c.hasGrad) {
      out.hasGrad = true
      for (i in 0 until 3) {
        out.grad[i] = m.col[i] + (c.grad[i] - m.col[i]) * w
        out.grad[3 + i] = m.col[i] + (c.grad[3 + i] - m.col[i]) * w
      }
      out.grad[6] = c.grad[6]
    }
    if (c.eyes != eyeOpen) out.eyes = c.eyes
    out.anim = c.anim; out.p = c.p
  }

  fun tick(dtRaw: Float) {
    val dt = Math.min(0.05f, Math.max(0f, dtRaw))
    t += dt
    val fl = flight
    if (fl != null) {
      val q = cl((t - fl.t0) / fl.d, 0f, 1f)
      val ex = ez(fl.ex, q); val ey = ez(fl.ey, q)
      val u = 1f - ex; val v = 1f - ey
      ax.to(u * u * fl.x0 + 2f * u * ex * fl.cx + ex * ex * fl.x1, true)
      ay.to(v * v * fl.y0 + 2f * v * ey * fl.cy + ey * ey * fl.y1, true)
      asz.to(fl.s0 + (fl.s1 - fl.s0) * ez(fl.es, q), true)
      if (q >= 1f) { flight = null; fl.cb?.invoke() }
    }
    X = ax.step(dt); Y = ay.step(dt); S = Math.max(4f, asz.step(dt))
    modeFrame(mode, t, fr)
    if (t - mT0 < 0.45f) {
      modeFrame(mPrev, t, fa)
      lerpF(fa, fr, ss((t - mT0) / 0.45f), f3)
      fr.set(f3)
    }
    if (clip == null && mode != "sleep" && t >= blinkAt) {
      val ph = (t - blinkAt) / 0.16f
      if (ph >= 1f) blinkAt = t + 2.2f + Math.random().toFloat() * 3.5f else fr.blink = Math.sin(Math.PI * ph).toFloat()
    }
    if (ambient && clip == null && mode == "idle" && t > ambAt && d.amb.isNotEmpty()) {
      ambAt = t + 9f + Math.random().toFloat() * 7f
      play(d.amb[(Math.random() * d.amb.size).toInt()])
    }
    val a = clip
    if (a != null) {
      val tc = t - clipT0
      val p = tc / a.d
      if (p >= 1f) { clip = null; hasSnap = false; onEnd?.invoke(a.id) }
      else {
        evalClip(a, p, cf)
        if (!a.colored) { cf.col[0] = fr.col[0]; cf.col[1] = fr.col[1]; cf.col[2] = fr.col[2] }
        compose(fr, cf, ss(cl(Math.min(tc / 0.08f, (a.d - tc) / 0.08f), 0f, 1f)), f2)
        if (hasSnap && tc < 0.16f) { lerpF(snap, f2, ss(tc / 0.16f), f3); fr.set(f3) } else fr.set(f2)
      }
    }
    cur.set(fr)
    curR = fr.r
    var dsx = fr.sx
    var dsy = fr.sy
    val rat = dsx / dsy
    if (rat > 1.2f || rat < 1f / 1.2f) {
      val pr = dsx * dsy
      val rc = cl(rat, 1f / 1.2f, 1.2f)
      dsx = Math.sqrt((pr * rc).toDouble()).toFloat(); dsy = Math.sqrt((pr / rc).toDouble()).toFloat()
    }
    val k = S / 152f
    curSX = fr.s * dsx * fr.fy * k
    curSY = fr.s * dsy * k
    if (histN == 16) { for (i in 0 until 15) { histX[i] = histX[i + 1]; histY[i] = histY[i + 1]; histR[i] = histR[i + 1]; histSX[i] = histSX[i + 1]; histSY[i] = histSY[i + 1] }; histN = 15 }
    histX[histN] = X + fr.x * S; histY[histN] = Y + fr.y * S; histR[histN] = curR; histSX[histN] = curSX; histSY[histN] = curSY
    histN++
  }

  private fun argb(c: Int, alpha: Float): Int = (c and 0x00FFFFFF) or ((Math.max(0f, Math.min(1f, alpha)) * 255f).toInt() shl 24)

  private fun bodyColor(f: Fr): Int = DataLab.argb(f.col)

  /* dessine l'étoile et ses effets autour de (X, Y) ; (ox, oy) = origine de la vue dans le repère de l'étoile */
  fun draw(c: Canvas, ox: Float, oy: Float) {
    val f = cur
    val u = S / d.scale
    val px = X + f.x * S - ox
    val py = Y + f.y * S - oy
    val a = f.anim
    val fi = if (a != null) Math.min(a.frames - 1, (cl(f.p, 0f, 0.9999f) * a.frames).toInt()) else 0
    val items = if (a != null && a.fx != null) a.fx!![fi] else null
    val col = bodyColor(f)

    if (f.glow > 0.01f) {
      val rad = S * (0.85f + 0.3f * Math.min(1f, f.glow))
      body.shader = RadialGradient(px, py, rad, argb(col, 0.6f * Math.min(1f, f.glow) * 0.9f), argb(col, 0f), Shader.TileMode.CLAMP)
      c.drawCircle(px, py, rad, body)
      body.shader = null
    }
    if (a != null && a.trail > 0) {
      for (i in 0 until Math.min(3, a.trail)) {
        val h = histN - 1 - (i + 1) * 4
        if (h < 0) continue
        c.save()
        c.translate(histX[h] - ox, histY[h] - oy); c.rotate(histR[h]); c.scale(histSX[h], histSY[h])
        body.color = argb(col, 0.32f - i * 0.1f)
        c.drawPath(d.body, body)
        c.restore()
      }
    }
    if (items != null) drawFx(c, items, 1, px, py, u)       // couche arrière + anneaux
    if (items != null) drawFx(c, items, 2, px, py, u)

    c.save()
    c.translate(px, py); c.rotate(curR); c.scale(if (Math.abs(curSX) < 0.0005f) 0.0005f else curSX, curSY)
    if (f.hasGrad) {
      val ang = Math.toRadians(f.grad[6].toDouble())
      val ca = Math.cos(ang).toFloat(); val sa = Math.sin(ang).toFloat()
      val hx = 71f; val hy = 76f
      val x1 = -hx * ca + hy * sa; val y1 = -hx * sa - hy * ca
      body.shader = LinearGradient(x1, y1, -x1, -y1, DataLab.argb(f.grad, 0), DataLab.argb(f.grad, 3), Shader.TileMode.CLAMP)
      body.color = argb(0xFFFFFFFF.toInt(), f.op)
    } else { body.shader = null; body.color = argb(col, f.op) }
    c.drawPath(d.body, body)
    body.shader = null

    if (f.fy >= 0f) {
      val lum = if (f.hasGrad) (f.grad[0] + f.grad[3]) / 2f else f.col[0]
      val ink = if (lum < 0.52f) cW else cK
      val bl = cl(f.blink, 0f, 1f)
      val exs = cl(f.ex, -1.2f, 1.2f) * 6f
      val eys = cl(f.ey, -1.2f, 1.2f) * 5f
      c.translate(exs, eys - 2f)
      c.scale(1f, 1f - 0.9f * bl)
      c.translate(0f, 2f)
      val name = d.eyeNames.getOrNull(f.eyes) ?: "open"
      val shapes = d.eyes[name]
      if (shapes != null) {
        for (e in shapes) {
          val color = argb(if (e.white) cW else if (e.green) cG3 else ink, f.op)
          if (e.circle) { pFill.color = color; c.drawCircle(e.cx, e.cy, e.r, pFill) }
          else if (e.stroke > 0f) { pStroke.color = color; pStroke.strokeWidth = e.stroke; c.drawPath(e.path!!, pStroke) }
          else { pFill.color = color; c.drawPath(e.path!!, pFill) }
        }
      }
    }
    c.restore()
    if (items != null) { drawFx(c, items, 0, px, py, u); drawFx(c, items, 3, px, py, u) }
  }

  /* kind : 0 = formes devant, 1 = formes derrière, 2 = anneaux, 3 = textes */
  private fun drawFx(c: Canvas, it: FloatArray, kind: Int, cx: Float, cy: Float, u: Float) {
    val n = it.size / EtoileData.STRIDE
    for (q in 0 until n) {
      val o = q * EtoileData.STRIDE
      val layer = it[o].toInt()
      if (layer != kind) continue
      val op = it[o + 6]
      if (op <= 0.003f) continue
      val colorIdx = it[o + 7].toInt()
      val color = argb(d.argb[colorIdx], op)
      val x = cx + it[o + 2] * u
      val y = cy + it[o + 3] * u
      when (layer) {
        0, 1 -> {
          val sh = d.shapes.getOrNull(it[o + 1].toInt()) ?: continue
          c.save()
          c.translate(x, y); c.rotate(it[o + 5]); val z = Math.max(0.001f, it[o + 4] * u / 10f); c.scale(z, z)
          pFill.color = color
          c.drawPath(sh, pFill)
          c.restore()
        }
        2 -> {
          val rad = Math.max(0.1f, it[o + 4] * u)
          pStroke.color = color; pStroke.strokeWidth = Math.max(1f, it[o + 5] * u)
          val dash = it[o + 8]
          if (dash >= 0f) { rect.set(x - rad, y - rad, x + rad, y + rad); c.drawArc(rect, -90f, 360f * dash, false, pStroke) }
          else c.drawCircle(x, y, rad, pStroke)
        }
        3 -> {
          val txt = d.texts.getOrNull(it[o + 1].toInt()) ?: continue
          pText.color = color; pText.textSize = Math.max(6f, it[o + 4] * u)
          c.drawText(txt, x, y + pText.textSize * 0.35f, pText)
        }
      }
    }
  }

  /* encombrement approximatif de l'étoile : sert à décider si elle déborde de la barre */
  fun radius(): Float = S * 1.2f
}

/* conversions de couleur Oklab -> ARGB sans allocation */
object DataLab {
  fun argb(lab: FloatArray, off: Int = 0): Int = EtoileData.labToArgb(lab[off], lab[off + 1], lab[off + 2])
}
