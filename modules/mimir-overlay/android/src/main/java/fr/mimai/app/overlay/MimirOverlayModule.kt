package fr.mimai.app.overlay

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
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

    /* fil d'Ariane : quelques lignes techniques (étapes, mémoire) écrites tout de suite sur disque, pour savoir ce qui se
       passait juste avant un plantage natif ; aucun texte de conversation n'y est écrit */
    Function("trail") { text: String ->
      val ctx = appContext.reactContext ?: return@Function false
      try {
        synchronized(TRAIL_LOCK) {
          val f = java.io.File(ctx.filesDir, "mimai-trail.txt")
          if (f.exists() && f.length() > 60000) f.writeText(f.readText().takeLast(30000))
          val ts = java.text.SimpleDateFormat("dd/MM HH:mm:ss.SSS", java.util.Locale.FRANCE).format(java.util.Date())
          val mb = android.os.Debug.getNativeHeapAllocatedSize() / (1024 * 1024)
          java.io.FileOutputStream(f, true).use { os ->
            os.write((ts + " [natif " + mb + " Mo] " + text + "\n").toByteArray())
            os.fd.sync()
          }
        }
        true
      } catch (e: Exception) { false }
    }

    Function("readTrail") {
      val ctx = appContext.reactContext ?: return@Function ""
      try {
        synchronized(TRAIL_LOCK) {
          val f = java.io.File(ctx.filesDir, "mimai-trail.txt")
          if (f.exists()) f.readText().takeLast(24000) else ""
        }
      } catch (e: Exception) { "" }
    }

    Function("clearTrail") {
      val ctx = appContext.reactContext ?: return@Function false
      try { synchronized(TRAIL_LOCK) { java.io.File(ctx.filesDir, "mimai-trail.txt").delete() }; true } catch (e: Exception) { false }
    }

    /* pourquoi Android a fermé l'app ces dernières fois (plantage natif, mémoire, plantage JavaScript…) :
       aucune donnée personnelle, uniquement l'état technique ; sert à comprendre un plantage sans câble ni outil */
    Function("lastExit") {
      val out = ArrayList<Map<String, Any?>>()
      val ctx = appContext.reactContext
      if (ctx == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return@Function out
      try {
        val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        for (r in am.getHistoricalProcessExitReasons(ctx.packageName, 0, 4)) {
          var trace = ""
          try {
            if (r.reason == ApplicationExitInfo.REASON_CRASH_NATIVE || r.reason == ApplicationExitInfo.REASON_ANR) {
              r.traceInputStream?.use { ins ->
                val buf = ByteArray(40000)
                val n = ins.read(buf)
                if (n > 0) trace = printableRuns(buf, n)
              }
            }
          } catch (e: Exception) { trace = "trace illisible : " + e.javaClass.simpleName }
          out.add(mapOf<String, Any?>(
            "reason" to exitReasonName(r.reason),
            "desc" to (r.description ?: ""),
            "time" to r.timestamp,
            "rssMb" to (r.rss / 1024),
            "importance" to r.importance,
            "trace" to trace
          ))
        }
      } catch (e: Exception) {
        out.add(mapOf<String, Any?>("reason" to "lecture impossible", "desc" to (e.message ?: ""), "time" to 0L, "rssMb" to 0L, "importance" to 0, "trace" to ""))
      }
      out
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

private fun exitReasonName(r: Int): String = when (r) {
  ApplicationExitInfo.REASON_CRASH -> "plantage JavaScript/Java"
  ApplicationExitInfo.REASON_CRASH_NATIVE -> "plantage NATIF (moteur du modèle)"
  ApplicationExitInfo.REASON_LOW_MEMORY -> "manque de MÉMOIRE (fermée par Android)"
  ApplicationExitInfo.REASON_ANR -> "application ne répond plus"
  ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "usage excessif de ressources"
  ApplicationExitInfo.REASON_SIGNALED -> "signal reçu"
  ApplicationExitInfo.REASON_USER_REQUESTED -> "fermée par l'utilisateur"
  ApplicationExitInfo.REASON_USER_STOPPED -> "arrêt forcé"
  ApplicationExitInfo.REASON_DEPENDENCY_DIED -> "dépendance arrêtée"
  ApplicationExitInfo.REASON_EXIT_SELF -> "fermeture normale"
  ApplicationExitInfo.REASON_PERMISSION_CHANGE -> "changement de permission"
  else -> "autre (" + r + ")"
}

/* extrait les suites de caractères lisibles d'un fichier binaire (signal, noms de bibliothèques et de fonctions) */
private fun printableRuns(buf: ByteArray, n: Int): String {
  val sb = StringBuilder()
  var run = StringBuilder()
  for (i in 0 until n) {
    val c = buf[i].toInt() and 0xFF
    if (c in 32..126) run.append(c.toChar())
    else {
      if (run.length >= 6 && sb.length < 2500) { if (sb.isNotEmpty()) sb.append(" | "); sb.append(run) }
      run = StringBuilder()
    }
  }
  if (run.length >= 6 && sb.length < 2500) { if (sb.isNotEmpty()) sb.append(" | "); sb.append(run) }
  return sb.toString()
}

private val TRAIL_LOCK = Any()
