import { useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { getErrorStats, RECORDS_CHANGED_EVENT, type ErrorStats } from '../features/records/errorsApi'

// 사이드바 통계(A-017) 불러오기를 한 곳에 모은 훅 (D-155). Sidebar가 한 번만 부르고 SidebarStats·GrowthPlant에 값을 내려 준다.
// 화면을 옮길 때, 창에 다시 돌아왔을 때, 기록이 저장·삭제됐을 때 다시 불러오고 이전 요청은 취소한다.
// stats는 실패해도 이전 값을 둔다(없으면 null). failed는 마지막 요청이 실패했다는 뜻이다.
export function useErrorStats(): { stats: ErrorStats | null; failed: boolean } {
  const location = useLocation()
  const [stats, setStats] = useState<ErrorStats | null>(null)
  const [failed, setFailed] = useState(false)
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
      .then((next) => {
        setStats(next)
        setFailed(false)
      })
      .catch(() => {
        // 취소는 실패가 아니다. 실패해도 화면은 멈추지 않는다.
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [pathname, reloadKey])

  return { stats, failed }
}
