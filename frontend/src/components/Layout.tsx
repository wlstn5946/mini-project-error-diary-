import { Outlet } from 'react-router'
import cornerCapybara from '../assets/mascot/corner-capybara.png'
import Sidebar from './Sidebar.tsx'

// 공통 레이아웃: SCREEN-SPEC 3절
// 본문 오른쪽 위의 카피바라는 모든 화면에 보이는 장식이다 (D-156). 눌리지 않고, 못 불러오면 그림만 빠진다.
function Layout() {
  return (
    <div className="layout">
      <Sidebar />
      <main className="content">
        <div className="content-inner">
          <img
            className="corner-capybara"
            src={cornerCapybara}
            alt=""
            aria-hidden="true"
            width={160}
            decoding="async"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export default Layout
