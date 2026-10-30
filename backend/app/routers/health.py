"""공용: A-001 연결 확인 (API-SPEC 6절)."""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health", summary="A-001 연결 확인")
def health() -> dict[str, str]:
    # DB와 Gemini를 호출하지 않는다.
    return {"status": "ok"}
