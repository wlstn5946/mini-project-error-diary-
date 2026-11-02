"""팀원 1 (찾기·정리): A-002, A-003, A-004, A-008 (API-SPEC 5절).

경로는 /errors, /errors/search 처럼 전체 상대 경로로 적는다. prefix(/api)는 main.py에서 붙인다.
이번 범위는 A-002(POST /errors), A-003(POST /errors/search), A-004(GET /series, GET /tags)만 구현한다. 나머지는 후보 상태 그대로다.
SQL은 이 파일에 쓰지 않고 backend/app/repositories/에만 둔다. (D-016)
"""

from difflib import SequenceMatcher

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ErrorRecord, Tag
from app.repositories import attempts as attempts_repo
from app.repositories import errors as errors_repo
from app.repositories import series as series_repo
from app.repositories import tags as tags_repo

router = APIRouter(tags=["records"])

MAX_TAGS = 5  # D-022
MIN_SIMILARITY = 60  # 유사도(%)가 이 값 이상인 기록만 비슷한 기록으로 본다. (D-035)


class SeriesResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    created_at: str


# A-004 시리즈 목록 (R-001, D-006). 최근 만든 순, 없으면 빈 배열.
@router.get("/series", response_model=list[SeriesResponse])
def list_series(db: Session = Depends(get_db)) -> list[SeriesResponse]:
    return [SeriesResponse.model_validate(series) for series in series_repo.list_series(db)]


class TagResponse(BaseModel):
    """비교용 name_key는 내보내지 않는다. 프론트가 같은 규칙으로 직접 비교한다. (API-SPEC A-004)"""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    created_at: str


# A-004 태그 목록 (R-001, D-021). 자동 완성용 전체 목록, 이름순, 없으면 빈 배열.
@router.get("/tags", response_model=list[TagResponse])
def list_tags(db: Session = Depends(get_db)) -> list[TagResponse]:
    return [TagResponse.model_validate(tag) for tag in tags_repo.list_tags(db)]


class ErrorCreateRequest(BaseModel):
    # 상한은 A-005와 맞춘다. 저장한 메시지를 그대로 AI에게 보내기 때문이다.
    error_message: str = Field(max_length=10_000)
    situation: str | None = None
    # 시리즈는 기존 ID와 새 이름 중 하나만 보낸다. 둘 다 없으면 시리즈 없음.
    series_id: int | None = None
    new_series_name: str | None = None
    tag_ids: list[int] = []
    new_tag_names: list[str] = []


class NamedItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class ErrorCreatedResponse(BaseModel):
    id: int
    error_message: str
    situation: str | None
    status: str
    series: NamedItem | None
    tags: list[NamedItem]
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
    """difflib 문자 유사도를 0~100%로 바꾼다(반올림). MIN_SIMILARITY 미만이면 None. (D-035)"""
    matcher = SequenceMatcher(None, query, other)
    # 값싼 상한부터 확인해서 어차피 못 미치는 기록은 정확한 계산을 건너뛴다.
    if int(matcher.real_quick_ratio() * 100 + 0.5) < MIN_SIMILARITY or int(matcher.quick_ratio() * 100 + 0.5) < MIN_SIMILARITY:
        return None
    percent = int(matcher.ratio() * 100 + 0.5)
    return percent if percent >= MIN_SIMILARITY else None


# A-003 비슷한 기존 기록 검색 (R-002, D-035). 해결된 기록만, 유사도 높은 순. 저장하거나 바꾸지 않는다.
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
    tags_by_error = tags_repo.list_tags_by_error_ids(db, error_ids)
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


# A-002 에러 등록 (R-001, D-024, D-025). 새 에러로 확정되는 순간 미해결로 저장한다.
# 새 시리즈·새 태그도 이때 함께 만든다(D-011, D-020). 모두 한 트랜잭션이다.
@router.post("/errors", response_model=ErrorCreatedResponse, status_code=201)
def create_error(body: ErrorCreateRequest, db: Session = Depends(get_db)) -> ErrorCreatedResponse:
    error_message = body.error_message.strip()
    if not error_message:
        raise _invalid("에러 메시지를 입력해 주세요.")
    situation = (body.situation or "").strip() or None

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
    db.commit()

    return ErrorCreatedResponse(
        id=error.id,
        error_message=error.error_message,
        situation=error.situation,
        status=error.status,
        series=NamedItem.model_validate(series) if series else None,
        tags=[NamedItem.model_validate(tag) for tag in tags],
        created_at=error.created_at,
    )
