package fr.mimai.app.overlay

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.MessageDigest

/* Pont JS ↔ natif :
   - bulle assistant (permission « par-dessus », service avant-plan)
   - SHA-256 natif en flux (rapide même sur 1 Go)
   - l'appui long sur la bulle ouvre MiMai en mode écoute (reconnaissance faite côté JS, sur l'appareil) */
class MimirOverlayModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MimirOverlay")

    /* discussion flottante : la barre envoie les messages saisis au moteur de l'app (JavaScript) et reçoit les réponses */
    Events("onChatSend", "onChatOpen")

    OnCreate {
      MimirOverlayService.sinkSend = { text -> sendEvent("onChatSend", mapOf("text" to text)) }
      MimirOverlayService.sinkOpen = { sendEvent("onChatOpen", mapOf<String, Any?>()) }
    }

    OnDestroy {
      MimirOverlayService.sinkSend = null
      MimirOverlayService.sinkOpen = null
    }

    /* réponse en cours (texte complet jusqu'ici) ; done = réponse terminée */
    Function("chatText") { text: String, done: Boolean ->
      MimirOverlayService.instance?.updateReply(text, done)
      true
    }

    Function("isGranted") {
      val ctx = appContext.reactContext ?: return@Function false
      Settings.canDrawOverlays(ctx)
    }

    Function("requestPermission") {
      val act = appContext.currentActivity ?: return@Function false
      val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${act.packageName}"))
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      act.startActivity(intent)
      if (Build.VERSION.SDK_INT >= 33) {
        act.requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 4711)
      }
      true
    }

    Function("show") {
      val ctx = appContext.reactContext ?: return@Function false
      if (!Settings.canDrawOverlays(ctx)) return@Function false
      val intent = Intent(ctx, MimirOverlayService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(intent) else ctx.startService(intent)
      true
    }

    Function("hide") {
      val ctx = appContext.reactContext ?: return@Function false
      ctx.stopService(Intent(ctx, MimirOverlayService::class.java))
      true
    }

    /* état pour l'écran de diagnostic : aucune donnée personnelle, uniquement l'état technique de la barre */
    Function("status") {
      val ctx = appContext.reactContext
      val cut = if (ctx != null) MimirOverlayService.cutoutRect(ctx) else null
      mapOf<String, Any?>(
        "sdk" to Build.VERSION.SDK_INT,
        "fabricant" to Build.MANUFACTURER,
        "modele" to Build.MODEL,
        "permission" to (ctx != null && Settings.canDrawOverlays(ctx)),
        "serviceActif" to MimirOverlayService.running,
        "dernierEvenement" to MimirOverlayService.lastEvent,
        "encoche" to (cut?.toShortString() ?: "non détectée")
      )
    }

    /* SHA-256 d'un fichier, en flux : rapide même pour des Go */
    AsyncFunction("sha256File") { path: String, promise: Promise ->
      try {
        val f = java.io.File(path)
        if (!f.exists()) { promise.reject("FILE_MISSING", "fichier introuvable", null); return@AsyncFunction }
        val md = MessageDigest.getInstance("SHA-256")
        val buf = ByteArray(1 shl 20)
        f.inputStream().use { ins ->
          while (true) {
            val n = ins.read(buf)
            if (n < 0) break
            md.update(buf, 0, n)
          }
        }
        val hex = md.digest().joinToString("") { "%02x".format(it) }
        promise.resolve(hex)
      } catch (e: Exception) {
        promise.reject("HASH_FAILED", e.message, e)
      }
    }

  }
}
