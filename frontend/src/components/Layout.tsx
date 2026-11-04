import { Outlet } from 'react-router'
import Sidebar from './Sidebar.tsx'

// 공통 레이아웃: SCREEN-SPEC 3절
function Layout() {
  return (
    <div className="layout">
      <Sidebar />
      <main className="content">
        <div className="content-inner">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export default Layout
