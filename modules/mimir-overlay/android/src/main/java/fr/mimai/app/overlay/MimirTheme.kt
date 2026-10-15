package fr.mimai.app.overlay

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Color

/* Palette de Mìmir partout : ORANGE hors ligne, BLEU en mode en ligne (choix poussé par l'app via setTheme, mémorisé pour le
   redémarrage du service seul). Toute couleur « chaude » (orange, crème, sable) est décalée vers le bleu en gardant sa
   saturation et sa luminosité ; le rouge (micro en écoute), le vert et les gris restent inchangés. */
object MimirTheme {
  @Volatile var online = false

  fun load(ctx: Context) {
    online = ctx.getSharedPreferences("mimai_overlay", Context.MODE_PRIVATE).getBoolean("online", false)
  }

  fun set(ctx: Context, on: Boolean) {
    online = on
    ctx.getSharedPreferences("mimai_overlay", Context.MODE_PRIVATE).edit().putBoolean("online", on).apply()
    launcherIcon(ctx, on)
  }

  /* icône de l'app sur l'écran d'accueil : orange hors ligne, bleue en mode en ligne (deux alias du lanceur, voir
     plugins/withMimaiAndroid.js). Selon le lanceur, le changement apparaît après quelques secondes. */
  fun launcherIcon(ctx: Context, blue: Boolean) {
    try {
      val pm = ctx.packageManager
      val on = ComponentName(ctx.packageName, "fr.mimai.app.LauncherBlue")
      val off = ComponentName(ctx.packageName, "fr.mimai.app.LauncherOrange")
      val wantOn = if (blue) on else off
      val wantOff = if (blue) off else on
      if (pm.getComponentEnabledSetting(wantOn) == PackageManager.COMPONENT_ENABLED_STATE_ENABLED && pm.getComponentEnabledSetting(wantOff) == PackageManager.COMPONENT_ENABLED_STATE_DISABLED) return
      pm.setComponentEnabledSetting(wantOn, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
      pm.setComponentEnabledSetting(wantOff, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
    } catch (e: Exception) { /* alias absent (build sans bulle) : l'icône ne change pas */ }
  }

  private val hsv = ThreadLocal<FloatArray>()

  fun shift(color: Int): Int = if (online) toBlue(color) else color

  /* version qui décale toujours (sert aux tableaux de couleurs précalculés de l'étoile) */
  fun toBlue(color: Int): Int {
    val h = hsv.get() ?: FloatArray(3).also { hsv.set(it) }
    Color.colorToHSV(color, h)
    if (h[1] < 0.10f || h[0] < 10f || h[0] > 65f) return color
    h[0] = (h[0] + 190f) % 360f
    return Color.HSVToColor(Color.alpha(color), h)
  }

  fun pc(hex: String): Int = shift(Color.parseColor(hex))
}
