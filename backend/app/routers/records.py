"""팀원 1 (찾기·정리): A-002, A-003, A-004, A-008 (API-SPEC 5절).

경로는 /errors, /errors/search 처럼 전체 상대 경로로 적는다. prefix(/api)는 main.py에서 붙인다.
이번 범위는 A-004(GET /series, GET /tags)만 구현한다. 나머지는 후보 상태 그대로다.
SQL은 이 파일에 쓰지 않고 backend/app/repositories/에만 둔다. (D-016)
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.db import get_db
from app.repositories import series as series_repo
from app.repositories import tags as tags_repo

router = APIRouter(tags=["records"])


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
