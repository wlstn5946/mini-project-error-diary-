"""팀원 1 (찾기·정리): tags 테이블 조회. SQL은 라우터에 쓰지 않고 이 파일에만 둔다. (D-016)"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Tag


def list_tags(db: Session) -> list[Tag]:
    """이름순(대소문자 무시). name_key는 겹치지 않지만 정렬을 고정하려고 id를 덧붙인다. (D-021)"""
    query = select(Tag).order_by(Tag.name_key, Tag.id)
    return list(db.scalars(query))
