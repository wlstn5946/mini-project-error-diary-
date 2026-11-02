"""공용: DB 연결과 테이블 생성 (DATA-MODEL_N.md). 개발 중에는 SQLite, 이후 PostgreSQL로 전환한다. (D-009)"""

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import DATABASE_PATH

# FastAPI는 일반 함수 라우터를 여러 스레드에서 실행하므로 SQLite의 같은 스레드 검사를 끈다.
engine = create_engine(
    f"sqlite:///{DATABASE_PATH.as_posix()}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


@event.listens_for(engine, "connect")
def _enable_foreign_keys(dbapi_connection, _connection_record) -> None:
    # SQLite는 외래 키 검사가 기본으로 꺼져 있고 연결마다 켜야 한다. PostgreSQL과 같은 동작을 맞추기 위해서다.
    if engine.dialect.name == "sqlite":
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.close()


def get_db() -> Iterator[Session]:
    """라우터에서 Depends(get_db)로 쓴다. 요청이 끝나면 세션을 닫는다."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """없는 테이블만 만든다. 이미 있는 테이블의 구조는 바꾸지 않는다."""
    from app import models  # noqa: F401  테이블 정의를 Base에 등록한다

    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)
