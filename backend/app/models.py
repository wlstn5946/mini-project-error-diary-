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


class Series(Base):
    """시리즈. 새 시리즈는 에러를 저장할 때 함께 만든다. (D-011)"""

    __tablename__ = "series"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String, unique=True)
    description: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(String, default=now_kst)


class Tag(Base):
    """태그. 새 태그는 에러를 저장할 때 함께 만든다. (D-018, D-020)"""

    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 처음 입력한 표기 그대로 보여준다 (예: Python)
    name: Mapped[str] = mapped_column(String)
    # 대소문자를 무시한 비교용 값 (예: python). COLLATE NOCASE 대신 써서 PostgreSQL에서도 같게 동작한다. (D-019)
    name_key: Mapped[str] = mapped_column(String, unique=True)
    created_at: Mapped[str] = mapped_column(String, default=now_kst)


class ErrorRecord(Base):
    """에러 기록. 새 에러로 확정되는 순간 미해결로 저장한다. (D-024, D-025)"""

    __tablename__ = "errors"

    id: Mapped[int] = mapped_column(primary_key=True)
    error_message: Mapped[str] = mapped_column(String)
    situation: Mapped[str | None] = mapped_column(String)
    series_id: Mapped[int | None] = mapped_column(ForeignKey("series.id"))
    # unresolved / resolved (D-028)
    status: Mapped[str] = mapped_column(String, default="unresolved")
    # 내 한 줄 정리와 해결 시각. resolved일 때만 값이 있다. (D-026)
    summary: Mapped[str | None] = mapped_column(String)
    resolved_at: Mapped[str | None] = mapped_column(String)
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
