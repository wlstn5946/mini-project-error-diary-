"""팀원 1 (찾기·정리): errors·error_tags 테이블 조회·생성. SQL은 라우터에 쓰지 않고 이 파일에만 둔다. (D-016)

mark_resolved()는 팀원 2가 해결 처리(A-006)용으로 추가했다. (D-030)
"""

from datetime import datetime, timedelta
from typing import Literal

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.models import KST, Attempt, ErrorRecord, ErrorTag, Tag, now_kst
from app.repositories import attempts as attempts_repo

# 비슷한 기록의 "이 방법 적용"이 남기는 시도 문구 (프론트 SolvePage의 applyMatch와 같게 유지한다, D-069).
# "재사용 해결" 개수(사이드바 통계, D-074)를 이 문구로 센다.
REUSE_ACTION_PATTERN = "기존 기록 #%의 해결 방법 적용"

# 등록한 지 이만큼(일) 지난 미해결 기록은 "오래된 기록"이다. 14일 이상이면 해당한다. (D-078)
STALE_DAYS = 14


def stale_cutoff() -> str:
    """이 시각 이전(같은 시각 포함)에 등록한 미해결 기록이 오래된 기록이다.

    created_at은 모두 한국 시간 ISO 8601(+09:00)이라 문자열 비교가 시간순 비교와 같다. (D-015)
    """
    return (datetime.now(KST) - timedelta(days=STALE_DAYS)).isoformat(timespec="seconds")


def is_stale(error: ErrorRecord, cutoff: str) -> bool:
    """오래된 기록인가: 미해결이고 등록한 지 STALE_DAYS일 이상이다. cutoff는 stale_cutoff() 값이다."""
    return error.status == "unresolved" and error.created_at <= cutoff


def count_stale_unresolved(db: Session) -> int:
    """오래된 미해결 기록 수. 사이드바 통계의 빨간 불(D-078)이 이 값이 1 이상일 때 켜진다."""
    query = select(func.count()).where(ErrorRecord.status == "unresolved", ErrorRecord.created_at <= stale_cutoff())
    return db.scalar(query) or 0


def get_error(db: Session, error_id: int) -> ErrorRecord | None:
    return db.get(ErrorRecord, error_id)


def count_by_status(db: Session) -> dict[str, int]:
    """상태별 에러 수. 없는 상태는 0이다. 사이드바 통계(D-074)용."""
    counts = {"unresolved": 0, "resolved": 0}
    for status, count in db.execute(select(ErrorRecord.status, func.count()).group_by(ErrorRecord.status)):
        counts[status] = count
    return counts


def count_reused_resolved(db: Session) -> int:
    """"이 방법 적용"으로 저장한 해결 기록 수. 해결됨 시도의 문구가 REUSE_ACTION_PATTERN인 해결된 에러를 센다. (D-074)"""
    query = (
        select(func.count(func.distinct(ErrorRecord.id)))
        .join(Attempt, Attempt.error_id == ErrorRecord.id)
        .where(
            ErrorRecord.status == "resolved",
            Attempt.result == "solved",
            Attempt.action.like(REUSE_ACTION_PATTERN),
        )
    )
    return db.scalar(query) or 0


def list_errors(
    db: Session,
    status: Literal["unresolved", "resolved"] | None,
    tag_ids: list[int],
    q: str | None,
    series_id: int | None = None,
    stale: bool = False,
) -> list[ErrorRecord]:
    """내 기록 목록 (A-008). 최근 등록 순, 같으면 id가 큰 것이 먼저. tag_ids는 중복 없이 넘긴다.

    series_id가 있으면 그 시리즈의 에러만, 시리즈 안 순서(series_order)대로 돌려준다. (D-042, D-051)
    stale이 True이면 오래된 기록(미해결 + 등록 14일 이상)만 돌려준다. (D-078)
    """
    query = select(ErrorRecord)
    if series_id is not None:
        query = query.where(ErrorRecord.series_id == series_id)
    if stale:
        query = query.where(ErrorRecord.status == "unresolved", ErrorRecord.created_at <= stale_cutoff())
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
    if series_id is not None:
        query = query.order_by(ErrorRecord.series_order, ErrorRecord.id)
    else:
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
    """미해결 상태로 저장한다. 커밋은 호출하는 쪽에서 한다. 새 시리즈·태그와 한 트랜잭션으로 묶기 위해서다. (D-025)

    시리즈에 넣으면 그 시리즈의 마지막 순서 + 1을 series_order로 매긴다. 에러를 만드는 어느 경로(에러 등록,
    비슷한 기록의 "이 방법 적용")든 여기를 거치므로 순서 매기기는 이 한 곳에 둔다. (D-051)
    """
    series_order = None
    if series_id is not None:
        last = db.scalar(select(func.max(ErrorRecord.series_order)).where(ErrorRecord.series_id == series_id))
        series_order = (last or 0) + 1
    error = ErrorRecord(
        error_message=error_message,
        situation=situation,
        series_id=series_id,
        series_order=series_order,
        status="unresolved",
    )
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


def set_summary(db: Session, error: ErrorRecord, summary: str | None) -> None:
    """내 한 줄 정리를 바꾼다. 비우면 None이다. 상태는 바꾸지 않는다. 커밋은 호출하는 쪽에서 한다.

    A-002(기록 저장)에서는 팀원 1이, A-007(한 줄 정리 수정)에서는 팀원 2가 쓴다.
    """
    error.summary = summary
    db.flush()


def set_feedback(db: Session, error: ErrorRecord, feedback: str) -> None:
    """AI 피드백을 저장한다(덮어쓴다). A-016용으로 팀원 2가 쓴다. 커밋은 호출하는 쪽에서 한다."""
    error.ai_feedback = feedback
    db.flush()


def update_error(
    db: Session,
    error: ErrorRecord,
    *,
    set_situation: bool,
    situation: str | None,
    set_series: bool,
    series_id: int | None,
    tag_ids: list[int] | None,
) -> None:
    """기록 수정 (A-010). set_*가 True인 항목만 바꾼다. tag_ids가 None이면 태그는 그대로, 목록이면 통째로 바꾼다.

    시리즈를 다른 시리즈로 옮기면 새 시리즈의 마지막 순서 + 1을 받고, 같은 시리즈면 순서를 그대로 둔다.
    시리즈를 비우면 series_order도 비운다. 커밋은 호출하는 쪽에서 한다. (D-051)
    """
    if set_situation:
        error.situation = situation
    if set_series and series_id != error.series_id:
        # 순서는 series_id를 바꾸기 전에 구한다. 바꾼 뒤에 구하면 자동 flush로 이 에러의 옛 순서가 새 시리즈의 최댓값에 섞인다.
        series_order = None
        if series_id is not None:
            last = db.scalar(select(func.max(ErrorRecord.series_order)).where(ErrorRecord.series_id == series_id))
            series_order = (last or 0) + 1
        error.series_id = series_id
        error.series_order = series_order
    if tag_ids is not None:
        db.execute(delete(ErrorTag).where(ErrorTag.error_id == error.id))
        db.add_all(ErrorTag(error_id=error.id, tag_id=tag_id) for tag_id in tag_ids)
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
    """시리즈를 지우기 전에 그 시리즈에 속한 에러의 소속(series_id)과 순서(series_order)를 비운다. 에러는 남는다. (D-050, D-051)

    커밋은 호출하는 쪽에서 한다.
    """
    db.execute(
        update(ErrorRecord)
        .where(ErrorRecord.series_id == series_id)
        .values(series_id=None, series_order=None)
    )


def remove_tag_links(db: Session, tag_id: int) -> None:
    """태그를 지우기 전에 그 태그의 에러 연결을 모두 지운다. 에러는 남는다. (D-050) 커밋은 호출하는 쪽에서 한다."""
    db.execute(delete(ErrorTag).where(ErrorTag.tag_id == tag_id))


def reorder_series(db: Session, series_id: int, error_ids: list[int]) -> bool:
    """그 시리즈의 에러 전체를 error_ids 순서로 바꿔 끼운다. series_order를 1부터 다시 매긴다. (D-051)

    error_ids가 그 시리즈에 속한 에러 ID와 정확히 같은 집합(중복·누락·다른 시리즈의 ID 없음)이 아니면
    아무것도 바꾸지 않고 False를 돌려준다. 커밋은 호출하는 쪽에서 한다.
    """
    errors = {error.id: error for error in db.scalars(select(ErrorRecord).where(ErrorRecord.series_id == series_id))}
    if len(error_ids) != len(set(error_ids)) or set(error_ids) != set(errors):
        return False
    for order, error_id in enumerate(error_ids, start=1):
        errors[error_id].series_order = order
    db.flush()
    return True
