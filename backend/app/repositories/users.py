"""공용: users 테이블 조회·생성. SQL은 라우터에 쓰지 않고 이 파일에만 둔다. (D-016, D-098)"""

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import User


def get_user(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def get_user_by_key(db: Session, username_key: str) -> User | None:
    """중복 판단용 소문자 키로 찾는다. (D-085)"""
    return db.scalars(select(User).where(User.username_key == username_key).limit(1)).first()


def create_user(
    db: Session,
    username: str,
    username_key: str,
    password_hash: str,
    security_question: str,
    security_answer_hash: str,
) -> User:
    """커밋은 호출하는 쪽에서 한다. 같은 키가 이미 있으면 flush에서 IntegrityError가 난다."""
    user = User(
        username=username,
        username_key=username_key,
        password_hash=password_hash,
        security_question=security_question,
        security_answer_hash=security_answer_hash,
    )
    db.add(user)
    db.flush()
    return user


def increment_failed(db: Session, user_id: int) -> int:
    """실패 횟수를 DB에서 직접 1 올리고 올린 뒤의 값을 돌려준다. 동시 요청에서도 횟수가 빠지지 않는다. (D-116)

    커밋은 호출하는 쪽에서 한다.
    """
    return db.execute(
        update(User)
        .where(User.id == user_id)
        .values(failed_login_count=User.failed_login_count + 1)
        .returning(User.failed_login_count)
    ).scalar_one()


def reset_failed(db: Session, user_id: int) -> None:
    """로그인에 성공하면 실패 횟수를 0으로 되돌린다. 커밋은 호출하는 쪽에서 한다."""
    db.execute(update(User).where(User.id == user_id).values(failed_login_count=0))
