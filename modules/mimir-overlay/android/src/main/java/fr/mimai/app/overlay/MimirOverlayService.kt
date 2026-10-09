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

  override fun onCreate() { super.onCreate(); instance = this }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    running = true
    instance = this
    lastEvent = "démarrage demandé (api " + Build.VERSION.SDK_INT + ", permission " + Settings.canDrawOverlays(this) + ")"
    Log.i(TAG, lastEvent)
    /* Le type « specialUse » n'existe qu'à partir d'Android 14 (API 34). Avant, l'attribut du manifeste est ignoré :
       passer ce type à startForeground() lèverait une exception et ferait planter le service. */
    try {
      val notification = buildNotification()
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
    if (intent?.action == ACTION_HIDE || !Settings.canDrawOverlays(this)) {
      lastEvent = "arrêt : " + (if (intent?.action == ACTION_HIDE) "demandé" else "permission « Afficher par-dessus » absente")
      removeBar(); stopSelf(); return START_NOT_STICKY
    }
    refreshBar()
    /* NOT_STICKY : Android 12+ interdit de relancer un service au premier plan depuis
       l'arrière-plan ; l'utilisateur réactive la barre depuis l'app. */
    return START_NOT_STICKY
  }

  /* rotation : on replace la barre (cachée en paysage) */
  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    if (Settings.canDrawOverlays(this)) refreshBar()
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
    lp.y = barBottom + (8 * dp).toInt()
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

  private fun buildNotification(): Notification {
    val chId = "mimir_overlay"
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(NotificationChannel(chId, "Mìmir", NotificationManager.IMPORTANCE_MIN))
    }
    val pi = PendingIntent.getActivity(this, 0, packageManager.getLaunchIntentForPackage(packageName) ?: Intent(), PendingIntent.FLAG_IMMUTABLE)
    val b = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, chId) else Notification.Builder(this)
    b.setContentTitle("Mìmir est à portée")
      .setContentText("Touchez la barre près de la caméra pour demander de l'aide, partout.")
      .setSmallIcon(R.drawable.ic_mimir_notif)
      .setContentIntent(pi)
      .setOngoing(true)
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
    const val NOTIF_ID = 4700
  }
}
