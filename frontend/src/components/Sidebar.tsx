import logo from '../assets/mascot/logo.svg'
import { Link, NavLink, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../features/auth/useAuth'
import '../features/auth/auth.css'
import GrowthPlant from './GrowthPlant'
import SidebarStats from './SidebarStats.tsx'
import { useErrorStats } from './useErrorStats'
import { isRecordsPath, matchSubView } from './sidebarNav'

// 최상위 메뉴는 두 개, 순서 고정: 에러 해결 → 내 기록 (D-005). "내 기록" 바로 아래 하위 보기 3개는 메뉴가 아니라 바로가기다 (D-146).

function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // 통계(A-017)는 여기서 한 번만 불러와 하위 목록과 식물에 같이 내려 준다 (D-155)
  const { stats, failed } = useErrorStats()
  // "내 기록" 강조 (D-146): 하위 항목과 주소가 정확히 같으면 글자색만(배경 강조는 그 하위 항목이 가진다),
  // 그 밖의 /records 화면(탭·필터가 붙은 목록, 상세 포함)이면 배경 강조. aria-current는 배경 강조에만 붙인다.
  const subActive = matchSubView(location.pathname, location.search) !== null
  const recordsBg = isRecordsPath(location.pathname) && !subActive
  const recordsClass = recordsBg ? 'menu-item active' : subActive ? 'menu-item parent-current' : 'menu-item'

  // 서버 로그아웃이 실패해도 사용자 상태를 비우고 /login으로 간다 (D-094)
  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="sidebar">
      <div className="app-name brand-logo">
        <img src={logo} alt="" aria-hidden="true" width={20} height={20} />
        에러 일기
      </div>
      <nav className="menu" aria-label="메뉴">
        <NavLink to="/solve" className={({ isActive }) => (isActive ? 'menu-item active' : 'menu-item')}>
          에러 해결
        </NavLink>
        <Link to="/records" className={recordsClass} aria-current={recordsBg ? 'page' : undefined}>
          내 기록
        </Link>
        <SidebarStats stats={stats} />
      </nav>
      {/* 식물: 통계를 모르거나 마지막 요청이 실패하면 그리지 않는다 (D-155) */}
      <GrowthPlant resolved={failed ? null : (stats?.resolved ?? null)} />
      {/* 맨 아래 계정 영역. 메뉴 항목이 아니라서 메뉴는 그대로 두 개다 (D-005) */}
      <div className="sidebar-account">
        <div className="account-name">{user?.username}</div>
        <button type="button" className="btn-secondary account-logout" onClick={handleLogout}>
          로그아웃
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
