# DATA-MODEL: 에러 해결 일기 (v4)

## 1. 문서 설명
- 테이블과 필드 규칙을 담는 문서다. 기능 설명은 PRD, 결정 이유는 DECISIONS에 있으므로 여기서는 R-, D-, Q- ID로만 가리킨다.
- **이번 버전(v4)의 범위는 `series`, `tags`, `errors`, `error_tags`, `attempts` 테이블에 "시리즈 안 순서(`errors.series_order`)와 삭제·이름 변경 동작"을 더한 것이다.**
  - v3까지 구현됨 (`backend/app/models.py`). `errors`·`error_tags`는 A-002(팀원 1), `attempts`는 A-006(팀원 2)이 쓴다
  - 에러·태그·시리즈 삭제와 태그·시리즈 이름 변경 동작은 구현됨. `errors.series_order`와 시리즈 순서 바꾸기는 정의만 됨(미구현)
- 이번 버전에서 다루지 않는 것:
  - 시도 출처 (`source`, D-032 Later)
  - 태그 합치기 (D-049 Later), 삭제 되돌리기(D-043)

## 2. DB
- 개발 중에는 SQLite를 쓰고, 이후 PostgreSQL로 전환한다. (D-009, D-010)
- 두 DB에서 모두 쓸 수 있는 타입만 쓴다.
- 연결은 SQLAlchemy를 쓰고, 테이블 정의는 `backend/app/models.py`에 둔다. (D-013)
- DB 파일 기본 경로는 `backend/data/error_diary.db`다. `.env`의 `DATABASE_PATH`로 바꿀 수 있다(상대 경로는 `backend/` 기준). (D-014)
- 테이블은 서버가 시작될 때 없는 것만 만든다. 이미 있는 테이블의 구조는 바꾸지 않는다. (D-014)
- 예외(D-052): 이미 만들어진 테이블에 새 컬럼이 생기면 `init_db()`가 서버 시작 때 **없는 컬럼만** `ALTER TABLE … ADD COLUMN`으로 추가한다. 컬럼 삭제·이름 변경·타입 변경은 하지 않는다. 추가한 컬럼의 기존 행 값은 필요하면 같은 때 채운다(`errors.series_order`는 아래 참고).
- SQLite 외래 키 검사를 연결마다 켠다(`PRAGMA foreign_keys = ON`). PostgreSQL과 동작을 맞추기 위해서다.
- 날짜·시간은 ISO 8601 한국 시간 문자열로 저장한다. (D-015)

## 3. 테이블

### series
시리즈 목록. 새 시리즈는 에러를 저장할 때 함께 만든다. (D-006, D-011)

| 필드 | 타입 | 규칙 | 설명 |
|------|------|------|------|
| `id` | INTEGER | PK, 자동 증가 | 시리즈 ID |
| `name` | TEXT | NOT NULL, UNIQUE | 시리즈 이름 |
| `description` | TEXT | NULL 허용 | 시리즈 설명 (선택) |
| `created_at` | TEXT | NOT NULL, 저장 시점 자동 | 만든 시각. 한국 시간 ISO 8601 (`2026-11-02T15:00:00+09:00`, D-015) |

**`name` 중복 규칙** (D-017)
- 앞뒤 공백을 빼고, 대소문자를 구분하지 않고 비교한다. 예: `Python`과 ` python `은 같은 시리즈다.
- 현재 DB의 UNIQUE 제약은 글자 그대로 비교한다. 위 규칙은 화면(SeriesSelect)에서 확인하고, 에러 저장(A-002) 때 서버에서도 확인한다.

**Later**
- `name` 최대 길이 (태그 이름 길이와 함께 A-002 때 정한다)

### tags
태그 목록. 새 태그는 에러를 저장할 때 함께 만든다. (D-006, D-018, D-020)

| 필드 | 타입 | 규칙 | 설명 |
|------|------|------|------|
| `id` | INTEGER | PK, 자동 증가 | 태그 ID |
| `name` | TEXT | NOT NULL | 보이는 이름. 처음 입력한 표기 그대로 (예: `Python`) |
| `name_key` | TEXT | NOT NULL, UNIQUE | 비교용 값. 정규화한 `name`을 소문자로 바꾼 것 (예: `python`) |
| `created_at` | TEXT | NOT NULL, 저장 시점 자동 | 만든 시각. 한국 시간 ISO 8601 (D-015) |

**이름 정규화 규칙** (D-019)
1. 앞뒤 공백을 지운다.
2. 앞에 붙은 `#`을 모두 지운다.
3. 다시 앞뒤 공백을 지운다. 결과가 빈 문자열이면 태그로 쓰지 않는다.
- 예: `#AI`, ` AI `, `# AI` → `AI` (`name_key`는 `ai`)

**같은 태그 판단** (D-019)
- `name_key`가 같으면 같은 태그다. DB의 UNIQUE 제약으로 막는다.
- SQLite 전용 `COLLATE NOCASE`는 쓰지 않는다. PostgreSQL에서도 같게 동작하도록 `name_key`를 따로 저장한다. (D-009)
- 이미 있는 태그와 대소문자만 다르게 입력하면 기존 표기(`name`)를 쓴다.

**Later**
- `name` 최대 길이 (시리즈 이름 길이와 함께 A-002 때 정한다)

### errors
에러 기록. 새 에러로 확정되는 순간 A-002로 미해결 상태로 저장한다. (D-024, D-025)

| 필드 | 타입 | 규칙 | 설명 |
|------|------|------|------|
| `id` | INTEGER | PK, 자동 증가 | 에러 ID |
| `error_message` | TEXT | NOT NULL | 에러 메시지·Traceback (입력 필수) |
| `situation` | TEXT | NULL 허용 | 상황 (입력 선택, 시안 ① "상황 (선택)") |
| `series_id` | INTEGER | FK → `series.id`, NULL 허용 | 시리즈 (입력 선택) |
| `series_order` | INTEGER | NULL 허용. 시리즈가 없으면 NULL, 있으면 값이 있음 | 시리즈 안 순서 (D-051, 미구현) |
| `status` | TEXT | NOT NULL, `unresolved` / `resolved`, 기본 `unresolved` | 해결 상태 (D-028) |
| `summary` | TEXT | NULL 허용. `resolved`이면 반드시 값이 있음 | 내 한 줄 정리 (D-026) |
| `resolved_at` | TEXT | NULL 허용. `resolved`이면 반드시 값이 있음 | 해결 시각. 한국 시간 ISO 8601 (D-015) |
| `created_at` | TEXT | NOT NULL, 저장 시점 자동 | 등록 시각. 한국 시간 ISO 8601 (D-015) |

- 화면 표시: `unresolved` → "미해결", `resolved` → "해결" (D-028)
- `status`·`summary`·`resolved_at`은 A-006에서 `result=solved`일 때 한 트랜잭션으로 바꾼다. SQL은 `repositories/errors.py`의 `mark_resolved()` (D-026, D-030)

**`series_order` 규칙** (D-051, D-052)
- 에러를 시리즈에 넣을 때(A-002 저장, 수정으로 시리즈 변경) 그 시리즈에 이미 있는 에러의 `series_order` 최대값 + 1을 매긴다(첫 에러는 1). 시리즈가 바뀌면 새 시리즈의 마지막 순서가 된다. 같은 시리즈로 다시 보내면 순서는 그대로다.
- 순서를 매기는 곳은 `errors.create_error()` 안 한 곳이다. 에러를 만드는 어느 경로(에러 등록, 비슷한 기록의 "이 방법 적용" D-041)든 같게 동작한다.
- 에러를 지우거나 다른 시리즈로 옮겨 생긴 빈 번호는 그대로 둔다. 번호의 크기는 상대 순서만 뜻한다. 화면의 순서 번호는 이 값이 아니라 목록 위치(1부터)로 보여준다.
- 순서 바꾸기(A-014)는 그 시리즈의 에러 전체를 새 순서로 받아 `series_order`를 1부터 다시 매긴다.
- 컬럼을 추가하는 때(D-052), 이미 시리즈에 속한 에러는 그 시리즈 안에서 `created_at` 오름차순(같으면 `id` 오름차순)으로 1부터 채운다. 그 전에는 모두 NULL이다.

**Later**
- `error_message`, `situation`, `summary` 최대 길이

### error_tags
에러와 태그를 잇는 연결 테이블 (다대다, D-018). A-002가 에러를 저장할 때 함께 넣는다. (D-020)

| 필드 | 타입 | 규칙 | 설명 |
|------|------|------|------|
| `error_id` | INTEGER | PK(복합), FK → `errors.id` | 에러 |
| `tag_id` | INTEGER | PK(복합), FK → `tags.id` | 태그 |

- `(error_id, tag_id)` 복합 PK라 같은 에러에 같은 태그가 두 번 붙지 않는다.
- 에러 하나당 태그는 최대 5개다. A-002에서 서버가 검사한다. (D-022)

### attempts
시도 기록. A-006으로 저장한다. (R-004, D-026, D-027)

| 필드 | 타입 | 규칙 | 설명 |
|------|------|------|------|
| `id` | INTEGER | PK, 자동 증가 | 시도 ID |
| `error_id` | INTEGER | FK → `errors.id`, NOT NULL | 어떤 에러의 시도인지 |
| `seq` | INTEGER | NOT NULL, 에러마다 1부터. `(error_id, seq)` UNIQUE | 시도 번호 ("시도 N") |
| `action` | TEXT | NOT NULL | "무엇을 했나요" |
| `result` | TEXT | NOT NULL, `solved` / `failed` / `partial` | 결과 (D-028) |
| `created_at` | TEXT | NOT NULL, 저장 시점 자동 | 시도 저장 시각. 한국 시간 ISO 8601 (D-015) |

- 화면 표시: `solved` → "해결됨", `failed` → "해결 안 됨", `partial` → "일부 해결" (D-028)
- `seq`는 그 에러의 마지막 시도 번호 + 1이다. `(error_id, seq)` UNIQUE로 같은 번호가 두 번 저장되는 것을 막는다.
- `partial`이어도 에러는 `unresolved`로 남는다. (D-029)
- 이미 `resolved`인 에러에는 시도를 추가하지 않는다. (D-032)
- 시도 출처(`source`)는 넣지 않는다. (D-032 Later)
- SQL: `backend/app/repositories/attempts.py` (팀원 2, D-016)

**Later**
- `action` 최대 길이

### 삭제·이름 변경 동작 (D-043 ~ D-046, D-049, D-050)
- 에러·태그·시리즈 삭제와 태그·시리즈 이름·설명 변경은 구현됨(`errors.delete_error()`, `tags.delete_tag()`·`rename_tag()`, `series.delete_series()`·`rename_series()`·`set_description()`).
- 시리즈 삭제에서 `series_order`를 함께 비우는 것과 순서 바꾸기는 `series_order` 컬럼을 추가할 때(D-051, D-052) 구현한다. 지금은 `series_id`만 비운다.
외래 키 검사가 켜져 있고 `ON DELETE CASCADE`는 쓰지 않으므로(D-044), 지우는 순서를 코드(repository)에서 지킨다. 모든 삭제·이름 변경은 한 트랜잭션이고, 중간에 실패하면 아무것도 바뀌지 않는다.

| 동작 | 처리 순서 |
|------|-----------|
| 에러 삭제 | `attempts`(그 에러의 시도 전부) → `error_tags`(그 에러의 연결 전부) → `errors` |
| 태그 삭제 | `error_tags`(그 태그의 연결 전부) → `tags`. 에러는 그대로 남고 태그만 빠진다 (D-050) |
| 시리즈 삭제 | 그 시리즈에 속한 에러의 `series_id`, `series_order`를 NULL로 → `series`. 에러는 그대로 남는다 (D-050) |
| 태그 이름 변경 | `name`과 `name_key`를 함께 바꾼다. 정규화 후 같은 `name_key`가 다른 태그에 있으면 막는다(409). 같은 태그의 대소문자만 바꾸는 것은 허용 (D-019, D-049) |
| 시리즈 이름·설명 변경 | `name`을 바꿀 때 공백을 빼고 대소문자를 무시한 같은 이름이 다른 시리즈에 있으면 막는다(409, D-017, D-049). 설명은 비우면 NULL (D-054) |
| 시리즈 순서 바꾸기 | 그 시리즈의 에러 전체의 `series_order`를 새 순서대로 1부터 다시 매긴다 (D-051) |

- 에러를 지워서 쓰이지 않게 된 태그·시리즈는 지우지 않는다 (D-046).
- 시도(`attempts`)만 따로 지우는 기능은 없다. 시도 삭제 SQL은 `repositories/attempts.py`(팀원 2 파일)에 팀원 1이 추가한다 (D-045).

## 4. 변경 이력

| 버전 | 날짜 | 내용 |
|------|------|------|
| v1 | 2026-11-02 | 최초 작성: series 테이블(id, name UNIQUE, description, created_at) |
| v1 | 2026-11-02 | DB 연결·생성 방식 반영(D-013, D-014), 외래 키 ON, description NULL 허용, created_at 한국 시간 ISO(D-015). `backend/app/db.py`, `models.py` 구현 |
| v1 | 2026-11-02 | series `name` 중복 규칙 확정: 앞뒤 공백 제외, 대소문자 구분 안 함 (D-017) |
| v2 | 2026-11-02 | `tags` 테이블 추가(id, name, name_key UNIQUE, created_at), 이름 정규화 규칙(D-019), `error_tags`는 A-002 때 추가 예정으로 표시. series `name` 최대 길이는 [결정 필요] → Later |
| v3 | 2026-11-02 | `errors`(D-024), `error_tags`, `attempts` 테이블 정의(미구현). 상태·결과 영어 코드(D-028), `(error_id, seq)` UNIQUE, 해결 처리 트랜잭션(D-026, D-030), 길이 제한은 Later |
| v3 | 2026-11-02 | `errors`, `error_tags`, `attempts` 구현됨(`ErrorRecord`, `ErrorTag`, `Attempt`). 기존 DB에는 서버 시작 시 세 테이블만 추가된다(D-014) |
| v4 | 2026-11-02 | `errors.series_order` 정의(D-051: 시리즈에 넣을 때 마지막 순서 + 1, `create_error()` 한 곳에서 매김, 빈 번호는 그대로, 컬럼 추가 시 기존 행은 `created_at` 순으로 채움), 기존 DB에 없는 컬럼만 추가하는 예외(D-052), 삭제·이름 변경 동작 절 추가(D-043 ~ D-046, D-049, D-050, D-054). 모두 미구현 |
| v4 | 2026-11-02 | 에러 삭제 동작 구현됨(`errors.delete_error()`, 시도 삭제는 `attempts.delete_by_error_id()`, D-044, D-045). 나머지(태그·시리즈 삭제·이름 변경, `series_order`)는 미구현 |
| v4 | 2026-11-02 | 태그·시리즈 삭제와 이름·설명 변경 동작 구현됨(삭제는 연결·소속을 먼저 지우거나 비운 뒤 한 트랜잭션, 이름 변경은 `name`·`name_key` 함께). `series_order`와 관련된 부분(삭제 시 비우기, 순서 바꾸기)은 컬럼과 함께 구현 예정 |
