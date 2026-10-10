package fr.mimai.app.overlay

import android.content.Context
import android.graphics.Path
import org.json.JSONArray
import org.json.JSONObject

/* Données de l'étoile de Mìmir : 156 animations « cuites » à 30 images par seconde par scripts/bake-etoile.mjs
   depuis le moteur de la maquette (assets/design/etoile-engine.js). Ce fichier ne fait que les lire. */

/* une forme des yeux : cercle ou chemin ; stroke > 0 = trait (sans remplissage) ; white = reflet blanc ; green = larme/goutte */
class EyeShape(val circle: Boolean, val cx: Float, val cy: Float, val r: Float, val path: Path?, val stroke: Float, val white: Boolean, val green: Boolean)

/* une animation. f : 15 valeurs par image (x, y, r, s, sx, sy, fy, op, glow, ex, ey, L, a, b, yeux).
   grad : 8 valeurs par image (présent, L1, a1, b1, L2, a2, b2, angle) ou null. fx : par image, éléments de 9 valeurs
   (couche, forme/texte, x, y, z, r, opacité, couleur, extra) ou null. */
class Anim(
  val id: String, val name: String, val fam: String, val d: Float, val trail: Int, val frames: Int,
  val f: FloatArray, val grad: FloatArray?, val fx: Array<FloatArray?>?, val colored: Boolean
)

class EtoileData(
  val fps: Float, val scale: Float, val colorKeys: List<String>, val labs: Array<FloatArray>,
  val shapes: List<Path>, val body: Path, val eyeNames: List<String>, val eyes: Map<String, List<EyeShape>>,
  val texts: List<String>, val tap: List<String>, val amb: List<String>, val anims: List<Anim>, val byId: Map<String, Anim>
) {
  val argb = IntArray(labs.size) { labToArgb(labs[it][0], labs[it][1], labs[it][2]) }
  fun key(k: String): Int = colorKeys.indexOf(k)
  fun eyeIndex(name: String): Int = eyeNames.indexOf(name)

  companion object {
    const val STRIDE = 9

    private fun toLin(c: Float): Float { val v = c / 255f; return if (v <= 0.04045f) v / 12.92f else Math.pow(((v + 0.055f) / 1.055f).toDouble(), 2.4).toFloat() }
    private fun toS(c: Float): Int {
      val v = if (c <= 0.0031308f) 12.92f * c else (1.055 * Math.pow(c.toDouble(), 1 / 2.4) - 0.055).toFloat()
      return Math.round(Math.max(0f, Math.min(1f, v)) * 255f)
    }

    /* #rrggbb -> Oklab (même espace que le moteur d'origine : les mélanges de couleurs sont identiques) */
    fun hexToLab(hex: String): FloatArray {
      val h = hex.removePrefix("#")
      val r = toLin(h.substring(0, 2).toInt(16).toFloat())
      val g = toLin(h.substring(2, 4).toInt(16).toFloat())
      val b = toLin(h.substring(4, 6).toInt(16).toFloat())
      val l = Math.cbrt((0.4122214708f * r + 0.5363325363f * g + 0.0514459929f * b).toDouble()).toFloat()
      val m = Math.cbrt((0.2119034982f * r + 0.6806995451f * g + 0.1073969566f * b).toDouble()).toFloat()
      val s = Math.cbrt((0.0883024619f * r + 0.2817188376f * g + 0.6299787005f * b).toDouble()).toFloat()
      return floatArrayOf(
        0.2104542553f * l + 0.793617785f * m - 0.0040720468f * s,
        1.9779984951f * l - 2.428592205f * m + 0.4505937099f * s,
        0.0259040371f * l + 0.7827717662f * m - 0.808675766f * s
      )
    }

    fun labToArgb(L: Float, a: Float, b: Float): Int {
      val l_ = L + 0.3963377774f * a + 0.2158037573f * b
      val m_ = L - 0.1055613458f * a - 0.0638541728f * b
      val s_ = L - 0.0894841775f * a - 1.291485548f * b
      val l = l_ * l_ * l_
      val m = m_ * m_ * m_
      val s = s_ * s_ * s_
      val r = toS(4.0767416621f * l - 3.3077115913f * m + 0.2309699292f * s)
      val g = toS(-1.2684380046f * l + 2.6097574011f * m - 0.3413193965f * s)
      val bl = toS(-0.0041960863f * l - 0.7034186147f * m + 1.707614701f * s)
      return (0xFF shl 24) or (r shl 16) or (g shl 8) or bl
    }

    private fun pathFrom(ops: JSONArray): Path {
      val p = Path()
      var i = 0
      val n = ops.length()
      while (i < n) {
        when (ops.getInt(i)) {
          0 -> { p.moveTo(ops.getDouble(i + 1).toFloat(), ops.getDouble(i + 2).toFloat()); i += 3 }
          1 -> { p.lineTo(ops.getDouble(i + 1).toFloat(), ops.getDouble(i + 2).toFloat()); i += 3 }
          2 -> { p.quadTo(ops.getDouble(i + 1).toFloat(), ops.getDouble(i + 2).toFloat(), ops.getDouble(i + 3).toFloat(), ops.getDouble(i + 4).toFloat()); i += 5 }
          3 -> {
            p.cubicTo(
              ops.getDouble(i + 1).toFloat(), ops.getDouble(i + 2).toFloat(), ops.getDouble(i + 3).toFloat(),
              ops.getDouble(i + 4).toFloat(), ops.getDouble(i + 5).toFloat(), ops.getDouble(i + 6).toFloat()
            ); i += 7
          }
          4 -> { p.close(); i += 1 }
          else -> i = n
        }
      }
      return p
    }

    private fun strings(a: JSONArray): List<String> = List(a.length()) { a.getString(it) }

    /* lit assets/etoile.json (environ 1 Mo) ; à appeler hors du fil d'affichage */
    fun load(ctx: Context): EtoileData {
      val text = ctx.assets.open("etoile.json").bufferedReader().use { it.readText() }
      val o = JSONObject(text)
      val colorKeys = strings(o.getJSONArray("colorKeys"))
      val hexes = strings(o.getJSONArray("colors"))
      val labs = Array(hexes.size) { hexToLab(hexes[it]) }
      val shapes = ArrayList<Path>()
      val sj = o.getJSONArray("shapes")
      for (i in 0 until sj.length()) shapes.add(pathFrom(sj.getJSONArray(i)))
      val eyeNames = strings(o.getJSONArray("eyeNames"))
      val eyesJ = o.getJSONObject("eyes")
      val eyes = HashMap<String, List<EyeShape>>()
      for (n in eyeNames) {
        val arr = eyesJ.getJSONArray(n)
        val list = ArrayList<EyeShape>()
        for (i in 0 until arr.length()) {
          val e = arr.getJSONObject(i)
          if (e.getString("t") == "c") {
            list.add(EyeShape(true, e.getDouble("cx").toFloat(), e.getDouble("cy").toFloat(), e.getDouble("r").toFloat(), null, 0f, e.optInt("w") == 1, e.optInt("g") == 1))
          } else {
            list.add(EyeShape(false, 0f, 0f, 0f, pathFrom(e.getJSONArray("ops")), e.optDouble("s", 0.0).toFloat(), e.optInt("w") == 1, e.optInt("g") == 1))
          }
        }
        eyes[n] = list
      }
      val anims = ArrayList<Anim>()
      val byId = HashMap<String, Anim>()
      val aj = o.getJSONArray("anims")
      for (i in 0 until aj.length()) {
        val a = aj.getJSONObject(i)
        val frames = a.getInt("frames")
        val fj = a.getJSONArray("f")
        val f = FloatArray(fj.length()) { fj.getDouble(it).toFloat() }
        var grad: FloatArray? = null
        if (a.has("g")) {
          val gj = a.getJSONArray("g")
          val g = FloatArray(frames * 8)
          for (k in 0 until frames) {
            val e = gj.get(k)
            if (e is JSONArray) {
              g[k * 8] = 1f
              for (q in 0 until 7) g[k * 8 + 1 + q] = e.getDouble(q).toFloat()
            }
          }
          grad = g
        }
        var fx: Array<FloatArray?>? = null
        if (a.has("fx")) {
          val xj = a.getJSONArray("fx")
          fx = arrayOfNulls<FloatArray>(frames)
          for (k in 0 until frames) {
            val items = xj.getJSONArray(k)
            if (items.length() == 0) continue
            val arr = FloatArray(items.length() * STRIDE)
            for (q in 0 until items.length()) {
              val it2 = items.getJSONArray(q)
              for (z in 0 until STRIDE) arr[q * STRIDE + z] = if (z < it2.length()) it2.getDouble(z).toFloat() else 0f
            }
            fx[k] = arr
          }
        }
        val an = Anim(a.getString("id"), a.getString("n"), a.getString("fam"), a.getDouble("d").toFloat(), a.getInt("trail"), frames, f, grad, fx, a.optBoolean("colored", false))
        anims.add(an)
        byId[an.id] = an
      }
      val sh = o.getJSONArray("shapeNames")
      return EtoileData(
        o.getDouble("fps").toFloat(), o.getDouble("scale").toFloat(), colorKeys, labs, shapes, pathFrom(o.getJSONArray("body")),
        eyeNames, eyes, strings(o.getJSONArray("texts")), strings(o.getJSONArray("tap")), strings(o.getJSONArray("amb")), anims, byId
      ).also { check(sh.length() == shapes.size) }
    }
  }
}
