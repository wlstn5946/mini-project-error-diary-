# 에러 해결 일기

> 같은 에러를 두 번 검색하지 않도록 돕는 에러 해결 기록 앱.
> 에러 메시지를 입력하면 **내가 예전에 해결한 기록을 먼저** 찾아 보여주고, 기록이 없을 때만 **Claude가 해결 방법을 제안**합니다.

- 배포 주소: https://mini-project-error-diary.vercel.app
- 저장소: https://github.com/wlstn5946/mini-project-error-diary-
- 만든 사람: 김진수, 권하온

## 이런 문제를 풉니다

분명 예전에 해결한 에러인데 다시 만나면 해결법이 기억나지 않아 처음부터 검색하게 됩니다. 해결한 순간에 기록을 남기지 않으면 같은 문제를 다시 풉니다. 이 앱은 해결 과정을 "내 한 줄 정리"로 남기고, 다음에 같은 에러를 만났을 때 그 기록을 가장 먼저 보여줍니다.

## 사용 흐름

```
에러 입력 → 비슷한 기록 확인 → (없으면) AI 제안 → 시도 기록 → 해결 + 내 한 줄 정리 → 저장
```

1. **에러 입력**: Traceback을 붙여 넣습니다. 필수는 에러 메시지 하나이고, 상황·시리즈·태그는 선택입니다.
2. **비슷한 기록**: 입력이 멈추면 자동으로 내 해결 기록 중 유사도 60% 이상만 보여줍니다. "이 방법 써 보기"로 예전 해결법을 시도 1로 채워 시작합니다.
3. **AI 제안**: "해당 없음 → AI에게 묻기"를 누르면 Claude가 추정 원인·해결 제안·확신도를 줍니다.
4. **시도 기록**: 해 본 일과 결과(해결됨 / 해결 안 됨 / 일부 해결)를 남깁니다. 해결이 안 되면 실패한 시도를 함께 보내 다음 방법을 제안받습니다.
5. **한 줄 정리**: 해결됨이면 내 말로 한 줄 정리가 필수입니다. 저장하면 AI가 정리에 대한 피드백을 줍니다. 저장은 "기록 저장" 한 번에 이루어집니다.

## 주요 기능

**에러 해결**
- 비슷한 기록 검색: 파이썬 `difflib` 유사도 60% 이상, 경로·줄 번호·메모리 주소는 비교 전에 가림, 같은 해결법은 원본 기준으로 묶어 "재사용 N회" 표시
- AI 제안·AI 피드백·AI 태그 추천: Claude `claude-haiku-5-5`, 실패하면 `claude-sonnet-5-5`로 재시도 (태그 추천은 Haiku만)
- 내 과거 해결 기록 최대 3건을 AI에 함께 보내고, 보내기 전에 키·토큰·비밀번호·경로의 사용자 이름을 가림
- AI가 실패하거나 응답 형식이 깨져도 화면이 멈추지 않음

**내 기록**
- 날짜별 / 태그별 / 시리즈별 보기, 에러·한 줄 정리·상황·시도 내용 검색, 상태·태그 필터
- 미해결 기록 "이어서 해결", 14일 넘게 미해결이면 빨간 불로 알림
- 태그 관리(이름 변경·별칭·합치기·삭제), 시리즈 순서 바꾸기
- 에러 일기 상세(시도 타임라인), Markdown 내려받기·PDF 인쇄, 시리즈 전체 Markdown 내려받기
- 통계 탭(해결률, 재사용 해결, 써 보기 성공률, 오래된 미해결, 태그별 미해결), 해결 10개마다 자라는 사이드바 식물

**계정**
- 회원가입·로그인(비밀번호 argon2 해시, HttpOnly 쿠키 세션 7일), 계정마다 자기 기록만 조회
- 로그인 실패가 5번 쌓이면 가입 때 정한 보안 질문을 추가로 확인(계정은 잠그지 않음)

## 기술 스택

| 구분 | 사용 기술 |
|------|-----------|
| 화면 | React 19, Vite, TypeScript, React Router |
| 서버 | Python 3.12, FastAPI, SQLAlchemy, Uvicorn |
| DB | PostgreSQL (로컬 개발은 로컬 PostgreSQL) |
| AI | Anthropic Claude API (서버에서만 호출) |
| 배포 | Vercel (`vercel.json`: backend FastAPI + frontend Vite) |

## 폴더 구조

```
backend/
  app/
    main.py            앱 진입점 (모든 API는 /api 아래)
    routers/           auth, health, records, solve (API 29개)
    repositories/      테이블별 DB 접근 (SQL은 여기에만 둔다)
    models.py, db.py, config.py, security.py, error_text.py
  requirements.txt
frontend/
  src/
    api.ts             서버 호출은 request() 한 곳으로 모은다
    features/          기능별 화면·훅 (records, solve, auth)
    pages/, components/
docs/                  PRD, DECISIONS, SCREEN-SPEC, API-SPEC, DATA-MODEL, PROMPTS, SCENARIO-REVIEW
vercel.json            배포 설정
CLAUDE.md              작업 규칙
```

## 실행 방법

### 준비물
- Python 3.12, [uv](https://docs.astral.sh/uv/)
- Node.js, npm
- PostgreSQL (로컬 개발용)
- Anthropic API 키

### 1. 환경 변수

`backend/.env.example`을 `backend/.env`로 복사해서 값을 채웁니다. `.env`는 커밋하지 않습니다.

| 이름 | 설명 |
|------|------|
| `ANTHROPIC_API_KEY` | Claude API 키 |
| `DATABASE_URL` | PostgreSQL 접속 주소. 로컬 예: `postgresql://postgres:<비밀번호>@localhost:5432/error_diary` (비밀번호의 특수문자는 URL 인코딩) |
| `SESSION_COOKIE_SECURE` | `true`/`false`. 로컬(http)은 `false`, 배포(https)는 `true`. 비우면 `true` |

로컬 DB는 `error_diary` 이름으로 먼저 만들어 둡니다. 테이블은 서버가 시작될 때 없는 것만 자동으로 만듭니다.

### 2. 백엔드 (`backend/` 폴더에서)

```powershell
uv venv --python 3.12 .venv
uv pip install --python .venv\Scripts\python.exe -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

- 위 명령은 Windows 기준입니다. 서버가 켜졌는지는 `http://localhost:8000/api/health`로 확인합니다.
- 서버를 반드시 `backend/` 폴더에서 실행합니다. 저장소 루트에서 실행하면 `app` 모듈을 찾지 못합니다.

### 3. 프론트 (`frontend/` 폴더에서)

```powershell
npm install
npm run dev
```

- 개발 서버가 `/api` 요청을 `http://localhost:8000`으로 전달하므로 백엔드를 먼저 켜 둡니다.
- 빌드: `npm run build` (`tsc -b && vite build`), 린트: `npm run lint`

### 4. 처음 사용하기
회원가입 화면에서 계정을 만들고(아이디 3~20자 영문·숫자·`_`, 비밀번호 4~30자, 보안 질문·답변) 로그인합니다.

## 배포 (Vercel)

`vercel.json`이 backend(FastAPI)와 frontend(Vite)를 한 프로젝트로 묶고, `/api` 요청은 backend로, 나머지는 frontend로 보냅니다. Vercel 프로젝트 환경 변수에 `ANTHROPIC_API_KEY`, `DATABASE_URL`, `SESSION_COOKIE_SECURE`를 설정합니다. 서버리스 환경이라 DB 연결 풀은 쓰지 않습니다(NullPool).

## 문서

설계와 결정은 `docs/` 폴더에 있습니다. 각 폴더에서 파일 이름의 `_N`에서 **N이 가장 큰 파일이 최신**입니다.

| 폴더 | 내용 |
|------|------|
| `docs/PRD` | 만들 것 / 안 만들 것, 요구사항(R-), 완료 조건, 열린 질문(Q-) |
| `docs/DECISIONS` | 결정과 이유(D-) |
| `docs/SCREEN-SPEC` | 화면 흐름과 상태 |
| `docs/API-SPEC` | API 목록, 요청·응답 형식 |
| `docs/DATA-MODEL` | 테이블과 필드 규칙 |
| `docs/PROMPTS` | AI 프롬프트, 응답 JSON 형식, 수정 이력 |
| `docs/SCENARIO-REVIEW` | 검증 결과와 시나리오 |

작업 규칙(담당 영역, 문서 규칙, 코드 규칙)은 [CLAUDE.md](CLAUDE.md)에 있습니다.

## 개발하면서 지킨 규칙
- API 키는 `.env`에만 두고 코드·문서·로그에 적지 않습니다.
- 화면이 서버를 부르는 곳은 `frontend/src/api.ts`의 `request()` 한 곳입니다.
- SQL은 `backend/app/repositories/`에만 둡니다.
- 기능은 이슈로 적고, 브랜치에서 PR로 올립니다. 결정이 바뀌면 옛 행을 지우지 않고 "변경됨"으로 두고 새 결정 ID를 답니다.

## 알려진 한계와 다음에 할 것

아래는 구현했지만 부족한 점과 앞으로 **검토할 것**입니다. 지금 구현된 기능이 아닙니다.

| 아쉬운 점 | 검토할 것 |
|-----------|-----------|
| 로그인 시도 횟수 제한이 없다(5번 실패하면 보안 질문만 추가, 계정은 잠그지 않음) | 시도 제한, 계정 잠금, 이메일·비밀번호 찾기 |
| 별도 CSRF 토큰이 없고 `SameSite=Lax`와 같은 도메인에 기댄다 | CSRF 토큰 |
| 비밀번호 복잡도 규칙이 없다(4~30자) | 복잡도 규칙 |
| AI 호출 횟수·비용 한도를 따로 두지 않았다 | 일일 한도와 비용 확인 |
| 비슷한 기록을 글자 모양(`difflib`)으로만 비교한다 | 의미 기반 검색 |
| 한 번 지운 기록을 되돌릴 수 없다 | 여러 개 삭제, 삭제 되돌리기 |
| 내보내기가 기록 한 건·Markdown·PDF뿐이다 | `.docx`, 여러 기록 한 번에 내보내기 |
| 자동 테스트와 CI가 없다 | 테스트 자동화 |
| 목록에 페이지 나누기가 없다 | 페이지 나누기 |

그 밖에 나중에 검토할 것: 복습 퀴즈(D-004), 시도 출처 표시(D-032), 시도 내용 수정(D-047). 자세한 내용은 `docs/PRD`의 "나중에 (Later)"와 `docs/DECISIONS`를 봅니다.

## 테스트·검증 현황
- 자동 테스트와 CI는 아직 없습니다. 프론트는 `npm run lint`, `npm run build`(타입 검사)로 확인합니다.
- 계정별 기록 분리는 로그인 도입 시점에 서버를 직접 호출하는 임시 스크립트로 97개 항목을 검증했고 모두 통과했습니다. 스크립트는 저장소에 남기지 않았습니다. 결과는 `docs/SCENARIO-REVIEW`에 있습니다.

## 발표 자료

발표를 위해 만든 파일들입니다. 앱 실행과는 관계가 없습니다.

| 경로 | 내용 |
|------|------|
| `발표자료/` | 발표 슬라이드(`.pptx`)와 슬라이드 생성 스크립트 |
| `발표대본.md` | 슬라이드별 발표 대본, 시연 순서, 예상 질문 |
| `spec.md` | 발표 설계서 |
| `demo_masking_log.py` | 사례 발표용: 비교 전 마스킹의 유사도 변화를 터미널 로그로 보여 주는 스크립트 (`backend\.venv\Scripts\python.exe demo_masking_log.py`) |
| `1. 에러일기` ~ `8. 내기록창기본`, `사례*.png`, `민감한정보가리기.png` | 발표용 캡처와 이미지 |
| `에러해결창_예시.png`, `내기록창_예시.png` | 초기 설계 시안 (실제 화면과 다름) |
