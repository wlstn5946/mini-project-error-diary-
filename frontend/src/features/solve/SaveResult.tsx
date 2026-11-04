import { useState } from 'react'
import { keyLine } from '../../errorText'
import type { SavedError } from '../records/errorsApi'
import FeedbackBox from './FeedbackBox'
import SummaryEditForm from './SummaryEditForm'
import type { FeedbackStatus } from './useFeedback'

// 결과 탭 (시안 에러해결창 ③, D-064). 기록 저장 뒤 보인다. 이전 이름은 ResolvedSummary(해결됨만 다뤘다).
// 위에서부터: 배너 / 에러·시도·태그·시리즈 / 내 한 줄 정리 / AI 피드백 / 버튼.
// 한 줄 정리를 저장하면 부모가 피드백을 다시 받는다 (A-007 → A-016).

type Props = {
  saved: SavedError
  feedback: string | null
  feedbackStatus: FeedbackStatus
  onRequestFeedback: () => void
  // 저장된 정리(미해결에서 비우면 null). 부모가 saved를 고치고 피드백을 다시 받는다
  onSummaryChanged: (summary: string | null) => void
  onNewError: () => void
  onViewDiary: () => void
}

// 마지막 시도 결과에 따른 배너. 보조 문구는 해결됨만 정해져 있고 나머지는 제안한 문구다.
const BANNERS = {
  solved: { title: '✔ 해결로 저장했어요', sub: '다음에 같은 에러가 나면 이 기록이 먼저 보여요' },
  failed: { title: '해결 안 됨으로 저장했어요', sub: '미해결 기록으로 남겨 뒀어요. 내 기록에서 다시 볼 수 있어요' },
  partial: { title: '일부 해결로 저장했어요', sub: '미해결 기록으로 남겨 뒀어요. 내 기록에서 다시 볼 수 있어요' },
} as const

function SaveResult({ saved, feedback, feedbackStatus, onRequestFeedback, onSummaryChanged, onNewError, onViewDiary }: Props) {
  const [editing, setEditing] = useState(false)

  // 에러는 핵심 줄만 보여준다(D-117). Traceback 전체는 위의 코드 영역에 있다.
  const errorTitle = keyLine(saved.error_message).text || saved.error_message
  const labels = [...saved.tags.map((t) => t.name), ...(saved.series ? [saved.series.name] : [])]
  const last = saved.attempts[saved.attempts.length - 1]?.result ?? 'failed'
  const banner = BANNERS[last]

  return (
    <section className="resolved" aria-labelledby="resolved-title">
      <div className={`resolved-banner ${last}`}>
        {/* 해결로 저장했을 때만 보이는 장식용 체크 (읽지 않는다). 제목 문구는 그대로다 */}
        {last === 'solved' && (
          <span className="resolved-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} />
            </svg>
          </span>
        )}
        <h2 id="resolved-title" className="resolved-title">
          {banner.title}
        </h2>
        <p className="resolved-sub">{banner.sub}</p>
      </div>

      <dl className="resolved-table">
        <dt>에러</dt>
        <dd>{errorTitle}</dd>
        <dt>시도</dt>
        <dd>{saved.attempts.length}회</dd>
        <dt>태그 · 시리즈</dt>
        <dd>{labels.length ? labels.join(' · ') : '없음'}</dd>
      </dl>

      {/* 정리가 비어 있으면 이 칸을 숨긴다 */}
      {saved.summary && (
        <div className="resolved-summary">
          <p className="ai-label">내 한 줄 정리</p>
          <p className="ai-text">{saved.summary}</p>
        </div>
      )}

      <FeedbackBox feedback={feedback} status={feedbackStatus} canRequest onRequest={onRequestFeedback} />

      {editing && (
        <SummaryEditForm
          errorId={saved.id}
          status={saved.status}
          initial={saved.summary}
          onSaved={(summary) => {
            setEditing(false)
            onSummaryChanged(summary)
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      <div className="resolved-actions">
        <button type="button" className="btn-primary" onClick={onNewError}>
          새 에러 입력
        </button>
        <button type="button" className="btn-secondary" onClick={onViewDiary}>
          에러 일기 보기
        </button>
        {!editing && (
          <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
            {saved.summary ? '한 줄 정리 수정' : '한 줄 정리 쓰기'}
          </button>
        )}
      </div>
    </section>
  )
}

export default SaveResult
