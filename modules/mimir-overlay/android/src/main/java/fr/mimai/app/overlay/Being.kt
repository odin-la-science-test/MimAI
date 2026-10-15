package fr.mimai.app.overlay

import android.graphics.Canvas

/* Le petit être qui vit près de la caméra : l'étoile de Mìmir (hors ligne) ou l'esprit gardien (mode en ligne).
   MimirBar ne parle qu'à cette interface ; chaque personnage a ses propres animations. */
interface Being {
  var ambient: Boolean
  /* position / taille affichées (pixels, repère de la vue) après ressorts, et décalage de l'animation en cours (en tailles) */
  val posX: Float
  val posY: Float
  val sizePx: Float
  val offX: Float
  val offY: Float
  fun place(x: Float, y: Float, size: Float)
  fun fly(x1: Float, y1: Float, s1: Float, cx: Float?, cy: Float?, d: Float, ex: String, ey: String?, es: String, cb: (() -> Unit)?)
  fun play(id: String)
  fun has(id: String): Boolean
  fun playRandomTap()
  fun switchMode(m: String)
  fun busy(): Boolean
  fun tick(dtRaw: Float)
  fun draw(c: Canvas, ox: Float, oy: Float)

  /* noms des mouvements pour les situations de la barre (chaque personnage a les siens) */
  fun clipFor(role: String): String
}
