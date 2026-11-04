import { NavLink, useNavigate } from 'react-router'
import { useAuth } from '../features/auth/useAuth'
import '../features/auth/auth.css'
import SidebarStats from './SidebarStats.tsx'

// 메뉴는 두 개, 순서 고정 (D-005)
const MENUS = [
  { to: '/solve', label: '에러 해결' },
  { to: '/records', label: '내 기록' },
]

function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // 서버 로그아웃이 실패해도 사용자 상태를 비우고 /login으로 간다 (D-094)
  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="sidebar">
      <div className="app-name">🛠 에러 일기</div>
      <nav className="menu">
        {MENUS.map((menu) => (
          <NavLink
            key={menu.to}
            to={menu.to}
            className={({ isActive }) =>
              isActive ? 'menu-item active' : 'menu-item'
            }
          >
            {menu.label}
          </NavLink>
        ))}
      </nav>
      <SidebarStats />
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
