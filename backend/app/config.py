"""backend/.env 설정 읽기 (공용)."""

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BACKEND_DIR / ".env")

# 값은 .env에만 둔다. 이 값을 로그나 응답에 출력하지 않는다. (CLAUDE.md 6절)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
