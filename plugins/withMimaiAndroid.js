/* Plugin Expo local (Continuous Native Generation) : durcissement Android pour Google Play.
   Le dossier android/ étant régénéré par `expo prebuild`, TOUTE la configuration native
   durable vit ici (et dans app.json) — pas dans android/ directement.

   Ce que fait ce plugin :
   - android:allowBackup=false + règles d'extraction vides (données chiffrées : jamais
     de sauvegarde cloud ni de transfert d'appareil) ;
   - usesCleartextTraffic=false + network_security_config (HTTPS uniquement) ;
   - bulle flottante désactivable : MIMAI_OVERLAY=0 retire SYSTEM_ALERT_WINDOW,
     FOREGROUND_SERVICE(_SPECIAL_USE), POST_NOTIFICATIONS et le service du manifeste
     final, et passe extra.overlayEnabled=false (lu par src/services/overlay.ts) ;
   - signature release via variables d'environnement (jamais de clé dans le dépôt) ;
   - R8/minification + réduction des ressources en release, règles Proguard natives ;
   - compileSdk/targetSdk explicites (36), architectures utiles, mémoire Gradle. */
const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest, withDangerousMod, withGradleProperties, withAppBuildGradle,
} = require('expo/config-plugins');

const OVERLAY_PERMISSIONS = [
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
  'android.permission.POST_NOTIFICATIONS',
];
const OVERLAY_SERVICE = 'fr.mimai.app.overlay.MimirOverlayService';

const overlayEnabled = () => process.env.MIMAI_OVERLAY !== '0';

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<!-- MiMai : aucun trafic en clair (HTTP). Les seules requêtes possibles sont le
     téléchargement explicite d'un modèle, en HTTPS. -->
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<!-- MiMai : les conversations, la mémoire et les documents restent sur l'appareil.
     Rien n'est copié vers le cloud ni vers un autre téléphone. -->
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="root" />
    <exclude domain="file" />
    <exclude domain="database" />
    <exclude domain="sharedpref" />
    <exclude domain="external" />
  </cloud-backup>
  <device-transfer>
    <exclude domain="root" />
    <exclude domain="file" />
    <exclude domain="database" />
    <exclude domain="sharedpref" />
    <exclude domain="external" />
  </device-transfer>
</data-extraction-rules>
`;

const PROGUARD_MARK = '# --- MiMai (plugins/withMimaiAndroid.js) ---';
const PROGUARD_RULES = `
${PROGUARD_MARK}
# Bibliothèques natives appelées par JNI (noms de classes/méthodes cherchés par réflexion native)
-keep class com.rnllama.** { *; }
-keep class com.margelo.nitro.** { *; }
-keep class com.margelo.** { *; }
-keep class com.facebook.jni.** { *; }
-keepclassmembers class * { @com.facebook.proguard.annotations.DoNotStrip *; }
# Module natif de la bulle (instancié par nom via expo-modules-core)
-keep class fr.mimai.app.overlay.** { *; }
-dontwarn com.rnllama.**
-dontwarn com.margelo.**
`;

/* — manifeste — */
function patchManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const app = manifest.application[0];
    app.$['android:allowBackup'] = 'false';
    app.$['android:usesCleartextTraffic'] = 'false';
    app.$['android:networkSecurityConfig'] = '@xml/mimai_network_security_config';
    app.$['android:dataExtractionRules'] = '@xml/mimai_data_extraction_rules';
    delete app.$['android:fullBackupContent'];

    if (!overlayEnabled()) {
      const perms = manifest['uses-permission'] || [];
      manifest['uses-permission'] = perms.filter((p) => !OVERLAY_PERMISSIONS.includes(p.$['android:name']));
      for (const name of OVERLAY_PERMISSIONS) {
        manifest['uses-permission'].push({ $: { 'android:name': name, 'tools:node': 'remove' } });
      }
      app.service = (app.service || []).filter((s) => s.$['android:name'] !== OVERLAY_SERVICE);
      app.service.push({ $: { 'android:name': OVERLAY_SERVICE, 'tools:node': 'remove' } });
    }
    return cfg;
  });
}

/* — fichiers res/xml + règles Proguard — */
function writeFiles(config) {
  return withDangerousMod(config, ['android', (cfg) => {
    const root = cfg.modRequest.platformProjectRoot;
    const xmlDir = path.join(root, 'app', 'src', 'main', 'res', 'xml');
    fs.mkdirSync(xmlDir, { recursive: true });
    fs.writeFileSync(path.join(xmlDir, 'mimai_network_security_config.xml'), NETWORK_SECURITY_CONFIG);
    fs.writeFileSync(path.join(xmlDir, 'mimai_data_extraction_rules.xml'), DATA_EXTRACTION_RULES);

    const pro = path.join(root, 'app', 'proguard-rules.pro');
    const cur = fs.existsSync(pro) ? fs.readFileSync(pro, 'utf8') : '';
    if (!cur.includes(PROGUARD_MARK)) fs.writeFileSync(pro, cur + PROGUARD_RULES);
    return cfg;
  }]);
}

/* — gradle.properties — */
function setProp(props, key, value) {
  const i = props.findIndex((p) => p.type === 'property' && p.key === key);
  if (i >= 0) props[i].value = value; else props.push({ type: 'property', key, value });
}
function patchGradleProps(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    setProp(props, 'android.enableMinifyInReleaseBuilds', 'true');
    setProp(props, 'android.enableShrinkResourcesInReleaseBuilds', 'true');
    setProp(props, 'android.compileSdkVersion', '36');
    setProp(props, 'android.targetSdkVersion', '36');
    setProp(props, 'reactNativeArchitectures', 'arm64-v8a,armeabi-v7a,x86_64');
    setProp(props, 'org.gradle.jvmargs', '-Xmx4096m -XX:MaxMetaspaceSize=1024m');
    cfg.modResults = props.filter((p) => !(p.type === 'property' && p.key === 'EX_DEV_CLIENT_NETWORK_INSPECTOR'));
    return cfg;
  });
}

/* — build.gradle de l'app : signature release par variables d'environnement — */
const SIGNING_BLOCK = `
        mimaiUpload {
            // Clé d'upload fournie par l'environnement (CI / poste local) — jamais dans le dépôt.
            def storePath = System.getenv('MIMAI_UPLOAD_STORE_FILE')
            if (storePath) {
                storeFile file(storePath)
                storePassword System.getenv('MIMAI_UPLOAD_STORE_PASSWORD')
                keyAlias System.getenv('MIMAI_UPLOAD_KEY_ALIAS')
                keyPassword System.getenv('MIMAI_UPLOAD_KEY_PASSWORD')
            }
        }`;
function patchAppGradle(config) {
  return withAppBuildGradle(config, (cfg) => {
    let g = cfg.modResults.contents;
    if (!g.includes('mimaiUpload')) {
      // 1) définition de la signature à côté de « debug »
      g = g.replace(/(signingConfigs\s*\{\s*debug\s*\{[^}]*\})/, `$1${SIGNING_BLOCK}`);
      // 2) le build release n'utilise JAMAIS la clé debug : clé d'upload si fournie, sinon
      //    AAB non signé (EAS Build injecte alors sa propre signature gérée)
      g = g.replace(/(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/,
        `$1if (System.getenv('MIMAI_UPLOAD_STORE_FILE')) { signingConfig signingConfigs.mimaiUpload }`);
      g += `
// Garde-fou : prévient si un build release part sans clé d'upload (hors EAS Build)
gradle.taskGraph.whenReady { graph ->
    def releaseRequested = graph.allTasks.any { it.path == ':app:bundleRelease' || it.path == ':app:assembleRelease' }
    if (releaseRequested && !System.getenv('MIMAI_UPLOAD_STORE_FILE') && !System.getenv('EAS_BUILD')) {
        logger.warn("MiMai : MIMAI_UPLOAD_STORE_FILE absent, le build release ne sera PAS signe (Play Console le refusera).")
    }
}
`;
    }
    cfg.modResults.contents = g;
    return cfg;
  });
}

module.exports = function withMimaiAndroid(config) {
  config.extra = { ...(config.extra || {}), overlayEnabled: overlayEnabled() };
  config = patchManifest(config);
  config = writeFiles(config);
  config = patchGradleProps(config);
  config = patchAppGradle(config);
  return config;
};
