#!/usr/bin/env python3
"""MiMai - entraînement LoRA SUR PC (hors serveur, 100 % local) puis conversion en GGUF.

Entrées : mimai_train.jsonl (format chat) exporté par l'app (Entraînement > Exporter le dataset).
Sortie  : out/adapter.gguf  -> à importer dans l'app (Entraînement > Importer un adaptateur .gguf).

Prérequis (PC avec GPU NVIDIA conseillé ; 8 Go de VRAM suffisent pour Qwen2.5-0.5B/1.5B) :
    pip install unsloth trl datasets
    git clone https://github.com/ggml-org/llama.cpp   (pour convert_lora_to_gguf.py)
    pip install -r llama.cpp/requirements/requirements-convert_lora_to_gguf.txt

Usage :
    python train_lora_pc.py --model qwen05b --train mimai_train.jsonl --llama-cpp ./llama.cpp

IMPORTANT : le modèle de base ici DOIT être celui installé dans l'app (même famille ET même taille).
Les poids HF (unsloth/...) servent à l'entraînement ; sur le téléphone l'adaptateur est appliqué
au GGUF quantifié correspondant (Q4_K_M) - c'est supporté par llama.cpp.
"""
import argparse, json, subprocess, sys
from pathlib import Path

BASES = {  # id MiMai -> dépôt Hugging Face des poids d'origine
    "qwen05b": "Qwen/Qwen2.5-0.5B-Instruct",
    "qwen15b": "Qwen/Qwen2.5-1.5B-Instruct",
    "smollm17b": "HuggingFaceTB/SmolLM2-1.7B-Instruct",
}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", choices=BASES, default="qwen05b")
    ap.add_argument("--train", default="mimai_train.jsonl")
    ap.add_argument("--llama-cpp", default="./llama.cpp")
    ap.add_argument("--out", default="out")
    ap.add_argument("--rank", type=int, default=16)
    ap.add_argument("--epochs", type=int, default=2)       # peu d'époques : limite l'oubli catastrophique
    ap.add_argument("--lr", type=float, default=1e-4)      # LR modeste, idem
    ap.add_argument("--max-seq", type=int, default=1024)
    a = ap.parse_args()

    from unsloth import FastLanguageModel
    from datasets import load_dataset
    from trl import SFTTrainer, SFTConfig

    model, tok = FastLanguageModel.from_pretrained(BASES[a.model], max_seq_length=a.max_seq, load_in_4bit=True)
    model = FastLanguageModel.get_peft_model(
        model, r=a.rank, lora_alpha=a.rank * 2, lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        use_gradient_checkpointing="unsloth")

    ds = load_dataset("json", data_files=a.train, split="train")
    ds = ds.map(lambda r: {"text": tok.apply_chat_template(r["messages"], tokenize=False)})

    SFTTrainer(model=model, tokenizer=tok, train_dataset=ds, args=SFTConfig(
        dataset_text_field="text", max_seq_length=a.max_seq, per_device_train_batch_size=2,
        gradient_accumulation_steps=4, num_train_epochs=a.epochs, learning_rate=a.lr,
        warmup_ratio=0.05, lr_scheduler_type="cosine", logging_steps=5, output_dir=a.out + "/ckpt",
        report_to="none", seed=3407)).train()

    lora_dir = Path(a.out) / "lora"
    model.save_pretrained(str(lora_dir))                   # adapter_model.safetensors + adapter_config.json
    out = Path(a.out) / "adapter.gguf"
    cmd = [sys.executable, str(Path(a.llama_cpp) / "convert_lora_to_gguf.py"), str(lora_dir),
           "--base-model-id", BASES[a.model], "--outfile", str(out), "--outtype", "f16"]
    print(" ".join(cmd)); subprocess.check_call(cmd)
    print("OK ->", out, "\nCopiez ce fichier sur le téléphone puis importez-le dans MiMai (aucun upload).")

if __name__ == "__main__":
    main()
