// A-025 내 기록 통계 탭 (Q-006, D-129). 팀원 1. fetch는 request()만 거친다 (D-056).
import { request } from '../../api'

export type RateItem = { numerator: number; denominator: number; rate: number | null }

export type TopErrorGroup = {
  title: string
  count: number
  resolved: number
  unresolved: number
  records: { id: number; created_at: string; status: 'unresolved' | 'resolved' }[]
}

export type TagUnresolvedItem = { id: number; name: string; total: number; unresolved: number }

export type Insights = {
  resolve_rate: RateItem
  reuse_rate: RateItem
  apply_success: RateItem
  apply_since: string
  stale_unresolved: number
  avg_attempts_fresh: number | null
  top_errors: TopErrorGroup[]
  tag_unresolved: TagUnresolvedItem[]
}

// 실패하면 예외를 던진다. 화면이 안내 문구와 "다시 시도"를 보여 준다.
export async function getInsights(signal?: AbortSignal): Promise<Insights> {
  const res = await request('/api/errors/insights', { signal })
  return (await res.json()) as Insights
}
