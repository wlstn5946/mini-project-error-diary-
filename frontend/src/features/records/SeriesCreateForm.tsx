import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { createSeries, type Series } from './seriesApi'

// 새 시리즈 폼 (S-002, D-061). 이름(필수)·설명(선택)을 받아 A-015로 만든다.
// SeriesEditForm은 기존 시리즈를 받아 수정(PATCH·404 처리)하는 폼이라 합치지 않고 따로 둔다.
// 같은 이름(409)·서버 오류면 안내하고 입력값을 그대로 둔다 (D-049).

type Props = {
  onCreated: (created: Series) => void
  onCancel: () => void
}

function SeriesCreateForm({ onCreated, onCancel }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 저장 버튼을 빠르게 두 번 눌러도 요청은 한 번만 보낸다
  const busy = useRef(false)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (busy.current || !name.trim()) return
    busy.current = true
    setSaving(true)
    setError(null)
    try {
      const created = await createSeries({ name, description: description.trim() ? description : null })
      onCreated(created)
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
    <form className="manage-edit series-create" onSubmit={save}>
      <input
        className="manage-input"
        aria-label="새 시리즈 이름"
        placeholder="시리즈 이름"
        value={name}
        disabled={saving}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <input
        className="manage-input"
        aria-label="새 시리즈 설명"
        placeholder="설명 (선택)"
        value={description}
        disabled={saving}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <button type="submit" className="btn-primary manage-btn" disabled={saving || !name.trim()}>
        {saving ? '만드는 중…' : '만들기'}
      </button>
      <button type="button" className="btn-secondary manage-btn" disabled={saving} onClick={onCancel}>
        취소
      </button>
      {error && <p className="manage-error">{error}</p>}
    </form>
  )
}

export default SeriesCreateForm
