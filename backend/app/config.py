"""backend/.env 설정 읽기 (공용)."""

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BACKEND_DIR / ".env")

# 값은 .env에만 둔다. 이 값을 로그나 응답에 출력하지 않는다. (CLAUDE.md 6절)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# SQLite DB 파일 경로. 비어 있으면 backend/data/error_diary.db, 상대 경로는 backend/ 기준이다.
DATABASE_PATH = Path(os.getenv("DATABASE_PATH") or "data/error_diary.db")
if not DATABASE_PATH.is_absolute():
    DATABASE_PATH = BACKEND_DIR / DATABASE_PATH
