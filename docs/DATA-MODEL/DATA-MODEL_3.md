# DATA-MODEL: 에러 해결 일기 (v3)

## 1. 문서 설명
- 테이블과 필드 규칙을 담는 문서다. 기능 설명은 PRD, 결정 이유는 DECISIONS에 있으므로 여기서는 R-, D-, Q- ID로만 가리킨다.
- **이번 버전(v3)의 범위는 `series`, `tags`, `errors`, `error_tags`, `attempts` 테이블이다.**
  - 모두 구현됨 (`backend/app/models.py`). `errors`·`error_tags`는 A-002(팀원 1), `attempts`는 A-006(팀원 2)이 쓴다
- 이번 버전에서 다루지 않는 것:
  - 시리즈 안 순서 (Q-005)
  - 시도 출처 (`source`, D-032 Later)
  - 삭제 동작 (삭제 기능이 아직 없음)

## 2. DB
- 개발 중에는 SQLite를 쓰고, 이후 PostgreSQL로 전환한다. (D-009, D-010)
- 두 DB에서 모두 쓸 수 있는 타입만 쓴다.
- 연결은 SQLAlchemy를 쓰고, 테이블 정의는 `backend/app/models.py`에 둔다. (D-013)
- DB 파일 기본 경로는 `backend/data/error_diary.db`다. `.env`의 `DATABASE_PATH`로 바꿀 수 있다(상대 경로는 `backend/` 기준). (D-014)
- 테이블은 서버가 시작될 때 없는 것만 만든다. 이미 있는 테이블의 구조는 바꾸지 않는다. (D-014)
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
| `status` | TEXT | NOT NULL, `unresolved` / `resolved`, 기본 `unresolved` | 해결 상태 (D-028) |
| `summary` | TEXT | NULL 허용. `resolved`이면 반드시 값이 있음 | 내 한 줄 정리 (D-026) |
| `resolved_at` | TEXT | NULL 허용. `resolved`이면 반드시 값이 있음 | 해결 시각. 한국 시간 ISO 8601 (D-015) |
| `created_at` | TEXT | NOT NULL, 저장 시점 자동 | 등록 시각. 한국 시간 ISO 8601 (D-015) |

- 화면 표시: `unresolved` → "미해결", `resolved` → "해결" (D-028)
- `status`·`summary`·`resolved_at`은 A-006에서 `result=solved`일 때 한 트랜잭션으로 바꾼다. SQL은 `repositories/errors.py`의 `mark_resolved()` (D-026, D-030)

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

## 4. 변경 이력

| 버전 | 날짜 | 내용 |
|------|------|------|
| v1 | 2026-11-02 | 최초 작성: series 테이블(id, name UNIQUE, description, created_at) |
| v1 | 2026-11-02 | DB 연결·생성 방식 반영(D-013, D-014), 외래 키 ON, description NULL 허용, created_at 한국 시간 ISO(D-015). `backend/app/db.py`, `models.py` 구현 |
| v1 | 2026-11-02 | series `name` 중복 규칙 확정: 앞뒤 공백 제외, 대소문자 구분 안 함 (D-017) |
| v2 | 2026-11-02 | `tags` 테이블 추가(id, name, name_key UNIQUE, created_at), 이름 정규화 규칙(D-019), `error_tags`는 A-002 때 추가 예정으로 표시. series `name` 최대 길이는 [결정 필요] → Later |
| v3 | 2026-11-02 | `errors`(D-024), `error_tags`, `attempts` 테이블 정의(미구현). 상태·결과 영어 코드(D-028), `(error_id, seq)` UNIQUE, 해결 처리 트랜잭션(D-026, D-030), 길이 제한은 Later |
| v3 | 2026-11-02 | `errors`, `error_tags`, `attempts` 구현됨(`ErrorRecord`, `ErrorTag`, `Attempt`). 기존 DB에는 서버 시작 시 세 테이블만 추가된다(D-014) |
