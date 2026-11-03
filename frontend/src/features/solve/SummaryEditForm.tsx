import './solve.css'
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { updateSummary } from './solveApi'

// 한 줄 정리 수정 폼 (A-007, D-064). 결과 탭과 에러 일기 상세가 같이 쓴다. 저장·취소만 하고, 저장 뒤 피드백 다시 받기는 부모가 한다.
// 해결된 기록은 비워서 저장할 수 없다. 실패하면 안내만 하고 입력값은 그대로 둔다.

type Props = {
  errorId: number
  status: 'unresolved' | 'resolved'
  initial: string | null
  // 저장된 정리(미해결에서 비우면 null)
  onSaved: (summary: string | null) => void
  onCancel: () => void
}

function SummaryEditForm({ errorId, status, initial, onSaved, onCancel }: Props) {
  const [text, setText] = useState(initial ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 저장 버튼을 빠르게 두 번 눌러도 요청은 한 번만 보낸다
  const busy = useRef(false)

  const emptyNotAllowed = status === 'resolved' && !text.trim()

  async function save(e: FormEvent) {
    e.preventDefault()
    if (busy.current || emptyNotAllowed) return
    busy.current = true
    setSaving(true)
    setError(null)
    try {
      onSaved(await updateSummary(errorId, text))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      busy.current = false
      setSaving(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <form className="summary-edit" onSubmit={save}>
      <label className="field-label" htmlFor="summary-edit-input">
        내 말로 한 줄 정리 {status === 'resolved' ? <span className="attempt-required">(필수)</span> : '(선택)'}
      </label>
      <input
        id="summary-edit-input"
        className="attempt-input"
        value={text}
        disabled={saving}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="attempt-actions">
        <button type="submit" className="btn-primary" disabled={saving || emptyNotAllowed}>
          {saving ? '저장 중…' : '저장'}
        </button>
        <button type="button" className="btn-secondary" disabled={saving} onClick={onCancel}>
          취소
        </button>
      </div>
      <div aria-live="polite">
        {error ? <p className="attempt-error">{error}</p> : emptyNotAllowed && <p className="hint">해결된 기록은 한 줄 정리를 비울 수 없어요.</p>}
      </div>
    </form>
  )
}

export default SummaryEditForm
