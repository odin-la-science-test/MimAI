package fr.mimai.app.overlay

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.Icon
import android.app.RemoteInput
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.RectF
import android.hardware.display.DisplayManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Display
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/* Service avant-plan qui affiche la barre Mìmir : une fine barre noire AUTOUR de la caméra frontale
   (type « îlot »), avec la petite étoile MiMai. Aucun personnage flottant à l'écran.
   Un toucher ouvre l'assistant ; un appui long l'ouvre en écoute vocale (deep link mimai://assistant).
   Position lue sur l'encoche réelle de l'écran (Android 11+) ; sinon barre centrée en haut.
   Masquée en paysage (vidéos, jeux) pour ne jamais gêner. */
class MimirOverlayService : Service() {

  private var wm: WindowManager? = null
  private var bar: ImageView? = null
  private val ui = Handler(Looper.getMainLooper())

  /* fenêtre de discussion flottante (ouverte par un toucher sur la barre) */
  private var panel: PanelRoot? = null
  private var panelList: LinearLayout? = null
  private var panelScroll: ScrollView? = null
  private var panelInput: EditText? = null
  private var typing: TextView? = null
  private var waiting = false
  private var barBottom = 0

  /* réponse rapide écrite dans la notification */
  private var notifWaiting = false
  private var lastNotifAt = 0L
  private var lastAnswer: String? = null

  /* racine de la fenêtre : la touche Retour la ferme */
  private class PanelRoot(ctx: Context, val onBack: () -> Unit) : LinearLayout(ctx) {
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
      if (event.keyCode == KeyEvent.KEYCODE_BACK) {
        if (event.action == KeyEvent.ACTION_UP) onBack()
        return true
      }
      return super.dispatchKeyEvent(event)
    }
  }

  override fun onCreate() {
    super.onCreate()
    instance = this
    wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    running = true
    instance = this
    lastEvent = "démarrage demandé (api " + Build.VERSION.SDK_INT + ", permission " + Settings.canDrawOverlays(this) + ")"
    Log.i(TAG, lastEvent)
    /* Le type « specialUse » n'existe qu'à partir d'Android 14 (API 34). Avant, l'attribut du manifeste est ignoré :
       passer ce type à startForeground() lèverait une exception et ferait planter le service. */
    try {
      val notification = buildNotification(lastAnswer)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
      } else {
        startForeground(NOTIF_ID, notification)
      }
    } catch (e: Exception) {
      lastEvent = "startForeground a échoué : " + e.javaClass.simpleName + " " + (e.message ?: "")
      Log.e(TAG, lastEvent, e)
      stopSelf(); return START_NOT_STICKY
    }
    if (intent?.action == ACTION_HIDE) {
      lastEvent = "arrêt : demandé"
      closePanel(); removeBar(); stopSelf(); return START_NOT_STICKY
    }
    if (intent?.action == ACTION_OPEN_PANEL) {
      /* toucher sur la puce / la notification : la fenêtre de discussion s'ouvre par-dessus l'appli en cours */
      lastEvent = "puce touchée"
      if (Settings.canDrawOverlays(this)) { if (panel == null) openPanel() } else openAssistant("0")
      return START_NOT_STICKY
    }
    if (!Settings.canDrawOverlays(this)) {
      /* sans la permission « par-dessus », seule la puce de la barre d'état est active (un toucher ouvre l'appli) */
      lastEvent = "puce seule : permission « Afficher par-dessus » absente"
      removeBar()
      return START_NOT_STICKY
    }
    applyBarPref()
    /* NOT_STICKY : Android 12+ interdit de relancer un service au premier plan depuis
       l'arrière-plan ; l'utilisateur réactive la barre depuis l'app. */
    return START_NOT_STICKY
  }

  /* la barre noire dessinée autour de la caméra est facultative (réglage de l'app) ; la puce système, elle, est toujours là */
  fun applyBarPref() {
    val want = getSharedPreferences("mimai_overlay", Context.MODE_PRIVATE).getBoolean("bar", false)
    if (want && Settings.canDrawOverlays(this)) refreshBar() else { closePanel(); removeBar(); lastEvent = "puce seule (barre dessinée désactivée)" }
  }

  /* rotation : on replace la barre (cachée en paysage) */
  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    if (Settings.canDrawOverlays(this)) applyBarPref()
  }

  /* bas de la zone caméra / barre d'état : la fenêtre de discussion s'ouvre juste en dessous */
  private fun anchorBottom(): Int {
    if (barBottom > 0 && bar != null) return barBottom
    val cut = cutoutRect(this)
    if (cut != null) return cut.bottom
    val sbId = resources.getIdentifier("status_bar_height", "dimen", "android")
    return if (sbId > 0) resources.getDimensionPixelSize(sbId) else (24 * resources.displayMetrics.density).toInt()
  }

  private fun refreshBar() {
    closePanel()
    removeBar()
    if (resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE) {
      lastEvent = "barre masquée : écran en paysage"
      Log.i(TAG, lastEvent)
      return
    }
    addBar()
  }

  /* rectangle de la caméra (encoche / trou) en pixels écran, ou null si inconnu ou absent */
  private fun cameraCutout(): android.graphics.Rect? = cutoutRect(this)

  private fun addBar() {
    wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val dp = resources.displayMetrics.density
    val screenW = resources.displayMetrics.widthPixels
    val cut = cameraCutout()

    /* dimensions : la barre enveloppe la caméra avec ~52 dp de chaque côté (étoile à gauche, voyant à droite) */
    val side = (52 * dp).toInt()
    val camW: Int; val w: Int; val h: Int; val x: Int; val y: Int
    if (cut != null) {
      camW = cut.width()
      w = camW + 2 * side
      h = cut.height() + (6 * dp).toInt()
      x = cut.centerX() - w / 2
      y = maxOf(0, cut.top - (3 * dp).toInt())
      barBottom = y + h
    } else {
      /* pas d'encoche détectée : barre discrète centrée sous le bord haut */
      camW = (22 * dp).toInt()
      w = camW + 2 * side
      h = (26 * dp).toInt()
      x = (screenW - w) / 2
      val sbId = resources.getIdentifier("status_bar_height", "dimen", "android")
      val sb = if (sbId > 0) resources.getDimensionPixelSize(sbId) else (24 * dp).toInt()
      y = maxOf(0, (sb - h) / 2)
      barBottom = y + h
    }

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE
    val params = WindowManager.LayoutParams(
      w, h, type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT
    )
    params.gravity = Gravity.TOP or Gravity.START
    params.x = maxOf(0, x)
    params.y = y
    /* autorise le dessin dans la zone de la caméra */
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
    }

    val iv = ImageView(this)
    iv.setImageBitmap(barBitmap(w, h, camW))
    iv.contentDescription = "Mìmir : toucher pour ouvrir la discussion flottante, appui long pour parler à voix haute"

    var downAt = 0L
    iv.setOnTouchListener { _, ev ->
      when (ev.actionMasked) {
        MotionEvent.ACTION_DOWN -> { downAt = System.currentTimeMillis(); lastEvent = "toucher reçu sur la barre"; true }
        MotionEvent.ACTION_UP -> {
          if (System.currentTimeMillis() - downAt > 500) {
            /* appui long : MiMai s'ouvre et écoute (reconnaissance vocale SUR L'APPAREIL, gérée côté JS) */
            openAssistant("force")
          } else togglePanel()
          true
        }
        else -> false
      }
    }
    try {
      wm?.addView(iv, params)
      bar = iv
      lastEvent = "barre affichée " + w + "x" + h + " px en (" + params.x + "," + params.y + "), encoche " + (if (cut != null) cut.toShortString() else "non détectée")
      Log.i(TAG, lastEvent)
    } catch (e: Exception) {
      /* permission retirée entre-temps, ou fenêtre refusée : on s'arrête proprement */
      lastEvent = "ajout de la fenêtre refusé : " + e.javaClass.simpleName + " " + (e.message ?: "")
      Log.e(TAG, lastEvent, e)
      bar = null
      stopSelf()
    }
  }

  private fun openAssistant(voice: String = "1") {
    val link = Intent(Intent.ACTION_VIEW, Uri.parse("mimai://assistant?voice=" + voice)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try { startActivity(link) } catch (e: Exception) {
      val launch = packageManager.getLaunchIntentForPackage(packageName)
      launch?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      if (launch != null) startActivity(launch)
    }
  }

  /* ───────── discussion flottante ───────── */
  private fun togglePanel() {
    if (panel != null) { closePanel(); return }
    /* la fenêtre s'ouvre toujours (un toucher doit toujours avoir un effet visible). Si le moteur de l'app
       (JavaScript) n'est pas actif, elle l'indique : Android interdit à un service de relancer l'app en arrière-plan. */
    openPanel()
    if (panel != null && sinkSend == null) {
      lastEvent = "discussion ouverte, mais le moteur de l'app n'est pas actif"
      bubble("Le moteur de MiMai n'est pas actif. Touchez « Ouvrir MiMai » en haut, puis revenez ici.", false)
    }
  }

  private fun bubble(text: String, mine: Boolean): TextView {
    val dp = resources.displayMetrics.density
    val maxW = (resources.displayMetrics.widthPixels * 0.94f * 0.78f).toInt()
    val tv = TextView(this)
    tv.text = text
    tv.setTextColor(if (mine) Color.WHITE else Color.parseColor("#F5EAD8"))
    tv.textSize = 15f
    tv.maxWidth = maxW
    tv.setTextIsSelectable(true)
    val bg = GradientDrawable()
    bg.setColor(Color.parseColor(if (mine) "#C67139" else "#2E2A26"))
    bg.cornerRadius = 16 * dp
    tv.background = bg
    tv.setPadding((12 * dp).toInt(), (8 * dp).toInt(), (12 * dp).toInt(), (8 * dp).toInt())
    val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
    lp.gravity = if (mine) Gravity.END else Gravity.START
    lp.topMargin = (6 * dp).toInt()
    panelList?.addView(tv, lp)
    scrollDown()
    return tv
  }

  private fun scrollDown() { panelScroll?.post { panelScroll?.fullScroll(View.FOCUS_DOWN) } }

  private fun openPanel() {
    val w = wm ?: return
    val dp = resources.displayMetrics.density
    val sw = resources.displayMetrics.widthPixels
    val sh = resources.displayMetrics.heightPixels
    val pw = (sw * 0.94f).toInt()
    val ph = (sh * 0.44f).toInt()

    val root = PanelRoot(this) { closePanel() }
    root.orientation = LinearLayout.VERTICAL
    val bg = GradientDrawable()
    bg.setColor(Color.parseColor("#181614"))
    bg.cornerRadius = 22 * dp
    root.background = bg
    root.setPadding((12 * dp).toInt(), (10 * dp).toInt(), (12 * dp).toInt(), (10 * dp).toInt())

    /* en-tête : titre, ouvrir l'application, fermer */
    val head = LinearLayout(this)
    head.orientation = LinearLayout.HORIZONTAL
    head.gravity = Gravity.CENTER_VERTICAL
    val title = TextView(this)
    title.text = "Mìmir"
    title.setTextColor(Color.parseColor("#F5EAD8"))
    title.textSize = 17f
    title.typeface = Typeface.DEFAULT_BOLD
    head.addView(title, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    val open = TextView(this)
    open.text = "Ouvrir MiMai"
    open.setTextColor(Color.parseColor("#C67139"))
    open.textSize = 13f
    open.setPadding((10 * dp).toInt(), (8 * dp).toInt(), (10 * dp).toInt(), (8 * dp).toInt())
    open.setOnClickListener { closePanel(); openAssistant("0") }
    head.addView(open)
    val close = TextView(this)
    close.text = "✕"
    close.setTextColor(Color.parseColor("#F5EAD8"))
    close.textSize = 18f
    close.contentDescription = "Fermer la discussion"
    close.setPadding((10 * dp).toInt(), (6 * dp).toInt(), (6 * dp).toInt(), (6 * dp).toInt())
    close.setOnClickListener { closePanel() }
    head.addView(close)
    root.addView(head, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

    /* messages : aucune phrase pré-écrite, la page est vide jusqu'au premier message */
    val list = LinearLayout(this)
    list.orientation = LinearLayout.VERTICAL
    val scroll = ScrollView(this)
    scroll.addView(list, android.view.ViewGroup.LayoutParams(android.view.ViewGroup.LayoutParams.MATCH_PARENT, android.view.ViewGroup.LayoutParams.WRAP_CONTENT))
    root.addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

    /* saisie */
    val row = LinearLayout(this)
    row.orientation = LinearLayout.HORIZONTAL
    row.gravity = Gravity.CENTER_VERTICAL
    val input = EditText(this)
    input.hint = "Écrire à Mìmir…"
    input.setHintTextColor(Color.parseColor("#8A8178"))
    input.setTextColor(Color.parseColor("#F5EAD8"))
    input.textSize = 15f
    input.maxLines = 3
    input.imeOptions = EditorInfo.IME_ACTION_SEND
    input.inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
    val ibg = GradientDrawable()
    ibg.setColor(Color.parseColor("#2E2A26"))
    ibg.cornerRadius = 20 * dp
    input.background = ibg
    input.setPadding((14 * dp).toInt(), (8 * dp).toInt(), (14 * dp).toInt(), (8 * dp).toInt())
    row.addView(input, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
    val send = TextView(this)
    send.text = "Envoyer"
    send.setTextColor(Color.WHITE)
    send.textSize = 14f
    send.typeface = Typeface.DEFAULT_BOLD
    val sbg = GradientDrawable()
    sbg.setColor(Color.parseColor("#C67139"))
    sbg.cornerRadius = 20 * dp
    send.background = sbg
    send.setPadding((14 * dp).toInt(), (10 * dp).toInt(), (14 * dp).toInt(), (10 * dp).toInt())
    val slp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
    slp.leftMargin = (8 * dp).toInt()
    row.addView(send, slp)
    val rlp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
    rlp.topMargin = (8 * dp).toInt()
    root.addView(row, rlp)

    panel = root; panelList = list; panelScroll = scroll; panelInput = input; typing = null; waiting = false
    send.setOnClickListener { sendFromPanel() }
    input.setOnEditorActionListener { _, action, _ ->
      if (action == EditorInfo.IME_ACTION_SEND) { sendFromPanel(); true } else false
    }

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE
    /* fenêtre prenant le focus (clavier) mais laissant passer les touches hors de la fenêtre */
    val lp = WindowManager.LayoutParams(pw, ph, type, WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL, PixelFormat.TRANSLUCENT)
    lp.gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
    lp.y = anchorBottom() + (8 * dp).toInt()
    lp.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN or WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE
    try {
      w.addView(root, lp)
      lastEvent = "discussion flottante ouverte"
      sinkOpen?.invoke()
      input.postDelayed({
        input.requestFocus()
        (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
      }, 150)
    } catch (e: Exception) {
      lastEvent = "discussion flottante refusée : " + e.javaClass.simpleName + " " + (e.message ?: "")
      Log.e(TAG, lastEvent, e)
      panel = null; panelList = null; panelScroll = null; panelInput = null
    }
  }

  private fun sendFromPanel() {
    val input = panelInput ?: return
    val t = input.text.toString().trim()
    if (t.isEmpty() || waiting) return
    input.setText("")
    bubble(t, true)
    typing = bubble("…", false)
    waiting = true
    val send = sinkSend
    if (send == null) updateReply("Ouvrez MiMai une fois pour activer la discussion flottante.", true)
    else send(t)
  }

  /* appelé par le module (réponse du moteur de l'app) : texte courant de la réponse, done = réponse terminée */
  fun updateReply(text: String, done: Boolean) {
    ui.post {
      if (notifWaiting) {
        val now = System.currentTimeMillis()
        if (done || now - lastNotifAt > 1200) { lastNotifAt = now; setNotif(text) }
        if (done) notifWaiting = false
      }
      if (panel == null) return@post
      val v = typing ?: bubble("", false).also { typing = it }
      v.text = text
      scrollDown()
      if (done) { typing = null; waiting = false }
    }
  }

  private fun closePanel() {
    val p = panel ?: return
    try { (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(p.windowToken, 0) } catch (e: Exception) { /* ignoré */ }
    try { wm?.removeView(p) } catch (e: Exception) { /* déjà retirée */ }
    panel = null; panelList = null; panelScroll = null; panelInput = null; typing = null; waiting = false
  }

  private fun removeBar() {
    bar?.let { try { wm?.removeView(it) } catch (e: Exception) { /* déjà retirée */ } }
    bar = null
  }

  override fun onDestroy() { running = false; closePanel(); removeBar(); instance = null; super.onDestroy() }

  /* la barre : pilule noire, étoile MiMai (astroïde x = a·cos³t, y = a·sin³t) à gauche de la caméra,
     petit voyant terracotta à droite ; l'espace central (la caméra) reste noir et se fond dans la barre */
  private fun barBitmap(w: Int, h: Int, camW: Int): Bitmap {
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    val p = Paint(Paint.ANTI_ALIAS_FLAG)
    p.color = Color.argb(240, 8, 8, 8)
    c.drawRoundRect(RectF(0f, 0f, w.toFloat(), h.toFloat()), h / 2f, h / 2f, p)

    val seg = (w - camW) / 2f            // largeur de chaque côté de la caméra
    val cy = h / 2f
    val a = h * 0.30f
    p.color = Color.parseColor("#F5EAD8")
    val path = Path()
    val n = 96
    val cxStar = seg / 2f
    for (i in 0..n) {
      val t = (i.toDouble() / n) * 2 * Math.PI
      val x = cxStar + (a * Math.pow(Math.cos(t), 3.0)).toFloat()
      val y = cy + (a * Math.pow(Math.sin(t), 3.0)).toFloat()
      if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
    }
    path.close()
    c.drawPath(path, p)

    p.color = Color.parseColor("#C67139")
    c.drawCircle(w - seg / 2f, cy, h * 0.12f, p)
    return bmp
  }

  /* texte écrit dans la notification (réponse rapide) : on la remet à jour avec l'état ou la réponse */
  fun onNotifReply(text: String) {
    val send = sinkSend
    if (send == null) { setNotif("Le moteur de MiMai n'est pas actif. Ouvrez MiMai une fois, puis réessayez."); return }
    notifWaiting = true
    lastNotifAt = 0L
    setNotif("Mìmir réfléchit…")
    send(text)
  }

  private fun setNotif(answer: String?) {
    lastAnswer = answer
    try { (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIF_ID, buildNotification(answer)) } catch (e: Exception) { Log.w(TAG, "mise à jour de la notification impossible", e) }
  }

  /* appel par réflexion : ces méthodes n'existent qu'à partir d'Android 16 (API 36) ; si absentes, la notification reste une notification normale */
  private fun tryCall(target: Any, name: String, type: Class<*>, value: Any) {
    try { target.javaClass.getMethod(name, type).invoke(target, value) } catch (e: Exception) { Log.i(TAG, name + " indisponible : " + e.javaClass.simpleName) }
  }

  /* La notification de Mìmir : sur Android 16 (Samsung One UI 8 compris) elle devient une PUCE dans la barre d'état,
     près de la caméra, comme un lecteur de musique. Un toucher ouvre la discussion ; on peut aussi écrire dans la notification. */
  private fun buildNotification(answer: String? = null): Notification {
    val chId = "mimir_chip"
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val ch = NotificationChannel(chId, "Mìmir : puce dans la barre d'état", NotificationManager.IMPORTANCE_LOW)
      ch.setShowBadge(false)
      nm.createNotificationChannel(ch)
    }
    val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    val open: PendingIntent = if (Settings.canDrawOverlays(this)) {
      PendingIntent.getService(this, 1, Intent(this, MimirOverlayService::class.java).setAction(ACTION_OPEN_PANEL), flags)
    } else {
      PendingIntent.getActivity(this, 0, packageManager.getLaunchIntentForPackage(packageName) ?: Intent(), flags)
    }
    val ri = RemoteInput.Builder(MimirReplyReceiver.KEY_REPLY).setLabel("Poser une question à Mìmir").build()
    val replyPi = PendingIntent.getBroadcast(this, 2, Intent(this, MimirReplyReceiver::class.java).setAction(MimirReplyReceiver.ACTION),
      PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val icon = Icon.createWithResource(this, R.drawable.ic_mimir_notif)
    val reply = Notification.Action.Builder(icon, "Écrire", replyPi).addRemoteInput(ri).setAllowGeneratedReplies(false).build()
    val talkPi = PendingIntent.getActivity(this, 3,
      Intent(Intent.ACTION_VIEW, Uri.parse("mimai://assistant?voice=force")).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), flags)
    val talk = Notification.Action.Builder(icon, "Parler", talkPi).build()

    val body = answer ?: "Touchez pour discuter, ou écrivez ici."
    val b = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, chId) else Notification.Builder(this)
    b.setContentTitle("Mìmir")
      .setContentText(body)
      .setStyle(Notification.BigTextStyle().bigText(body))
      .setSmallIcon(R.drawable.ic_mimir_notif)
      .setContentIntent(open)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .addAction(reply)
      .addAction(talk)
    if (Build.VERSION.SDK_INT >= 36) {
      tryCall(b, "setRequestPromotedOngoing", java.lang.Boolean.TYPE, true)
      tryCall(b, "setShortCriticalText", CharSequence::class.java, "Mìmir")
    }
    return b.build()
  }

  companion object {
    const val TAG = "MiMaiOverlay"
    /* état lisible par l'écran de diagnostic de l'app */
    @Volatile var lastEvent: String = "le service n'a jamais été démarré"
    @Volatile var running: Boolean = false
    @Volatile var instance: MimirOverlayService? = null
    /* branchés par le module JavaScript : envoi d'un message / ouverture d'une nouvelle discussion */
    @Volatile var sinkSend: ((String) -> Unit)? = null
    @Volatile var sinkOpen: (() -> Unit)? = null

    /* rectangle de la caméra (encoche / trou) en pixels écran, ou null si inconnu ou absent (Android 11+) */
    fun cutoutRect(ctx: Context): android.graphics.Rect? {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
      return try {
        val dm = ctx.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager
        val r = dm.getDisplay(Display.DEFAULT_DISPLAY)?.cutout?.boundingRectTop
        if (r != null && !r.isEmpty) r else null
      } catch (e: Exception) {
        Log.w(TAG, "lecture de l'encoche impossible", e)
        null
      }
    }
    const val ACTION_HIDE = "fr.mimai.app.overlay.HIDE"
    const val ACTION_OPEN_PANEL = "fr.mimai.app.overlay.OPEN_PANEL"
    /* texte écrit dans la notification : envoyé au moteur de l'app */
    fun replyFromNotification(text: String) { instance?.onNotifReply(text) }
    const val NOTIF_ID = 4700
  }
}
