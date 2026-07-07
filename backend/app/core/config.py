import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = BASE_DIR.parent  # backend/
load_dotenv(BACKEND_DIR / ".env")
DATABASE_URL = f"sqlite:///{BASE_DIR / 'ozon.db'}"

# ── DeepSeek / LLM Configuration ────────────────────────────────────────
# 使用的腾讯云
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-pro")


# ── OpenAI Image Configuration (GPT Image 2) ───────────────────────────
# 使用的中转仓
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_IMAGE_MODEL = os.getenv("OPENAI_IMAGE_MODEL", "gpt-image-2")
OPENAI_IMAGE_TIMEOUT_SECONDS = int(os.getenv("OPENAI_IMAGE_TIMEOUT_SECONDS", "120"))
OPENAI_IMAGE_MAX_CONCURRENCY = int(os.getenv("OPENAI_IMAGE_MAX_CONCURRENCY", "2"))
