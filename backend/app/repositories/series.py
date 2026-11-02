"""팀원 1 (찾기·정리): series 테이블 조회. SQL은 라우터에 쓰지 않고 이 파일에만 둔다. (D-016)"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Series


def list_series(db: Session) -> list[Series]:
    """최근 만든 순. created_at이 초 단위라 같을 수 있으므로 id가 큰(나중에 만든) 것을 먼저 둔다."""
    query = select(Series).order_by(Series.created_at.desc(), Series.id.desc())
    return list(db.scalars(query))
