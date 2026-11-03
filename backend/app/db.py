"""공용: DB 연결과 테이블 생성 (DATA-MODEL_N.md). DB는 PostgreSQL이다(로컬, 이후 Supabase). (D-057, D-058, D-059)"""

from collections.abc import Iterator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import DATABASE_URL

# DB 서버를 다시 켰거나 원격(Supabase) 연결이 끊긴 경우를 위해 꺼내기 전에 확인한다.
# Supabase transaction pooler(6543 포트)는 prepared statement를 지원하지 않아 psycopg의 자동 준비를 끈다.
engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args={"prepare_threshold": None})
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


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

    created_at 오름차순(같으면 id 오름차순)으로 1부터 센다.
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

    Base.metadata.create_all(engine)
    added = _add_missing_columns()
    if ("errors", "series_order") in added:
        _backfill_series_order()
