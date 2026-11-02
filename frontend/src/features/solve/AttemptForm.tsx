import { useState } from 'react'
import { RESULT_LABELS, type AttemptBody, type AttemptResult } from './solveApi'

// 시도 N 기록하기 (R-004, 시안 ②). 저장과 AI 재호출은 부모가 한다.
// 새 시도로 넘어가면 부모가 key를 바꿔 입력칸을 비운다.

type Props = {
  seq: number
  saving: boolean
  error: string | null
  onSubmit: (body: AttemptBody) => void
}

const RESULTS: AttemptResult[] = ['solved', 'failed', 'partial']

function AttemptForm({ seq, saving, error, onSubmit }: Props) {
  const [action, setAction] = useState('')
  const [result, setResult] = useState<AttemptResult | null>(null)
  const [summary, setSummary] = useState('')

  const solved = result === 'solved'
  // "해결됨"이면 한 줄 정리가 필수다 (D-026)
  const missing = !action.trim() ? '무엇을 했는지 입력해 주세요.' : !result ? '결과를 골라 주세요.' : solved && !summary.trim() ? '해결됨으로 저장하려면 한 줄 정리를 입력해 주세요.' : null

  function submit() {
    if (missing || saving || !result) return
    onSubmit({ action: action.trim(), result, summary: solved ? summary.trim() : null })
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
        onChange={(e) => setAction(e.target.value)}
      />

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
        내 말로 한 줄 정리 <span className="attempt-required">(해결 시 필수)</span>
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
        {/* 결과에 따라 버튼 하나만 보인다. 일부 해결은 해결 안 됨과 같다 (D-029) */}
        {result === null || solved ? (
          <button type="button" className="btn-primary" disabled={Boolean(missing) || saving} onClick={submit}>
            {saving ? '저장 중…' : '기록 저장'}
          </button>
        ) : (
          <button type="button" className="btn-secondary" disabled={Boolean(missing) || saving} onClick={submit}>
            {saving ? '저장 중…' : '해결 안 됨 → 다음 방법 제안받기'}
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
