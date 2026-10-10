package fr.mimai.app.overlay

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import java.io.File

/* Activité transparente : ouvre le sélecteur de fichiers d'Android pour choisir une photo depuis la bulle de discussion,
   la copie dans l'espace privé de l'appli (dossier « vision ») puis se ferme. Aucune permission, aucun accès à la galerie
   en dehors du fichier choisi par l'utilisateur. */
class MimirPickActivity : Activity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    try {
      val i = Intent(Intent.ACTION_OPEN_DOCUMENT)
      i.addCategory(Intent.CATEGORY_OPENABLE)
      i.type = "image/*"
      startActivityForResult(i, REQ)
    } catch (e: Exception) {
      Log.w(MimirOverlayService.TAG, "sélecteur de photos indisponible", e)
      finish()
    }
  }

  @Deprecated("Deprecated in Java")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    val uri: Uri? = data?.data
    if (requestCode == REQ && resultCode == RESULT_OK && uri != null) {
      try {
        val mime = contentResolver.getType(uri) ?: "image/jpeg"
        val ext = when {
          mime.contains("png") -> "png"
          mime.contains("webp") -> "webp"
          mime.contains("gif") -> "gif"
          else -> "jpg"
        }
        val dir = File(filesDir, "vision")
        dir.mkdirs()
        val out = File(dir, "img" + System.currentTimeMillis() + "." + ext)
        contentResolver.openInputStream(uri)?.use { ins -> out.outputStream().use { os -> ins.copyTo(os) } }
        if (out.exists() && out.length() > 0) MimirOverlayService.instance?.onPhotoPicked(out.absolutePath)
      } catch (e: Exception) {
        Log.w(MimirOverlayService.TAG, "copie de la photo impossible", e)
      }
    }
    finish()
  }

  companion object { private const val REQ = 4721 }
}
