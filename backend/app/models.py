"""공용: 테이블 정의 (DATA-MODEL_N.md). 테이블끼리 외래 키로 이어지므로 한 파일에 둔다."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base

# Windows에는 ZoneInfo("Asia/Seoul")용 시간대 데이터가 없어서 고정 +9시간을 쓴다. 한국은 서머타임이 없다.
KST = timezone(timedelta(hours=9))


def now_kst() -> str:
    """한국 시간 ISO 8601 문자열 (예: 2026-11-02T15:00:00+09:00)."""
    return datetime.now(KST).isoformat(timespec="seconds")


class User(Base):
    """계정. 회원가입으로 만든다. (D-082, D-084, D-085)"""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 입력한 표기 그대로 보여준다 (예: Alice)
    username: Mapped[str] = mapped_column(String)
    # 중복 판단용. 소문자로 바꾼 username이다 (예: alice). D-019 방식. (D-085)
    username_key: Mapped[str] = mapped_column(String, unique=True)
    # argon2 해시. 비밀번호 원문은 저장하지 않는다.
    password_hash: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String, default=now_kst)


class UserSession(Base):
    """로그인 세션. 토큰 원문은 쿠키에만 있고 DB에는 sha256 해시만 저장한다. (D-084)"""

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    token_hash: Mapped[str] = mapped_column(String, unique=True)
    # 만료 시각. created_at + 7일, 한국 시간 ISO 8601이라 문자열 비교가 시간순 비교와 같다. (D-015)
    expires_at: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String, default=now_kst)


class Series(Base):
    """시리즈. 새 시리즈는 에러를 저장할 때 함께 만든다. (D-011)"""

    __tablename__ = "series"
    # 같은 이름은 같은 사용자 안에서만 겹치지 못한다. 다른 사용자는 같은 이름을 가질 수 있다. (D-086)
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    # 시리즈 주인 (D-086)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String, default=now_kst)


class Tag(Base):
    """태그. 새 태그는 에러를 저장할 때 함께 만든다. (D-018, D-020)"""

    __tablename__ = "tags"
    # 같은 사용자 안에서만 name_key가 겹치지 못한다. (D-019, D-086)
    __table_args__ = (UniqueConstraint("user_id", "name_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    # 태그 주인 (D-086)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    # 처음 입력한 표기 그대로 보여준다 (예: Python)
    name: Mapped[str] = mapped_column(String)
    # 대소문자를 무시한 비교용 값 (예: python). COLLATE NOCASE 대신 써서 PostgreSQL에서도 같게 동작한다. (D-019)
    name_key: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String, default=now_kst)


class TagAlias(Base):
    """태그의 별칭. 합치기(A-022)나 태그 관리(A-023)로 만든다. 화면에 별도 태그로 보이지 않는다. (D-112 ~ D-114)

    새 테이블이라 init_db()의 create_all이 만든다. 태그 name_key와 alias_key가 겹치지 않는 것은
    UNIQUE로 막을 수 없어 repository 코드가 확인한다. (D-114)
    """

    __tablename__ = "tag_aliases"
    # 같은 사용자 안에서만 alias_key가 겹치지 못한다.
    __table_args__ = (UniqueConstraint("user_id", "alias_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id"))
    # 표기 그대로 (예: py)
    alias: Mapped[str] = mapped_column(String)
    # 비교용. 정규화한 alias의 소문자 (예: py)
    alias_key: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String, default=now_kst)


class ErrorRecord(Base):
    """에러 기록. 새 에러로 확정되는 순간 미해결로 저장한다. (D-024, D-025)"""

    __tablename__ = "errors"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 기록 주인. 모든 조회가 user_id로 거르므로 인덱스를 둔다. (D-086)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    error_message: Mapped[str] = mapped_column(String)
    situation: Mapped[str | None] = mapped_column(String)
    series_id: Mapped[int | None] = mapped_column(ForeignKey("series.id"))
    # 시리즈 안 순서. 시리즈가 없으면 NULL, 있으면 값이 있다. 시리즈에 넣을 때 마지막 순서 + 1을 매긴다. (D-051)
    # 빈 번호는 그대로 둔다(상대 순서만 뜻한다). 이미 만들어진 DB에는 init_db()가 컬럼을 추가한다. (D-052)
    series_order: Mapped[int | None] = mapped_column()
    # unresolved / resolved (D-028)
    status: Mapped[str] = mapped_column(String, default="unresolved")
    # 내 한 줄 정리. 해결됨이면 필수이고, 미해결에도 선택으로 저장한다. (D-026, D-064 이후 변경)
    summary: Mapped[str | None] = mapped_column(String)
    # 해결 시각. resolved일 때만 값이 있다.
    resolved_at: Mapped[str | None] = mapped_column(String)
    # AI 피드백. 기록 저장 뒤 받아서 저장하고, 한 줄 정리를 고치면 다시 받아 덮어쓴다. 없으면 NULL. (Q-003)
    # 이미 만들어진 DB에는 init_db()가 컬럼을 추가한다. (D-052)
    ai_feedback: Mapped[str | None] = mapped_column(String)
    # 재사용 기록이 가리키는 맨 처음 원본(뿌리). 원본이면 NULL이다. 묶음은 한 단계만 있다. (D-080)
    # 이미 만들어진 DB에는 init_db()가 컬럼을 추가하고 옛 시도 문구로 한 번 채운다. (D-052)
    reused_from_id: Mapped[int | None] = mapped_column(ForeignKey("errors.id"))
    created_at: Mapped[str] = mapped_column(String, default=now_kst)


class ErrorTag(Base):
    """에러와 태그 연결 (다대다, D-018). 복합 PK라 같은 태그가 두 번 붙지 않는다."""

    __tablename__ = "error_tags"

    error_id: Mapped[int] = mapped_column(ForeignKey("errors.id"), primary_key=True)
    tag_id: Mapped[int] = mapped_column(ForeignKey("tags.id"), primary_key=True)


class Attempt(Base):
    """시도 기록. seq는 에러마다 1부터 매긴다. (R-004, D-026)"""

    __tablename__ = "attempts"
    # 같은 시도가 두 번 저장되어 같은 번호가 생기는 것을 막는다.
    __table_args__ = (UniqueConstraint("error_id", "seq"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    error_id: Mapped[int] = mapped_column(ForeignKey("errors.id"))
    seq: Mapped[int] = mapped_column()
    action: Mapped[str] = mapped_column(String)
    # solved / failed / partial (D-028)
    result: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String, default=now_kst)
