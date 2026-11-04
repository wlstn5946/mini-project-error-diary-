import { useState } from 'react'
import { RESULT_LABELS, type AttemptBody, type AttemptResult } from './solveApi'

// 시도 N 기록하기 (R-004, 시안 ②). 저장 없이 화면에 모아 두기만 한다. "기록 저장"과 "다음 방법 제안받기"는 부모가 처리한다 (D-064).
// 새 시도로 넘어가면 부모가 key를 바꿔 입력칸을 비운다.

type Props = {
  seq: number
  saving: boolean
  error: string | null
  // "기록 저장": 모아 둔 시도와 이번 시도를 저장한다. summary는 해결됨이면 필수, 그 밖에는 선택(비면 null)
  onSave: (body: AttemptBody) => void
  // "해결 안 됨 → 다음 방법 제안받기": 이번 시도를 모아 두고 AI에게 다시 묻는다 (저장하지 않는다)
  onNext: (body: AttemptBody) => void
  // 미리 채울 "무엇을 했나요?" — "이 방법 써 보기"의 시도 1 (D-128)
  initialAction?: string
  // true면 "무엇을 했나요?"를 고칠 수 없다 (적용 시도 문구 고정, D-128)
  actionReadOnly?: boolean
  // 미리 채울 한 줄 정리 — 원본 정리 복사, 고칠 수 있다 (D-128)
  initialSummary?: string
}

const RESULTS: AttemptResult[] = ['solved', 'failed', 'partial']

function AttemptForm({ seq, saving, error, onSave, onNext, initialAction, actionReadOnly, initialSummary }: Props) {
  const [action, setAction] = useState(initialAction ?? '')
  const [result, setResult] = useState<AttemptResult | null>(null)
  const [summary, setSummary] = useState(initialSummary ?? '')

  const solved = result === 'solved'
  // "해결됨"이면 한 줄 정리가 필수다 (D-026)
  const missing = !action.trim() ? '무엇을 했는지 입력해 주세요.' : !result ? '결과를 골라 주세요.' : solved && !summary.trim() ? '해결됨으로 저장하려면 한 줄 정리를 입력해 주세요.' : null

  function save() {
    if (missing || saving || !result) return
    onSave({ action: action.trim(), result, summary: summary.trim() || null })
  }

  function next() {
    if (missing || saving || !result) return
    onNext({ action: action.trim(), result, summary: null })
  }

  return (
    <section className="attempt-card" aria-labelledby="attempt-title">
      <h2 id="attempt-title" className="attempt-title">
        📝 시도 {seq} 기록하기
      </h2>

      <label className="field-label" htmlFor="attempt-action">
        무엇을 했나요?
      </label>
      <input
        id="attempt-action"
        className="attempt-input"
        placeholder="예: response_mime_type 설정 추가하고 다시 실행"
        value={action}
        disabled={saving}
        readOnly={actionReadOnly}
        onChange={(e) => setAction(e.target.value)}
      />
      {actionReadOnly && <p className="hint">기존 기록의 방법을 그대로 해 봤는지 결과만 골라 주세요.</p>}

      <fieldset className="attempt-results" disabled={saving}>
        <legend className="field-label">결과</legend>
        {RESULTS.map((r) => (
          <label key={r} className="attempt-result">
            <input type="radio" name="attempt-result" value={r} checked={result === r} onChange={() => setResult(r)} />
            {RESULT_LABELS[r]}
          </label>
        ))}
      </fieldset>

      <label className="field-label" htmlFor="attempt-summary">
        내 말로 한 줄 정리 {solved ? <span className="attempt-required">(필수)</span> : '(선택)'}
      </label>
      <input
        id="attempt-summary"
        className="attempt-input"
        placeholder="예: AI가 JSON을 꾸며서 보내서 파싱이 안 됐고, 응답 형식을 고정해서 해결했다"
        value={summary}
        disabled={saving}
        onChange={(e) => setSummary(e.target.value)}
      />

      <div className="attempt-actions">
        {/* 해결됨은 "기록 저장"만, 해결 안 됨·일부 해결은 "기록 저장"과 "다음 방법 제안받기" 둘 다 보인다 (D-029, D-064) */}
        <button type="button" className="btn-primary" disabled={Boolean(missing) || saving} onClick={save}>
          {saving ? '저장 중…' : '기록 저장'}
        </button>
        {result !== null && !solved && (
          <button type="button" className="btn-secondary" disabled={Boolean(missing) || saving} onClick={next}>
            해결 안 됨 → 다음 방법 제안받기
          </button>
        )}
      </div>

      <div aria-live="polite">
        {error ? <p className="attempt-error">{error}</p> : missing && <p className="hint">{missing}</p>}
      </div>
    </section>
  )
}

export default AttemptForm
