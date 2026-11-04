"""공용: users 테이블 조회·생성. SQL은 라우터에 쓰지 않고 이 파일에만 둔다. (D-016, D-098)"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User


def get_user(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def get_user_by_key(db: Session, username_key: str) -> User | None:
    """중복 판단용 소문자 키로 찾는다. (D-085)"""
    return db.scalars(select(User).where(User.username_key == username_key).limit(1)).first()


def create_user(db: Session, username: str, username_key: str, password_hash: str) -> User:
    """커밋은 호출하는 쪽에서 한다. 같은 키가 이미 있으면 flush에서 IntegrityError가 난다."""
    user = User(username=username, username_key=username_key, password_hash=password_hash)
    db.add(user)
    db.flush()
    return user
