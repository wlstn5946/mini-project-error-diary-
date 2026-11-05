"""팀원 1 (찾기·정리): errors·error_tags 테이블 조회·생성. SQL은 라우터에 쓰지 않고 이 파일에만 둔다. (D-016)

mark_resolved()는 팀원 2가 해결 처리(A-006)용으로 추가했다. (D-030)

계정별 분리 (D-086, D-105): errors·series·tags를 읽거나 쓰는 함수는 모두 기본값 없는 키워드 인자 user_id를 받는다.
소유 확인은 get_owned_error() 하나로 모은다. 남의 기록은 없는 기록과 똑같이 None이다.
"""

from datetime import datetime, timedelta
from typing import Literal

from sqlalchemy import case, delete, func, or_, select, update
from sqlalchemy.orm import Session

from app.models import KST, Attempt, ErrorRecord, ErrorTag, Series, Tag, now_kst
from app.repositories import attempts as attempts_repo

# 등록한 지 이만큼(일) 지난 미해결 기록은 "오래된 기록"이다. 14일 이상이면 해당한다. (D-078)
STALE_DAYS = 14


def assert_owner(row: ErrorRecord | Series | Tag, user_id: int) -> None:
    """이미 소유를 확인한 객체를 받는 함수의 방어 장치. 주인이 다르면 오류를 던진다. 정상 흐름에서는 일어나지 않는다. (D-105)"""
    if row.user_id != user_id:
        raise PermissionError("다른 사용자의 행이에요.")


def stale_cutoff() -> str:
    """이 시각 이전(같은 시각 포함)에 등록한 미해결 기록이 오래된 기록이다.

    created_at은 모두 한국 시간 ISO 8601(+09:00)이라 문자열 비교가 시간순 비교와 같다. (D-015)
    """
    return (datetime.now(KST) - timedelta(days=STALE_DAYS)).isoformat(timespec="seconds")


def is_stale(error: ErrorRecord, cutoff: str) -> bool:
    """오래된 기록인가: 미해결이고 등록한 지 STALE_DAYS일 이상이다. cutoff는 stale_cutoff() 값이다."""
    return error.status == "unresolved" and error.created_at <= cutoff


def count_stale_unresolved(db: Session, *, user_id: int) -> int:
    """오래된 미해결 기록 수. 사이드바 통계의 빨간 불(D-078)이 이 값이 1 이상일 때 켜진다."""
    query = select(func.count()).where(
        ErrorRecord.user_id == user_id, ErrorRecord.status == "unresolved", ErrorRecord.created_at <= stale_cutoff()
    )
    return db.scalar(query) or 0


def get_owned_error(db: Session, *, user_id: int, error_id: int) -> ErrorRecord | None:
    """소유 확인 함수. 내 기록이면 돌려주고, 없거나 남의 것이면 None이다. 에러를 id로 찾는 곳은 모두 여기를 거친다. (D-105)"""
    query = select(ErrorRecord).where(ErrorRecord.id == error_id, ErrorRecord.user_id == user_id)
    return db.scalars(query).first()


def count_by_status(db: Session, *, user_id: int) -> dict[str, int]:
    """상태별 에러 수. 없는 상태는 0이다. 사이드바 통계(D-074)용."""
    counts = {"unresolved": 0, "resolved": 0}
    query = select(ErrorRecord.status, func.count()).where(ErrorRecord.user_id == user_id).group_by(ErrorRecord.status)
    for status, count in db.execute(query):
        counts[status] = count
    return counts


def count_reused_resolved(db: Session, *, user_id: int) -> int:
    """"이 방법 적용"으로 저장한 해결 기록 수. 원본을 가리키는(reused_from_id가 있는) 해결된 에러를 센다. (D-074, D-080)"""
    query = select(func.count()).where(
        ErrorRecord.user_id == user_id, ErrorRecord.status == "resolved", ErrorRecord.reused_from_id.is_not(None)
    )
    return db.scalar(query) or 0


def count_errors_by_tag_and_status(db: Session, *, user_id: int) -> dict[int, tuple[int, int]]:
    """태그 id별 (전체, 미해결) 기록 수. 기록이 없는 태그는 키가 없다. 통계 탭(A-025, D-129)용."""
    query = (
        select(
            ErrorTag.tag_id,
            func.count(),
            func.coalesce(func.sum(case((ErrorRecord.status == "unresolved", 1), else_=0)), 0),
        )
        .join(ErrorRecord, ErrorRecord.id == ErrorTag.error_id)
        .join(Tag, Tag.id == ErrorTag.tag_id)
        .where(ErrorRecord.user_id == user_id, Tag.user_id == user_id)
        .group_by(ErrorTag.tag_id)
    )
    return {tag_id: (int(total), int(unresolved)) for tag_id, total, unresolved in db.execute(query)}


def count_apply_attempts(db: Session, since: str, *, user_id: int) -> tuple[int, int]:
    """"기존 기록 #N의 해결 방법 적용" 시도 중 since 이후 것의 (전체, solved) 수. 내 기록의 시도만. (D-129)

    created_at은 한국 시간 ISO 8601이라 문자열 비교가 시간순 비교와 같다. (D-015)
    집계 조건은 그것을 만드는 함수가 읽는다는 D-126 해석에 따라 attempts 테이블을 여기서 읽는다.
    """
    query = (
        select(func.count(), func.coalesce(func.sum(case((Attempt.result == "solved", 1), else_=0)), 0))
        .select_from(Attempt)
        .join(ErrorRecord, ErrorRecord.id == Attempt.error_id)
        .where(
            ErrorRecord.user_id == user_id,
            Attempt.action.like("기존 기록 #%의 해결 방법 적용"),
            Attempt.created_at >= since,
        )
    )
    total, solved = db.execute(query).one()
    return int(total), int(solved)


def avg_attempts_fresh_resolved(db: Session, *, user_id: int) -> float | None:
    """해결됨 + reused_from_id가 없는 기록의 시도 수 평균. 해당 기록이 없으면 None. (D-129)"""
    per_error = (
        select(func.count(Attempt.id).label("n"))
        .select_from(ErrorRecord)
        .join(Attempt, Attempt.error_id == ErrorRecord.id)
        .where(ErrorRecord.user_id == user_id, ErrorRecord.status == "resolved", ErrorRecord.reused_from_id.is_(None))
        .group_by(ErrorRecord.id)
        .subquery()
    )
    value = db.scalar(select(func.avg(per_error.c.n)))
    return None if value is None else float(value)


def list_messages_for_grouping(db: Session, *, user_id: int) -> list[tuple[int, str, str, str, int | None]]:
    """자주 만나는 에러 묶기용: (id, error_message, created_at, status, reused_from_id) 전체. 최근 등록순. 묶기는 라우터가 한다. (D-129)"""
    query = (
        select(
            ErrorRecord.id, ErrorRecord.error_message, ErrorRecord.created_at, ErrorRecord.status, ErrorRecord.reused_from_id
        )
        .where(ErrorRecord.user_id == user_id)
        .order_by(ErrorRecord.created_at.desc(), ErrorRecord.id.desc())
    )
    return [(i, m, c, st, r) for i, m, c, st, r in db.execute(query)]


def get_reuse_root_id(db: Session, source_id: int, error_id: int | None = None, *, user_id: int) -> int:
    """"이 방법 적용"으로 고른 기록 source_id에서 reused_from_id에 넣을 맨 처음 원본(뿌리)의 id를 구한다. (D-080)

    고른 기록이 이미 재사용 기록이면 그 기록의 reused_from_id를 돌려준다. error_id는 이미 있는 기록에 연결할 때
    (A-006) 그 기록의 id다. 쓸 수 없으면 ValueError(화면에 보여줄 문구)를 던진다: 없는 기록(남의 기록 포함), 해결되지 않은 원본, 자기 자신.
    고른 기록과 뿌리 모두 내 기록이어야 한다. (D-105)
    """
    source = get_owned_error(db, user_id=user_id, error_id=source_id)
    if source is None:
        raise ValueError("재사용할 기록을 찾을 수 없어요.")
    root_id = source.reused_from_id or source.id
    if error_id is not None and error_id in (source.id, root_id):
        raise ValueError("자기 자신은 재사용할 수 없어요.")
    root = source if root_id == source.id else get_owned_error(db, user_id=user_id, error_id=root_id)
    if root is None or root.status != "resolved":
        raise ValueError("해결된 기록만 재사용할 수 있어요.")
    return root_id


def count_reuses_by_ids(db: Session, error_ids: list[int], *, user_id: int) -> dict[int, int]:
    """원본마다 재사용 기록(자식) 수. 없으면 키가 없다(0으로 본다). 태그·시리즈와 상관없이 내 기록 전체 수다. (D-081)"""
    if not error_ids:
        return {}
    query = (
        select(ErrorRecord.reused_from_id, func.count())
        .where(ErrorRecord.user_id == user_id, ErrorRecord.reused_from_id.in_(error_ids))
        .group_by(ErrorRecord.reused_from_id)
    )
    return {root_id: count for root_id, count in db.execute(query)}


def list_reuses(db: Session, root_id: int, *, user_id: int) -> list[ErrorRecord]:
    """원본의 재사용 기록을 날짜순(오래된 것 먼저)으로. 상세(A-009)의 타임라인에 쓴다. (D-081)"""
    query = (
        select(ErrorRecord)
        .where(ErrorRecord.user_id == user_id, ErrorRecord.reused_from_id == root_id)
        .order_by(ErrorRecord.created_at, ErrorRecord.id)
    )
    return list(db.scalars(query))


def fill_reused_from(db: Session, error: ErrorRecord, root_id: int, *, user_id: int) -> None:
    """이어서 해결하기(A-006)에서 "이 방법 적용"을 했을 때, 그 기록의 reused_from_id가 비어 있을 때만 채운다. (D-080)

    root_id는 get_reuse_root_id()로 구한 내 기록의 id다. 커밋은 호출하는 쪽에서 한다.
    """
    assert_owner(error, user_id)
    if error.reused_from_id is None:
        error.reused_from_id = root_id
        db.flush()


def list_errors(
    db: Session,
    status: Literal["unresolved", "resolved"] | None,
    tag_ids: list[int],
    q: str | None,
    series_id: int | None = None,
    stale: bool = False,
    *,
    user_id: int,
) -> list[ErrorRecord]:
    """내 기록 목록 (A-008). 최근 등록 순, 같으면 id가 큰 것이 먼저. tag_ids는 중복 없이 넘긴다.

    series_id가 있으면 그 시리즈의 에러만, 시리즈 안 순서(series_order)대로 돌려준다. (D-042, D-051)
    남의 시리즈·태그 ID는 없는 ID와 같게 빈 결과가 된다. (D-105)
    stale이 True이면 오래된 기록(미해결 + 등록 14일 이상)만 돌려준다. (D-078)
    q는 에러 메시지·한 줄 정리·상황·시도 내용 중 하나라도 포함하면 찾는다. (D-126)
    """
    query = select(ErrorRecord).where(ErrorRecord.user_id == user_id)
    if series_id is not None:
        query = query.where(ErrorRecord.series_id == series_id)
    if stale:
        query = query.where(ErrorRecord.status == "unresolved", ErrorRecord.created_at <= stale_cutoff())
    if status:
        query = query.where(ErrorRecord.status == status)
    if q:
        # 대소문자 무시, 사용자가 입력한 %·_는 글자 그대로 찾는다
        # 시도 내용은 attempts 테이블이지만 목록 조건의 일부라 여기서 서브쿼리로 읽는다 (D-126, D-016 해석)
        has_action = (
            select(Attempt.error_id)
            .where(Attempt.error_id == ErrorRecord.id, Attempt.action.icontains(q, autoescape=True))
            .exists()
        )
        query = query.where(
            or_(
                ErrorRecord.error_message.icontains(q, autoescape=True),
                ErrorRecord.summary.icontains(q, autoescape=True),
                ErrorRecord.situation.icontains(q, autoescape=True),
                has_action,
            )
        )
    if tag_ids:
        # 고른 태그를 모두 가진 에러만: 고른 태그 중 붙어 있는 개수가 고른 개수와 같아야 한다. 남의 태그는 세지 않는다.
        has_all_tags = (
            select(ErrorTag.error_id)
            .join(Tag, Tag.id == ErrorTag.tag_id)
            .where(ErrorTag.tag_id.in_(tag_ids), Tag.user_id == user_id)
            .group_by(ErrorTag.error_id)
            .having(func.count() == len(tag_ids))
        )
        query = query.where(ErrorRecord.id.in_(has_all_tags))
    if series_id is not None:
        query = query.order_by(ErrorRecord.series_order, ErrorRecord.id)
    else:
        query = query.order_by(ErrorRecord.created_at.desc(), ErrorRecord.id.desc())
    return list(db.scalars(query))


def get_matching_actions(db: Session, error_ids: list[int], q: str, *, user_id: int) -> dict[int, str]:
    """검색어(q)가 걸린 시도 중 seq가 가장 작은 것의 action을 에러마다 돌려준다. 걸린 시도가 없는 에러는 빠진다. (D-126)

    목록 전체를 한 번에 가져온다 (N+1 조회 방지). ErrorRecord와 조인해 내 기록의 시도만 읽는다. (D-105)
    """
    if not error_ids:
        return {}
    query = (
        select(Attempt.error_id, Attempt.action)
        .join(ErrorRecord, ErrorRecord.id == Attempt.error_id)
        .where(
            Attempt.error_id.in_(error_ids),
            ErrorRecord.user_id == user_id,
            Attempt.action.icontains(q, autoescape=True),
        )
        .order_by(Attempt.error_id, Attempt.seq)
    )
    found: dict[int, str] = {}
    for error_id, action in db.execute(query):
        found.setdefault(error_id, action)
    return found


def get_tags_by_error_ids(db: Session, error_ids: list[int], *, user_id: int) -> dict[int, list[Tag]]:
    """에러마다 붙은 태그(이름순). 목록 전체를 한 번에 가져온다 (N+1 조회 방지). 내 태그만 돌려준다."""
    tags: dict[int, list[Tag]] = {error_id: [] for error_id in error_ids}
    if not error_ids:
        return tags
    query = (
        select(ErrorTag.error_id, Tag)
        .join(Tag, Tag.id == ErrorTag.tag_id)
        .where(ErrorTag.error_id.in_(error_ids), Tag.user_id == user_id)
        .order_by(Tag.name_key, Tag.id)
    )
    for error_id, tag in db.execute(query):
        tags[error_id].append(tag)
    return tags


def list_resolved_errors(db: Session, *, user_id: int) -> list[ErrorRecord]:
    """비슷한 기록 검색(A-003)의 후보. 한 줄 정리(해결법)가 있는 해결된 기록만 돌려준다. 내 기록 안에서만. (D-040)"""
    query = select(ErrorRecord).where(ErrorRecord.user_id == user_id, ErrorRecord.status == "resolved")
    return list(db.scalars(query))


def _require_own_refs(db: Session, user_id: int, series_id: int | None, tag_ids: list[int]) -> None:
    """series_id·tag_ids가 모두 내 것인지 확인한다. 아니면 ValueError. 라우터가 먼저 검사하므로 정상 흐름에서는 일어나지 않는다. (D-105)"""
    if series_id is not None:
        owned = db.scalar(select(Series.id).where(Series.id == series_id, Series.user_id == user_id))
        if owned is None:
            raise ValueError("없는 시리즈예요.")
    unique_ids = set(tag_ids)
    if unique_ids:
        count = db.scalar(select(func.count()).where(Tag.id.in_(unique_ids), Tag.user_id == user_id)) or 0
        if count != len(unique_ids):
            raise ValueError("없는 태그 ID가 있어요.")


def _next_series_order(db: Session, user_id: int, series_id: int) -> int:
    last = db.scalar(
        select(func.max(ErrorRecord.series_order)).where(
            ErrorRecord.user_id == user_id, ErrorRecord.series_id == series_id
        )
    )
    return (last or 0) + 1


def create_error(
    db: Session,
    error_message: str,
    situation: str | None,
    series_id: int | None,
    tag_ids: list[int],
    reused_from_id: int | None = None,
    *,
    user_id: int,
) -> ErrorRecord:
    """미해결 상태로 저장한다. reused_from_id는 get_reuse_root_id()로 구한 뿌리 id다. (D-080) 커밋은 호출하는 쪽에서 한다. 새 시리즈·태그와 한 트랜잭션으로 묶기 위해서다. (D-025)

    시리즈에 넣으면 그 시리즈의 마지막 순서 + 1을 series_order로 매긴다. 에러를 만드는 어느 경로(에러 등록,
    비슷한 기록의 "이 방법 적용")든 여기를 거치므로 순서 매기기는 이 한 곳에 둔다. (D-051)
    series_id·tag_ids·reused_from_id는 모두 내 것이어야 한다. 아니면 ValueError. (D-105)
    """
    _require_own_refs(db, user_id, series_id, tag_ids)
    if reused_from_id is not None and get_owned_error(db, user_id=user_id, error_id=reused_from_id) is None:
        raise ValueError("재사용할 기록을 찾을 수 없어요.")
    series_order = _next_series_order(db, user_id, series_id) if series_id is not None else None
    error = ErrorRecord(
        user_id=user_id,
        error_message=error_message,
        situation=situation,
        series_id=series_id,
        series_order=series_order,
        status="unresolved",
        reused_from_id=reused_from_id,
    )
    db.add(error)
    db.flush()
    db.add_all(ErrorTag(error_id=error.id, tag_id=tag_id) for tag_id in tag_ids)
    db.flush()
    return error


def mark_resolved(db: Session, error: ErrorRecord, summary: str, *, user_id: int) -> None:
    """팀원 2 추가 (D-030). 시도 저장과 같은 트랜잭션에서 부른다. 커밋은 호출하는 쪽에서 한다. (D-026)"""
    assert_owner(error, user_id)
    error.status = "resolved"
    error.summary = summary
    error.resolved_at = now_kst()
    db.flush()


def set_summary(db: Session, error: ErrorRecord, summary: str | None, *, user_id: int) -> None:
    """내 한 줄 정리를 바꾼다. 비우면 None이다. 상태는 바꾸지 않는다. 커밋은 호출하는 쪽에서 한다.

    A-002(기록 저장)에서는 팀원 1이, A-007(한 줄 정리 수정)에서는 팀원 2가 쓴다.
    """
    assert_owner(error, user_id)
    error.summary = summary
    db.flush()


def set_feedback(db: Session, error: ErrorRecord, feedback: str, *, user_id: int) -> None:
    """AI 피드백을 저장한다(덮어쓴다). A-016용으로 팀원 2가 쓴다. 커밋은 호출하는 쪽에서 한다."""
    assert_owner(error, user_id)
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
    user_id: int,
) -> None:
    """기록 수정 (A-010). set_*가 True인 항목만 바꾼다. tag_ids가 None이면 태그는 그대로, 목록이면 통째로 바꾼다.

    시리즈를 다른 시리즈로 옮기면 새 시리즈의 마지막 순서 + 1을 받고, 같은 시리즈면 순서를 그대로 둔다.
    시리즈를 비우면 series_order도 비운다. 커밋은 호출하는 쪽에서 한다. (D-051)
    series_id·tag_ids는 내 것이어야 한다. 아니면 ValueError. (D-105)
    """
    assert_owner(error, user_id)
    _require_own_refs(db, user_id, series_id if set_series else None, tag_ids or [])
    if set_situation:
        error.situation = situation
    if set_series and series_id != error.series_id:
        # 순서는 series_id를 바꾸기 전에 구한다. 바꾼 뒤에 구하면 자동 flush로 이 에러의 옛 순서가 새 시리즈의 최댓값에 섞인다.
        series_order = _next_series_order(db, user_id, series_id) if series_id is not None else None
        error.series_id = series_id
        error.series_order = series_order
    if tag_ids is not None:
        db.execute(delete(ErrorTag).where(ErrorTag.error_id == error.id))
        db.add_all(ErrorTag(error_id=error.id, tag_id=tag_id) for tag_id in tag_ids)
    db.flush()


def delete_error(db: Session, error: ErrorRecord, *, user_id: int) -> None:
    """기록을 지운다 (D-043). 자식 처리를 먼저 하고 attempts → error_tags → errors 순서로 지운다. CASCADE는 쓰지 않는다. (D-044)

    원본(뿌리)을 지우면 남은 재사용 기록 중 가장 오래된 것(created_at, 같으면 id 작은 것)이 새 뿌리가 된다:
    새 뿌리는 reused_from_id를 NULL로, 나머지는 새 뿌리를 가리키게 바꾼다. 재사용 기록이 없으면 하는 일이 없다. (D-121, D-080 변경)
    쓰이지 않게 된 태그·시리즈도 남긴다. (D-046)
    커밋은 호출하는 쪽에서 한다. 중간에 실패하면 커밋 전이라 아무것도 지워지지 않는다.
    """
    assert_owner(error, user_id)
    new_root = db.scalars(
        select(ErrorRecord)
        .where(ErrorRecord.user_id == user_id, ErrorRecord.reused_from_id == error.id)
        .order_by(ErrorRecord.created_at, ErrorRecord.id)
        .limit(1)
    ).first()
    if new_root is not None:
        # 나머지를 먼저 새 뿌리로 옮기고 새 뿌리를 비운다. 새 뿌리가 자기 자신을 가리키는 순간이 없게 하는 순서다.
        db.execute(
            update(ErrorRecord)
            .where(
                ErrorRecord.user_id == user_id,
                ErrorRecord.reused_from_id == error.id,
                ErrorRecord.id != new_root.id,
            )
            .values(reused_from_id=new_root.id)
        )
        db.execute(update(ErrorRecord).where(ErrorRecord.id == new_root.id).values(reused_from_id=None))
    attempts_repo.delete_by_error_id(db, error.id)  # attempts에는 user_id가 없다. 위에서 에러 소유를 확인했다. (D-086)
    db.execute(delete(ErrorTag).where(ErrorTag.error_id == error.id))
    db.delete(error)
    db.flush()


def count_errors_by_series(db: Session, *, user_id: int) -> dict[int, int]:
    """시리즈마다 속한 에러 수. 에러가 없는 시리즈는 키가 없다(0으로 본다). 시리즈 목록의 "에러 N개"에 쓴다. (D-050)"""
    query = (
        select(ErrorRecord.series_id, func.count())
        .where(ErrorRecord.user_id == user_id, ErrorRecord.series_id.is_not(None))
        .group_by(ErrorRecord.series_id)
    )
    return {series_id: count for series_id, count in db.execute(query)}


def count_errors_by_tag(db: Session, *, user_id: int) -> dict[int, int]:
    """태그마다 붙은 에러 수. 쓰이지 않는 태그는 키가 없다(0으로 본다). 삭제 확인 창의 "N개 기록에서 빠져요"에 쓴다. (D-050)"""
    query = (
        select(ErrorTag.tag_id, func.count())
        .join(Tag, Tag.id == ErrorTag.tag_id)
        .where(Tag.user_id == user_id)
        .group_by(ErrorTag.tag_id)
    )
    return {tag_id: count for tag_id, count in db.execute(query)}


def clear_series(db: Session, series_id: int, *, user_id: int) -> None:
    """시리즈를 지우기 전에 그 시리즈에 속한 에러의 소속(series_id)과 순서(series_order)를 비운다. 에러는 남는다. (D-050, D-051)

    커밋은 호출하는 쪽에서 한다.
    """
    db.execute(
        update(ErrorRecord)
        .where(ErrorRecord.user_id == user_id, ErrorRecord.series_id == series_id)
        .values(series_id=None, series_order=None)
    )


def remove_tag_links(db: Session, tag_id: int, *, user_id: int) -> None:
    """태그를 지우기 전에 그 태그의 에러 연결을 모두 지운다. 에러는 남는다. (D-050) 커밋은 호출하는 쪽에서 한다.

    error_tags에는 user_id가 없어서 내 태그일 때만 지운다.
    """
    own_tag = select(Tag.id).where(Tag.id == tag_id, Tag.user_id == user_id)
    db.execute(delete(ErrorTag).where(ErrorTag.tag_id.in_(own_tag)))


def reorder_series(db: Session, series_id: int, error_ids: list[int], *, user_id: int) -> bool:
    """그 시리즈의 에러 전체를 error_ids 순서로 바꿔 끼운다. series_order를 1부터 다시 매긴다. (D-051)

    error_ids가 내 그 시리즈에 속한 에러 ID와 정확히 같은 집합(중복·누락·다른 시리즈·남의 ID 없음)이 아니면
    아무것도 바꾸지 않고 False를 돌려준다. 커밋은 호출하는 쪽에서 한다.
    """
    query = select(ErrorRecord).where(ErrorRecord.user_id == user_id, ErrorRecord.series_id == series_id)
    errors = {error.id: error for error in db.scalars(query)}
    if len(error_ids) != len(set(error_ids)) or set(error_ids) != set(errors):
        return False
    for order, error_id in enumerate(error_ids, start=1):
        errors[error_id].series_order = order
    db.flush()
    return True
