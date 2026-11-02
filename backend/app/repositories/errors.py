"""팀원 1 (찾기·정리): errors·error_tags 테이블 조회·생성. SQL은 라우터에 쓰지 않고 이 파일에만 둔다. (D-016)

mark_resolved()는 팀원 2가 해결 처리(A-006)용으로 추가했다. (D-030)
"""

from sqlalchemy.orm import Session

from app.models import ErrorRecord, ErrorTag, now_kst


def get_error(db: Session, error_id: int) -> ErrorRecord | None:
    return db.get(ErrorRecord, error_id)


def create_error(
    db: Session,
    error_message: str,
    situation: str | None,
    series_id: int | None,
    tag_ids: list[int],
) -> ErrorRecord:
    """미해결 상태로 저장한다. 커밋은 호출하는 쪽에서 한다. 새 시리즈·태그와 한 트랜잭션으로 묶기 위해서다. (D-025)"""
    error = ErrorRecord(error_message=error_message, situation=situation, series_id=series_id, status="unresolved")
    db.add(error)
    db.flush()
    db.add_all(ErrorTag(error_id=error.id, tag_id=tag_id) for tag_id in tag_ids)
    db.flush()
    return error


def mark_resolved(db: Session, error: ErrorRecord, summary: str) -> None:
    """팀원 2 추가 (D-030). 시도 저장과 같은 트랜잭션에서 부른다. 커밋은 호출하는 쪽에서 한다. (D-026)"""
    error.status = "resolved"
    error.summary = summary
    error.resolved_at = now_kst()
    db.flush()
