import { Outlet } from 'react-router'
import Sidebar from './Sidebar.tsx'

// 공통 레이아웃: SCREEN-SPEC 3절
function Layout() {
  return (
    <div className="layout">
      <Sidebar />
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
