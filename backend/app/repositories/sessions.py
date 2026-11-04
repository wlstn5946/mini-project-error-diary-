"""공용: sessions 테이블 조회·생성·삭제. SQL은 라우터에 쓰지 않고 이 파일에만 둔다. (D-016, D-098)"""

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import UserSession


def create_session(db: Session, user_id: int, token_hash: str, expires_at: str) -> UserSession:
    """커밋은 호출하는 쪽에서 한다. DB에는 토큰 해시만 저장한다. (D-084)"""
    session = UserSession(user_id=user_id, token_hash=token_hash, expires_at=expires_at)
    db.add(session)
    db.flush()
    return session


def get_session_by_token_hash(db: Session, token_hash: str) -> UserSession | None:
    return db.scalars(select(UserSession).where(UserSession.token_hash == token_hash).limit(1)).first()


def delete_expired_sessions(db: Session, user_id: int, now: str) -> None:
    """그 사용자의 만료된 세션만 지운다(로그인할 때). 다른 사용자·만료되지 않은 세션은 그대로다. (D-084, D-096)"""
    db.execute(delete(UserSession).where(UserSession.user_id == user_id, UserSession.expires_at <= now))


def delete_session_by_token_hash(db: Session, token_hash: str) -> None:
    """로그아웃. 그 세션 하나만 지운다. 없어도 오류 없이 끝난다. (D-094, D-096)"""
    db.execute(delete(UserSession).where(UserSession.token_hash == token_hash))
