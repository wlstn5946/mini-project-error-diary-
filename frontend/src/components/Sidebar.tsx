import { NavLink } from 'react-router'

// 메뉴는 두 개, 순서 고정 (D-005)
const MENUS = [
  { to: '/solve', label: '에러 해결' },
  { to: '/records', label: '내 기록' },
]

function Sidebar() {
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
    </aside>
  )
}

export default Sidebar
