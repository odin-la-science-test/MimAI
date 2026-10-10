package fr.mimai.app.overlay

import android.content.Context
import java.io.File
import java.io.FileOutputStream

/* Fil d'Ariane natif : quelques lignes techniques écrites tout de suite sur disque (aucun texte de conversation).
   Le module (JavaScript) et le service de la barre écrivent dans le même fichier ; l'app le relit dans « Rapport de plantage ». */
object Trail {
  private val lock = Any()

  fun add(ctx: Context, text: String) {
    try {
      synchronized(lock) {
        val f = File(ctx.filesDir, "mimai-trail.txt")
        if (f.exists() && f.length() > 60000) f.writeText(f.readText().takeLast(30000))
        val ts = java.text.SimpleDateFormat("dd/MM HH:mm:ss.SSS", java.util.Locale.FRANCE).format(java.util.Date())
        val mb = android.os.Debug.getNativeHeapAllocatedSize() / (1024 * 1024)
        FileOutputStream(f, true).use { os ->
          os.write((ts + " [natif " + mb + " Mo] " + text.replace('\n', ' ') + "\n").toByteArray())
          os.fd.sync()
        }
      }
    } catch (e: Exception) { /* le journal est facultatif */ }
  }
}
