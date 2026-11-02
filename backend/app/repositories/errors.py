"""팀원 1 (찾기·정리): errors·error_tags 테이블 조회·생성. SQL은 라우터에 쓰지 않고 이 파일에만 둔다. (D-016)

mark_resolved()는 팀원 2가 해결 처리(A-006)용으로 추가했다. (D-030)
"""

from typing import Literal

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.models import ErrorRecord, ErrorTag, Tag, now_kst
from app.repositories import attempts as attempts_repo


def get_error(db: Session, error_id: int) -> ErrorRecord | None:
    return db.get(ErrorRecord, error_id)


def list_errors(
    db: Session,
    status: Literal["unresolved", "resolved"] | None,
    tag_ids: list[int],
    q: str | None,
) -> list[ErrorRecord]:
    """내 기록 목록 (A-008). 최근 등록 순, 같으면 id가 큰 것이 먼저. tag_ids는 중복 없이 넘긴다."""
    query = select(ErrorRecord)
    if status:
        query = query.where(ErrorRecord.status == status)
    if q:
        # 대소문자 무시, 사용자가 입력한 %·_는 글자 그대로 찾는다
        query = query.where(ErrorRecord.error_message.icontains(q, autoescape=True))
    if tag_ids:
        # 고른 태그를 모두 가진 에러만: 고른 태그 중 붙어 있는 개수가 고른 개수와 같아야 한다
        has_all_tags = (
            select(ErrorTag.error_id)
            .where(ErrorTag.tag_id.in_(tag_ids))
            .group_by(ErrorTag.error_id)
            .having(func.count() == len(tag_ids))
        )
        query = query.where(ErrorRecord.id.in_(has_all_tags))
    query = query.order_by(ErrorRecord.created_at.desc(), ErrorRecord.id.desc())
    return list(db.scalars(query))


def get_tags_by_error_ids(db: Session, error_ids: list[int]) -> dict[int, list[Tag]]:
    """에러마다 붙은 태그(이름순). 목록 전체를 한 번에 가져온다 (N+1 조회 방지)."""
    tags: dict[int, list[Tag]] = {error_id: [] for error_id in error_ids}
    if not error_ids:
        return tags
    query = (
        select(ErrorTag.error_id, Tag)
        .join(Tag, Tag.id == ErrorTag.tag_id)
        .where(ErrorTag.error_id.in_(error_ids))
        .order_by(Tag.name_key, Tag.id)
    )
    for error_id, tag in db.execute(query):
        tags[error_id].append(tag)
    return tags


def list_resolved_errors(db: Session) -> list[ErrorRecord]:
    """비슷한 기록 검색(A-003)의 후보. 한 줄 정리(해결법)가 있는 해결된 기록만 돌려준다. (D-040)"""
    return list(db.scalars(select(ErrorRecord).where(ErrorRecord.status == "resolved")))


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


def delete_error(db: Session, error: ErrorRecord) -> None:
    """기록을 지운다 (D-043). 외래 키 때문에 attempts → error_tags → errors 순서로 지운다. CASCADE는 쓰지 않는다. (D-044)

    쓰이지 않게 된 태그·시리즈는 남긴다. (D-046) 커밋은 호출하는 쪽에서 한다. 중간에 실패하면 커밋 전이라 아무것도 지워지지 않는다.
    """
    attempts_repo.delete_by_error_id(db, error.id)
    db.execute(delete(ErrorTag).where(ErrorTag.error_id == error.id))
    db.delete(error)
    db.flush()


def count_errors_by_series(db: Session) -> dict[int, int]:
    """시리즈마다 속한 에러 수. 에러가 없는 시리즈는 키가 없다(0으로 본다). 시리즈 목록의 "에러 N개"에 쓴다. (D-050)"""
    query = (
        select(ErrorRecord.series_id, func.count())
        .where(ErrorRecord.series_id.is_not(None))
        .group_by(ErrorRecord.series_id)
    )
    return {series_id: count for series_id, count in db.execute(query)}


def count_errors_by_tag(db: Session) -> dict[int, int]:
    """태그마다 붙은 에러 수. 쓰이지 않는 태그는 키가 없다(0으로 본다). 삭제 확인 창의 "N개 기록에서 빠져요"에 쓴다. (D-050)"""
    query = select(ErrorTag.tag_id, func.count()).group_by(ErrorTag.tag_id)
    return {tag_id: count for tag_id, count in db.execute(query)}


def clear_series(db: Session, series_id: int) -> None:
    """시리즈를 지우기 전에 그 시리즈에 속한 에러의 소속을 비운다. 에러는 남는다. (D-050)

    errors.series_order 컬럼이 생기면(D-051) 함께 비운다. 커밋은 호출하는 쪽에서 한다.
    """
    db.execute(update(ErrorRecord).where(ErrorRecord.series_id == series_id).values(series_id=None))


def remove_tag_links(db: Session, tag_id: int) -> None:
    """태그를 지우기 전에 그 태그의 에러 연결을 모두 지운다. 에러는 남는다. (D-050) 커밋은 호출하는 쪽에서 한다."""
    db.execute(delete(ErrorTag).where(ErrorTag.tag_id == tag_id))
