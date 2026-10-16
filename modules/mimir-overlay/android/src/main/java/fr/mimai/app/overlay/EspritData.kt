package fr.mimai.app.overlay

import android.content.Context
import android.graphics.Path
import org.json.JSONArray
import org.json.JSONObject

/* Données de L'ESPRIT GARDIEN (le personnage du mode en ligne) : 156 animations « cuites » à 30 images par seconde par
   scripts/bake-esprit.mjs depuis le moteur de la maquette (assets/design/esprit-engine.js). Ce fichier ne fait que les lire. */

/* une forme des yeux. type : 0 ellipse, 1 cercle, 2 chemin, 3 rectangle ; a = paramètres (cx, cy, rx, ry | cx, cy, r | x, y, w, h, rx) */
class EyePrim(val type: Int, val a: FloatArray, val path: Path?, val kind: Int, val stroke: Float, val pupil: Boolean)

class EspritAnim(
  val id: String, val name: String, val fam: String, val d: Float, val trail: Int, val hard: Boolean, val frames: Int,
  val f: FloatArray, val colAlt: FloatArray, val fx: Array<FloatArray?>?
)

class EspritData(
  val fps: Float, val scale: Float, val hexKeys: List<String>, val labs: Array<FloatArray>,
  val shapes: List<Path>, val eyes: Map<String, List<EyePrim>>, val eyeKeys: List<String>, val texts: List<String>,
  val feath: List<Path>, val runes: List<Path>, val rim: Path, val void: Path, val brow: Path, val ghost: Path,
  val tap: List<String>, val amb: List<String>, val anims: List<EspritAnim>, val byId: Map<String, EspritAnim>,
  val labsAlt: Array<FloatArray>
) {
  fun key(k: String): Int = hexKeys.indexOf(k)
  fun lab(k: String, orange: Boolean = false): FloatArray = (if (orange) labsAlt else labs)[hexKeys.indexOf(k)]

  /* couleurs d'effets : la palette est déjà bleue, aucun décalage de teinte */
  val argb: IntArray = IntArray(labs.size) { EtoileData.labToArgbRaw(labs[it][0], labs[it][1], labs[it][2]) }
  /* palette orange (personnage hors ligne) */
  val argbAlt: IntArray = IntArray(labsAlt.size) { EtoileData.labToArgbRaw(labsAlt[it][0], labsAlt[it][1], labsAlt[it][2]) }

  companion object {
    /* ordre des champs d'une image cuite */
    const val X = 0; const val Y = 1; const val R = 2; const val PR = 3; const val HT = 4; const val HH = 5; const val WL = 6; const val WR = 7
    const val WG = 8; const val WF = 9; const val EX = 10; const val EY = 11; const val EG = 12; const val LID = 13; const val BL = 14; const val BR = 15
    const val BA = 16; const val RG = 17; const val R1 = 18; const val R2 = 19; const val R3 = 20; const val RR = 21; const val AG = 22; const val HC = 23
    const val BLINK = 24
    const val S = 25; const val SX = 26; const val SY = 27; const val OP = 28; const val BOP = 29; const val WS = 30; const val ES = 31; const val RS = 32; const val BO = 33
    const val HOLD = 34
    const val C0 = 35; const val C1 = 36; const val C2 = 37; const val EYES = 38
    const val N = 39
    const val ADD_END = 25        // indices 0..24 s'additionnent, 25..33 se multiplient
    const val MUL_END = 34
    const val STRIDE = 11

    private val EXPECTED = listOf(
      "x", "y", "r", "pr", "ht", "hh", "wl", "wr", "wg", "wf", "ex", "ey", "eg", "lid", "bl", "br", "ba", "rg", "r1", "r2", "r3", "rr", "ag", "hc", "blink",
      "s", "sx", "sy", "op", "bop", "ws", "es", "rs", "bo", "hold"
    )
    private val KINDS = listOf("iris", "pup", "hi", "hi2", "st", "ring", "fi", "dim")

    private fun strings(a: JSONArray): List<String> = List(a.length()) { a.getString(it) }

    /* lit assets/esprit.json (environ 1,8 Mo) ; à appeler hors du fil d'affichage */
    fun load(ctx: Context): EspritData {
      val text = ctx.assets.open("esprit.json").bufferedReader().use { it.readText() }
      val o = JSONObject(text)
      check(strings(o.getJSONArray("fields")) == EXPECTED) { "champs d'animation inattendus" }
      val hexKeys = strings(o.getJSONArray("hexKeys"))
      val hexes = strings(o.getJSONArray("hex"))
      val labs = Array(hexes.size) { EtoileData.hexToLab(hexes[it]) }
      val shapes = ArrayList<Path>()
      val sj = o.getJSONArray("shapes")
      for (i in 0 until sj.length()) shapes.add(EtoileData.pathFrom(sj.getJSONArray(i)))
      val eyeNames = strings(o.getJSONArray("eyeNames"))
      val eyeKeys = strings(o.getJSONArray("eyeKeys"))
      val eyesJ = o.getJSONObject("eyes")
      val eyes = HashMap<String, List<EyePrim>>()
      for (n in eyeNames) {
        val arr = eyesJ.getJSONArray(n)
        val list = ArrayList<EyePrim>()
        for (i in 0 until arr.length()) {
          val e = arr.getJSONObject(i)
          val kind = Math.max(0, KINDS.indexOf(e.getString("k")))
          val w = e.optDouble("w", 0.0).toFloat()
          val pupil = e.optInt("m") == 1
          when (e.getString("t")) {
            "path" -> list.add(EyePrim(2, FloatArray(0), EtoileData.pathFrom(e.getJSONArray("ops")), kind, w, pupil))
            "circle" -> {
              val a = e.getJSONObject("a")
              list.add(EyePrim(1, floatArrayOf(a.optDouble("cx", 0.0).toFloat(), a.optDouble("cy", 0.0).toFloat(), a.getDouble("r").toFloat()), null, kind, w, pupil))
            }
            "rect" -> {
              val a = e.getJSONObject("a")
              list.add(EyePrim(3, floatArrayOf(a.getDouble("x").toFloat(), a.getDouble("y").toFloat(), a.getDouble("width").toFloat(), a.getDouble("height").toFloat(), a.optDouble("rx", 0.0).toFloat()), null, kind, w, pupil))
            }
            else -> {
              val a = e.getJSONObject("a")
              list.add(EyePrim(0, floatArrayOf(a.optDouble("cx", 0.0).toFloat(), a.optDouble("cy", 0.0).toFloat(), a.getDouble("rx").toFloat(), a.getDouble("ry").toFloat()), null, kind, w, pupil))
            }
          }
        }
        eyes[n] = list
      }
      val anims = ArrayList<EspritAnim>()
      val byId = HashMap<String, EspritAnim>()
      val aj = o.getJSONArray("anims")
      for (i in 0 until aj.length()) {
        val a = aj.getJSONObject(i)
        val frames = a.getInt("frames")
        val fj = a.getJSONArray("f")
        val f = FloatArray(fj.length()) { fj.getDouble(it).toFloat() }
        check(f.size == frames * N) { "images de " + a.getString("id") + " : taille inattendue" }
        val cj = a.getJSONArray("c2")
        val colAlt = FloatArray(cj.length()) { cj.getDouble(it).toFloat() }
        check(colAlt.size == frames * 3) { "couleurs orange de " + a.getString("id") + " : taille inattendue" }
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
        val an = EspritAnim(a.getString("id"), a.getString("n"), a.getString("fam"), a.getDouble("d").toFloat(), a.getInt("trail"), a.optBoolean("hard", false), frames, f, colAlt, fx)
        anims.add(an)
        byId[an.id] = an
      }
      fun pathOf(k: String): Path = EtoileData.pathFrom(o.getJSONArray(k))
      val hexOrange = strings(o.getJSONArray("hexOrange"))
      val labsAlt = Array(hexOrange.size) { EtoileData.hexToLab(hexOrange[it]) }
      val fj = o.getJSONArray("feath")
      val rj = o.getJSONArray("runes")
      return EspritData(
        o.getDouble("fps").toFloat(), o.getDouble("scale").toFloat(), hexKeys, labs, shapes, eyes, eyeKeys, strings(o.getJSONArray("texts")),
        List(fj.length()) { EtoileData.pathFrom(fj.getJSONArray(it)) }, List(rj.length()) { EtoileData.pathFrom(rj.getJSONArray(it)) },
        pathOf("rim"), pathOf("void"), pathOf("brow"), pathOf("ghost"),
        strings(o.getJSONArray("tap")), strings(o.getJSONArray("amb")), anims, byId, labsAlt
      )
    }
  }
}
