"""팀원 2 (AI로 해결): attempts 테이블 조회·생성. SQL은 라우터에 쓰지 않고 이 파일에만 둔다. (D-016)"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Attempt


def next_seq(db: Session, error_id: int) -> int:
    """그 에러의 마지막 시도 번호 + 1. 첫 시도는 1이다."""
    last = db.scalar(select(func.max(Attempt.seq)).where(Attempt.error_id == error_id))
    return (last or 0) + 1


def count_by_error_ids(db: Session, error_ids: list[int]) -> dict[int, int]:
    """팀원 1 추가 (A-003 "시도 N회 만에 해결" 표시용). 에러마다 시도 수."""
    if not error_ids:
        return {}
    query = select(Attempt.error_id, func.count()).where(Attempt.error_id.in_(error_ids)).group_by(Attempt.error_id)
    return {error_id: count for error_id, count in db.execute(query)}


def create_attempt(db: Session, error_id: int, seq: int, action: str, result: str) -> Attempt:
    """커밋은 호출하는 쪽에서 한다. 해결 처리와 한 트랜잭션으로 묶기 위해서다. (D-026)"""
    attempt = Attempt(error_id=error_id, seq=seq, action=action, result=result)
    db.add(attempt)
    db.flush()
    return attempt
