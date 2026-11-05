"""팀원 1 (찾기·정리): A-002, A-003, A-004, A-008, A-009, A-010, A-011, A-012, A-013, A-014, A-015 (API-SPEC 5절).

경로는 /errors, /errors/search 처럼 전체 상대 경로로 적는다. prefix(/api)는 main.py에서 붙인다.
이번 범위는 A-002(POST /errors), A-003(POST /errors/search), A-004(GET /series, GET /tags), A-008(GET /errors), A-009(GET /errors/{id}), A-010(PATCH /errors/{id}), A-011(DELETE /errors/{id}), A-012(PATCH·DELETE /tags/{id}), A-013(PATCH·DELETE /series/{id}), A-014(PUT /series/{id}/order), A-015(POST /series)를 구현한다.
A-003(/errors/search)은 A-009(/errors/{error_id})보다 위에 선언한다. 먼저 선언한 경로가 먼저 매칭되기 때문이다.
SQL은 이 파일에 쓰지 않고 backend/app/repositories/에만 둔다. (D-016)
계정별 분리 (D-086, D-087, D-105): 모든 핸들러가 현재 사용자를 받아 repository에 user_id로 넘긴다. 남의 리소스는 없는 것과 똑같이 처리한다.
"""

import re
from difflib import SequenceMatcher
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db import get_db
from app.error_text import key_line, mask_variable_parts
from app.models import ErrorRecord, Series, Tag, TagAlias, User
from app.repositories import attempts as attempts_repo
from app.repositories import errors as errors_repo
from app.repositories import series as series_repo
from app.repositories import tag_aliases as aliases_repo
from app.repositories import tags as tags_repo
from app.security import get_current_user

router = APIRouter(tags=["records"])

MAX_TAGS = 5  # D-022
MAX_TAG_NAME = 20  # 태그 이름과 별칭의 최대 글자 수(정규화한 뒤 센다). D-115
TAG_NAME_TOO_LONG = f"태그 이름은 {MAX_TAG_NAME}자까지 쓸 수 있어요."
ALIAS_TOO_LONG = f"별칭은 {MAX_TAG_NAME}자까지 쓸 수 있어요."
MIN_SIMILARITY = 60  # 유사도(%)가 이 값 이상인 기록만 비슷한 기록으로 본다. (D-040)
# 써 보기 성공률은 이 시각 이후 시도만 센다. D-128 이전의 "이 방법 적용"은 무조건 해결됨으로 저장됐다. (D-129)
APPLY_TRIAL_SINCE = "2026-11-05T00:00:00+09:00"


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
def list_series(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[SeriesResponse]:
    counts = errors_repo.count_errors_by_series(db, user_id=user.id)
    return [_series_response(series, counts.get(series.id, 0)) for series in series_repo.list_series(db, user_id=user.id)]


class TagResponse(BaseModel):
    """비교용 name_key는 내보내지 않는다. 프론트가 같은 규칙으로 직접 비교한다. (API-SPEC A-004)"""

    id: int
    name: str
    # 이 태그가 붙은 에러 수. 삭제 확인 창의 "N개 기록에서 빠져요"에 쓴다. (D-050)
    error_count: int
    created_at: str
    # 이 태그의 별칭(이름순). 별칭이 없으면 빈 배열. (D-114)
    aliases: list["AliasItem"] = []


class AliasItem(BaseModel):
    id: int
    name: str


TagResponse.model_rebuild()


def _tag_response(tag: Tag, error_count: int, aliases: list[TagAlias] | None = None) -> TagResponse:
    return TagResponse(
        id=tag.id,
        name=tag.name,
        error_count=error_count,
        created_at=tag.created_at,
        aliases=[AliasItem(id=a.id, name=a.alias) for a in aliases or []],
    )


# A-004 태그 목록 (R-001, D-021). 자동 완성용 전체 목록, 이름순, 없으면 빈 배열.
@router.get("/tags", response_model=list[TagResponse])
def list_tags(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[TagResponse]:
    counts = errors_repo.count_errors_by_tag(db, user_id=user.id)
    tags = tags_repo.list_tags(db, user_id=user.id)
    aliases = aliases_repo.list_aliases_by_tag_ids(db, [tag.id for tag in tags], user_id=user.id)  # 한 번의 쿼리
    return [_tag_response(tag, counts.get(tag.id, 0), aliases.get(tag.id)) for tag in tags]


def _tag_response_for(db: Session, tag: Tag, user_id: int) -> TagResponse:
    """한 태그를 A-004 목록 항목과 같은 모양으로 만든다."""
    count = errors_repo.count_errors_by_tag(db, user_id=user_id).get(tag.id, 0)
    aliases = aliases_repo.list_aliases_by_tag_ids(db, [tag.id], user_id=user_id)
    return _tag_response(tag, count, aliases.get(tag.id))


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
    # "이 방법 적용"으로 고른 기록의 id. 서버가 맨 처음 원본으로 바꿔 저장한다. (D-080)
    reused_from_id: int | None = None


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
    # 핵심 줄 비교 값이 전체 비교 값보다 클 때만 key_line, 같거나 작으면 full (D-118)
    matched_by: Literal["full", "key_line"]
    summary: str
    attempt_count: int
    tags: list[NamedItem]
    resolved_at: str
    # 이 기록(뿌리)을 가리키는 재사용 기록 수. 내 기록의 "재사용 N"과 같은 값이다. (D-121)
    reuse_count: int


def _normalize_for_compare(text: str) -> str:
    """공백 모양과 대소문자 차이는 비교하지 않는다."""
    return " ".join(text.lower().split())


def _normalize_masked(text: str) -> str:
    """비교용: 경로·줄 번호·주소를 자리표시자로 바꾼 뒤 공백·대소문자를 정리한다. 저장·표시에는 쓰지 않는다. (D-122)"""
    return _normalize_for_compare(mask_variable_parts(text))


def _similarity_percent(query: str, other: str) -> int | None:
    """difflib 문자 유사도를 0~100%로 바꾼다(반올림). MIN_SIMILARITY 미만이면 None. (D-040)"""
    matcher = SequenceMatcher(None, query, other)
    # 값싼 상한부터 확인해서 어차피 못 미치는 기록은 정확한 계산을 건너뛴다.
    if int(matcher.real_quick_ratio() * 100 + 0.5) < MIN_SIMILARITY or int(matcher.quick_ratio() * 100 + 0.5) < MIN_SIMILARITY:
        return None
    percent = int(matcher.ratio() * 100 + 0.5)
    return percent if percent >= MIN_SIMILARITY else None


# A-003 비슷한 기존 기록 검색 (R-002, D-040, D-121, D-122). 해결된 기록만, 뿌리 기준으로 묶어 카드 1장, 유사도 높은 순. 저장하거나 바꾸지 않는다.
@router.post("/errors/search", response_model=list[SimilarErrorResponse])
def search_similar_errors(
    body: SimilarSearchRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[SimilarErrorResponse]:
    if not _normalize_for_compare(body.error_message):
        raise _invalid("에러 메시지를 입력해 주세요.")
    # 비교 전에 경로·줄 번호·메모리 주소를 자리표시자로 바꾼다. 핵심 줄은 원문에서 찾고 그 줄에 마스킹한다. (D-122)
    query = _normalize_masked(body.error_message)

    # 전체 비교와 핵심 줄 비교(D-117) 중 높은 값을 유사도로 쓴다. 핵심 줄이 비어 있으면 핵심 줄 비교는 하지 않는다. (D-118)
    query_key = _normalize_masked(key_line(body.error_message)[0])

    # 해결된 기록 전부(재사용 기록 포함)를 비교하고, 뿌리(reused_from_id or id) 기준으로 묶는다. (D-121)
    candidates = errors_repo.list_resolved_errors(db, user_id=user.id)
    by_id = {error.id: error for error in candidates}
    groups: dict[int, list[tuple[int, Literal["full", "key_line"], ErrorRecord]]] = {}
    for error in candidates:
        percent = _similarity_percent(query, _normalize_masked(error.error_message))
        matched_by: Literal["full", "key_line"] = "full"
        if query_key:
            other_key = _normalize_masked(key_line(error.error_message)[0])
            if other_key:
                key_percent = _similarity_percent(query_key, other_key)
                if key_percent is not None and (percent is None or key_percent > percent):
                    percent, matched_by = key_percent, "key_line"
        if percent is not None:
            groups.setdefault(error.reused_from_id or error.id, []).append((percent, matched_by, error))

    # 묶음마다: 유사도·matched_by는 묶음 안 최고값(같으면 id가 큰 기록), 카드 내용은 뿌리(대표 기록)의 것이다.
    matched: list[tuple[int, Literal["full", "key_line"], ErrorRecord]] = []
    for root_id, members in groups.items():
        best_percent, best_matched_by, _ = max(members, key=lambda item: (item[0], item[2].id))
        rep = by_id.get(root_id) or errors_repo.get_owned_error(db, user_id=user.id, error_id=root_id)
        if rep is None or rep.status != "resolved":
            # 이론상 없는 경우: 묶음 안에서 가장 오래된 기록을 대표로 쓴다
            rep = min((item[2] for item in members), key=lambda e: (e.created_at, e.id))
        matched.append((best_percent, best_matched_by, rep))
    # 유사도 높은 순. 같으면 최근에 만든(id가 큰) 대표 기록이 먼저다. (D-040)
    matched.sort(key=lambda item: (-item[0], -item[2].id))

    error_ids = [error.id for _, _, error in matched]
    tags_by_error = errors_repo.get_tags_by_error_ids(db, error_ids, user_id=user.id)
    attempt_counts = attempts_repo.count_by_error_ids(db, error_ids)  # error_ids는 위에서 내 기록으로만 모았다
    reuse_counts = errors_repo.count_reuses_by_ids(db, error_ids, user_id=user.id)
    return [
        SimilarErrorResponse(
            id=error.id,
            error_message=error.error_message,
            similarity=percent,
            matched_by=matched_by,
            summary=error.summary or "",
            attempt_count=attempt_counts.get(error.id, 0),
            tags=[NamedItem.model_validate(tag) for tag in tags_by_error.get(error.id, [])],
            resolved_at=error.resolved_at or error.created_at,
            reuse_count=reuse_counts.get(error.id, 0),
        )
        for percent, matched_by, error in matched
    ]


def _resolve_tags(db: Session, user_id: int, tag_ids: list[int], new_tag_names: list[str]) -> tuple[list[Tag], list[str]]:
    """기존 태그와 새로 만들 태그 이름을 나눈다. (D-019, D-114)

    새 이름은 ① 내 태그 name_key ② 내 별칭 alias_key ③ 새 태그 순으로 찾는다. 별칭은 원래 태그로 바꾼 뒤
    같은 태그를 한 번만 센다. 별칭은 한 번의 쿼리로 찾는다(key마다 조회하지 않는다).
    """
    unique_ids = list(dict.fromkeys(tag_ids))
    by_id = {tag.id: tag for tag in tags_repo.get_tags_by_ids(db, unique_ids, user_id=user_id)}
    if len(by_id) != len(unique_ids):
        raise _invalid("없는 태그 ID가 있어요.")
    chosen = [by_id[tag_id] for tag_id in unique_ids]
    chosen_ids = {tag.id for tag in chosen}

    def add(tag: Tag) -> None:
        if tag.id not in chosen_ids:  # 별칭으로 바꿔도 같은 태그는 한 번만
            chosen_ids.add(tag.id)
            chosen.append(tag)

    new_names: dict[str, str] = {}
    for raw in new_tag_names:
        name = tags_repo.normalize_tag_name(raw)
        key = name.lower()
        if name and key not in new_names:
            new_names[key] = name

    found = tags_repo.get_tags_by_keys(db, list(new_names), user_id=user_id)  # ① 태그 이름
    missing = [key for key in new_names if key not in found]
    alias_hits = aliases_repo.get_aliases_by_keys(db, missing, user_id=user_id)  # ② 별칭 (한 번에)
    alias_tags = {
        tag.id: tag
        for tag in tags_repo.get_tags_by_ids(db, [alias.tag_id for alias in alias_hits.values()], user_id=user_id)
    }
    to_create: list[str] = []
    for key, name in new_names.items():
        if key in found:
            add(found[key])
        elif key in alias_hits and alias_hits[key].tag_id in alias_tags:
            add(alias_tags[alias_hits[key].tag_id])
        else:
            to_create.append(name)  # ③ 새 태그
    if any(len(name) > MAX_TAG_NAME for name in to_create):
        raise _invalid(TAG_NAME_TOO_LONG)
    if len(chosen) + len(to_create) > MAX_TAGS:
        raise _invalid(f"태그는 최대 {MAX_TAGS}개까지 넣을 수 있어요.")
    return chosen, to_create


# A-002 기록 저장 (R-001, D-064). 에러와 화면에 모아 둔 시도를 "기록 저장" 때 한 번에 저장한다.
# 새 시리즈·새 태그도 이때 함께 만든다(D-011, D-020). 에러·태그 연결·시도·해결 처리까지 모두 한 트랜잭션이다.
# 마지막 시도가 해결됨이면 resolved, 아니면 unresolved다. (D-028, D-029)
@router.post("/errors", response_model=ErrorCreatedResponse, status_code=201)
def create_error(
    body: ErrorCreateRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ErrorCreatedResponse:
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
    reused_from_id = None
    if body.reused_from_id is not None:
        if not solved:
            raise _invalid("기존 기록의 방법으로 해결됐을 때만 원본과 연결할 수 있어요.")  # D-128
        try:
            reused_from_id = errors_repo.get_reuse_root_id(db, body.reused_from_id, user_id=user.id)
        except ValueError as exc:
            raise _invalid(str(exc))

    # 먼저 모두 검사하고, 통과하면 그때 만든다. 중간에 실패해도 커밋 전이라 아무것도 남지 않는다.
    if body.series_id is not None and body.new_series_name is not None:
        raise _invalid("시리즈는 series_id와 new_series_name 중 하나만 보내 주세요.")
    series = None
    new_series_name = None
    if body.series_id is not None:
        series = series_repo.get_owned_series(db, user_id=user.id, series_id=body.series_id)
        if series is None:
            raise _invalid("없는 시리즈예요.")  # 남의 시리즈도 같은 응답이다 (D-105)
    elif body.new_series_name is not None:
        new_series_name = body.new_series_name.strip()
        if not new_series_name:
            raise _invalid("새 시리즈 이름이 비어 있어요.")
        # 내 시리즈 중 같은 이름(공백·대소문자 무시)이 이미 있으면 그 시리즈를 쓴다. (D-017)
        series = series_repo.find_series_by_name(db, new_series_name, user_id=user.id)
    tags, new_tag_names = _resolve_tags(db, user.id, body.tag_ids, body.new_tag_names)

    if series is None and new_series_name:
        series = series_repo.create_series(db, new_series_name, user_id=user.id)
    tags += [tags_repo.create_tag(db, name, user_id=user.id) for name in new_tag_names]
    error = errors_repo.create_error(
        db,
        error_message,
        situation,
        series.id if series else None,
        [tag.id for tag in tags],
        reused_from_id,
        user_id=user.id,
    )
    saved = [attempts_repo.create_attempt(db, error.id, seq, action, result) for seq, (action, result) in enumerate(attempts, 1)]
    if solved:
        errors_repo.mark_resolved(db, error, summary, user_id=user.id)  # 팀원 2 함수 그대로 (D-030)
    else:
        errors_repo.set_summary(db, error, summary, user_id=user.id)  # 미해결에도 한 줄 정리는 선택으로 저장한다
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
    # 오래된 기록인가: 미해결이고 등록한 지 14일 이상. 화면의 빨간 불이 이 값을 따른다. (D-078)
    is_stale: bool
    # 재사용 기록이 가리키는 맨 처음 원본. 원본이면 None이다. (D-080)
    reused_from_id: int | None
    # 이 기록을 재사용한 기록 전체 수. 태그·시리즈 필터와 상관없다. (D-081)
    reuse_count: int
    # 검색어(q)를 어느 칸에서 찾았는지. q가 없으면 빈 배열. A-009는 항상 빈 배열이다. (D-126)
    matched_in: list[Literal["error_message", "summary", "situation", "attempt"]] = []
    # 에러 메시지 밖에서 찾았을 때 그 부분 한 줄. 아니면 None. A-009는 항상 None이다. (D-126)
    match_snippet: str | None = None


class ReuseItem(BaseModel):
    """원본 상세(A-009)의 재사용 기록 한 건. 그 기록의 상황·태그·시리즈를 그대로 보여준다. (D-081)"""

    id: int
    created_at: str
    situation: str | None
    series: NamedItem | None
    tags: list[NamedItem]


class ErrorDetailResponse(ErrorListItem):
    situation: str | None
    summary: str | None
    # AI 피드백. 이전 기록이나 받기에 실패한 기록은 None이다. 목록(A-008)에는 넣지 않는다. (Q-003)
    ai_feedback: str | None
    attempts: list[AttemptItem]
    # 이 기록을 재사용한 기록을 날짜순으로. 재사용 기록 자신은 빈 배열이다. (D-081)
    reuses: list[ReuseItem]


SNIPPET_BEFORE, SNIPPET_AFTER = 20, 40


def _contains(text: str | None, q: str) -> bool:
    return bool(text) and re.search(re.escape(q), text, re.IGNORECASE) is not None


def _snippet(text: str, q: str) -> str:
    """찾은 곳 앞 20자·뒤 40자만 한 줄로. 잘렸으면 앞뒤에 …. (D-126)"""
    one = " ".join(text.split())
    m = re.search(re.escape(q), one, re.IGNORECASE)
    if m is None:
        return one[: SNIPPET_BEFORE + SNIPPET_AFTER] + ("…" if len(one) > SNIPPET_BEFORE + SNIPPET_AFTER else "")
    start = max(0, m.start() - SNIPPET_BEFORE)
    end = min(len(one), m.end() + SNIPPET_AFTER)
    return ("…" if start > 0 else "") + one[start:end] + ("…" if end < len(one) else "")


def _match_info(error: ErrorRecord, q: str, action: str | None) -> tuple[list[str], str | None]:
    """(matched_in, match_snippet). 순서는 error_message → summary → situation → attempt로 고정, 미리보기 우선순위는 정리 → 시도 → 상황. (D-126)"""
    matched = [
        name
        for name, hit in (
            ("error_message", _contains(error.error_message, q)),
            ("summary", _contains(error.summary, q)),
            ("situation", _contains(error.situation, q)),
            ("attempt", action is not None),
        )
        if hit
    ]
    snippet = None
    if "summary" in matched:
        snippet = _snippet(error.summary or "", q)
    elif "attempt" in matched:
        snippet = _snippet(action or "", q)
    elif "situation" in matched:
        snippet = _snippet(error.situation or "", q)
    return matched, snippet


def _list_items(db: Session, user_id: int, errors: list[ErrorRecord], q: str | None = None) -> list[ErrorListItem]:
    """시리즈·태그·시도 수를 에러마다 따로 조회하지 않고 한 번씩 모아서 가져온다 (N+1 조회 방지).

    q가 있으면 어느 칸에서 찾았는지(matched_in, match_snippet)도 채운다. (D-126)
    """
    error_ids = [error.id for error in errors]
    series = series_repo.get_series_by_ids(
        db, {error.series_id for error in errors if error.series_id is not None}, user_id=user_id
    )
    tags = errors_repo.get_tags_by_error_ids(db, error_ids, user_id=user_id)
    counts = attempts_repo.count_by_error_ids(db, error_ids)
    reuse_counts = errors_repo.count_reuses_by_ids(db, error_ids, user_id=user_id)
    cutoff = errors_repo.stale_cutoff()
    actions = errors_repo.get_matching_actions(db, error_ids, q, user_id=user_id) if q else {}
    matches = {error.id: _match_info(error, q, actions.get(error.id)) for error in errors} if q else {}
    return [
        ErrorListItem(
            matched_in=matches[error.id][0] if q else [],
            match_snippet=matches[error.id][1] if q else None,
            id=error.id,
            error_message=error.error_message,
            status=error.status,
            series=NamedItem.model_validate(series[error.series_id]) if error.series_id in series else None,
            series_order=error.series_order,
            tags=[NamedItem.model_validate(tag) for tag in tags[error.id]],
            attempt_count=counts[error.id],
            created_at=error.created_at,
            resolved_at=error.resolved_at,
            is_stale=errors_repo.is_stale(error, cutoff),
            reused_from_id=error.reused_from_id,
            reuse_count=reuse_counts.get(error.id, 0),
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
    # true이면 오래된 기록(미해결 + 등록 14일 이상)만. 다른 필터와 함께 쓰면 모두 만족하는 것만 준다. (D-078)
    stale: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[ErrorListItem]:
    keyword = (q or "").strip() or None
    errors = errors_repo.list_errors(db, status, list(dict.fromkeys(tag_id)), keyword, series_id, stale, user_id=user.id)
    return _list_items(db, user.id, errors, keyword)


class ErrorStatsResponse(BaseModel):
    total: int
    resolved: int
    unresolved: int
    reused_resolved: int
    # 오래된 미해결 기록 수 (D-078). 1 이상이면 사이드바 미해결 칸의 빨간 불이 켜진다.
    stale_unresolved: int


# A-017 기록 통계 (R-005, D-074). 사이드바 대시보드의 에러 기록·해결·미해결·재사용 해결 개수.
# 고정 경로라서 A-009(/errors/{error_id})보다 위에 선언한다. 먼저 선언한 경로가 먼저 매칭되기 때문이다.
@router.get("/errors/stats", response_model=ErrorStatsResponse)
def get_error_stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> ErrorStatsResponse:
    counts = errors_repo.count_by_status(db, user_id=user.id)
    return ErrorStatsResponse(
        total=counts["resolved"] + counts["unresolved"],
        resolved=counts["resolved"],
        unresolved=counts["unresolved"],
        reused_resolved=errors_repo.count_reused_resolved(db, user_id=user.id),
        stale_unresolved=errors_repo.count_stale_unresolved(db, user_id=user.id),
    )


class RateItem(BaseModel):
    numerator: int
    denominator: int
    rate: float | None  # 0~1, 분모 0이면 None


class TopErrorRecord(BaseModel):
    id: int
    created_at: str
    status: str


class TopErrorGroup(BaseModel):
    title: str  # 가장 최근 기록의 핵심 줄 원문
    count: int
    resolved: int
    unresolved: int
    records: list[TopErrorRecord]  # 최근순


class TagUnresolvedItem(BaseModel):
    id: int
    name: str
    total: int
    unresolved: int


class InsightsResponse(BaseModel):
    resolve_rate: RateItem
    reuse_rate: RateItem  # numerator = 재사용 해결 수, denominator = 해결 수
    apply_success: RateItem
    apply_since: str
    stale_unresolved: int
    avg_attempts_fresh: float | None
    top_errors: list[TopErrorGroup]
    tag_unresolved: list[TagUnresolvedItem]


def _rate(numerator: int, denominator: int) -> RateItem:
    return RateItem(numerator=numerator, denominator=denominator, rate=numerator / denominator if denominator else None)


def _top_errors(db: Session, user_id: int) -> list[TopErrorGroup]:
    """마스킹한 핵심 줄이 같은 기록끼리 묶어 건수순으로 최대 5개. 1건짜리도 포함한다. (D-129, D-117, D-122)

    재사용 기록(reused_from_id)은 메시지가 달라도 원본의 묶음에 넣는다. 다시 만난 같은 에러이기 때문이다. (D-080)
    """
    rows = errors_repo.list_messages_for_grouping(db, user_id=user_id)  # 최근 등록순
    keys = {row[0]: _normalize_masked(key_line(row[1])[0]) for row in rows}
    groups: dict[str, list[tuple[int, str, str, str, int | None]]] = {}
    for row in rows:
        group_key = keys.get(row[4]) if row[4] is not None else None
        group_key = group_key or keys[row[0]]
        if group_key:
            groups.setdefault(group_key, []).append(row)
    ranked = sorted(groups.values(), key=lambda g: (len(g), g[0][2], g[0][0]), reverse=True)  # g[0]이 가장 최근
    return [
        TopErrorGroup(
            title=key_line(g[0][1])[0].strip(),
            count=len(g),
            resolved=sum(1 for r in g if r[3] == "resolved"),
            unresolved=sum(1 for r in g if r[3] != "resolved"),
            records=[TopErrorRecord(id=r[0], created_at=r[2], status=r[3]) for r in g],
        )
        for g in ranked[:5]
    ]


# A-025 내 기록 통계 탭 (Q-006, D-129). 한 번의 요청으로 탭 전체를 그린다.
# 고정 경로라서 A-009(/errors/{error_id})보다 위에 선언한다 (A-017과 같은 이유).
@router.get("/errors/insights", response_model=InsightsResponse)
def get_error_insights(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> InsightsResponse:
    uid = user.id
    counts = errors_repo.count_by_status(db, user_id=uid)
    resolved = counts["resolved"]
    reused = errors_repo.count_reused_resolved(db, user_id=uid)
    apply_total, apply_solved = errors_repo.count_apply_attempts(db, APPLY_TRIAL_SINCE, user_id=uid)
    avg = errors_repo.avg_attempts_fresh_resolved(db, user_id=uid)

    tag_counts = errors_repo.count_errors_by_tag_and_status(db, user_id=uid)
    tags = [
        TagUnresolvedItem(id=t.id, name=t.name, total=tag_counts[t.id][0], unresolved=tag_counts[t.id][1])
        for t in tags_repo.list_tags(db, user_id=uid)
        if t.id in tag_counts
    ]
    tags.sort(key=lambda t: (-t.unresolved, -t.total, t.name.lower()))

    return InsightsResponse(
        resolve_rate=_rate(resolved, resolved + counts["unresolved"]),
        reuse_rate=_rate(reused, resolved),
        apply_success=_rate(apply_solved, apply_total),
        apply_since=APPLY_TRIAL_SINCE,
        stale_unresolved=errors_repo.count_stale_unresolved(db, user_id=uid),
        avg_attempts_fresh=None if avg is None else round(avg, 1),
        top_errors=_top_errors(db, uid),
        tag_unresolved=tags[:8],
    )


# A-009 에러 일기 상세 (R-004, R-005, D-031). 시도는 시도 번호 순서.
@router.get("/errors/{error_id}", response_model=ErrorDetailResponse)
def get_error_detail(
    error_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ErrorDetailResponse:
    error = errors_repo.get_owned_error(db, user_id=user.id, error_id=error_id)
    if error is None:
        raise HTTPException(status_code=404, detail="에러 기록을 찾을 수 없어요.")
    item = _list_items(db, user.id, [error])[0]
    children = errors_repo.list_reuses(db, error.id, user_id=user.id)
    child_items = {child.id: child_item for child, child_item in zip(children, _list_items(db, user.id, children))}
    return ErrorDetailResponse(
        **item.model_dump(),
        situation=error.situation,
        summary=error.summary,
        ai_feedback=error.ai_feedback,
        attempts=[AttemptItem.model_validate(attempt) for attempt in attempts_repo.list_attempts(db, error.id)],  # 위에서 에러 소유를 확인했다
        reuses=[
            ReuseItem(
                id=child.id,
                created_at=child.created_at,
                situation=child.situation,
                series=child_items[child.id].series,
                tags=child_items[child.id].tags,
            )
            for child in children
        ],
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
def update_error(
    error_id: int, body: ErrorUpdateRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ErrorDetailResponse:
    error = errors_repo.get_owned_error(db, user_id=user.id, error_id=error_id)
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
        series = series_repo.get_owned_series(db, user_id=user.id, series_id=body.series_id)
        if series is None:
            raise _invalid("없는 시리즈예요.")
    elif body.new_series_name is not None:
        new_series_name = body.new_series_name.strip()
        if not new_series_name:
            raise _invalid("새 시리즈 이름이 비어 있어요.")
        series = series_repo.find_series_by_name(db, new_series_name, user_id=user.id)

    tags = None
    new_tag_names: list[str] = []
    if "tag_ids" in sent or "new_tag_names" in sent:
        tags, new_tag_names = _resolve_tags(db, user.id, body.tag_ids or [], body.new_tag_names or [])

    if series is None and new_series_name:
        series = series_repo.create_series(db, new_series_name, user_id=user.id)
    if tags is not None:
        tags += [tags_repo.create_tag(db, name, user_id=user.id) for name in new_tag_names]
    errors_repo.update_error(
        db,
        error,
        set_situation=set_situation,
        situation=situation,
        set_series=set_series,
        series_id=series.id if series else None,
        tag_ids=[tag.id for tag in tags] if tags is not None else None,
        user_id=user.id,
    )
    db.commit()
    return get_error_detail(error_id, db, user)


# A-011 기록 삭제 (R-005, D-043, D-044). 시도·태그 연결까지 한 트랜잭션으로 지운다. 쓰이지 않게 된 태그·시리즈는 남긴다. (D-046)
@router.delete("/errors/{error_id}", status_code=204)
def delete_error(error_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> None:
    error = errors_repo.get_owned_error(db, user_id=user.id, error_id=error_id)
    if error is None:
        raise HTTPException(status_code=404, detail="에러 기록을 찾을 수 없어요.")
    errors_repo.delete_error(db, error, user_id=user.id)
    db.commit()


NAME_TAKEN = "이미 있는 이름이에요."  # D-049


class TagRenameRequest(BaseModel):
    name: str


# A-012 태그 이름 변경 (R-005, D-019, D-049). 같은 이름(정규화 후 같은 name_key)이 다른 태그에 있으면 409.
@router.patch("/tags/{tag_id}", response_model=TagResponse)
def rename_tag(
    tag_id: int, body: TagRenameRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> TagResponse:
    tag = tags_repo.get_owned_tag(db, user_id=user.id, tag_id=tag_id)
    if tag is None:
        raise HTTPException(status_code=404, detail="태그를 찾을 수 없어요.")
    name = tags_repo.normalize_tag_name(body.name)
    if not name:
        raise _invalid("태그 이름을 입력해 주세요.")
    if len(name) > MAX_TAG_NAME:
        raise _invalid(TAG_NAME_TOO_LONG)
    if tags_repo.find_other_tag_by_key(db, name.lower(), tag.id, user_id=user.id) is not None:
        raise HTTPException(status_code=409, detail=NAME_TAKEN)
    # 새 이름이 별칭과 같으면: 다른 태그의 별칭이면 409, 자기 자신의 별칭이면 그 별칭을 지우고 바꾼다 (D-114).
    # 예전 이름을 별칭으로 자동 추가하지는 않는다(오타 수정이 별칭으로 쌓이지 않게).
    same_alias = aliases_repo.get_aliases_by_keys(db, [name.lower()], user_id=user.id).get(name.lower())
    if same_alias is not None:
        if same_alias.tag_id != tag.id:
            raise HTTPException(status_code=409, detail=NAME_TAKEN)
        aliases_repo.delete_alias(db, same_alias, user_id=user.id)
    tags_repo.rename_tag(db, tag, name, user_id=user.id)
    try:
        db.commit()
    except IntegrityError:
        # 확인한 뒤 다른 요청이 같은 이름을 먼저 저장한 경우(name_key UNIQUE)
        db.rollback()
        raise HTTPException(status_code=409, detail=NAME_TAKEN)
    return _tag_response_for(db, tag, user.id)


# A-012 태그 삭제 (R-005, D-050). 쓰이는 태그도 지울 수 있고, 에러 연결만 지워진다. 에러는 남는다.
@router.delete("/tags/{tag_id}", status_code=204)
def delete_tag(tag_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> None:
    tag = tags_repo.get_owned_tag(db, user_id=user.id, tag_id=tag_id)
    if tag is None:
        raise HTTPException(status_code=404, detail="태그를 찾을 수 없어요.")
    tags_repo.delete_tag(db, tag, user_id=user.id)
    db.commit()


class TagMergeRequest(BaseModel):
    into_tag_id: int


# A-022 태그 합치기 (R-005, D-112, D-113). tag_id(합쳐질 태그)를 지우고 into_tag_id(남을 태그)에 모은다.
@router.post("/tags/{tag_id}/merge", response_model=TagResponse)
def merge_tag(
    tag_id: int, body: TagMergeRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> TagResponse:
    source = tags_repo.get_owned_tag(db, user_id=user.id, tag_id=tag_id)
    target = tags_repo.get_owned_tag(db, user_id=user.id, tag_id=body.into_tag_id)
    if source is None or target is None:
        raise HTTPException(status_code=404, detail="태그를 찾을 수 없어요.")
    if source.id == target.id:
        raise _invalid("같은 태그끼리는 합칠 수 없어요.")
    try:
        tags_repo.merge_tags(db, source, target, user_id=user.id)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return _tag_response_for(db, target, user.id)


class AliasCreateRequest(BaseModel):
    name: str


ALIAS_IS_TAG = "이미 있는 태그 이름이에요."  # D-114


def _alias_conflict(db: Session, key: str, user_id: int) -> str | None:
    """별칭으로 쓰려는 key가 내 태그 이름이나 내 별칭과 겹치면 409 문구를, 아니면 None을 돌려준다. (D-114)"""
    if tags_repo.get_tags_by_keys(db, [key], user_id=user_id):
        return ALIAS_IS_TAG
    alias = aliases_repo.get_aliases_by_keys(db, [key], user_id=user_id).get(key)
    if alias is None:
        return None
    owner = tags_repo.get_owned_tag(db, user_id=user_id, tag_id=alias.tag_id)
    return f"이미 #{owner.name}의 별칭이에요." if owner else "이미 있는 별칭이에요."


# A-023 태그 별칭 추가 (R-005, D-114). 태그 이름·다른 별칭과 같으면 409, 빈 이름은 422.
# 이름은 20자까지다(태그 이름과 같다, D-115).
@router.post("/tags/{tag_id}/aliases", response_model=AliasItem, status_code=201)
def create_alias(
    tag_id: int, body: AliasCreateRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> AliasItem:
    tag = tags_repo.get_owned_tag(db, user_id=user.id, tag_id=tag_id)
    if tag is None:
        raise HTTPException(status_code=404, detail="태그를 찾을 수 없어요.")
    name = tags_repo.normalize_tag_name(body.name)
    if not name:
        raise _invalid("별칭 이름을 입력해 주세요.")
    if len(name) > MAX_TAG_NAME:
        raise _invalid(ALIAS_TOO_LONG)
    conflict = _alias_conflict(db, name.lower(), user.id)
    if conflict:
        raise HTTPException(status_code=409, detail=conflict)
    alias = aliases_repo.create_alias(db, tag, name, user_id=user.id)
    try:
        db.commit()
    except IntegrityError:
        # 확인한 뒤 다른 요청이 같은 별칭을 먼저 저장한 경우(alias_key UNIQUE)
        db.rollback()
        raise HTTPException(status_code=409, detail=_alias_conflict(db, name.lower(), user.id) or "이미 있는 이름이에요.")
    return AliasItem(id=alias.id, name=alias.alias)


# A-024 태그 별칭 삭제 (R-005, D-114). 그 태그의 별칭이 아니거나 남의 것이면 404.
@router.delete("/tags/{tag_id}/aliases/{alias_id}", status_code=204)
def delete_alias(
    tag_id: int, alias_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    if tags_repo.get_owned_tag(db, user_id=user.id, tag_id=tag_id) is None:
        raise HTTPException(status_code=404, detail="태그를 찾을 수 없어요.")
    alias = aliases_repo.get_owned_alias(db, user_id=user.id, tag_id=tag_id, alias_id=alias_id)
    if alias is None:
        raise HTTPException(status_code=404, detail="별칭을 찾을 수 없어요.")
    aliases_repo.delete_alias(db, alias, user_id=user.id)
    db.commit()


class SeriesCreateRequest(BaseModel):
    name: str
    description: str | None = None


# A-015 시리즈 새로 만들기 (R-005, D-017, D-049, D-054, D-061). 같은 이름(공백 제외·대소문자 무시)이면 409.
@router.post("/series", response_model=SeriesResponse, status_code=201)
def create_series(
    body: SeriesCreateRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> SeriesResponse:
    name = body.name.strip()
    if not name:
        raise _invalid("시리즈 이름을 입력해 주세요.")
    if series_repo.find_series_by_name(db, name, user_id=user.id) is not None:
        raise HTTPException(status_code=409, detail=NAME_TAKEN)
    series = series_repo.create_series(db, name, (body.description or "").strip() or None, user_id=user.id)
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
def update_series(
    series_id: int, body: SeriesUpdateRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> SeriesResponse:
    series = series_repo.get_owned_series(db, user_id=user.id, series_id=series_id)
    if series is None:
        raise HTTPException(status_code=404, detail="시리즈를 찾을 수 없어요.")
    sent = body.model_fields_set
    if "name" in sent:
        name = (body.name or "").strip()
        if not name:
            raise _invalid("시리즈 이름을 입력해 주세요.")
        if series_repo.find_other_series_by_name(db, name, series.id, user_id=user.id) is not None:
            raise HTTPException(status_code=409, detail=NAME_TAKEN)
        series_repo.rename_series(db, series, name, user_id=user.id)
    if "description" in sent:
        series_repo.set_description(db, series, (body.description or "").strip() or None, user_id=user.id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=NAME_TAKEN)
    return _series_response(series, errors_repo.count_errors_by_series(db, user_id=user.id).get(series.id, 0))


# A-013 시리즈 삭제 (R-005, D-050). 속한 에러의 소속만 비워지고 에러는 남는다.
@router.delete("/series/{series_id}", status_code=204)
def delete_series(series_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> None:
    series = series_repo.get_owned_series(db, user_id=user.id, series_id=series_id)
    if series is None:
        raise HTTPException(status_code=404, detail="시리즈를 찾을 수 없어요.")
    series_repo.delete_series(db, series, user_id=user.id)
    db.commit()


class SeriesOrderRequest(BaseModel):
    # 그 시리즈의 에러 ID 전체를 원하는 순서대로
    error_ids: list[int]


# A-014 시리즈 안 순서 바꾸기 (R-005, D-051). 전체를 바꿔 끼운다. ID가 그 시리즈의 에러와 정확히 같지 않으면 422.
@router.put("/series/{series_id}/order", response_model=list[ErrorListItem])
def reorder_series(
    series_id: int, body: SeriesOrderRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[ErrorListItem]:
    if series_repo.get_owned_series(db, user_id=user.id, series_id=series_id) is None:
        raise HTTPException(status_code=404, detail="시리즈를 찾을 수 없어요.")
    if not errors_repo.reorder_series(db, series_id, body.error_ids, user_id=user.id):
        raise _invalid("순서를 바꿀 기록이 시리즈의 기록과 맞지 않아요. 화면을 새로 고쳐 주세요.")
    db.commit()
    return _list_items(db, user.id, errors_repo.list_errors(db, None, [], None, series_id, user_id=user.id))
