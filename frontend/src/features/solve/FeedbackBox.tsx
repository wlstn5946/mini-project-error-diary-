import './solve.css'
import type { FeedbackStatus } from './useFeedback'

// "✨ AI 피드백" 칸 (Q-003, D-064, 시안 에러해결창 ③·내기록창 ④). 결과 탭과 에러 일기 상세가 같이 쓴다.
// 받는 중 / 받음 / 실패(+ 다시 받기) / 아직 없음(+ 피드백 받기). 요청은 부모가 한다.
// 실패해도 기록 저장·정리 저장은 성공으로 두고, 이 칸에만 안내한다.

type Props = {
  feedback: string | null
  status: FeedbackStatus
  // 시도 기록도 한 줄 정리도 없으면 피드백을 받을 수 없다 (A-016 422)
  canRequest: boolean
  onRequest: () => void
}

function FeedbackBox({ feedback, status, canRequest, onRequest }: Props) {
  let body
  if (status === 'loading') {
    body = <p className="ai-text">✨ 피드백을 받는 중이에요…</p>
  } else if (status === 'failed') {
    body = (
      <p className="feedback-failed">
        피드백을 가져오지 못했어요.
        <button type="button" className="btn-secondary" onClick={onRequest}>
          다시 받기
        </button>
      </p>
    )
  } else if (feedback) {
    body = <p className="ai-text">{feedback}</p>
  } else if (!canRequest) {
    body = <p className="hint">시도 기록이 없어 피드백을 받을 수 없어요.</p>
  } else {
    body = (
      <p className="feedback-failed">
        아직 AI 피드백이 없어요.
        <button type="button" className="btn-secondary" onClick={onRequest}>
          피드백 받기
        </button>
      </p>
    )
  }

  return (
    <section className="feedback-box" aria-labelledby="feedback-title">
      <h3 id="feedback-title" className="ai-label">
        ✨ AI 피드백
      </h3>
      <div aria-live="polite">{body}</div>
    </section>
  )
}

export default FeedbackBox
