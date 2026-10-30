"""팀원 1 (찾기·정리): A-002, A-003, A-004, A-008 자리 (API-SPEC 5절, 모두 후보).

경로는 /errors, /errors/search 처럼 전체 상대 경로로 적는다. prefix(/api)는 main.py에서 붙인다.
"""

from fastapi import APIRouter

router = APIRouter(tags=["records"])
