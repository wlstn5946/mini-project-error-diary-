"""공용: FastAPI 앱 진입점. 모든 라우터에 /api prefix를 붙인다."""

from fastapi import FastAPI

from app.routers import health, records, solve

API_PREFIX = "/api"

app = FastAPI(title="에러 해결 일기 API")

# records를 solve보다 먼저 등록한다. /errors/search 같은 고정 경로가 /errors/{id}보다 먼저 매칭되게 하기 위해서다.
app.include_router(health.router, prefix=API_PREFIX)
app.include_router(records.router, prefix=API_PREFIX)
app.include_router(solve.router, prefix=API_PREFIX)
