const fs=require('fs');
let p, s;
function rep(a,b){ if(!s.includes(a)) throw new Error(p+' ancre absente: '+a.slice(0,80)); s=s.replace(a,()=>b); }
const CR=String.fromCharCode(13), LF=String.fromCharCode(10);
const edit=(path,fn)=>{ p=path; s=fs.readFileSync(p,'utf8'); const crlf=s.includes(CR+LF); s=s.split(CR+LF).join(LF); fn(); fs.writeFileSync(p, crlf? s.split(LF).join(CR+LF):s); };
edit('src/services/engine.ts',()=>{ rep("L\u2019analyse d\u2019images demande un modèle compatible vision, comme Gemma 3 4B.\n\nVous pouvez l\u2019installer depuis Modèles — le téléchargement reste la seule chose qui sort de l\u2019appareil, et uniquement avec votre accord.","L\u2019analyse d\u2019images demande un modèle de vision (SmolVLM2, Qwen 2.5 VL ou Gemma 3).\n\nInstallez-en un depuis Modèles → Un moteur par fonction → Vision. Le téléchargement reste la seule chose qui sort de l\u2019appareil, et uniquement avec votre accord ; vos photos restent sur le téléphone."); });
edit('PRIVACY.md',()=>{
  rep("- Un **rapport de plantage**","- Les **photos** que vous joignez à la fonction Vision sont copiées dans l'espace privé de l'application, analysées **sur l'appareil** par le modèle de vision, et supprimées avec la conversation ou lors de la suppression des données. Elles ne sont jamais envoyées. MiMai n'utilise pas la caméra et ne demande aucune permission photo (sélecteur de fichiers d'Android).\n- Un **rapport de plantage**");
  rep("- A **crash report**","- **Photos** you attach to the Vision function are copied into the app's private storage, analysed **on the device** by the vision model, and deleted with the conversation or when you delete local data. They are never uploaded. MiMai does not use the camera and requests no photo permission (Android file picker).\n- A **crash report**");
});
edit('README.md',()=>{
  rep("| **Mémoire** |","| **Une IA par fonction** | Chaque fonction (Rapide, Réflexion, Outils, Vision) a son propre modèle. Le mode et le modèle sont **fixés à la création d'une discussion** : pour en changer, on ouvre une nouvelle discussion. |\n| **Vision** | Joignez une photo : le modèle de vision (SmolVLM2 500M, Qwen 2.5 VL 3B ou Gemma 3 4B, chacun avec son module image « mmproj » vérifié par SHA-256) la décrit **sur l'appareil**. |\n| **Mémoire** |");
});
console.log('ok');
