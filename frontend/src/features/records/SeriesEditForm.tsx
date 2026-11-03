import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { ApiError } from '../../api'
import { updateSeries, type Series } from './seriesApi'

// 시리즈 이름·설명 수정 폼 (S-002, D-054). 관리 모달과 시리즈별 보기에서 같이 쓴다.
// 같은 이름이면(409) 안내하고 입력값을 그대로 둔다 (D-049). 이미 삭제된 시리즈면(404) 부모에게 알린다.

type Props = {
  series: Series
  onSaved: (updated: Series) => void
  onCancel: () => void
  onGone: () => void
}

function SeriesEditForm({ series, onSaved, onCancel, onGone }: Props) {
  const [name, setName] = useState(series.name)
  const [description, setDescription] = useState(series.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (saving || !name.trim()) return
    setSaving(true)
    setError(null)
    try {
      // 설명을 비우면 null로 보내 지운다 (D-054)
      const updated = await updateSeries(series.id, { name, description: description.trim() ? description : null })
      onSaved(updated)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) onGone()
      else setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  // 입력 중 Esc는 모달이 아니라 이 폼만 닫는다
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
    }
  }

  return (
    <form className="manage-edit" onSubmit={save}>
      <input
        className="manage-input"
        aria-label="시리즈 이름"
        value={name}
        disabled={saving}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <input
        className="manage-input"
        aria-label="시리즈 설명"
        placeholder="설명 (선택)"
        value={description}
        disabled={saving}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <button type="submit" className="btn-primary manage-btn" disabled={saving || !name.trim()}>
        {saving ? '저장 중…' : '저장'}
      </button>
      <button type="button" className="btn-secondary manage-btn" disabled={saving} onClick={onCancel}>
        취소
      </button>
      {error && <p className="manage-error">{error}</p>}
    </form>
  )
}

export default SeriesEditForm
