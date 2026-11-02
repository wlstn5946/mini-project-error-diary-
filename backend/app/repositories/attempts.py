"""팀원 2 (AI로 해결): attempts 테이블 조회·생성. SQL은 라우터에 쓰지 않고 이 파일에만 둔다. (D-016)

count_by_error_ids(), list_attempts()는 팀원 1이 내 기록(A-008, A-009)용으로 추가했다. (D-038)
delete_by_error_id()는 팀원 1이 기록 삭제(A-011)용으로 추가했다. (D-045)
"""

from sqlalchemy import delete, func, select
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


def count_by_error_ids(db: Session, error_ids: list[int]) -> dict[int, int]:
    """팀원 1 추가 (D-038). 에러마다 시도 수. 시도가 없는 에러는 0이다."""
    counts = {error_id: 0 for error_id in error_ids}
    if not error_ids:
        return counts
    query = select(Attempt.error_id, func.count()).where(Attempt.error_id.in_(error_ids)).group_by(Attempt.error_id)
    for error_id, count in db.execute(query):
        counts[error_id] = count
    return counts


def list_attempts(db: Session, error_id: int) -> list[Attempt]:
    """팀원 1 추가 (D-038). 에러 일기 상세용, 시도 번호 순서."""
    return list(db.scalars(select(Attempt).where(Attempt.error_id == error_id).order_by(Attempt.seq)))


def delete_by_error_id(db: Session, error_id: int) -> None:
    """팀원 1 추가 (D-045). 에러를 지우기 전에 그 에러의 시도를 모두 지운다. 커밋은 호출하는 쪽에서 한다. (D-044)"""
    db.execute(delete(Attempt).where(Attempt.error_id == error_id))
