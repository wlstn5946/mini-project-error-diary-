import { useEffect } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router'
import { setUnauthorizedHandler } from './api'
import Layout from './components/Layout.tsx'
import { AuthProvider } from './features/auth/AuthContext'
import './features/auth/auth.css'
import { useAuth } from './features/auth/useAuth'
import LoginPage from './pages/LoginPage.tsx'
import NotFoundPage from './pages/NotFoundPage.tsx'
import RecordDetailPage from './pages/RecordDetailPage.tsx'
import RecordsPage from './pages/RecordsPage.tsx'
import RegisterPage from './pages/RegisterPage.tsx'
import SolvePage from './pages/SolvePage.tsx'

const FIRST_SCREEN = '/solve'
const GUEST_PATHS = ['/login', '/register']

// 로그인한 뒤 돌아갈 주소. 내부 경로(경로+쿼리)만 받는다.
function returnPath(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return FIRST_SCREEN
  if (GUEST_PATHS.some((path) => from === path || from.startsWith(`${path}?`))) return FIRST_SCREEN
  return from
}

// 로그인해야 열리는 화면. 비로그인이면 원래 주소를 state로 넘기며 /login으로 보낸다 (D-103).
function RequireAuth() {
  const { user } = useAuth()
  const location = useLocation()
  if (user === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

// /login, /register. 이미 로그인했으면 원래 주소(있으면) 또는 첫 화면으로 보낸다.
// 로그인 성공 직후에도 이 가드가 이동을 맡는다 (D-103).
function GuestOnly() {
  const { user } = useAuth()
  const location = useLocation()
  if (user !== null) return <Navigate to={returnPath(location.state)} replace />
  return <Outlet />
}

// 앱 시작 때 로그인 상태(me)를 확인한 뒤에 화면을 그린다. 확인이 끝나기 전에는 아무 화면도 그리지 않는다.
function AppRoutes() {
  const { user, status, errorMessage, retry, clearUser } = useAuth()
  const navigate = useNavigate()

  // api.ts의 request()가 401을 받으면(로그인 API 제외) 사용자 상태를 비우고 현재 주소를 넘겨 /login으로 보낸다 (D-102)
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearUser()
      const { pathname, search } = window.location
      if (GUEST_PATHS.includes(pathname)) return
      navigate('/login', { replace: true, state: { from: pathname + search } })
    })
    return () => setUnauthorizedHandler(null)
  }, [clearUser, navigate])

  if (status === 'checking') return null
  if (status === 'error') {
    // 네트워크·서버 오류는 비로그인으로 보지 않는다
    return (
      <main className="auth-page">
        <div className="auth-card">
          <p className="auth-error" role="alert">
            {errorMessage || '로그인 상태를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.'}
          </p>
          <button type="button" className="btn-primary auth-submit" onClick={retry}>
            다시 시도
          </button>
        </div>
      </main>
    )
  }

  // 화면 목록·이동 규칙: SCREEN-SPEC 2절, 5절
  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
      </Route>
      <Route element={<RequireAuth />}>
        {/* key: 로그인한 계정이 바뀌면 보호 화면 전체를 새로 마운트해 이전 계정의 화면 상태가 남지 않게 한다 (D-106) */}
        <Route element={<Layout key={user?.id} />}>
          <Route index element={<Navigate to={FIRST_SCREEN} replace />} />
          <Route path="solve" element={<SolvePage />} />
          <Route path="records" element={<RecordsPage />} />
          {/* 에러 일기 상세 (D-037). "내 기록" 메뉴 강조가 유지된다 */}
          <Route path="records/:id" element={<RecordDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

export default App
