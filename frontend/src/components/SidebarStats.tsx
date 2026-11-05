import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { getErrorStats, RECORDS_CHANGED_EVENT, type ErrorStats } from '../features/records/errorsApi'
import StaleDot from './StaleDot'
import { matchSubView, SUB_VIEWS, type SubViewKey } from './sidebarNav'

// 사이드바 "내 기록" 하위 보기 (D-146, 이전 이름 사이드바 대시보드: D-074, D-110). 전체·해결·미해결 3줄이고
// 누르면 내 기록의 전체·해결·미해결 보기로 간다. "재사용 해결"은 목록 필터가 아니라 통계 탭 항목이라 사이드바에서 뺐다(값은 통계 탭 카드에 있다, D-129).
// 개수는 화면을 옮길 때, 창에 다시 돌아왔을 때, 기록이 저장·삭제됐을 때 다시 불러온다. 실패하면 이전 값(없으면 "-")을 둔다.

type Row = {
  key: SubViewKey
  label: string
  unit: string
  value: number | null
  to: string
  // 1 이상이면 칸에 깜빡이는 빨간 불을 켠다: 14일 이상 지난 미해결 기록이 있다는 뜻이다 (D-078)
  staleCount?: number
}

function SidebarStats() {
  const location = useLocation()
  const [stats, setStats] = useState<ErrorStats | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // 기록이 저장·삭제되거나 창으로 돌아오면 다시 불러온다
  useEffect(() => {
    const reload = () => setReloadKey((k) => k + 1)
    window.addEventListener(RECORDS_CHANGED_EVENT, reload)
    window.addEventListener('focus', reload)
    return () => {
      window.removeEventListener(RECORDS_CHANGED_EVENT, reload)
      window.removeEventListener('focus', reload)
    }
  }, [])

  // 화면을 옮길 때도 다시 불러온다(주소의 필터가 바뀔 때마다 부르지 않도록 경로만 본다)
  const pathname = location.pathname
  useEffect(() => {
    const controller = new AbortController()
    getErrorStats(controller.signal)
      .then(setStats)
      .catch(() => {
        // 실패해도 화면은 멈추지 않는다. 이전 값이 있으면 그대로 두고, 없으면 "-"로 보인다.
      })
    return () => controller.abort()
  }, [pathname, reloadKey])

  const values: Record<SubViewKey, number | null> = {
    all: stats?.total ?? null,
    resolved: stats?.resolved ?? null,
    unresolved: stats?.unresolved ?? null,
  }
  const rows: Row[] = SUB_VIEWS.map((view) => ({
    key: view.key,
    label: view.label,
    unit: '개',
    value: values[view.key],
    to: view.to,
    // 미해결 줄에만: 14일 이상 지난 미해결 기록이 있으면 빨간 불 (D-078)
    staleCount: view.key === 'unresolved' ? (stats?.stale_unresolved ?? 0) : 0,
  }))

  // 주소가 하위 항목과 경로·쿼리까지 정확히 같을 때만 그 항목을 배경 강조한다 (D-146). 부모 "내 기록"의 강조는 Sidebar가 같은 판단(matchSubView)으로 정한다.
  const activeKey = matchSubView(location.pathname, location.search)

  return (
    <ul className="sidebar-stats" aria-label="내 기록 보기">
      {rows.map((row) => {
        const text = row.value === null ? '-' : `${row.value}${row.unit}`
        const stale = row.staleCount ?? 0
        const active = activeKey === row.key
        return (
          <li key={row.key}>
            <Link
              to={row.to}
              className={`stat stat-${row.key}${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
              aria-label={`내 기록 ${row.label} 보기 · ${text}${stale > 0 ? ` · 14일 이상 지난 미해결 기록 ${stale}개` : ''}`}
            >
              <span className="stat-label">
                {stale > 0 && <StaleDot label={`14일 이상 지난 미해결 기록 ${stale}개`} />}
                {row.label}
              </span>
              <span className="stat-value">{text}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export default SidebarStats
