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
import android.animation.LayoutTransition
import android.animation.ValueAnimator
import android.os.Handler
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
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
  /* barre animée (pilule + étoile vivante) ; la barre dessinée ci-dessous ne sert que de repli */
  private var animBar: MimirBar? = null
  private val ui = Handler(Looper.getMainLooper())

  /* fenêtre de discussion flottante (ouverte par un toucher sur la barre) */
  private var panel: PanelRoot? = null
  private var panelList: LinearLayout? = null
  private var panelScroll: ScrollView? = null
  private var panelInput: EditText? = null
  private var typing: TextView? = null
  private var waiting = false
  private var barBottom = 0
  private var curMode = "rapide"
  private var replyStarted = false
  /* le mode et le modèle d'une discussion sont fixés dès son premier message */
  private var modeLocked = false

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
    appCtx = applicationContext
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
      if (Settings.canDrawOverlays(this)) {
        val wantMic = intent.getBooleanExtra("mic", false)
        if (panel == null) togglePanel(wantMic) else if (wantMic) sinkAction?.invoke("mic", "")
      } else openAssistant("0")
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
    val want = getSharedPreferences("mimai_overlay", Context.MODE_PRIVATE).getBoolean("bar", true)
    if (want && Settings.canDrawOverlays(this)) refreshBar() else { closePanel(); removeBar(); lastEvent = "puce seule (barre dessinée désactivée)" }
  }

  /* rotation : on replace la barre (cachée en paysage) */
  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    if (Settings.canDrawOverlays(this)) applyBarPref()
  }

  /* bas de la zone caméra / barre d'état : la fenêtre de discussion s'ouvre juste en dessous */
  private fun anchorBottom(): Int {
    if (barBottom > 0 && (bar != null || animBar != null)) return barBottom
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
    if (!addAnimatedBar()) addBar()
  }

  /* barre animée : demande les données de l'étoile (1 Mo, lues hors du fil d'affichage la première fois) */
  private fun addAnimatedBar(): Boolean {
    val d = etoile
    if (d == null) {
      if (!etoileLoading) {
        etoileLoading = true
        Thread {
          try { etoile = EtoileData.load(applicationContext); etoileError = "" }
          catch (e: Exception) { etoileError = e.javaClass.simpleName + " " + (e.message ?: ""); Log.e(TAG, "animations de l'étoile illisibles", e) }
          etoileLoading = false
          ui.post { if (running && etoile != null && bar != null) refreshBar() }   /* remplace la barre de repli */
        }.start()
      }
      return false
    }
    val w = wm ?: return false
    val cut = cameraCutout()
    val sbId = resources.getIdentifier("status_bar_height", "dimen", "android")
    val sb = if (sbId > 0) resources.getDimensionPixelSize(sbId) else (24 * resources.displayMetrics.density).toInt()
    val cx = if (cut != null) cut.exactCenterX() else resources.displayMetrics.widthPixels / 2f
    val top = Math.max(sb.toFloat(), (cut?.bottom ?: 0).toFloat())   /* bas de la barre d'état : Mìmir se tient juste en dessous */
    val cy = if (cut != null) cut.exactCenterY() else sb / 2f
    val atCam = getSharedPreferences("mimai_overlay", Context.MODE_PRIVATE).getString("pos", "below") == "camera"
    val b = MimirBar(this, w, d, cx, cy, top, atCam, { togglePanel() }, { togglePanel(true) })
    if (!b.show()) return false
    animBar = b
    barBottom = b.bottomPx()
    lastEvent = "barre animée affichée (caméra " + (if (cut != null) cut.toShortString() else "non détectée") + ")"
    Log.i(TAG, lastEvent)
    return true
  }

  /* état de la barre demandé par l'app : repos, notif, ecoute, reflexion, activite */
  fun barState(state: String, title: String, body: String, label: String, prog: Float) { animBar?.setState(state, prog) }
  fun barPlay(id: String) { animBar?.play(id) }

  /* rectangle de la caméra (encoche / trou) en pixels écran, ou null si inconnu ou absent */
  private fun cameraCutout(): android.graphics.Rect? = cutoutRect(this)

  /* repli (si les animations ne se chargent pas) : une simple étoile près de la caméra, sans barre */
  private fun addBar() {
    wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val dp = resources.displayMetrics.density
    val cut = cameraCutout()
    val sbId = resources.getIdentifier("status_bar_height", "dimen", "android")
    val sb = if (sbId > 0) resources.getDimensionPixelSize(sbId) else (24 * dp).toInt()
    val cx = if (cut != null) cut.exactCenterX() else resources.displayMetrics.widthPixels / 2f
    val top = Math.max(sb.toFloat(), (cut?.bottom ?: 0).toFloat())
    val size = (44 * dp).toInt()
    val atCam = getSharedPreferences("mimai_overlay", Context.MODE_PRIVATE).getString("pos", "below") == "camera"
    val cy = if (cut != null) cut.exactCenterY() else sb / 2f
    val x = Math.max(0, (if (atCam) Math.max(26 * dp, cx - 34 * dp) - size / 2f else cx - size / 2f).toInt())
    val y = Math.max(0, ((if (atCam) cy else top + 18 * dp) - size / 2f).toInt())
    barBottom = y + size

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE
    val params = WindowManager.LayoutParams(
      size, size, type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT
    )
    params.gravity = Gravity.TOP or Gravity.START
    params.x = x
    params.y = y
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      params.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
    }

    val iv = ImageView(this)
    iv.setImageBitmap(starBitmap(size))
    iv.contentDescription = "Mìmir : toucher pour ouvrir la bulle de discussion, appui long pour parler"
    var downAt = 0L
    iv.setOnTouchListener { _, ev ->
      when (ev.actionMasked) {
        MotionEvent.ACTION_DOWN -> { downAt = System.currentTimeMillis(); lastEvent = "toucher reçu sur Mìmir"; true }
        MotionEvent.ACTION_UP -> {
          if (System.currentTimeMillis() - downAt > 500) togglePanel(true) else togglePanel()
          true
        }
        else -> false
      }
    }
    try {
      wm?.addView(iv, params)
      bar = iv
      lastEvent = "Mìmir (étoile fixe) affiché " + size + " px en (" + x + "," + y + ")"
      Log.i(TAG, lastEvent)
    } catch (e: Exception) {
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

  /* ───────── la bulle de discussion : TOUT se fait ici (modèle, mode, photo, voix, historique), sans ouvrir l'appli ───────── */
  private var modeViews: Map<String, TextView> = emptyMap()
  private var modelView: TextView? = null
  private var modelList: LinearLayout? = null
  private var optionsBox: LinearLayout? = null
  private var subtitle: TextView? = null
  private var sizeView: TextView? = null
  private var regenView: TextView? = null
  private var micView: TextView? = null
  private var photoBtn: TextView? = null
  private var thumbRow: LinearLayout? = null
  private var pendingPhoto: String? = null
  private var listening = false
  private var expanded = false
  private var canPhoto = false
  private var panelLp: WindowManager.LayoutParams? = null

  /* petite étoile Mìmir (astroïde) sur un disque terracotta */
  private class StarView(ctx: Context) : View(ctx) {
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)
    override fun onDraw(c: Canvas) {
      val w = width.toFloat()
      val h = height.toFloat()
      p.color = Color.parseColor("#C67139")
      c.drawCircle(w / 2f, h / 2f, minOf(w, h) / 2f, p)
      p.color = Color.parseColor("#F5EAD8")
      val a = minOf(w, h) * 0.26f
      val path = Path()
      val n = 72
      for (i in 0..n) {
        val t = (i.toDouble() / n) * 2 * Math.PI
        val x = w / 2f + (a * Math.pow(Math.cos(t), 3.0)).toFloat()
        val y = h / 2f + (a * Math.pow(Math.sin(t), 3.0)).toFloat()
        if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
      }
      path.close()
      c.drawPath(path, p)
    }
  }

  /* un toucher sur la barre ouvre la bulle (un second toucher la ferme) ; mic = elle démarre directement l'écoute */
  private fun togglePanel(mic: Boolean = false) {
    if (panel != null) { if (mic) sinkAction?.invoke("mic", "") else closePanel(); return }
    openPanel()
    if (panel == null) return
    if (sinkSend == null) {
      lastEvent = "bulle ouverte, mais le moteur de l'app n'est pas actif"
      bubble("Le moteur de MiMai n'est pas actif. Touchez « Ouvrir MiMai » en haut, puis revenez ici.", false, null)
    } else if (mic) {
      ui.postDelayed({ sinkAction?.invoke("mic", "") }, 600)
    }
  }

  private fun dp(v: Float): Int = (v * resources.displayMetrics.density).toInt()

  private fun styleChip(tv: TextView, on: Boolean) {
    val bg = GradientDrawable()
    bg.setColor(Color.parseColor(if (on) "#C67139" else "#2E2A26"))
    bg.cornerRadius = dp(15f).toFloat()
    tv.background = bg
    tv.setTextColor(if (on) Color.WHITE else Color.parseColor("#F5EAD8"))
  }

  private fun chip(label: String, on: Boolean, click: () -> Unit): TextView {
    val tv = TextView(this)
    tv.text = label
    tv.textSize = 12.5f
    styleChip(tv, on)
    tv.setPadding(dp(11f), dp(6f), dp(11f), dp(6f))
    tv.setOnClickListener { click() }
    return tv
  }

  private fun smallAction(label: String, click: () -> Unit): TextView {
    val tv = TextView(this)
    tv.text = label
    tv.textSize = 12f
    tv.setTextColor(Color.parseColor("#C67139"))
    tv.setPadding(dp(6f), dp(6f), dp(10f), dp(6f))
    tv.setOnClickListener { click() }
    return tv
  }

  private fun roundButton(label: String, color: String, click: () -> Unit): TextView {
    val tv = TextView(this)
    tv.text = label
    tv.textSize = 17f
    tv.gravity = Gravity.CENTER
    tv.setTextColor(Color.WHITE)
    val bg = GradientDrawable()
    bg.setColor(Color.parseColor(color))
    bg.shape = GradientDrawable.OVAL
    tv.background = bg
    tv.setOnClickListener { click() }
    return tv
  }

  private fun lpWrap(left: Int = 0, top: Int = 0): LinearLayout.LayoutParams {
    val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
    lp.leftMargin = left
    lp.topMargin = top
    return lp
  }

  /* miniature d'une photo (réduite : jamais l'image entière en mémoire) */
  private fun thumbnail(path: String, sizeDp: Float): ImageView? {
    return try {
      val o = android.graphics.BitmapFactory.Options()
      o.inSampleSize = 8
      val bmp = android.graphics.BitmapFactory.decodeFile(path.removePrefix("file://"), o) ?: return null
      val iv = ImageView(this)
      iv.setImageBitmap(bmp)
      iv.scaleType = ImageView.ScaleType.CENTER_CROP
      iv.layoutParams = LinearLayout.LayoutParams(dp(sizeDp), dp(sizeDp * 0.75f))
      iv
    } catch (e: Exception) { null }
  }

  private fun bubble(text: String, mine: Boolean, photo: String?): TextView {
    if (photo != null) {
      val th = thumbnail(photo, 150f)
      if (th != null) {
        val lpi = LinearLayout.LayoutParams(dp(150f), dp(112f))
        lpi.gravity = Gravity.END
        lpi.topMargin = dp(6f)
        panelList?.addView(th, lpi)
      }
    }
    val maxW = (resources.displayMetrics.widthPixels * 0.94f * 0.78f).toInt()
    val tv = TextView(this)
    tv.text = text
    tv.setTextColor(if (mine) Color.WHITE else Color.parseColor("#F5EAD8"))
    tv.textSize = 15f
    tv.maxWidth = maxW
    tv.setTextIsSelectable(true)
    val bg = GradientDrawable()
    bg.setColor(Color.parseColor(if (mine) "#C67139" else "#2E2A26"))
    bg.cornerRadius = dp(18f).toFloat()
    tv.background = bg
    tv.setPadding(dp(12f), dp(8f), dp(12f), dp(8f))
    val lp = lpWrap(0, dp(6f))
    lp.gravity = if (mine) Gravity.END else Gravity.START
    tv.alpha = 0f
    tv.translationY = dp(10f).toFloat()
    panelList?.addView(tv, lp)
    tv.animate().alpha(1f).translationY(0f).setDuration(240).setInterpolator(DecelerateInterpolator()).start()
    scrollDown()
    return tv
  }

  /* Copier / Écouter / Régénérer sous une réponse terminée (Régénérer seulement sur la dernière) */
  private fun addActions(text: String, canRegen: Boolean) {
    regenView?.visibility = View.GONE
    regenView = null
    val row = LinearLayout(this)
    row.orientation = LinearLayout.HORIZONTAL
    row.addView(smallAction("Copier") {
      try {
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
        cm.setPrimaryClip(android.content.ClipData.newPlainText("Mìmir", text))
        android.widget.Toast.makeText(this, "Réponse copiée", android.widget.Toast.LENGTH_SHORT).show()
      } catch (e: Exception) { Log.w(TAG, "copie impossible", e) }
    })
    row.addView(smallAction("Écouter") { sinkAction?.invoke("speak", text) })
    if (canRegen) {
      val r = smallAction("Régénérer") { sinkAction?.invoke("regen", "") }
      row.addView(r)
      regenView = r
    }
    val lp = lpWrap()
    lp.gravity = Gravity.START
    panelList?.addView(row, lp)
    scrollDown()
  }

  private fun scrollDown() { panelScroll?.post { panelScroll?.fullScroll(View.FOCUS_DOWN) } }

  private fun styleMic() {
    val m = micView ?: return
    val bg = GradientDrawable()
    bg.setColor(Color.parseColor(if (listening) "#D23F3F" else "#2E2A26"))
    bg.shape = GradientDrawable.OVAL
    m.background = bg
    m.text = if (listening) "■" else "🎤"
  }

  private fun clearPhoto() {
    pendingPhoto = null
    thumbRow?.removeAllViews()
    thumbRow?.visibility = View.GONE
  }

  /* photo choisie dans le sélecteur d'Android (activité transparente MimirPickActivity) */
  fun onPhotoPicked(path: String) {
    ui.post {
      if (panel == null) return@post
      pendingPhoto = path
      val row = thumbRow ?: return@post
      row.removeAllViews()
      val th = thumbnail(path, 64f)
      if (th != null) {
        row.addView(th)
        row.addView(smallAction("Retirer") { clearPhoto() })
        row.visibility = View.VISIBLE
      }
      panelInput?.requestFocus()
    }
  }

  private fun pickPhoto() {
    try {
      val i = Intent(this, MimirPickActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      startActivity(i)
    } catch (e: Exception) {
      android.widget.Toast.makeText(this, "Impossible d'ouvrir le sélecteur de photos.", android.widget.Toast.LENGTH_SHORT).show()
      Log.w(TAG, "sélecteur de photos refusé", e)
    }
  }

  private fun toggleSize() {
    expanded = !expanded
    val p = panel ?: return
    val lp = panelLp ?: return
    val from = lp.height
    val to = (resources.displayMetrics.heightPixels * (if (expanded) 0.78f else 0.52f)).toInt()
    sizeView?.text = if (expanded) "Réduire" else "Agrandir"
    val va = ValueAnimator.ofInt(from, to)
    va.duration = 260
    va.interpolator = DecelerateInterpolator()
    va.addUpdateListener { a ->
      lp.height = a.animatedValue as Int
      try { wm?.updateViewLayout(p, lp) } catch (e: Exception) { /* fenêtre fermée pendant l'animation */ }
    }
    va.start()
  }

  private fun openPanel() {
    val w = wm ?: return
    val sw = resources.displayMetrics.widthPixels
    val sh = resources.displayMetrics.heightPixels
    val pw = (sw * 0.94f).toInt()
    val ph = (sh * (if (expanded) 0.78f else 0.52f)).toInt()

    val root = PanelRoot(this) { closePanel() }
    root.orientation = LinearLayout.VERTICAL
    val bg = GradientDrawable()
    bg.setColor(Color.parseColor("#181614"))
    bg.cornerRadius = dp(26f).toFloat()
    bg.setStroke(dp(1f), Color.parseColor("#3A342E"))
    root.background = bg
    root.setPadding(dp(12f), dp(10f), dp(12f), dp(10f))

    /* en-tête : étoile, titre + moteur de la discussion, nouvelle discussion, taille, fermer */
    val head = LinearLayout(this)
    head.orientation = LinearLayout.HORIZONTAL
    head.gravity = Gravity.CENTER_VERTICAL
    head.addView(StarView(this), LinearLayout.LayoutParams(dp(30f), dp(30f)))
    val titles = LinearLayout(this)
    titles.orientation = LinearLayout.VERTICAL
    val title = TextView(this)
    title.text = "Mìmir"
    title.setTextColor(Color.parseColor("#F5EAD8"))
    title.textSize = 16f
    title.typeface = Typeface.DEFAULT_BOLD
    titles.addView(title)
    val sub = TextView(this)
    sub.setTextColor(Color.parseColor("#A39A8F"))
    sub.textSize = 11.5f
    sub.maxLines = 1
    sub.ellipsize = android.text.TextUtils.TruncateAt.END
    titles.addView(sub)
    subtitle = sub
    val tl = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    tl.leftMargin = dp(10f)
    head.addView(titles, tl)
    head.addView(smallAction("Nouveau") { sinkAction?.invoke("new", "") })
    val size = smallAction(if (expanded) "Réduire" else "Agrandir") { toggleSize() }
    sizeView = size
    head.addView(size)
    val close = TextView(this)
    close.text = "✕"
    close.setTextColor(Color.parseColor("#F5EAD8"))
    close.textSize = 18f
    close.contentDescription = "Fermer la bulle"
    close.setPadding(dp(8f), dp(6f), dp(4f), dp(6f))
    close.setOnClickListener { closePanel() }
    head.addView(close)
    root.addView(head, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

    /* choix du moteur de la discussion (modes + modèle) : seulement tant qu'elle est vide, ensuite il est fixé */
    val opts = LinearLayout(this)
    opts.orientation = LinearLayout.VERTICAL
    val seg = LinearLayout(this)
    seg.orientation = LinearLayout.HORIZONTAL
    val modes = LinkedHashMap<String, TextView>()
    for ((key, label) in listOf("rapide" to "Rapide", "reflexion" to "Réflexion", "outils" to "Outils", "vision" to "Vision")) {
      val c = chip(label, key == curMode) {
        if (!modeLocked) {
          curMode = key
          for ((k, v) in modeViews) styleChip(v, k == key)
          sinkAction?.invoke("mode", key)
        }
      }
      seg.addView(c, lpWrap(if (modes.isEmpty()) 0 else dp(6f), 0))
      modes[key] = c
    }
    modeViews = modes
    opts.addView(seg, lpWrap(0, dp(8f)))
    val mlist = LinearLayout(this)
    mlist.orientation = LinearLayout.VERTICAL
    mlist.visibility = View.GONE
    modelList = mlist
    val model = chip("Modèle ▾", false) { mlist.visibility = if (mlist.visibility == View.VISIBLE) View.GONE else View.VISIBLE }
    modelView = model
    opts.addView(model, lpWrap(0, dp(6f)))
    opts.addView(mlist, lpWrap(0, dp(4f)))
    optionsBox = opts
    root.addView(opts, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

    /* messages : aucune phrase pré-écrite, la page est vide jusqu'au premier message */
    val list = LinearLayout(this)
    list.orientation = LinearLayout.VERTICAL
    val scroll = ScrollView(this)
    scroll.addView(list, android.view.ViewGroup.LayoutParams(android.view.ViewGroup.LayoutParams.MATCH_PARENT, android.view.ViewGroup.LayoutParams.WRAP_CONTENT))
    root.addView(scroll, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))

    /* photo en attente d'envoi */
    val trow = LinearLayout(this)
    trow.orientation = LinearLayout.HORIZONTAL
    trow.gravity = Gravity.CENTER_VERTICAL
    trow.visibility = View.GONE
    thumbRow = trow
    root.addView(trow, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

    /* saisie : photo (Vision), texte, micro, envoyer */
    val row = LinearLayout(this)
    row.orientation = LinearLayout.HORIZONTAL
    row.gravity = Gravity.CENTER_VERTICAL
    val photo = chip("Photo", false) { pickPhoto() }
    photo.visibility = View.GONE
    photoBtn = photo
    row.addView(photo, lpWrap(0, 0))
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
    ibg.cornerRadius = dp(20f).toFloat()
    input.background = ibg
    input.setPadding(dp(14f), dp(8f), dp(14f), dp(8f))
    val il = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
    il.leftMargin = dp(6f)
    row.addView(input, il)
    val mic = roundButton("🎤", "#2E2A26") { sinkAction?.invoke("mic", "") }
    micView = mic
    row.addView(mic, lpWrap(dp(6f), 0).also { it.width = dp(40f); it.height = dp(40f) })
    val send = roundButton("↑", "#C67139") { sendFromPanel() }
    row.addView(send, lpWrap(dp(6f), 0).also { it.width = dp(40f); it.height = dp(40f) })
    root.addView(row, lpWrap(0, dp(8f)).also { it.width = LinearLayout.LayoutParams.MATCH_PARENT })

    val lt = LayoutTransition()
    lt.enableTransitionType(LayoutTransition.CHANGING)
    lt.setDuration(220)
    root.layoutTransition = lt
    val lt2 = LayoutTransition()
    lt2.enableTransitionType(LayoutTransition.CHANGING)
    lt2.setDuration(200)
    lt2.disableTransitionType(LayoutTransition.APPEARING)      // les bulles s'animent elles-mêmes
    lt2.disableTransitionType(LayoutTransition.DISAPPEARING)
    list.layoutTransition = lt2
    panel = root; panelList = list; panelScroll = scroll; panelInput = input; typing = null; waiting = false; regenView = null
    listening = false
    styleMic()
    input.setOnEditorActionListener { _, action, _ ->
      if (action == EditorInfo.IME_ACTION_SEND) { sendFromPanel(); true } else false
    }

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE
    /* fenêtre prenant le focus (clavier) mais laissant passer les touches hors de la fenêtre */
    val lp = WindowManager.LayoutParams(pw, ph, type, WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL, PixelFormat.TRANSLUCENT)
    lp.gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
    lp.y = anchorBottom() + dp(8f)
    lp.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN or WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE
    panelLp = lp
    try {
      w.addView(root, lp)
      root.pivotX = pw / 2f
      root.pivotY = 0f
      root.alpha = 0f; root.scaleX = 0.9f; root.scaleY = 0.9f; root.translationY = -dp(14f).toFloat()
      root.animate().alpha(1f).scaleX(1f).scaleY(1f).translationY(0f).setDuration(300).setInterpolator(OvershootInterpolator(1.15f)).start()
      lastEvent = "bulle ouverte"
      sinkOpen?.invoke()   /* l'app répond avec le moteur, les modèles et l'historique (applyState) */
      input.postDelayed({
        input.requestFocus()
        (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
      }, 150)
    } catch (e: Exception) {
      lastEvent = "bulle refusée : " + e.javaClass.simpleName + " " + (e.message ?: "")
      Log.e(TAG, lastEvent, e)
      panel = null; panelList = null; panelScroll = null; panelInput = null
    }
  }

  private fun modeName(m: String): String = when (m) {
    "reflexion" -> "Réflexion"
    "outils" -> "Outils"
    "vision" -> "Vision"
    else -> "Rapide"
  }

  /* état envoyé par l'app : moteur, modèles proposés, photo/micro possibles, et (reset) toute la conversation */
  fun applyState(json: String) {
    ui.post {
      if (panel == null) return@post
      try {
        val o = org.json.JSONObject(json)
        curMode = o.optString("mode", curMode)
        modeLocked = o.optBoolean("locked", false)
        canPhoto = o.optBoolean("canPhoto", false)
        val modelName = o.optString("model", "—")
        for ((k, v) in modeViews) { styleChip(v, k == curMode); v.alpha = if (modeLocked && k != curMode) 0.45f else 1f }
        optionsBox?.visibility = if (modeLocked) View.GONE else View.VISIBLE
        subtitle?.text = modeName(curMode) + " · " + modelName + (if (modeLocked) " · fixé pour cette discussion" else "")
        modelView?.text = "Modèle : " + modelName + " ▾"
        modelList?.removeAllViews()
        val arr = o.optJSONArray("models")
        if (arr != null) {
          for (i in 0 until arr.length()) {
            val m = arr.getJSONObject(i)
            val id = m.optString("id")
            val row = TextView(this)
            row.text = (if (m.optString("name") == modelName) "✓ " else "   ") + m.optString("name")
            row.setTextColor(Color.parseColor("#F5EAD8"))
            row.textSize = 13.5f
            row.setPadding(dp(8f), dp(7f), dp(8f), dp(7f))
            row.setOnClickListener { modelList?.visibility = View.GONE; sinkAction?.invoke("model", id) }
            modelList?.addView(row)
          }
        }
        photoBtn?.visibility = if (canPhoto) View.VISIBLE else View.GONE
        if (!canPhoto) clearPhoto()
        micView?.visibility = if (o.optBoolean("micOk", true)) View.VISIBLE else View.GONE
        if (o.has("mic")) { listening = o.optBoolean("mic", false); styleMic() }
        if (o.optBoolean("reset", false)) {
          panelList?.removeAllViews()
          typing = null; waiting = false; regenView = null
          val msgs = o.optJSONArray("msgs")
          if (msgs != null) {
            for (i in 0 until msgs.length()) {
              val m = msgs.getJSONObject(i)
              val mine = m.optString("role") == "user"
              val t = m.optString("text")
              bubble(t, mine, if (m.has("image")) m.optString("image") else null)
              if (!mine) addActions(t, i == msgs.length() - 1)
            }
          }
          val hint = o.optString("hint", "")
          if ((msgs == null || msgs.length() == 0) && hint.isNotEmpty()) bubble(hint, false, null)
        }
      } catch (e: Exception) { Log.w(TAG, "état de la bulle illisible", e) }
    }
  }

  /* texte dicté : affiché au fur et à mesure dans la zone de saisie */
  fun setInput(t: String) {
    ui.post { panelInput?.setText(t); panelInput?.setSelection(t.length) }
  }

  fun setMic(on: Boolean) {
    ui.post { listening = on; styleMic() }
  }

  private fun sendFromPanel() {
    val input = panelInput ?: return
    val t = input.text.toString().trim()
    val photo = pendingPhoto
    if ((t.isEmpty() && photo == null) || waiting) return
    input.setText("")
    regenView?.visibility = View.GONE
    bubble(if (t.isEmpty()) "Décris cette image." else t, true, photo)
    clearPhoto()
    replyStarted = false
    typing = bubble("•", false, null)
    typing?.let { animateTyping(it) }
    waiting = true
    val send = sinkSend
    if (send == null) updateReply("Ouvrez MiMai une fois pour activer la bulle de discussion.", true)
    else send(t, photo)
  }

  /* trois points qui se remplissent tant que la réponse n'a pas commencé */
  private fun animateTyping(tv: TextView) {
    val frames = arrayOf("•", "• •", "• • •")
    var i = 0
    val r = object : Runnable {
      override fun run() {
        if (typing !== tv || replyStarted) return
        i = (i + 1) % frames.size
        tv.text = frames[i]
        ui.postDelayed(this, 330)
      }
    }
    ui.postDelayed(r, 330)
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
      replyStarted = true
      val v = typing ?: bubble("", false, null).also { typing = it }
      v.text = text
      scrollDown()
      if (done) { typing = null; waiting = false; addActions(text, true) }
    }
  }

  private fun closePanel() {
    val p = panel ?: return
    if (listening) sinkAction?.invoke("mic", "")   /* coupe l'écoute en fermant */
    try { (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(p.windowToken, 0) } catch (e: Exception) { /* ignoré */ }
    panel = null
    val manager = wm
    p.animate().alpha(0f).scaleX(0.92f).scaleY(0.92f).translationY(-dp(10f).toFloat()).setDuration(170).setInterpolator(DecelerateInterpolator())
      .withEndAction { try { manager?.removeView(p) } catch (e: Exception) { /* déjà retirée */ } }.start()
    panelList = null; panelScroll = null; panelInput = null; typing = null; waiting = false
    modeViews = emptyMap(); modelView = null; modelList = null; optionsBox = null; subtitle = null; sizeView = null
    regenView = null; micView = null; photoBtn = null; thumbRow = null; pendingPhoto = null; listening = false; panelLp = null
  }

  private fun removeBar() {
    animBar?.dispose()
    animBar = null
    bar?.let { try { wm?.removeView(it) } catch (e: Exception) { /* déjà retirée */ } }
    bar = null
  }

  override fun onDestroy() { running = false; closePanel(); removeBar(); instance = null; super.onDestroy() }

  /* l'étoile Mìmir (astroïde) sur un disque terracotta : repli sans animation */
  private fun starBitmap(size: Int): Bitmap {
    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val cv = Canvas(bmp)
    val p = Paint(Paint.ANTI_ALIAS_FLAG)
    p.color = Color.parseColor("#C67139")
    cv.drawCircle(size / 2f, size / 2f, size * 0.36f, p)
    p.color = Color.parseColor("#F5EAD8")
    val a = size * 0.2f
    val path = Path()
    val n = 96
    for (i in 0..n) {
      val t = (i.toDouble() / n) * 2 * Math.PI
      val x = size / 2f + (a * Math.pow(Math.cos(t), 3.0)).toFloat()
      val y = size / 2f + (a * Math.pow(Math.sin(t), 3.0)).toFloat()
      if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
    }
    path.close()
    cv.drawPath(path, p)
    return bmp
  }

  /* texte écrit dans la notification (réponse rapide) : on la remet à jour avec l'état ou la réponse */
  fun onNotifReply(text: String) {
    val send = sinkSend
    if (send == null) { setNotif("Le moteur de MiMai n'est pas actif. Ouvrez MiMai une fois, puis réessayez."); return }
    notifWaiting = true
    lastNotifAt = 0L
    setNotif("Mìmir réfléchit…")
    send(text, null)
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
    /* « Parler » ouvre la bulle et lance l'écoute (sans ouvrir l'appli) ; sans la permission « par-dessus », il ouvre l'appli */
    val talkPi = if (Settings.canDrawOverlays(this)) {
      PendingIntent.getService(this, 3, Intent(this, MimirOverlayService::class.java).setAction(ACTION_OPEN_PANEL).putExtra("mic", true), flags)
    } else {
      PendingIntent.getActivity(this, 3,
        Intent(Intent.ACTION_VIEW, Uri.parse("mimai://assistant?voice=force")).setPackage(packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), flags)
    }
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
    @Volatile var appCtx: Context? = null
    /* chaque événement de la barre est aussi écrit dans le fil d'Ariane (lisible dans Menu → Rapport de plantage) */
    @Volatile var lastEvent: String = "le service n'a jamais été démarré"
      set(v) { field = v; appCtx?.let { Trail.add(it, "[barre] " + v) } }
    @Volatile var running: Boolean = false
    @Volatile var instance: MimirOverlayService? = null
    /* animations de l'étoile, chargées une seule fois */
    @Volatile var etoile: EtoileData? = null
    @Volatile var etoileLoading: Boolean = false
    @Volatile var etoileError: String = ""
    /* branchés par le module JavaScript : envoi d'un message / ouverture d'une nouvelle discussion */
    @Volatile var sinkSend: ((String, String?) -> Unit)? = null
    @Volatile var sinkOpen: (() -> Unit)? = null
    /* actions de la fenêtre : "mode", "model", "new", "regen", "speak" */
    @Volatile var sinkAction: ((String, String) -> Unit)? = null

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
