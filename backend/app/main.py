"""공용: FastAPI 앱 진입점. 모든 라우터에 /api prefix를 붙인다."""

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI

from app.db import init_db
from app.routers import auth, health, records, solve
from app.security import get_current_user

API_PREFIX = "/api"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # 서버가 시작될 때 없는 테이블을 만든다.
    init_db()
    yield


app = FastAPI(title="에러 해결 일기 API", lifespan=lifespan)

# records를 solve보다 먼저 등록한다. /errors/search 같은 고정 경로가 /errors/{id}보다 먼저 매칭되게 하기 위해서다.
app.include_router(health.router, prefix=API_PREFIX)
# health·auth는 로그인 없이 열려 있다. auth 안에서는 /auth/me만 따로 인증을 건다. (D-087, D-094)
app.include_router(auth.router, prefix=API_PREFIX)
# records·solve는 라우터째로 로그인을 요구한다(D-087). 핸들러도 사용자를 받지만 같은 의존성은 요청마다 한 번만 실행된다.
app.include_router(records.router, prefix=API_PREFIX, dependencies=[Depends(get_current_user)])
app.include_router(solve.router, prefix=API_PREFIX, dependencies=[Depends(get_current_user)])
