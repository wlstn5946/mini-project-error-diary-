import { useCallback, useRef, useState } from 'react'
import { requestFeedback } from './solveApi'

// AI 피드백 받기 상태 (A-016, D-064). 결과 탭(SolvePage)과 에러 일기 상세(RecordDetailPage)가 같이 쓴다.
// feedback이 undefined이면 이 훅으로 받은 값이 없다는 뜻이라, 상세는 서버가 준 ai_feedback을 그대로 보여준다.
// 요청을 여러 번 보내면(정리를 연달아 고침) 마지막 요청의 응답만 반영한다.

export type FeedbackStatus = 'idle' | 'loading' | 'failed'

type State = { errorId: number | null; feedback: string | undefined; status: FeedbackStatus }

const EMPTY: State = { errorId: null, feedback: undefined, status: 'idle' }

export function useFeedback(errorId: number | null) {
  const [state, setState] = useState<State>(EMPTY)
  const latest = useRef(0)

  // 다른 기록으로 바뀌면 이전 기록에서 받은 값은 쓰지 않는다
  const current = state.errorId === errorId ? state : EMPTY

  const request = useCallback(async (id: number) => {
    const mine = ++latest.current
    setState({ errorId: id, feedback: undefined, status: 'loading' })
    // requestFeedback은 실패해도 예외 없이 unavailable을 돌려준다
    const res = await requestFeedback(id)
    if (mine !== latest.current) return
    if (res.status === 'ok' && res.feedback) setState({ errorId: id, feedback: res.feedback, status: 'idle' })
    else setState({ errorId: id, feedback: undefined, status: 'failed' })
  }, [])

  const reset = useCallback(() => {
    latest.current++
    setState(EMPTY)
  }, [])

  return { feedback: current.feedback, status: current.status, request, reset }
}
