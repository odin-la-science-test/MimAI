package fr.mimai.app.overlay

import android.app.RemoteInput
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/* Reçoit le texte écrit dans la notification de Mìmir (réponse rapide) et le transmet au moteur de l'app. */
class MimirReplyReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val results = RemoteInput.getResultsFromIntent(intent) ?: return
    val text = results.getCharSequence(KEY_REPLY)?.toString()?.trim() ?: return
    if (text.isEmpty()) return
    MimirOverlayService.replyFromNotification(text)
  }

  companion object {
    const val KEY_REPLY = "mimir_reply"
    const val ACTION = "fr.mimai.app.overlay.REPLY"
  }
}
