import { useEffect, useState } from 'react'
import { getError, searchSimilarErrors, type ErrorDetail, type SimilarError } from '../records/errorsApi'

// 이어서 해결하기 (D-075). /solve?retry={id}로 들어오면 미해결 기록을 불러오고(A-009), 바로 한 번 비슷한 기록을 찾아(A-003, 300ms 대기 없음)
// 첫 탭을 정한다. 비슷한 기록이 1건 이상이면 "에러 입력" 탭, 0건이면 "AI 제안 → 시도 기록" 탭이다.
// A-003이 실패하면(items가 null) 기존 실패 안내를 보여주는 "에러 입력" 탭으로 간다.

export type RetryTab = 'input' | 'analysis'

export type RetryState =
  | { status: 'off' }
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'resolved'; id: number }
  | { status: 'error'; reload: () => void }
  | { status: 'ready'; detail: ErrorDetail; similar: SimilarError[] | null; entryTab: RetryTab }

type Outcome =
  | { kind: 'not-found' }
  | { kind: 'resolved'; id: number }
  | { kind: 'error' }
  | { kind: 'ready'; detail: ErrorDetail; similar: SimilarError[] | null }

// 결과가 어느 요청의 것인지 key로 구분한다. 현재 key와 다르면 아직 불러오는 중이다 (RecordDetailPage와 같은 방식).
type Loaded = { key: string; outcome: Outcome }

// 양의 정수 문자열만 받는다. 그 밖(없음, abc, 0, 1.5)은 null이라 일반 모드로 처리한다.
export function parseRetryId(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

export function useRetryRecord(id: number | null): RetryState {
  const [reloadKey, setReloadKey] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const key = `${id}|${reloadKey}`

  useEffect(() => {
    if (id === null) return
    const controller = new AbortController()
    const finish = (outcome: Outcome) => {
      if (!controller.signal.aborted) setLoaded({ key, outcome })
    }
    async function load(retryId: number) {
      try {
        const detail = await getError(retryId, controller.signal)
        if (detail === null) return finish({ kind: 'not-found' })
        if (detail.status === 'resolved') return finish({ kind: 'resolved', id: retryId })
        // 실패하면 null이다 (예외를 던지지 않는다)
        const similar = await searchSimilarErrors(detail.error_message.trim(), controller.signal)
        finish({ kind: 'ready', detail, similar })
      } catch {
        finish({ kind: 'error' })
      }
    }
    void load(id)
    return () => controller.abort()
  }, [id, key])

  if (id === null) return { status: 'off' }
  if (loaded?.key !== key) return { status: 'loading' }
  const { outcome } = loaded
  switch (outcome.kind) {
    case 'not-found':
      return { status: 'not-found' }
    case 'resolved':
      return { status: 'resolved', id: outcome.id }
    case 'error':
      return { status: 'error', reload: () => setReloadKey((k) => k + 1) }
    case 'ready':
      return {
        status: 'ready',
        detail: outcome.detail,
        similar: outcome.similar,
        entryTab: outcome.similar !== null && outcome.similar.length === 0 ? 'analysis' : 'input',
      }
  }
}
