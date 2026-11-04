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

# 세션 쿠키의 Secure 속성 (D-084, D-091). true/false이고 비우면 true다. 그 밖의 값이면 서버가 시작되지 않는다.
# 로컬(http)에서는 false로 둬야 쿠키가 저장된다.
_session_cookie_secure = os.getenv("SESSION_COOKIE_SECURE", "").strip().lower()
if _session_cookie_secure in ("", "true"):
    SESSION_COOKIE_SECURE = True
elif _session_cookie_secure == "false":
    SESSION_COOKIE_SECURE = False
else:
    raise RuntimeError("backend/.env의 SESSION_COOKIE_SECURE는 true 또는 false여야 한다(비우면 true). .env.example을 참고한다.")

# 코드 상수 (D-084, D-091)
SESSION_COOKIE_NAME = "error_diary_session"
SESSION_EXPIRE_DAYS = 7
