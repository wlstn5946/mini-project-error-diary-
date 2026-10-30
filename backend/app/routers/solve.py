"""팀원 2 (AI로 해결): A-005, A-006, A-007 자리 (API-SPEC 5절, 모두 후보).

경로는 /errors/{id}/attempts 처럼 전체 상대 경로로 적는다. prefix(/api)는 main.py에서 붙인다.
"""

from fastapi import APIRouter

router = APIRouter(tags=["solve"])
