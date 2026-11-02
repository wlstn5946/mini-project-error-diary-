"""팀원 2 (AI로 해결): attempts 테이블 조회·생성. SQL은 라우터에 쓰지 않고 이 파일에만 둔다. (D-016)"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Attempt


def next_seq(db: Session, error_id: int) -> int:
    """그 에러의 마지막 시도 번호 + 1. 첫 시도는 1이다."""
    last = db.scalar(select(func.max(Attempt.seq)).where(Attempt.error_id == error_id))
    return (last or 0) + 1


def create_attempt(db: Session, error_id: int, seq: int, action: str, result: str) -> Attempt:
    """커밋은 호출하는 쪽에서 한다. 해결 처리와 한 트랜잭션으로 묶기 위해서다. (D-026)"""
    attempt = Attempt(error_id=error_id, seq=seq, action=action, result=result)
    db.add(attempt)
    db.flush()
    return attempt
