import { useEffect, useId, useRef, useState } from 'react'
import { keyLine } from '../../errorText'
import ErrorDetail from './ErrorDetail'
import { getError, type ErrorDetail as Detail, type SimilarError } from './errorsApi'
import './records.css' // ErrorDetail 본문 모양 (S-001에는 따로 불러온 곳이 없다)
import './RecordPreviewPanel.css'

// 비슷한 기록 카드의 "에러 일기 보기" 미리보기 패널 (S-001, D-152). 새 탭 대신 같은 화면 오른쪽에 겹쳐 연다.
// 브라우저 기본 모달(<dialog>)이라 Esc로 닫히고 포커스가 패널 안에 갇힌다 (ConfirmDialog와 같은 방식).

type Props = {
  match: SimilarError
  myErrorMessage: string
  busy: boolean
  onApply: (match: SimilarError) => void
  onClose: () => void
}

// attempt는 몇 번째 불러오기인지(다시 시도하면 올라간다). 결과가 현재 attempt의 것이 아니면 불러오는 중이다.
type Loaded = { attempt: number; detail: Detail | null | 'failed' }

function RecordPreviewPanel({ match, myErrorMessage, busy, onApply, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  // 열릴 때(그리고 "다시 시도"할 때) 상세를 불러온다. 닫히거나 다시 부르면 이전 요청은 취소한다.
  useEffect(() => {
    const controller = new AbortController()
    getError(match.id, controller.signal)
      .then((detail) => setLoaded({ attempt, detail }))
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ attempt, detail: 'failed' })
      })
    return () => controller.abort()
  }, [match.id, attempt])

  const current = loaded && loaded.attempt === attempt ? loaded.detail : undefined // undefined = 불러오는 중
  const detail = current && current !== 'failed' ? current : null
  const missing = current === null
  const failed = current === 'failed'

  const mine = keyLine(myErrorMessage).text || myErrorMessage
  const theirs = detail ? keyLine(detail.error_message).text || detail.error_message : null

  return (
    <dialog
      ref={ref}
      className="preview-panel"
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Esc
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        // 어두운 영역(::backdrop)을 누르면 target이 dialog 자신이다. 패널 안 클릭은 닫지 않는다.
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="preview-head">
        <h2 id={titleId} className="preview-title">
          에러 일기 #{match.id}
        </h2>
        <button type="button" className="preview-close" aria-label="닫기" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="preview-compare">
        <div>
          <h3 className="detail-label">내 에러</h3>
          <pre className="code-view preview-line">{mine}</pre>
        </div>
        <div>
          <h3 className="detail-label">이 기록 · 유사도 {match.similarity}%</h3>
          {theirs !== null ? (
            <pre className="code-view preview-line">{theirs}</pre>
          ) : (
            <p className="hint">{current === undefined ? '불러오는 중…' : '—'}</p>
          )}
        </div>
      </div>

      <div className="preview-body" aria-live="polite">
        {current === undefined && <p className="hint">불러오는 중…</p>}
        {failed && (
          <div className="preview-state">
            <p className="attempt-error">에러 일기를 불러오지 못했어요.</p>
            <button type="button" className="btn-secondary" onClick={() => setAttempt((n) => n + 1)}>
              다시 시도
            </button>
          </div>
        )}
        {missing && <p className="hint">이 기록은 지워졌어요.</p>}
        {detail && <ErrorDetail detail={detail} preview />}
      </div>

      <div className="preview-foot">
        <button type="button" className="btn-secondary" onClick={onClose}>
          닫기
        </button>
        <button
          type="button"
          className="btn-apply"
          disabled={busy || missing}
          onClick={() => {
            onApply(match)
            onClose()
          }}
        >
          ✔ 같은 에러예요, 이 방법 써 보기
        </button>
      </div>
    </dialog>
  )
}

export default RecordPreviewPanel
