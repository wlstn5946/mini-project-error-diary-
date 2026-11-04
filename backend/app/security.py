"""공용: 비밀번호 해시, 세션 토큰, 현재 사용자 확인. (D-084, D-085, D-093, D-098)

비밀번호·토큰은 로그에 남기지 않는다. 이 파일은 로그를 쓰지 않는다.
"""

import hashlib
import secrets
import unicodedata
from datetime import datetime, timedelta

from fastapi import Cookie, Depends, HTTPException
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from app.config import SESSION_COOKIE_NAME, SESSION_EXPIRE_DAYS
from app.db import get_db
from app.models import KST, User, now_kst
from app.repositories import sessions as sessions_repo
from app.repositories import users as users_repo

# argon2 권장 설정
_password_hash = PasswordHash.recommended()

# 아이디가 없을 때도 verify를 한 번 실행하기 위한 더미 해시. 응답 시간 차이를 줄인다. (D-093)
_DUMMY_HASH = _password_hash.hash(secrets.token_urlsafe(16))

NOT_LOGGED_IN = "로그인이 필요해요."  # D-097


def hash_password(password: str) -> str:
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return _password_hash.verify(password, password_hash)


def verify_dummy(password: str) -> None:
    """아이디가 없을 때 비밀번호 확인과 비슷한 시간을 쓰려고 더미 해시로 verify를 한 번 한다. 결과는 쓰지 않는다. (D-093)"""
    _password_hash.verify(password, _DUMMY_HASH)


def normalize_answer(answer: str) -> str:
    """보안 답 정규화. 가입(저장)과 로그인(비교)이 반드시 이 함수 하나만 쓴다. (D-116)

    1) 유니코드 NFC  2) 모든 공백 제거  3) 소문자
    """
    return "".join(unicodedata.normalize("NFC", answer).split()).lower()


def hash_answer(answer: str) -> str:
    return _password_hash.hash(normalize_answer(answer))


def verify_answer(answer: str, answer_hash: str) -> bool:
    return _password_hash.verify(normalize_answer(answer), answer_hash)


def new_token() -> str:
    """쿠키에 담을 세션 토큰 원문."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """DB에는 이 sha256 해시(16진수)만 저장한다. (D-084)"""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def session_expires_at() -> str:
    """지금 + 7일, 한국 시간 ISO 8601 문자열 (D-015, D-084)."""
    return (datetime.now(KST) + timedelta(days=SESSION_EXPIRE_DAYS)).isoformat(timespec="seconds")


def get_current_user(
    token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    db: Session = Depends(get_db),
) -> User:
    """쿠키 없음·세션 없음·만료·사용자 없음이면 401. 전역 의존성은 5단계에서 건다. (D-087, D-097)"""
    if not token:
        raise HTTPException(status_code=401, detail=NOT_LOGGED_IN)
    session = sessions_repo.get_session_by_token_hash(db, hash_token(token))
    if session is None or session.expires_at <= now_kst():
        raise HTTPException(status_code=401, detail=NOT_LOGGED_IN)
    user = users_repo.get_user(db, session.user_id)
    if user is None:
        raise HTTPException(status_code=401, detail=NOT_LOGGED_IN)
    return user
