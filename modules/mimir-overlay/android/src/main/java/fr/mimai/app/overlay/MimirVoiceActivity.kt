package fr.mimai.app.overlay

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log

/* Dictée de la bulle : une activité transparente (donc « au premier plan », ce qui donne le droit d'utiliser le micro, même quand
   MiMai est fermé ou en arrière-plan) qui écoute avec la reconnaissance vocale d'Android, affiche le texte au fur et à mesure dans
   la bulle puis l'envoie, et se ferme. L'app n'est PAS rouverte. Hors ligne : reconnaissance de préférence sur l'appareil ;
   en mode en ligne : service de reconnaissance du téléphone (qui peut utiliser Internet). */
class MimirVoiceActivity : Activity() {
  private var rec: SpeechRecognizer? = null
  private val ui = Handler(Looper.getMainLooper())
  private var finished = false
  private val guard = Runnable { stopListening() }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    current = this
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ)
      return
    }
    begin()
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == REQ && grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) begin() else end("permission")
  }

  private fun begin() {
    if (!SpeechRecognizer.isRecognitionAvailable(this)) { end("indisponible"); return }
    try {
      val r = SpeechRecognizer.createSpeechRecognizer(this)
      rec = r
      r.setRecognitionListener(object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) { MimirOverlayService.instance?.setMic(true) }
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onError(error: Int) { end(codeName(error)) }
        override fun onResults(results: Bundle?) {
          val t = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull() ?: ""
          MimirOverlayService.instance?.onVoiceResult(t.trim())
          end(null)
        }
        override fun onPartialResults(partialResults: Bundle?) {
          val t = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
          if (!t.isNullOrBlank()) MimirOverlayService.instance?.setInput(t)
        }
        override fun onEvent(eventType: Int, params: Bundle?) {}
      })
      val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
      i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "fr-FR")
      i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      i.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, !MimirTheme.online)
      i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
      r.startListening(i)
      ui.postDelayed(guard, 20000)
    } catch (e: Exception) {
      Log.w(MimirOverlayService.TAG, "dictée impossible", e)
      end("erreur")
    }
  }

  fun stopListening() { try { rec?.stopListening() } catch (e: Exception) { /* déjà arrêté */ } }

  private fun codeName(error: Int): String = when (error) {
    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "silence"
    SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER -> "reseau"
    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission"
    SpeechRecognizer.ERROR_AUDIO -> "micro"
    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "occupe"
    12, 13 -> "langue"          // LANGUAGE_NOT_SUPPORTED, LANGUAGE_UNAVAILABLE (Android 12+)
    else -> "erreur"
  }

  private fun end(err: String?) {
    if (finished) return
    finished = true
    ui.removeCallbacks(guard)
    val svc = MimirOverlayService.instance
    if (err != null) svc?.onVoiceError(err)
    svc?.setMic(false)
    try { rec?.destroy() } catch (e: Exception) { /* déjà détruit */ }
    rec = null
    if (current === this) current = null
    finish()
    overridePendingTransition(0, 0)
  }

  override fun onDestroy() {
    end(null)
    super.onDestroy()
  }

  companion object {
    private const val REQ = 4722
    @Volatile var current: MimirVoiceActivity? = null
    /* arrête l'écoute en cours : le texte déjà entendu est envoyé */
    fun stopCurrent() { current?.stopListening() }
  }
}
