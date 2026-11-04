# SCENARIO-REVIEW_1 — 계정별 분리 검증 (로그인 5-2단계)

> 테스트 체크리스트와 데모 시나리오 문서다. 이 버전은 로그인 5-2단계(계정별 기록 분리) 검증 결과를 담는다. 경로는 CLAUDE.md 2절, D-107.

## 1. 검증 범위와 방법

- 대상: 로그인 5-1단계 구현(D-086, D-087, D-105). 기준 문서: API-SPEC_13 3절, DATA-MODEL_9, DECISIONS_13
- 방법: 로컬 PostgreSQL(`error_diary`)에 대해 FastAPI `TestClient`(HTTPS 기준 주소, 쿠키는 클라이언트별로 따로 보관)로 실제 앱을 호출했다. 계정 A·B·쿠키 없는 클라이언트 3개를 썼다
- Gemini: 호출하지 않았다. 시도는 직접 넣어 저장했고, A-005·A-016은 키를 비운 상태로 호출해 `unavailable` 응답(소유 확인은 통과)만 확인했다. 실제 Gemini 응답은 이 검증 범위 밖이다
- 스크립트·쿠키: 저장소에 남기지 않았다(임시 경로에서 실행 후 삭제). 테스트 계정 2개와 그 데이터는 검증이 끝난 뒤 그 행만 지웠고, 행 수가 실행 전과 같음을 확인했다
- 실행 날짜: 2026-11-04

## 2. 엔드포인트 목록 (코드에서 뽑음)

FastAPI가 만든 `app.openapi()`의 경로·메서드를 그대로 뽑았다(24개). A- 번호는 각 라우터 주석 기준이다.

| A- | 메서드 | 경로 | 파일 | 로그인 필요 |
|----|--------|------|------|-------------|
| A-001 | GET | `/api/health` | health.py | 아니오 |
| A-002 | POST | `/api/errors` | records.py | 예 |
| A-003 | POST | `/api/errors/search` | records.py | 예 |
| A-004 | GET | `/api/series` | records.py | 예 |
| A-004 | GET | `/api/tags` | records.py | 예 |
| A-005 | POST | `/api/ai-suggestions` | solve.py | 예 |
| A-006 | POST | `/api/errors/{error_id}/attempts` | solve.py | 예 |
| A-007 | PATCH | `/api/errors/{error_id}/summary` | solve.py | 예 |
| A-008 | GET | `/api/errors` | records.py | 예 |
| A-009 | GET | `/api/errors/{error_id}` | records.py | 예 |
| A-010 | PATCH | `/api/errors/{error_id}` | records.py | 예 |
| A-011 | DELETE | `/api/errors/{error_id}` | records.py | 예 |
| A-012 | DELETE | `/api/tags/{tag_id}` | records.py | 예 |
| A-012 | PATCH | `/api/tags/{tag_id}` | records.py | 예 |
| A-013 | DELETE | `/api/series/{series_id}` | records.py | 예 |
| A-013 | PATCH | `/api/series/{series_id}` | records.py | 예 |
| A-014 | PUT | `/api/series/{series_id}/order` | records.py | 예 |
| A-015 | POST | `/api/series` | records.py | 예 |
| A-016 | POST | `/api/errors/{error_id}/feedback` | solve.py | 예 |
| A-017 | GET | `/api/errors/stats` | records.py | 예 |
| A-018 | POST | `/api/auth/register` | auth.py | 아니오 |
| A-019 | POST | `/api/auth/login` | auth.py | 아니오 |
| A-020 | POST | `/api/auth/logout` | auth.py | 아니오 |
| A-021 | GET | `/api/auth/me` | auth.py | 예 |

## 3. 결과

**전체 97개 항목 중 97개 통과, 0개 실패.**

### 2 준비

A로 시리즈·태그·해결된 에러·미해결 에러·재사용 기록을 만든 결과

| 항목 | 기대 | 실제 | 통과 |
|------|------|------|------|
| A: 해결 기록·미해결 기록·재사용 기록 생성 | 원본 reuse_count=1, 재사용 reused_from_id=원본 | reuse_count=1, e3.reused_from_id=6 | 통과 |

### 3-1 쿠키 없이

로그인 없이 호출: `health`와 `auth`(register, login, logout)를 뺀 모든 엔드포인트가 401이어야 한다. `/auth/me`도 401이다

| 항목 | 기대 | 실제 | 통과 |
|------|------|------|------|
| DELETE /api/errors/{error_id} | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |
| DELETE /api/series/{series_id} | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |
| DELETE /api/tags/{tag_id} | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |
| GET /api/auth/me | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |
| GET /api/errors | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |
| GET /api/errors/stats | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |
| GET /api/errors/{error_id} | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |
| GET /api/series | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |
| GET /api/tags | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |
| PATCH /api/errors/{error_id} | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |
| PATCH /api/errors/{error_id}/summary | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |
| PATCH /api/series/{series_id} | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |
| PATCH /api/tags/{tag_id} | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |
| POST /api/ai-suggestions | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |
| POST /api/errors | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |
| POST /api/errors/search | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |
| POST /api/errors/{error_id}/attempts | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |
| POST /api/errors/{error_id}/feedback | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |
| POST /api/series | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |
| PUT /api/series/{series_id}/order | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |
| GET /api/health (열려 있음) | 200 | 200 | 통과 |
| POST /api/auth/logout (열려 있음) | 204 | 204 | 통과 |
| POST /api/auth/login (열려 있음, 틀린 값은 401 문구) | 401 아이디 또는 비밀번호가 올바르지 않아요. | 401 아이디 또는 비밀번호가 올바르지 않아요. | 통과 |
| GET /api/auth/me | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |

### 3-4 B 조회

계정 B가 보는 목록·태그·시리즈·통계·검색에는 A의 것이 0건이어야 한다

| 항목 | 기대 | 실제 | 통과 |
|------|------|------|------|
| GET /errors (A-008) | 200, 0건 | 200, 0건 | 통과 |
| GET /tags (A-004) | 200, 0건 | 200, 0건 | 통과 |
| GET /series (A-004) | 200, 0건 | 200, 0건 | 통과 |
| GET /errors/stats (A-017) 모두 0 | {'total': 0, 'resolved': 0, 'unresolved': 0, 'reused_resolved': 0, 'stale_unresolved': 0} | {'total': 0, 'resolved': 0, 'unresolved': 0, 'reused_resolved': 0, 'stale_unresolved': 0} | 통과 |
| POST /errors/search (A-003) A의 해결 기록과 같은 메시지로 검색 | 200, 0건 | 200, 0건 | 통과 |
| GET /errors?series_id=A의 시리즈 (A-008) | 200, 0건 | 200, 0건 | 통과 |
| GET /errors?tag_id=A의 태그 (A-008) | 200, 0건 | 200, 0건 | 통과 |
| GET /errors?q=ZeroDivision (A-008) | 200, 0건 | 200, 0건 | 통과 |
| GET /errors?stale=true (A-008) | 200, 0건 | 200, 0건 | 통과 |
| B가 기록 2개 만든 뒤 B의 통계 | total 2, unresolved 2, resolved 0, reused 0 | {'total': 2, 'resolved': 0, 'unresolved': 2, 'reused_resolved': 0, 'stale_unresolved': 0} | 통과 |
| B의 태그 error_count는 B의 기록만 셈 | Python 1, Extra 1 | {'Extra': 1, 'python': 1} | 통과 |

### 3-2 B가 A의 ID를 경로에

B가 A의 에러·태그·시리즈 ID를 경로에 넣으면 없는 ID와 같은 404(같은 문구)여야 한다

| 항목 | 기대 | 실제 | 통과 |
|------|------|------|------|
| GET /errors/{id} (A-009) | 404 에러 기록을 찾을 수 없어요. | 404 에러 기록을 찾을 수 없어요. | 통과 |
| PATCH /errors/{id} (A-010) | 404 에러 기록을 찾을 수 없어요. | 404 에러 기록을 찾을 수 없어요. | 통과 |
| DELETE /errors/{id} (A-011) | 404 에러 기록을 찾을 수 없어요. | 404 에러 기록을 찾을 수 없어요. | 통과 |
| PATCH /errors/{id}/summary (A-007) | 404 에러 기록을 찾을 수 없어요. | 404 에러 기록을 찾을 수 없어요. | 통과 |
| POST /errors/{id}/attempts (A-006, 미해결 에러) | 404 없는 에러예요. | 404 없는 에러예요. | 통과 |
| POST /errors/{id}/feedback (A-016) | 404 에러 기록을 찾을 수 없어요. | 404 에러 기록을 찾을 수 없어요. | 통과 |
| PATCH /tags/{id} (A-012) | 404 태그를 찾을 수 없어요. | 404 태그를 찾을 수 없어요. | 통과 |
| DELETE /tags/{id} (A-012) | 404 태그를 찾을 수 없어요. | 404 태그를 찾을 수 없어요. | 통과 |
| PATCH /series/{id} (A-013) | 404 시리즈를 찾을 수 없어요. | 404 시리즈를 찾을 수 없어요. | 통과 |
| DELETE /series/{id} (A-013) | 404 시리즈를 찾을 수 없어요. | 404 시리즈를 찾을 수 없어요. | 통과 |
| PUT /series/{id}/order (A-014) | 404 시리즈를 찾을 수 없어요. | 404 시리즈를 찾을 수 없어요. | 통과 |

### 3-3 B가 요청 본문에 A의 참조를

B가 요청 본문에 A의 `series_id`·태그·`reused_from_id`를 넣으면 없는 참조와 같은 422로 거부되고 아무것도 저장되지 않아야 한다

| 항목 | 기대 | 실제 | 통과 |
|------|------|------|------|
| POST /errors series_id=A의 시리즈 (A-002) | 422 없는 시리즈예요. | 422 없는 시리즈예요. | 통과 |
| POST /errors tag_ids=[A의 태그] (A-002) | 422 없는 태그 ID가 있어요. | 422 없는 태그 ID가 있어요. | 통과 |
| POST /errors reused_from_id=A의 해결 기록 (A-002) | 422 재사용할 기록을 찾을 수 없어요. | 422 재사용할 기록을 찾을 수 없어요. | 통과 |
| PATCH /errors/{B의 것} series_id=A의 시리즈 (A-010) | 422 없는 시리즈예요. | 422 없는 시리즈예요. | 통과 |
| PATCH /errors/{B의 것} tag_ids=[A의 태그] (A-010) | 422 없는 태그 ID가 있어요. | 422 없는 태그 ID가 있어요. | 통과 |
| POST /errors/{B의 것}/attempts reused_from_id=A의 해결 기록 (A-006) | 422 재사용할 기록을 찾을 수 없어요. | 422 재사용할 기록을 찾을 수 없어요. | 통과 |
| 거부된 요청 뒤 B의 기록 수(부작용 없음) | 1건(B가 만든 것만) | 1건 | 통과 |
| 거부된 요청 뒤 B의 태그·시리즈 수 | 0, 0 | 0, 0 | 통과 |
| B의 에러가 A의 시리즈·태그를 갖지 않음 | series=None, tags=[] | series=None, tags=[] | 통과 |

### 3-5 같은 이름·중복

다른 계정은 같은 이름의 시리즈·태그를 따로 만들 수 있고(409 아님), 같은 계정 안의 중복은 409다

| 항목 | 기대 | 실제 | 통과 |
|------|------|------|------|
| B: A와 같은 이름의 시리즈 만들기 POST /series (A-015) | 201 | 201 | 통과 |
| B의 시리즈 id가 A의 것과 다름 | 다름 | A=4, B=5 | 통과 |
| B: A와 같은 이름(대소문자만 다름)의 새 태그로 저장 POST /errors (A-002) | 201 | 201 | 통과 |
| B의 태그가 A의 태그와 별개 | B 태그 2개, 어느 id도 A의 태그 id가 아님 | {'Extra': 8, 'python': 7}, A=[5, 6] | 통과 |
| B: 자기 시리즈와 같은 이름(공백·대소문자만 다름) POST /series | 409 이미 있는 이름이에요. | 409 이미 있는 이름이에요. | 통과 |
| A: 자기 시리즈와 같은 이름 POST /series | 409 이미 있는 이름이에요. | 409 이미 있는 이름이에요. | 통과 |
| B: 자기 태그를 자기 다른 태그 이름으로 PATCH /tags/{id} (A-012) | 409 이미 있는 이름이에요. | 409 이미 있는 이름이에요. | 통과 |
| A: 자기 태그를 자기 다른 태그 이름으로 PATCH /tags/{id} | 409 이미 있는 이름이에요. | 409 이미 있는 이름이에요. | 통과 |
| B: 시리즈 이름을 자기 다른 시리즈 이름으로 PATCH /series/{id} (A-013) | 409 이미 있는 이름이에요. | 409 이미 있는 이름이에요. | 통과 |

### 3-6 B의 삭제 시도 뒤

B가 A의 기록·시리즈·태그를 지우려 한 뒤에도 A의 데이터는 그대로여야 한다

| 항목 | 기대 | 실제 | 통과 |
|------|------|------|------|
| A의 통계(total/resolved/unresolved/reused_resolved) | {'total': 3, 'resolved': 2, 'unresolved': 1, 'reused_resolved': 1, 'stale_unresolved': 0} | {'total': 3, 'resolved': 2, 'unresolved': 1, 'reused_resolved': 1, 'stale_unresolved': 0} | 통과 |
| A의 목록 건수 | 3 | 3 | 통과 |
| A의 시리즈·태그 목록이 그대로 | 동일 | 동일 | 통과 |
| A의 각 기록 상세(시도·태그·시리즈·재사용 포함)가 그대로 | 동일 | 동일 | 통과 |

### 3-7 A의 기존 흐름

A로 기존 흐름(목록·필터·검색·시도 이어 붙이기·정리 수정·수정·순서·삭제)이 동작해야 한다

| 항목 | 기대 | 실제 | 통과 |
|------|------|------|------|
| GET /errors (A-008) 3건 | 200, 3건 | 200, 3건 | 통과 |
| GET /errors?status=resolved | 2건 | 2건 | 통과 |
| GET /errors?tag_id=Python | 2건(e1, e2) | 2건 | 통과 |
| GET /errors?series_id (시리즈 안 순서) | 3건, series_order 1,2,3 | [1, 2, 3] | 통과 |
| GET /errors?q=keyerror | 1건 | 1건 | 통과 |
| GET /series (A-004) error_count | 1개, error_count 3 | [('Alpha Series', 3)] | 통과 |
| GET /tags (A-004) error_count | Math 1, Python 2 | [('Math', 1), ('Python', 2)] | 통과 |
| GET /errors/stats (A-017) | total 3, resolved 2, unresolved 1, reused_resolved 1 | {'total': 3, 'resolved': 2, 'unresolved': 1, 'reused_resolved': 1, 'stale_unresolved': 0} | 통과 |
| POST /errors/search (A-003) | 해결된 e1, e3 포함 | [(6, 100), (8, 90)] | 통과 |
| GET /errors/{원본} (A-009) reuses | reuses 1건, reuse_count 1 | reuses=[8], reuse_count=1 | 통과 |
| POST /errors/{id}/attempts (A-006) 내 기록 + 내 reused_from_id | 201 | 201 | 통과 |
| A-006 결과: 해결 처리·재사용 연결·시도 2개 | resolved, reused_from_id=원본, 시도 2 | resolved, 6, 2 | 통과 |
| PATCH /errors/{id}/summary (A-007) | 200 | 200 | 통과 |
| POST /errors/{id}/feedback (A-016, Gemini 키 비워 호출하지 않음) | 200 unavailable(소유 확인은 통과) | 200 unavailable | 통과 |
| POST /ai-suggestions (A-005, Gemini 키 비워 호출하지 않음) | 200 unavailable | 200 unavailable | 통과 |
| PATCH /errors/{id} (A-010) 내 태그로 교체 | 200 | 200 | 통과 |
| PATCH /tags/{id} (A-012) 내 태그 이름 변경 | 200 | 200 | 통과 |
| PUT /series/{id}/order (A-014) 내 에러로 순서 바꾸기 | 200, 순서 eid3,eid2,eid1 | 200 [8, 7, 6] | 통과 |
| PUT /series/{id}/order 에 B의 에러 ID가 섞임 | 422 | 422 | 통과 |
| PATCH /series/{id} (A-013) 내 시리즈 이름 변경 | 200 | 200 | 통과 |
| DELETE /errors/{재사용 기록} (A-011) | 204 | 204 | 통과 |
| 삭제 뒤 A의 기록 수 | 2건 | 2건 | 통과 |
| DELETE /series/{id} (A-013) 내 시리즈 삭제(에러는 남음) | 204 | 204 | 통과 |
| 시리즈 삭제 뒤 A의 기록 수 | 2건 | 2건 | 통과 |
| DELETE /tags/{id} (A-012) 내 태그 삭제 | 204 | 204 | 통과 |
| 로그아웃 뒤 같은 쿠키로 접근 (POST /auth/logout → GET /errors) | 204 | 204 | 통과 |
| 로그아웃 뒤 GET /errors | 401 로그인이 필요해요. | 401 로그인이 필요해요. | 통과 |

### 정리

검증 후 정리

| 항목 | 기대 | 실제 | 통과 |
|------|------|------|------|
| 테스트 데이터 삭제 뒤 users/errors/series/tags/attempts/sessions 행 수가 실행 전과 같음 | 0, 0, 0, 0, 0, 0 | 0, 0, 0, 0, 0, 0 | 통과 |

## 4. 한계와 남은 확인

- 서버 단위(HTTP) 검증이다. 브라우저에서 두 계정을 번갈아 로그인하며 화면에 이전 계정 데이터가 남지 않는지는 사람이 확인해야 한다(SCREEN-SPEC_12 6절)
- 같은 이름 확인은 시리즈 `Alpha Series` 동일 이름, 태그는 대소문자만 다른 `Python`/`python`(같은 `name_key`)으로 했다
- 동시 요청(경합)으로 인한 중복, 세션 만료 경과, 14일 지난 오래된 기록의 계정 분리는 이 검증에 넣지 않았다. 오래된 기록은 `stale=true` 목록이 B에게 0건인 것만 확인했다
- A-005는 DB를 읽지 않으므로 소유 확인 대상이 아니다. 로그인 필요(401)만 확인했다

## 5. 변경 이력

| 버전 | 날짜 | 내용 |
|------|------|------|
| v1 | 2026-11-04 | 로그인 5-2단계 계정별 분리 검증 결과 최초 작성 |
