"""공용: 테이블 정의 (DATA-MODEL_N.md). 테이블끼리 외래 키로 이어지므로 한 파일에 둔다."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import String
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
