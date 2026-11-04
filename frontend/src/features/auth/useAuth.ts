import { createContext, useContext } from 'react'
import type { AuthUser } from './authApi'

// 현재 로그인한 사용자와 로그인 상태 (공용). 앱 시작 때 me를 한 번 불러 확인한다.
// checking: 확인 중(보호 화면도 로그인 화면도 그리지 않는다), ready: 확인 끝(user가 null이면 비로그인), error: 확인하지 못함(네트워크·서버 오류)
export type AuthStatus = 'checking' | 'ready' | 'error'

export type AuthValue = {
  user: AuthUser | null
  status: AuthStatus
  // status가 error일 때 보여줄 안내 문구
  errorMessage: string
  retry: () => void
  login: (username: string, password: string) => Promise<void>
  // 서버 로그아웃이 실패해도 사용자 상태는 비운다 (D-094)
  logout: () => Promise<void>
  // 401을 받았을 때처럼 서버 호출 없이 상태만 비운다
  clearUser: () => void
}

export const AuthContext = createContext<AuthValue | null>(null)


export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (value === null) throw new Error('useAuth는 AuthProvider 안에서만 쓸 수 있다')
  return value
}
