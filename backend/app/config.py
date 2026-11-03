"""backend/.env 설정 읽기 (공용)."""

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BACKEND_DIR / ".env")

# 값은 .env에만 둔다. 이 값을 로그나 응답에 출력하지 않는다. (CLAUDE.md 6절)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# PostgreSQL 접속 주소(로컬 또는 Supabase, D-058). 비밀번호가 들어 있으므로 로그에 출력하지 않는다.
# postgresql://... 주소(Supabase 대시보드 주소 포함)를 그대로 넣어도 psycopg 드라이버로 연결되게 바꾼다.
DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError("backend/.env에 DATABASE_URL이 없다. .env.example을 참고해 PostgreSQL 접속 주소를 채운다.")
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL.removeprefix("postgresql://")
