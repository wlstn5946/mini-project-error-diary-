import { useRef, useState, type FormEvent } from 'react'
import { ApiError } from './apiError'
import { updateError, type ErrorDetail } from './errorsApi'
import SeriesSelect, { type SeriesChoice } from './SeriesSelect'
import TagInput, { type TagsValue } from './TagInput'

// 에러 일기 상세의 편집 모드 (S-003, A-010, D-047). 태그·시리즈·상황만 고친다. 에러 메시지·시도는 고치지 않는다.
// 손댄 항목만 서버로 보낸다. 안 건드린 항목을 보내면 그 사이 다른 곳에서 지운 시리즈·태그 때문에 괜히 실패할 수 있다.
// 저장이 실패하면 편집 모드와 입력값을 그대로 두고, 이미 지워진 기록(404)이면 부모에게 알린다.

type Props = {
  detail: ErrorDetail
  onSaved: (updated: ErrorDetail) => void
  onCancel: () => void
  onGone: () => void
}

function RecordEditForm({ detail, onSaved, onCancel, onGone }: Props) {
  const [situation, setSituation] = useState(detail.situation ?? '')
  // undefined: 건드리지 않음, null: 새 시리즈 이름이 비었거나 겹쳐서 아직 쓸 수 없음
  const [seriesChoice, setSeriesChoice] = useState<SeriesChoice | null | undefined>(undefined)
  const [tags, setTags] = useState<TagsValue | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 저장 버튼을 빠르게 두 번 눌러도 요청은 한 번만 보낸다
  const busy = useRef(false)

  const situationChanged = situation.trim() !== (detail.situation ?? '').trim()
  const changed = situationChanged || seriesChoice !== undefined || tags !== undefined
  const canSave = changed && seriesChoice !== null && !saving

  async function save(e: FormEvent) {
    e.preventDefault()
    if (busy.current || !canSave) return
    busy.current = true
    setSaving(true)
    setError(null)
    try {
      const change: Parameters<typeof updateError>[1] = {}
      if (situationChanged) change.situation = situation.trim() || null
      if (seriesChoice) {
        if (seriesChoice.kind === 'none') change.series_id = null
        else if (seriesChoice.kind === 'existing') change.series_id = seriesChoice.series.id
        else change.new_series_name = seriesChoice.name
      }
      if (tags) {
        change.tag_ids = tags.existingIds
        change.new_tag_names = tags.newNames
      }
      onSaved(await updateError(detail.id, change))
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) onGone()
      else setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
      busy.current = false
    }
  }

  return (
    <form className="edit-form" onSubmit={save}>
      <SeriesSelect initialSeriesId={detail.series?.id ?? null} disabled={saving} onChange={setSeriesChoice} />
      <TagInput initialTags={detail.tags} disabled={saving} onChange={setTags} />

      <label className="field-label" htmlFor="edit-situation">
        상황 (선택)
      </label>
      <input
        id="edit-situation"
        className="edit-situation"
        placeholder="예: 새로 만든 가상환경에서 처음 실행함"
        value={situation}
        disabled={saving}
        onChange={(e) => setSituation(e.target.value)}
      />

      {error && (
        <p className="edit-error" role="alert">
          {error}
        </p>
      )}
      <div className="edit-buttons">
        <button type="submit" className="btn-primary" disabled={!canSave}>
          {saving ? '저장 중…' : '저장'}
        </button>
        <button type="button" className="btn-secondary" disabled={saving} onClick={onCancel}>
          취소
        </button>
      </div>
    </form>
  )
}

export default RecordEditForm
