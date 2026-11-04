"""공용: 회원가입·로그인·로그아웃·내 정보 (A-018 ~ A-021, D-082 ~ D-098).

응답에 password_hash, 토큰, 토큰 해시를 넣지 않는다.
"""

import re

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import security
from app.config import SESSION_COOKIE_NAME, SESSION_COOKIE_SECURE, SESSION_EXPIRE_DAYS
from app.db import get_db
from app.models import User, now_kst
from app.repositories import sessions as sessions_repo
from app.repositories import users as users_repo

router = APIRouter(prefix="/auth", tags=["auth"])

USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_]{3,20}$")  # D-092
PASSWORD_MIN, PASSWORD_MAX = 4, 30  # D-099
USERNAME_TAKEN = "이미 사용 중인 아이디예요."  # D-097
LOGIN_FAILED = "아이디 또는 비밀번호가 올바르지 않아요."  # D-090


class RegisterRequest(BaseModel):
    username: str
    password: str = Field(min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)

    @field_validator("username")
    @classmethod
    def check_username(cls, value: str) -> str:
        value = value.strip()  # 앞뒤 공백을 지운 뒤 검사한다. 가운데 공백은 허용 문자가 아니라 거부된다. (D-092)
        if not USERNAME_PATTERN.fullmatch(value):
            raise ValueError("아이디는 3~20자의 영문 대소문자, 숫자, _만 쓸 수 있어요.")
        return value


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    created_at: str


def _to_response(user: User) -> UserResponse:
    return UserResponse(id=user.id, username=user.username, created_at=user.created_at)


@router.post("/register", response_model=UserResponse, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    """A-018. 가입만 하고 로그인(세션·쿠키)은 하지 않는다. (D-090)"""
    key = body.username.lower()
    if users_repo.get_user_by_key(db, key) is not None:
        raise HTTPException(status_code=409, detail=USERNAME_TAKEN)
    try:
        user = users_repo.create_user(db, body.username, key, security.hash_password(body.password))
        db.commit()
    except IntegrityError:
        # 같은 아이디가 동시에 가입되어 DB UNIQUE에 걸린 경우
        db.rollback()
        raise HTTPException(status_code=409, detail=USERNAME_TAKEN)
    return _to_response(user)


@router.post("/login", response_model=UserResponse)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """A-019. 아이디가 없든 비밀번호가 틀리든 같은 401 문구 하나만 쓴다. (D-085, D-090)"""
    user = users_repo.get_user_by_key(db, body.username.strip().lower())
    # 가입 때 정한 상한보다 긴 비밀번호는 맞을 수 없고, argon2에 긴 값을 넣지 않으려고 더미로만 확인한다.
    too_long = len(body.password) > PASSWORD_MAX
    if user is None or too_long:
        security.verify_dummy("x" if too_long else body.password)  # 아이디가 없어도 verify를 한 번 한다 (D-093)
        raise HTTPException(status_code=401, detail=LOGIN_FAILED)
    if not security.verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail=LOGIN_FAILED)

    # 그 사용자의 만료된 세션만 지우고 새 세션을 만든다. 동시 세션 수는 제한하지 않는다. (D-084, D-096)
    sessions_repo.delete_expired_sessions(db, user.id, now_kst())
    token = security.new_token()
    sessions_repo.create_session(db, user.id, security.hash_token(token), security.session_expires_at())
    db.commit()

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_EXPIRE_DAYS * 24 * 60 * 60,
        path="/",
        httponly=True,
        samesite="lax",
        secure=SESSION_COOKIE_SECURE,
    )
    return _to_response(user)


@router.post("/logout", status_code=204)
def logout(token: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME), db: Session = Depends(get_db)):
    """A-020. 인증을 걸지 않는다. 세션이 있으면 지우고, 없거나 만료여도 쿠키를 지운 뒤 항상 204. (D-094)"""
    if token:
        sessions_repo.delete_session_by_token_hash(db, security.hash_token(token))
        db.commit()
    response = Response(status_code=204)
    response.delete_cookie(
        key=SESSION_COOKIE_NAME, path="/", httponly=True, samesite="lax", secure=SESSION_COOKIE_SECURE
    )
    return response


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(security.get_current_user)):
    """A-021. 쿠키 없음·세션 없음·만료면 401 (get_current_user). (D-094)"""
    return _to_response(user)
