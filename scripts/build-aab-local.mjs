// Build local de l'AAB de production (sans EAS). Variables requises :
//   MIMAI_UPLOAD_STORE_FILE, MIMAI_UPLOAD_STORE_PASSWORD, MIMAI_UPLOAD_KEY_ALIAS, MIMAI_UPLOAD_KEY_PASSWORD
// Option : MIMAI_OVERLAY=1 pour inclure la bulle flottante (défaut ici : 0).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const need = ['MIMAI_UPLOAD_STORE_FILE', 'MIMAI_UPLOAD_STORE_PASSWORD', 'MIMAI_UPLOAD_KEY_ALIAS', 'MIMAI_UPLOAD_KEY_PASSWORD'];
const missing = need.filter(k => !process.env[k]);
if (missing.length) { console.error('Variables manquantes : ' + missing.join(', ')); process.exit(1); }
if (!existsSync(process.env.MIMAI_UPLOAD_STORE_FILE)) { console.error('Keystore introuvable : ' + process.env.MIMAI_UPLOAD_STORE_FILE); process.exit(1); }
const env = { ...process.env, MIMAI_OVERLAY: process.env.MIMAI_OVERLAY ?? '0', CI: '1' };
const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env, cwd, shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run('npx', ['expo', 'prebuild', '-p', 'android', '--no-install', '--clean']);
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
run(gradlew, ['bundleRelease'], 'android');
console.log('AAB : android/app/build/outputs/bundle/release/app-release.aab');
