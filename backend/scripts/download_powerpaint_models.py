"""Download PowerPaint model weights to backend/models/ directory.

Usage:
    python scripts/download_powerpaint_models.py

This script downloads the PowerPaint v1 checkpoint from HuggingFace
to backend/models/powerpaint-v1/. The model is ~4GB.
"""
import subprocess
import sys
from pathlib import Path


def main():
    models_dir = Path(__file__).resolve().parent.parent / "models" / "powerpaint-v1"
    models_dir.mkdir(parents=True, exist_ok=True)

    print(f"[download] Target directory: {models_dir}")

    if any(models_dir.glob("*.safetensors")) or any(models_dir.glob("*.bin")):
        print("[download] Model weights already exist, skipping download.")
        return

    print("[download] Downloading PowerPaint v1 model from HuggingFace...")
    print("[download] This may take 5-15 minutes depending on network speed.")

    try:
        from huggingface_hub import snapshot_download

        snapshot_download(
            repo_id="JunhaoZhuang/PowerPaint-v1",
            local_dir=str(models_dir),
            local_dir_use_symlinks=False,
        )
        print(f"[download] Model downloaded successfully to {models_dir}")
    except ImportError:
        print("[download] huggingface_hub not installed. Installing...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "huggingface_hub"])
        from huggingface_hub import snapshot_download

        snapshot_download(
            repo_id="JunhaoZhuang/PowerPaint-v1",
            local_dir=str(models_dir),
            local_dir_use_symlinks=False,
        )
        print(f"[download] Model downloaded successfully to {models_dir}")
    except Exception as e:
        print(f"[download] Error: {e}")
        print("[download] You can also manually download from:")
        print("  https://huggingface.co/JunhaoZhuang/PowerPaint-v1")
        print(f"  and place files in: {models_dir}")
        sys.exit(1)


if __name__ == "__main__":
    main()
