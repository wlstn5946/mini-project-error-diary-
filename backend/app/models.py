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
