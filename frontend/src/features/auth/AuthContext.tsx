import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError } from '../../api'
import { login as loginApi, logout as logoutApi, me, type AuthUser } from './authApi'
import { AuthContext, type AuthStatus } from './useAuth'

// 로그인 상태를 담는 Provider (공용). 상태의 모양·훅은 useAuth.ts에 있다.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('checking')
  const [errorMessage, setErrorMessage] = useState('')
  // "다시 시도"를 누를 때마다 올려서 me를 다시 부른다
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    me(controller.signal)
      .then((current) => {
        setUser(current)
        setStatus('ready')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        // 네트워크 오류를 비로그인으로 보지 않는다
        setErrorMessage(error instanceof ApiError ? error.message : '')
        setStatus('error')
      })
    return () => controller.abort()
  }, [attempt])

  const retry = useCallback(() => {
    setStatus('checking')
    setAttempt((n) => n + 1)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const current = await loginApi(username, password)
    setUser(current)
    setStatus('ready')
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutApi()
    } catch {
      // 서버 로그아웃은 항상 204가 정상이다. 실패해도 이 화면의 로그인 상태는 비운다.
    }
    setUser(null)
  }, [])

  const clearUser = useCallback(() => setUser(null), [])

  const value = useMemo(
    () => ({ user, status, errorMessage, retry, login, logout, clearUser }),
    [user, status, errorMessage, retry, login, logout, clearUser],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
