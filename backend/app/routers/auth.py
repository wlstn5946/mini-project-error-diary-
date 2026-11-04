"""공용: 회원가입·로그인·로그아웃·내 정보 (A-018 ~ A-021, D-082 ~ D-098).

응답에 password_hash, 토큰, 토큰 해시를 넣지 않는다.
"""

import re

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
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
LOGIN_FAILED_SECURED = "비밀번호 또는 보안 답변이 올바르지 않아요."  # 실패 5회 이상 계정 (D-116)
QUESTION_MAX, ANSWER_MAX = 50, 20  # D-116
FAILED_LIMIT = 5  # 이 횟수 이상 실패한 계정은 보안 답변도 받는다. 잠그지는 않는다. (D-116)


class RegisterRequest(BaseModel):
    username: str
    password: str = Field(min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)
    security_question: str
    security_answer: str

    @field_validator("security_question")
    @classmethod
    def check_question(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= QUESTION_MAX:
            raise ValueError(f"보안 질문은 1~{QUESTION_MAX}자로 입력해 주세요.")
        return value

    @field_validator("security_answer")
    @classmethod
    def check_answer(cls, value: str) -> str:
        # 저장·비교와 같은 정규화 뒤의 길이를 센다. 공백만 있는 답은 거부된다. (D-116)
        if not 1 <= len(security.normalize_answer(value)) <= ANSWER_MAX:
            raise ValueError(f"보안 답변은 1~{ANSWER_MAX}자로 입력해 주세요.")
        return value

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
    security_answer: str | None = None  # 실패 5회 이상 계정만 필요하다 (D-116)


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
        user = users_repo.create_user(
            db,
            body.username,
            key,
            security.hash_password(body.password),
            body.security_question,
            security.hash_answer(body.security_answer),
        )
        db.commit()
    except IntegrityError:
        # 같은 아이디가 동시에 가입되어 DB UNIQUE에 걸린 경우
        db.rollback()
        raise HTTPException(status_code=409, detail=USERNAME_TAKEN)
    return _to_response(user)


def _login_failed(detail: str, question: str | None = None) -> JSONResponse:
    """401. 질문은 실패 5회 이상 계정일 때만 담는다. (D-116)"""
    content: dict[str, str] = {"detail": detail}
    if question is not None:
        content["security_question"] = question
    return JSONResponse(status_code=401, content=content)


@router.post("/login", response_model=UserResponse)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """A-019. 아이디가 없든 비밀번호가 틀리든 같은 401 문구 하나만 쓴다. (D-085, D-090)

    실패 5회 이상인 계정은 비밀번호와 보안 답변이 모두 맞아야 한다. 이 판단은 서버에서만 한다. (D-116)
    """
    user = users_repo.get_user_by_key(db, body.username.strip().lower())
    # 가입 때 정한 상한보다 긴 비밀번호는 맞을 수 없고, argon2에 긴 값을 넣지 않으려고 더미로만 확인한다.
    too_long = len(body.password) > PASSWORD_MAX
    if user is None or too_long:
        security.verify_dummy("x" if too_long else body.password)  # 아이디가 없어도 verify를 한 번 한다 (D-093)
        if user is not None:
            # 비밀번호가 너무 길어도 실패로 센다
            count = users_repo.increment_failed(db, user.id)
            db.commit()
            if count >= FAILED_LIMIT:
                return _login_failed(LOGIN_FAILED_SECURED, user.security_question)
        return _login_failed(LOGIN_FAILED)

    if user.failed_login_count >= FAILED_LIMIT:
        answer = body.security_answer
        if answer is None or security.normalize_answer(answer) == "":
            # 답이 없으면 비밀번호 검증 자체를 하지 않고 거부한다. 횟수는 올리지 않는다.
            return _login_failed(LOGIN_FAILED_SECURED, user.security_question)
        # 어느 쪽이 틀렸는지 응답 시간으로도 알 수 없게 둘 다 항상 확인한다.
        password_ok = security.verify_password(body.password, user.password_hash)
        if len(security.normalize_answer(answer)) > ANSWER_MAX:
            security.verify_dummy("x")  # 가입 때 정한 상한보다 길면 맞을 수 없다
            answer_ok = False
        else:
            answer_ok = security.verify_answer(answer, user.security_answer_hash)
        if not (password_ok and answer_ok):
            users_repo.increment_failed(db, user.id)
            db.commit()
            return _login_failed(LOGIN_FAILED_SECURED, user.security_question)
    elif not security.verify_password(body.password, user.password_hash):
        count = users_repo.increment_failed(db, user.id)
        db.commit()
        # 이번 실패로 5회가 되면 바로 질문을 내려준다
        return _login_failed(LOGIN_FAILED, user.security_question if count >= FAILED_LIMIT else None)

    users_repo.reset_failed(db, user.id)

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
