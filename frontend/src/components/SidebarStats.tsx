import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { getErrorStats, RECORDS_CHANGED_EVENT, type ErrorStats } from '../features/records/errorsApi'
import StaleDot from './StaleDot'

// 사이드바 대시보드 (시안 내기록창_예시.png의 "에러 기록 N개 · 해결 · 미해결 · 재사용 해결", D-074).
// 한 칸에 한 줄씩 4칸이다. 에러 기록·해결·미해결은 누르면 내 기록의 전체·해결·미해결 보기로 간다.
// 재사용 해결은 모아 보는 필터가 없어서 이동 없이 표시만 한다.
// 개수는 화면을 옮길 때, 창에 다시 돌아왔을 때, 기록이 저장·삭제됐을 때 다시 불러온다. 실패하면 이전 값(없으면 "-")을 둔다.

type Tone = 'all' | 'resolved' | 'unresolved' | 'reuse'

type Row = {
  key: Tone
  label: string
  unit: string
  value: number | null
  // 없으면 누를 수 없는 표시 칸이다
  to?: string
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

  const rows: Row[] = [
    { key: 'all', label: '에러 기록', unit: '개', value: stats?.total ?? null, to: '/records' },
    { key: 'resolved', label: '해결', unit: '개', value: stats?.resolved ?? null, to: '/records?status=resolved' },
    {
      key: 'unresolved',
      label: '미해결',
      unit: '개',
      value: stats?.unresolved ?? null,
      to: '/records?status=unresolved',
      staleCount: stats?.stale_unresolved ?? 0,
    },
    { key: 'reuse', label: '재사용 해결', unit: '회', value: stats?.reused_resolved ?? null },
  ]

  return (
    <section className="sidebar-stats" aria-label="내 기록 통계">
      {rows.map((row) => {
        const text = row.value === null ? '-' : `${row.value}${row.unit}`
        const stale = row.staleCount ?? 0
        const content = (
          <>
            <span className="stat-label">
              {stale > 0 && <StaleDot label={`14일 이상 지난 미해결 기록 ${stale}개`} />}
              {row.label}
            </span>
            <span className="stat-value">{text}</span>
          </>
        )
        if (!row.to) {
          return (
            <div key={row.key} className={`stat stat-${row.key} static`}>
              {content}
            </div>
          )
        }
        // 지금 보고 있는 내 기록 보기(전체·해결·미해결)와 같은 칸은 강조한다. 탭·태그 등 다른 조건이 붙어 있으면 강조하지 않는다.
        const [targetPath, targetSearch = ''] = row.to.split('?')
        const active = location.pathname === targetPath && location.search === (targetSearch ? `?${targetSearch}` : '')
        return (
          <Link
            key={row.key}
            to={row.to}
            className={`stat stat-${row.key}${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
            aria-label={`내 기록 ${row.label} 보기 · ${text}${stale > 0 ? ` · 14일 이상 지난 미해결 기록 ${stale}개` : ''}`}
          >
            {content}
          </Link>
        )
      })}
    </section>
  )
}

export default SidebarStats
