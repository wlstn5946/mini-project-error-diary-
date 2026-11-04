// 서버 호출은 이 파일의 request() 한 곳에서 한다 (D-056). 화면 파일은 API 함수(*Api.ts)만 부른다.
// 서버 주소는 vite 프록시(/api → 백엔드)가 정하므로 여기서는 /api 경로만 쓴다. 쿠키는 같은 도메인이라 fetch 옵션을 따로 바꾸지 않는다.
// 로그인 세션이 만료되거나 로그인하지 않아 401을 받으면 등록된 핸들러를 부른다(아래 setUnauthorizedHandler, D-089, D-102).
// 오류 문구도 여기서 정한다. 실패하면 화면에 그대로 보여줄 문구를 담은 ApiError를 던진다.

export class ApiError extends Error {
  // 서버가 준 상태 코드. 네트워크 오류면 null
  status: number | null
  // 로그인 실패 응답이 보안 질문을 함께 줬을 때만 있다 (실패 5회 이상 계정, D-116)
  securityQuestion: string | null

  constructor(message: string, status: number | null, securityQuestion: string | null = null) {
    super(message)
    this.status = status
    this.securityQuestion = securityQuestion
  }
}

export const JSON_HEADERS = { 'Content-Type': 'application/json' }
export const RENAME_FAILED = '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
export const DELETE_FAILED = '삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
const REQUEST_FAILED = '서버와 통신하지 못했어요. 잠시 뒤 다시 시도해 주세요.'

// 이름 변경·삭제·순서 바꾸기 요청에서 서버 안내 대신 쓰는 문구 (404 이미 삭제됨, 409 이름 중복 D-049)
export const GONE_OR_TAKEN: Record<number, string> = {
  404: '이미 삭제된 항목이에요.',
  409: '이미 있는 이름이에요.',
}

// 401을 받았을 때 부를 핸들러. App에서 등록한다: 사용자 상태를 비우고 /login으로 보낸다 (D-102).
let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler
}

// 로그인 API(/api/auth/)의 401은 "아이디 또는 비밀번호가 올바르지 않아요."처럼 화면에 문구를 보여야 하고
// 앱 시작 때 me의 401은 "로그인하지 않음"이라는 정상 결과라서 핸들러를 부르지 않는다.
const AUTH_URL_PREFIX = '/api/auth/'

// 성공이면 Response를 돌려준다. 실패하면 ApiError를 던진다: known에 그 상태 코드의 문구가 있으면 그것을,
// 서버가 준 안내 문구(detail 문자열)가 있으면 그것을, 없으면 fallback을 쓴다.
export async function request(
  url: string,
  init?: RequestInit,
  fallback: string = REQUEST_FAILED,
  known?: Record<number, string>,
): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new ApiError(fallback, null)
  }
  if (res.ok) return res
  if (res.status === 401 && !url.startsWith(AUTH_URL_PREFIX)) unauthorizedHandler?.()
  if (known?.[res.status]) throw new ApiError(known[res.status], res.status)
  const data = await res.json().then((body) => body, () => null)
  const detail = data?.detail
  const question = typeof data?.security_question === 'string' ? data.security_question : null
  throw new ApiError(typeof detail === 'string' ? detail : fallback, res.status, question)
}

// JSON 본문을 보내는 요청의 init
export function jsonInit(method: 'POST' | 'PATCH' | 'PUT', body: unknown, signal?: AbortSignal): RequestInit {
  return { method, headers: JSON_HEADERS, body: JSON.stringify(body), signal }
}
