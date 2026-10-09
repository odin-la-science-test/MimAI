# Entraîner un adaptateur LoRA sur PC pour MiMai

Tout se passe sur votre machine ; seul le téléchargement des poids de base Hugging Face
sort (comme l'installation d'un modèle dans l'app). Aucun jeu de données n'est envoyé nulle part.

1. **Exporter** : dans l'app, Entraînement > « Exporter le dataset (JSONL) », choisissez un dossier
   du téléphone. Fichiers : `mimai_train.jsonl` (chat), `mimai_eval.jsonl` (test, ne PAS entraîner dessus),
   `mimai_preferences.jsonl` (paires choisi/rejeté, optionnel). Copiez-les sur le PC (USB).
   L'app réutilise `mimai_eval.jsonl` (même découpage déterministe) pour évaluer l'adaptateur.
2. **Entraîner + convertir** : `python train_lora_pc.py --model qwen05b --train mimai_train.jsonl --llama-cpp ./llama.cpp`
   (le modèle doit être **identique** à celui actif dans l'app : qwen05b, qwen15b ou smollm17b).
   Produit `out/adapter.gguf` (LoRA f16, quelques Mo). Conversion équivalente à la main :
   `python llama.cpp/convert_lora_to_gguf.py out/lora --base-model-id Qwen/Qwen2.5-0.5B-Instruct --outfile out/adapter.gguf --outtype f16`
3. **Importer** : copiez `adapter.gguf` sur le téléphone, puis Entraînement > « Importer un adaptateur .gguf ».
   L'app vérifie : signature GGUF, `general.type = adapter`, `adapter.type = lora`, architecture,
   dimensions (n_embd, nombre de couches), taille, SHA-256 ; puis charge l'adaptateur avec llama.rn
   et compare modèle de base vs base + adaptateur (style sur le jeu de test, 12 questions de
   capacités générales). FAIL = fichier supprimé, rien d'activé. PASS = version `vNNN` active, la précédente conservée (rollback).

Conseils anti-oubli : 2 époques, LR 1e-4, rang 16, 30 à 200 exemples de qualité, mélanger des réponses 👍 variées.
Alternatives : tout framework produisant un LoRA PEFT convertible par `convert_lora_to_gguf.py` (Axolotl, LLaMA-Factory, TRL seul).
