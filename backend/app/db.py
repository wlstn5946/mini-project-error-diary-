"""공용: DB 연결과 테이블 생성 (DATA-MODEL_N.md). 개발 중에는 SQLite, 이후 PostgreSQL로 전환한다. (D-009)"""

from collections.abc import Iterator

from sqlalchemy import create_engine, event, inspect, text
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


def _add_missing_columns() -> set[tuple[str, str]]:
    """이미 있는 테이블에 모델에는 있고 DB에는 없는 컬럼을 ADD COLUMN으로 추가한다. 추가한 (테이블, 컬럼)을 돌려준다. (D-052)

    컬럼 삭제·이름 변경·타입 변경은 하지 않는다. NULL을 허용하지 않는 컬럼은 기존 행에 채울 값이 없어서 추가하지 않고 멈춘다.
    """
    added: set[tuple[str, str]] = set()
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue  # 없는 테이블은 create_all이 만든다
            existing = {column["name"] for column in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing:
                    continue
                if not column.nullable:
                    raise RuntimeError(f"{table.name}.{column.name}은 NULL을 허용하지 않아 기존 DB에 추가할 수 없다")
                column_type = column.type.compile(dialect=engine.dialect)
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {column_type}'))
                added.add((table.name, column.name))
    return added


def _backfill_series_order() -> None:
    """series_order 컬럼을 방금 추가했을 때, 이미 시리즈에 속한 에러에 그 시리즈 안 순서를 채운다. (D-051, D-052)

    created_at 오름차순(같으면 id 오름차순)으로 1부터 센다. 윈도 함수 대신 세어서 SQLite와 PostgreSQL에서 같게 동작한다.
    """
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                UPDATE errors SET series_order = (
                    SELECT COUNT(*) FROM errors AS other
                    WHERE other.series_id = errors.series_id
                      AND (other.created_at < errors.created_at
                           OR (other.created_at = errors.created_at AND other.id <= errors.id))
                )
                WHERE series_id IS NOT NULL
                """
            )
        )


def init_db() -> None:
    """없는 테이블을 만들고, 이미 있는 테이블에는 없는 컬럼만 추가한다. 그 밖의 구조는 바꾸지 않는다. (D-014, D-052)"""
    from app import models  # noqa: F401  테이블 정의를 Base에 등록한다

    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)
    added = _add_missing_columns()
    if ("errors", "series_order") in added:
        _backfill_series_order()
