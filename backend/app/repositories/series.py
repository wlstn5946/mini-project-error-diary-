"""팀원 1 (찾기·정리): series 테이블 조회·생성·수정·삭제. SQL은 라우터에 쓰지 않고 이 파일에만 둔다. (D-016)

계정별 분리 (D-086, D-105): 모든 함수가 user_id를 받는다. 이름 중복은 같은 사용자 안에서만 판단한다.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Series
from app.repositories import errors as errors_repo


def list_series(db: Session, *, user_id: int) -> list[Series]:
    """최근 만든 순. created_at이 초 단위라 같을 수 있으므로 id가 큰(나중에 만든) 것을 먼저 둔다."""
    query = select(Series).where(Series.user_id == user_id).order_by(Series.created_at.desc(), Series.id.desc())
    return list(db.scalars(query))


def get_owned_series(db: Session, *, user_id: int, series_id: int) -> Series | None:
    """소유 확인 함수. 내 시리즈면 돌려주고, 없거나 남의 것이면 None이다. (D-105)"""
    return db.scalars(select(Series).where(Series.id == series_id, Series.user_id == user_id)).first()


def get_series_by_ids(db: Session, series_ids: set[int], *, user_id: int) -> dict[int, Series]:
    """내 기록 목록용. 여러 에러의 시리즈를 한 번에 가져온다 (N+1 조회 방지)."""
    if not series_ids:
        return {}
    query = select(Series).where(Series.user_id == user_id, Series.id.in_(series_ids))
    return {series.id: series for series in db.scalars(query)}


def find_series_by_name(db: Session, name: str, *, user_id: int) -> Series | None:
    """앞뒤 공백을 빼고 대소문자를 무시해 내 시리즈 중 같은 이름을 찾는다. (D-017)"""
    key = name.strip().lower()
    query = select(Series).where(Series.user_id == user_id, func.lower(func.trim(Series.name)) == key).limit(1)
    return db.scalars(query).first()


def create_series(db: Session, name: str, description: str | None = None, *, user_id: int) -> Series:
    """커밋은 호출하는 쪽에서 한다. 에러 저장과 한 트랜잭션으로 묶기 위해서다. (D-011)
    description은 시리즈별 탭에서 새로 만들 때만 넘긴다. (D-061)"""
    series = Series(user_id=user_id, name=name.strip(), description=description)
    db.add(series)
    db.flush()
    return series


def find_other_series_by_name(db: Session, name: str, exclude_id: int, *, user_id: int) -> Series | None:
    """이름을 바꿀 때 같은 이름(공백 제외·대소문자 무시)을 가진 내 **다른** 시리즈가 있는지 찾는다. (D-017, D-049)"""
    key = name.strip().lower()
    query = (
        select(Series)
        .where(Series.user_id == user_id, func.lower(func.trim(Series.name)) == key, Series.id != exclude_id)
        .limit(1)
    )
    return db.scalars(query).first()


def rename_series(db: Session, series: Series, name: str, *, user_id: int) -> None:
    """커밋은 호출하는 쪽에서 한다."""
    errors_repo.assert_owner(series, user_id)
    series.name = name.strip()
    db.flush()


def set_description(db: Session, series: Series, description: str | None, *, user_id: int) -> None:
    """설명을 바꾼다. 비우면 None이다. (D-054) 커밋은 호출하는 쪽에서 한다."""
    errors_repo.assert_owner(series, user_id)
    series.description = description
    db.flush()


def delete_series(db: Session, series: Series, *, user_id: int) -> None:
    """속한 에러의 소속을 먼저 비우고 시리즈를 지운다. 에러는 남는다. (D-044, D-050)"""
    errors_repo.assert_owner(series, user_id)
    errors_repo.clear_series(db, series.id, user_id=user_id)
    db.delete(series)
    db.flush()
