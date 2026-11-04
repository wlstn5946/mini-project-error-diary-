// 회원가입·로그인·로그아웃·내 정보 API 호출 (공용, A-018 ~ A-021). fetch를 직접 쓰지 않고 api.ts의 request()로 한다 (D-056).
import { ApiError, jsonInit, request } from '../../api'

// 서버 규칙과 같은 값이다. 화면은 안내용이고 실제 판단은 서버(422·409)가 한다.
// backend/app/routers/auth.py의 USERNAME_PATTERN, PASSWORD_MIN, PASSWORD_MAX를 고치면 여기도 함께 고친다. (D-092, D-099)
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/
export const USERNAME_RULE = '3~20자, 영문 대소문자·숫자·_만 쓸 수 있어요.'
export const PASSWORD_MIN = 4
export const PASSWORD_MAX = 30
export const PASSWORD_RULE = `${PASSWORD_MIN}~${PASSWORD_MAX}자로 입력해 주세요.`

// A-018 ~ A-021의 계정 응답. password_hash·토큰은 오지 않는다.
export type AuthUser = { id: number; username: string; created_at: string }

// 서버가 422(규칙 위반)를 FastAPI 기본 검증 응답(detail 배열)으로 주므로, 화면에 보여줄 문구를 여기서 정한다.
const REGISTER_KNOWN = { 422: `아이디는 ${USERNAME_RULE} 비밀번호는 ${PASSWORD_RULE}` }

async function readUser(res: Response): Promise<AuthUser> {
  return (await res.json()) as AuthUser
}

// A-018. 가입만 하고 로그인(쿠키)은 하지 않는다 (D-090). 같은 아이디면 서버 문구(409)가 ApiError에 담긴다.
export async function register(username: string, password: string): Promise<AuthUser> {
  const res = await request('/api/auth/register', jsonInit('POST', { username, password }), undefined, REGISTER_KNOWN)
  return readUser(res)
}

// A-019. 실패(401)는 서버 문구 "아이디 또는 비밀번호가 올바르지 않아요."가 ApiError에 담긴다 (D-090).
export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await request('/api/auth/login', jsonInit('POST', { username, password }))
  return readUser(res)
}

// A-020. 서버는 항상 204를 준다. 호출하는 쪽이 실패해도 로그아웃 처리를 이어간다 (D-094).
export async function logout(): Promise<void> {
  await request('/api/auth/logout', { method: 'POST' })
}

// A-021. 로그인 상태면 계정을, 401이면 null(로그인하지 않음)을 돌려준다. 네트워크 오류·서버 오류는 ApiError를 던진다.
export async function me(signal?: AbortSignal): Promise<AuthUser | null> {
  try {
    const res = await request('/api/auth/me', { signal })
    return await readUser(res)
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}
