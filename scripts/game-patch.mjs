// Correctifs appliques au jeu « La Garde des Etoiles » lors de l'embarquement (scripts/embed-game.mjs).
// Objectif : en mode DEFI, l'adversaire (Mimir) est pilote par le MODELE LOCAL de MiMai au lieu des regles figees du jeu.
// Le jeu envoie l'etat du combat a l'application (window.ReactNativeWebView.postMessage), qui repond par un sort + une replique.
// Securite de jeu : si le modele est absent, trop lent ou en erreur, le jeu retombe sur son IA d'origine (la methode ai() inchangee).
// Chaque correctif est ancre sur un texte exact et verifie : si le jeu change, l'embarquement ECHOUE au lieu de produire un jeu casse.

const AI_LLM = String.raw`
  /* MiMai : IA de combat pilotee par le modele local (mode Defi). Retourne true si elle a la main ce tour-ci. */
  aiLLM(b, now) {
    const A = window.MIMAI_AI;
    if (!A || !A.enabled || b.mode !== 'defi') return false;
    if (!window.__miAiReply) window.__miAiReply = (r) => {
      const a = window.MIMAI_AI;
      if (!a || !r || r.id !== a.seq) return;
      a.pending = false;
      const dt = Date.now() - a.t0;
      a.lat = a.lat ? a.lat * 0.5 + dt * 0.5 : dt;
      a.reply = r;
    };
    const fail = (msg) => { A.enabled = false; A.pending = false; A.reply = null; b.banner = { t: msg, at: now }; return false; };
    if (!A.announced) { A.announced = true; b.banner = { t: 'IA de MiMai : ' + (A.model || 'modèle local'), at: now }; }
    if (A.pending && now - A.t0 > 9000) return fail('IA de MiMai trop lente : IA du jeu');
    const al = b.foes.filter(f => !f.dead);
    if (A.reply) {
      const r = A.reply; A.reply = null;
      if (r.ok === false) return fail('IA de MiMai indisponible : IA du jeu');
      if (A.lat > 5000) { A.slow = (A.slow || 0) + 1; if (A.slow >= 2) return fail('Modèle trop lent pour le combat : IA du jeu'); } else A.slow = 0;
      const CD = { 'Soin': 9000, 'Bouclier d’étoiles': 11000, 'Vague': 7000, 'Pluie d’étoiles': 6000, 'Éclair': 900 };
      const sp = r.spell;
      if (sp && CD[sp] && (b.cd[sp] || 0) <= now && (al.length || sp === 'Soin')) { b.cd[sp] = now + CD[sp]; this.cast(b, sp, now); }
      if (r.say) b.banner = { t: '« ' + r.say + ' »', at: now };
    }
    if (b.combo >= 100 && al.length >= 2) { b.combo = 0; b.fx.push({ id: 'nv' + now, k: 'nova', t: now, life: 1200 }); al.forEach(t => this.hit(b, t, 120, now)); b.banner = { t: 'Supernova !', at: now }; }
    if (!A.pending && (al.length || b.hp < b.max)) {
      A.seq++; A.pending = true; A.t0 = now;
      const ready = ['Éclair', 'Pluie d’étoiles', 'Vague', 'Bouclier d’étoiles', 'Soin'].filter(n => (b.cd[n] || 0) <= now);
      const msg = { type: 'ai_request', id: A.seq, hp: Math.round(b.hp), max: Math.round(b.max), ready,
        foes: al.slice(0, 8).map(f => ({ n: f.name, hp: Math.round(f.hp), max: Math.round(f.max), x: Math.round(f.x), range: Math.round(f.st.range), boss: !!f.st.boss, healer: !!f.st.healer, fly: !!f.st.fly })) };
      try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) { return fail('IA du jeu'); }
    }
    return true;
  }
`;

/* nouvelle partie : on repart d'un etat propre (une reponse en retard d'une partie precedente est ignoree) */
const RESET = "    if (window.MIMAI_AI) { const A = window.MIMAI_AI; A.pending = false; A.reply = null; A.slow = 0; A.announced = false; A.seq = (A.seq || 0) + 1000; }\n";

export const PATCHES = [
  { name: 'methode aiLLM', anchor: '\n  ai(b, now) {\n', replace: AI_LLM + '  ai(b, now) {\n    if (this.aiLLM(b, now)) return;\n' },
  { name: 'reinitialisation par partie', anchor: '  start(mode, lvl) {\n', replace: '  start(mode, lvl) {\n' + RESET },
];

export function patchTemplate(tpl) {
  let out = tpl;
  for (const p of PATCHES) {
    const n = out.split(p.anchor).length - 1;
    if (n !== 1) throw new Error('Correctif « ' + p.name + ' » : ancre trouvee ' + n + ' fois (attendu 1). Le jeu a change : revoir scripts/game-patch.mjs');
    out = out.replace(p.anchor, () => p.replace);
  }
  return out;
}

/* Le mode Defi (le joueur lance des monstres, l'IA joue Mimir) n'existe que dans certaines versions du jeu.
   Les correctifs d'IA ne s'appliquent que si TOUTES leurs ancres sont presentes ; sinon le jeu est embarque tel quel
   (aucune IA a brancher : le joueur y est toujours Mimir contre des vagues). */
export function hasDefiAi(tpl) {
  return PATCHES.every(p => tpl.split(p.anchor).length - 1 === 1);
}
