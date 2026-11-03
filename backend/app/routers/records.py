"""팀원 1 (찾기·정리): A-002, A-003, A-004, A-008, A-009, A-010, A-011, A-012, A-013, A-014, A-015 (API-SPEC 5절).

경로는 /errors, /errors/search 처럼 전체 상대 경로로 적는다. prefix(/api)는 main.py에서 붙인다.
이번 범위는 A-002(POST /errors), A-003(POST /errors/search), A-004(GET /series, GET /tags), A-008(GET /errors), A-009(GET /errors/{id}), A-010(PATCH /errors/{id}), A-011(DELETE /errors/{id}), A-012(PATCH·DELETE /tags/{id}), A-013(PATCH·DELETE /series/{id}), A-014(PUT /series/{id}/order), A-015(POST /series)를 구현한다.
A-003(/errors/search)은 A-009(/errors/{error_id})보다 위에 선언한다. 먼저 선언한 경로가 먼저 매칭되기 때문이다.
SQL은 이 파일에 쓰지 않고 backend/app/repositories/에만 둔다. (D-016)
"""

from difflib import SequenceMatcher
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ErrorRecord, Series, Tag
from app.repositories import attempts as attempts_repo
from app.repositories import errors as errors_repo
from app.repositories import series as series_repo
from app.repositories import tags as tags_repo

router = APIRouter(tags=["records"])

MAX_TAGS = 5  # D-022
MIN_SIMILARITY = 60  # 유사도(%)가 이 값 이상인 기록만 비슷한 기록으로 본다. (D-040)


class SeriesResponse(BaseModel):
    id: int
    name: str
    description: str | None
    # 이 시리즈에 속한 에러 수. 시리즈 카드와 삭제 확인 창에 쓴다. (D-050)
    error_count: int
    created_at: str


def _series_response(series: Series, error_count: int) -> SeriesResponse:
    return SeriesResponse(
        id=series.id,
        name=series.name,
        description=series.description,
        error_count=error_count,
        created_at=series.created_at,
    )


# A-004 시리즈 목록 (R-001, D-006). 최근 만든 순, 없으면 빈 배열.
@router.get("/series", response_model=list[SeriesResponse])
def list_series(db: Session = Depends(get_db)) -> list[SeriesResponse]:
    counts = errors_repo.count_errors_by_series(db)
    return [_series_response(series, counts.get(series.id, 0)) for series in series_repo.list_series(db)]


class TagResponse(BaseModel):
    """비교용 name_key는 내보내지 않는다. 프론트가 같은 규칙으로 직접 비교한다. (API-SPEC A-004)"""

    id: int
    name: str
    # 이 태그가 붙은 에러 수. 삭제 확인 창의 "N개 기록에서 빠져요"에 쓴다. (D-050)
    error_count: int
    created_at: str


def _tag_response(tag: Tag, error_count: int) -> TagResponse:
    return TagResponse(id=tag.id, name=tag.name, error_count=error_count, created_at=tag.created_at)


# A-004 태그 목록 (R-001, D-021). 자동 완성용 전체 목록, 이름순, 없으면 빈 배열.
@router.get("/tags", response_model=list[TagResponse])
def list_tags(db: Session = Depends(get_db)) -> list[TagResponse]:
    counts = errors_repo.count_errors_by_tag(db)
    return [_tag_response(tag, counts.get(tag.id, 0)) for tag in tags_repo.list_tags(db)]


class AttemptInput(BaseModel):
    action: str
    result: Literal["solved", "failed", "partial"]  # D-028


class ErrorCreateRequest(BaseModel):
    # 상한은 A-005와 맞춘다. 저장한 메시지를 그대로 AI에게 보내기 때문이다.
    error_message: str = Field(max_length=10_000)
    situation: str | None = None
    # 시리즈는 기존 ID와 새 이름 중 하나만 보낸다. 둘 다 없으면 시리즈 없음.
    series_id: int | None = None
    new_series_name: str | None = None
    tag_ids: list[int] = []
    new_tag_names: list[str] = []
    # 화면에 모아 둔 시도. 순서대로 seq 1부터 저장한다. 1개 이상 필수. (D-064)
    attempts: list[AttemptInput] = []
    # 내 한 줄 정리. 마지막 시도가 해결됨이면 필수이고, 그 밖에는 선택이다.
    summary: str | None = None


class NamedItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class AttemptItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    seq: int
    action: str
    result: str
    created_at: str


class ErrorCreatedResponse(BaseModel):
    id: int
    error_message: str
    situation: str | None
    status: str
    summary: str | None
    resolved_at: str | None
    series: NamedItem | None
    tags: list[NamedItem]
    attempts: list[AttemptItem]
    created_at: str


def _invalid(message: str) -> HTTPException:
    return HTTPException(status_code=422, detail=message)


class SimilarSearchRequest(BaseModel):
    # 상한은 A-002와 같다. 길어서 GET 쿼리 대신 POST 본문으로 받는다.
    error_message: str = Field(max_length=10_000)


class SimilarErrorResponse(BaseModel):
    id: int
    error_message: str
    similarity: int
    summary: str
    attempt_count: int
    tags: list[NamedItem]
    resolved_at: str


def _normalize_for_compare(text: str) -> str:
    """공백 모양과 대소문자 차이는 비교하지 않는다."""
    return " ".join(text.lower().split())


def _similarity_percent(query: str, other: str) -> int | None:
    """difflib 문자 유사도를 0~100%로 바꾼다(반올림). MIN_SIMILARITY 미만이면 None. (D-040)"""
    matcher = SequenceMatcher(None, query, other)
    # 값싼 상한부터 확인해서 어차피 못 미치는 기록은 정확한 계산을 건너뛴다.
    if int(matcher.real_quick_ratio() * 100 + 0.5) < MIN_SIMILARITY or int(matcher.quick_ratio() * 100 + 0.5) < MIN_SIMILARITY:
        return None
    percent = int(matcher.ratio() * 100 + 0.5)
    return percent if percent >= MIN_SIMILARITY else None


# A-003 비슷한 기존 기록 검색 (R-002, D-040). 해결된 기록만, 유사도 높은 순. 저장하거나 바꾸지 않는다.
@router.post("/errors/search", response_model=list[SimilarErrorResponse])
def search_similar_errors(body: SimilarSearchRequest, db: Session = Depends(get_db)) -> list[SimilarErrorResponse]:
    query = _normalize_for_compare(body.error_message)
    if not query:
        raise _invalid("에러 메시지를 입력해 주세요.")

    matched: list[tuple[int, ErrorRecord]] = []
    for error in errors_repo.list_resolved_errors(db):
        percent = _similarity_percent(query, _normalize_for_compare(error.error_message))
        if percent is not None:
            matched.append((percent, error))
    # 유사도 높은 순. 같으면 최근에 만든(id가 큰) 기록이 먼저다.
    matched.sort(key=lambda item: (-item[0], -item[1].id))

    error_ids = [error.id for _, error in matched]
    tags_by_error = errors_repo.get_tags_by_error_ids(db, error_ids)
    attempt_counts = attempts_repo.count_by_error_ids(db, error_ids)
    return [
        SimilarErrorResponse(
            id=error.id,
            error_message=error.error_message,
            similarity=percent,
            summary=error.summary or "",
            attempt_count=attempt_counts.get(error.id, 0),
            tags=[NamedItem.model_validate(tag) for tag in tags_by_error.get(error.id, [])],
            resolved_at=error.resolved_at or error.created_at,
        )
        for percent, error in matched
    ]


def _resolve_tags(db: Session, tag_ids: list[int], new_tag_names: list[str]) -> tuple[list[Tag], list[str]]:
    """기존 태그와 새로 만들 태그 이름을 나눈다. 새 이름이 기존 태그와 같으면 기존 태그로 합친다. (D-019)"""
    unique_ids = list(dict.fromkeys(tag_ids))
    by_id = {tag.id: tag for tag in tags_repo.get_tags_by_ids(db, unique_ids)}
    if len(by_id) != len(unique_ids):
        raise _invalid("없는 태그 ID가 있어요.")
    chosen = [by_id[tag_id] for tag_id in unique_ids]
    chosen_keys = {tag.name_key for tag in chosen}

    new_names: dict[str, str] = {}
    for raw in new_tag_names:
        name = tags_repo.normalize_tag_name(raw)
        key = name.lower()
        if name and key not in chosen_keys and key not in new_names:
            new_names[key] = name

    found = tags_repo.get_tags_by_keys(db, list(new_names))
    chosen += [found[key] for key in new_names if key in found]
    to_create = [name for key, name in new_names.items() if key not in found]
    if len(chosen) + len(to_create) > MAX_TAGS:
        raise _invalid(f"태그는 최대 {MAX_TAGS}개까지 넣을 수 있어요.")
    return chosen, to_create


# A-002 기록 저장 (R-001, D-064). 에러와 화면에 모아 둔 시도를 "기록 저장" 때 한 번에 저장한다.
# 새 시리즈·새 태그도 이때 함께 만든다(D-011, D-020). 에러·태그 연결·시도·해결 처리까지 모두 한 트랜잭션이다.
# 마지막 시도가 해결됨이면 resolved, 아니면 unresolved다. (D-028, D-029)
@router.post("/errors", response_model=ErrorCreatedResponse, status_code=201)
def create_error(body: ErrorCreateRequest, db: Session = Depends(get_db)) -> ErrorCreatedResponse:
    error_message = body.error_message.strip()
    if not error_message:
        raise _invalid("에러 메시지를 입력해 주세요.")
    situation = (body.situation or "").strip() or None

    if not body.attempts:
        raise _invalid("시도 기록이 1개 이상 있어야 저장할 수 있어요.")
    attempts = [(attempt.action.strip(), attempt.result) for attempt in body.attempts]
    if any(not action for action, _ in attempts):
        raise _invalid("무엇을 했는지 입력해 주세요.")
    if any(result == "solved" for _, result in attempts[:-1]):
        raise _invalid("해결됨은 마지막 시도에만 쓸 수 있어요.")
    solved = attempts[-1][1] == "solved"
    summary = (body.summary or "").strip() or None
    if solved and summary is None:
        raise _invalid("해결됨으로 저장하려면 한 줄 정리를 입력해 주세요.")  # A-006과 같은 문구 (D-026)

    # 먼저 모두 검사하고, 통과하면 그때 만든다. 중간에 실패해도 커밋 전이라 아무것도 남지 않는다.
    if body.series_id is not None and body.new_series_name is not None:
        raise _invalid("시리즈는 series_id와 new_series_name 중 하나만 보내 주세요.")
    series = None
    new_series_name = None
    if body.series_id is not None:
        series = series_repo.get_series(db, body.series_id)
        if series is None:
            raise _invalid("없는 시리즈예요.")
    elif body.new_series_name is not None:
        new_series_name = body.new_series_name.strip()
        if not new_series_name:
            raise _invalid("새 시리즈 이름이 비어 있어요.")
        # 같은 이름(공백·대소문자 무시)이 이미 있으면 그 시리즈를 쓴다. (D-017)
        series = series_repo.find_series_by_name(db, new_series_name)
    tags, new_tag_names = _resolve_tags(db, body.tag_ids, body.new_tag_names)

    if series is None and new_series_name:
        series = series_repo.create_series(db, new_series_name)
    tags += [tags_repo.create_tag(db, name) for name in new_tag_names]
    error = errors_repo.create_error(db, error_message, situation, series.id if series else None, [tag.id for tag in tags])
    saved = [attempts_repo.create_attempt(db, error.id, seq, action, result) for seq, (action, result) in enumerate(attempts, 1)]
    if solved:
        errors_repo.mark_resolved(db, error, summary)  # 팀원 2 함수 그대로 (D-030)
    else:
        errors_repo.set_summary(db, error, summary)  # 미해결에도 한 줄 정리는 선택으로 저장한다
    db.commit()

    return ErrorCreatedResponse(
        id=error.id,
        error_message=error.error_message,
        situation=error.situation,
        status=error.status,
        summary=error.summary,
        resolved_at=error.resolved_at,
        series=NamedItem.model_validate(series) if series else None,
        tags=[NamedItem.model_validate(tag) for tag in tags],
        attempts=[AttemptItem.model_validate(attempt) for attempt in saved],
        created_at=error.created_at,
    )


class ErrorListItem(BaseModel):
    id: int
    error_message: str
    status: str
    series: NamedItem | None
    # 시리즈 안 순서. 시리즈가 없으면 None. 화면은 이 값이 아니라 목록 위치를 순서 번호로 보여준다. (D-051)
    series_order: int | None
    tags: list[NamedItem]
    attempt_count: int
    created_at: str
    resolved_at: str | None


class ErrorDetailResponse(ErrorListItem):
    situation: str | None
    summary: str | None
    # AI 피드백. 이전 기록이나 받기에 실패한 기록은 None이다. 목록(A-008)에는 넣지 않는다. (Q-003)
    ai_feedback: str | None
    attempts: list[AttemptItem]


def _list_items(db: Session, errors: list[ErrorRecord]) -> list[ErrorListItem]:
    """시리즈·태그·시도 수를 에러마다 따로 조회하지 않고 한 번씩 모아서 가져온다 (N+1 조회 방지)."""
    error_ids = [error.id for error in errors]
    series = series_repo.get_series_by_ids(db, {error.series_id for error in errors if error.series_id is not None})
    tags = errors_repo.get_tags_by_error_ids(db, error_ids)
    counts = attempts_repo.count_by_error_ids(db, error_ids)
    return [
        ErrorListItem(
            id=error.id,
            error_message=error.error_message,
            status=error.status,
            series=NamedItem.model_validate(series[error.series_id]) if error.series_id in series else None,
            series_order=error.series_order,
            tags=[NamedItem.model_validate(tag) for tag in tags[error.id]],
            attempt_count=counts[error.id],
            created_at=error.created_at,
            resolved_at=error.resolved_at,
        )
        for error in errors
    ]


# A-008 내 기록 목록 (R-005, D-035, D-036). 필터는 모두 선택이고, 함께 쓰면 모두 만족하는 기록만 준다.
@router.get("/errors", response_model=list[ErrorListItem])
def list_errors(
    status: Literal["unresolved", "resolved"] | None = None,
    # 고른 태그를 모두 가진 에러만. 없는 태그 ID면 빈 결과다 (필터 결과로 본다).
    tag_id: list[int] = Query(default=[]),
    q: str | None = Query(default=None, max_length=200),
    # 그 시리즈의 에러만, 시리즈 안 순서대로. 없는 시리즈 ID면 빈 결과다. (D-042, D-051)
    series_id: int | None = None,
    db: Session = Depends(get_db),
) -> list[ErrorListItem]:
    keyword = (q or "").strip() or None
    errors = errors_repo.list_errors(db, status, list(dict.fromkeys(tag_id)), keyword, series_id)
    return _list_items(db, errors)


# A-009 에러 일기 상세 (R-004, R-005, D-031). 시도는 시도 번호 순서.
@router.get("/errors/{error_id}", response_model=ErrorDetailResponse)
def get_error_detail(error_id: int, db: Session = Depends(get_db)) -> ErrorDetailResponse:
    error = errors_repo.get_error(db, error_id)
    if error is None:
        raise HTTPException(status_code=404, detail="에러 기록을 찾을 수 없어요.")
    item = _list_items(db, [error])[0]
    return ErrorDetailResponse(
        **item.model_dump(),
        situation=error.situation,
        summary=error.summary,
        ai_feedback=error.ai_feedback,
        attempts=[AttemptItem.model_validate(attempt) for attempt in attempts_repo.list_attempts(db, error.id)],
    )


class ErrorUpdateRequest(BaseModel):
    """보낸 필드만 바꾼다. error_message는 받지 않는다(보내도 무시). 시리즈는 series_id와 new_series_name 중 하나만."""

    situation: str | None = None
    series_id: int | None = None
    new_series_name: str | None = None
    tag_ids: list[int] | None = None
    new_tag_names: list[str] | None = None


# A-010 기록 수정 (R-005, D-047, D-048). 태그·시리즈·상황만 고친다. 먼저 모두 검사하고 한 트랜잭션으로 바꾼다.
@router.patch("/errors/{error_id}", response_model=ErrorDetailResponse)
def update_error(error_id: int, body: ErrorUpdateRequest, db: Session = Depends(get_db)) -> ErrorDetailResponse:
    error = errors_repo.get_error(db, error_id)
    if error is None:
        raise HTTPException(status_code=404, detail="에러 기록을 찾을 수 없어요.")
    sent = body.model_fields_set

    set_situation = "situation" in sent
    situation = (body.situation or "").strip() or None

    if body.series_id is not None and body.new_series_name is not None:
        raise _invalid("시리즈는 series_id와 new_series_name 중 하나만 보내 주세요.")
    set_series = "series_id" in sent or "new_series_name" in sent
    series = None
    new_series_name = None
    if body.series_id is not None:
        series = series_repo.get_series(db, body.series_id)
        if series is None:
            raise _invalid("없는 시리즈예요.")
    elif body.new_series_name is not None:
        new_series_name = body.new_series_name.strip()
        if not new_series_name:
            raise _invalid("새 시리즈 이름이 비어 있어요.")
        series = series_repo.find_series_by_name(db, new_series_name)

    tags = None
    new_tag_names: list[str] = []
    if "tag_ids" in sent or "new_tag_names" in sent:
        tags, new_tag_names = _resolve_tags(db, body.tag_ids or [], body.new_tag_names or [])

    if series is None and new_series_name:
        series = series_repo.create_series(db, new_series_name)
    if tags is not None:
        tags += [tags_repo.create_tag(db, name) for name in new_tag_names]
    errors_repo.update_error(
        db,
        error,
        set_situation=set_situation,
        situation=situation,
        set_series=set_series,
        series_id=series.id if series else None,
        tag_ids=[tag.id for tag in tags] if tags is not None else None,
    )
    db.commit()
    return get_error_detail(error_id, db)


# A-011 기록 삭제 (R-005, D-043, D-044). 시도·태그 연결까지 한 트랜잭션으로 지운다. 쓰이지 않게 된 태그·시리즈는 남긴다. (D-046)
@router.delete("/errors/{error_id}", status_code=204)
def delete_error(error_id: int, db: Session = Depends(get_db)) -> None:
    error = errors_repo.get_error(db, error_id)
    if error is None:
        raise HTTPException(status_code=404, detail="에러 기록을 찾을 수 없어요.")
    errors_repo.delete_error(db, error)
    db.commit()


NAME_TAKEN = "이미 있는 이름이에요."  # D-049


class TagRenameRequest(BaseModel):
    name: str


# A-012 태그 이름 변경 (R-005, D-019, D-049). 같은 이름(정규화 후 같은 name_key)이 다른 태그에 있으면 409.
@router.patch("/tags/{tag_id}", response_model=TagResponse)
def rename_tag(tag_id: int, body: TagRenameRequest, db: Session = Depends(get_db)) -> TagResponse:
    tag = tags_repo.get_tag(db, tag_id)
    if tag is None:
        raise HTTPException(status_code=404, detail="태그를 찾을 수 없어요.")
    name = tags_repo.normalize_tag_name(body.name)
    if not name:
        raise _invalid("태그 이름을 입력해 주세요.")
    if tags_repo.find_other_tag_by_key(db, name.lower(), tag.id) is not None:
        raise HTTPException(status_code=409, detail=NAME_TAKEN)
    tags_repo.rename_tag(db, tag, name)
    try:
        db.commit()
    except IntegrityError:
        # 확인한 뒤 다른 요청이 같은 이름을 먼저 저장한 경우(name_key UNIQUE)
        db.rollback()
        raise HTTPException(status_code=409, detail=NAME_TAKEN)
    return _tag_response(tag, errors_repo.count_errors_by_tag(db).get(tag.id, 0))


# A-012 태그 삭제 (R-005, D-050). 쓰이는 태그도 지울 수 있고, 에러 연결만 지워진다. 에러는 남는다.
@router.delete("/tags/{tag_id}", status_code=204)
def delete_tag(tag_id: int, db: Session = Depends(get_db)) -> None:
    tag = tags_repo.get_tag(db, tag_id)
    if tag is None:
        raise HTTPException(status_code=404, detail="태그를 찾을 수 없어요.")
    tags_repo.delete_tag(db, tag)
    db.commit()


class SeriesCreateRequest(BaseModel):
    name: str
    description: str | None = None


# A-015 시리즈 새로 만들기 (R-005, D-017, D-049, D-054, D-061). 같은 이름(공백 제외·대소문자 무시)이면 409.
@router.post("/series", response_model=SeriesResponse, status_code=201)
def create_series(body: SeriesCreateRequest, db: Session = Depends(get_db)) -> SeriesResponse:
    name = body.name.strip()
    if not name:
        raise _invalid("시리즈 이름을 입력해 주세요.")
    if series_repo.find_series_by_name(db, name) is not None:
        raise HTTPException(status_code=409, detail=NAME_TAKEN)
    series = series_repo.create_series(db, name, (body.description or "").strip() or None)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=NAME_TAKEN)
    return _series_response(series, 0)


class SeriesUpdateRequest(BaseModel):
    # 보낸 필드만 바꾼다. description은 null로 보내면 설명을 지운다(보내지 않으면 그대로).
    name: str | None = None
    description: str | None = None


# A-013 시리즈 이름·설명 변경 (R-005, D-017, D-049, D-054)
@router.patch("/series/{series_id}", response_model=SeriesResponse)
def update_series(series_id: int, body: SeriesUpdateRequest, db: Session = Depends(get_db)) -> SeriesResponse:
    series = series_repo.get_series(db, series_id)
    if series is None:
        raise HTTPException(status_code=404, detail="시리즈를 찾을 수 없어요.")
    sent = body.model_fields_set
    if "name" in sent:
        name = (body.name or "").strip()
        if not name:
            raise _invalid("시리즈 이름을 입력해 주세요.")
        if series_repo.find_other_series_by_name(db, name, series.id) is not None:
            raise HTTPException(status_code=409, detail=NAME_TAKEN)
        series_repo.rename_series(db, series, name)
    if "description" in sent:
        series_repo.set_description(db, series, (body.description or "").strip() or None)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=NAME_TAKEN)
    return _series_response(series, errors_repo.count_errors_by_series(db).get(series.id, 0))


# A-013 시리즈 삭제 (R-005, D-050). 속한 에러의 소속만 비워지고 에러는 남는다.
@router.delete("/series/{series_id}", status_code=204)
def delete_series(series_id: int, db: Session = Depends(get_db)) -> None:
    series = series_repo.get_series(db, series_id)
    if series is None:
        raise HTTPException(status_code=404, detail="시리즈를 찾을 수 없어요.")
    series_repo.delete_series(db, series)
    db.commit()


class SeriesOrderRequest(BaseModel):
    # 그 시리즈의 에러 ID 전체를 원하는 순서대로
    error_ids: list[int]


# A-014 시리즈 안 순서 바꾸기 (R-005, D-051). 전체를 바꿔 끼운다. ID가 그 시리즈의 에러와 정확히 같지 않으면 422.
@router.put("/series/{series_id}/order", response_model=list[ErrorListItem])
def reorder_series(series_id: int, body: SeriesOrderRequest, db: Session = Depends(get_db)) -> list[ErrorListItem]:
    if series_repo.get_series(db, series_id) is None:
        raise HTTPException(status_code=404, detail="시리즈를 찾을 수 없어요.")
    if not errors_repo.reorder_series(db, series_id, body.error_ids):
        raise _invalid("순서를 바꿀 기록이 시리즈의 기록과 맞지 않아요. 화면을 새로 고쳐 주세요.")
    db.commit()
    return _list_items(db, errors_repo.list_errors(db, None, [], None, series_id))
