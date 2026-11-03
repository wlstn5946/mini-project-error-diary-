import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ApiError } from './apiError'
import ConfirmDialog from './ConfirmDialog'
import SeriesEditForm from './SeriesEditForm'
import { deleteSeries, fetchSeries, type Series } from './seriesApi'
import { deleteTag, fetchTags, renameTag, type Tag } from './tagsApi'

// "⚙ 관리" 모달 (S-002, D-042). 태그·시리즈 이름 변경과 삭제를 한다. 메뉴는 늘리지 않는다 (D-005).
// 새로 만드는 곳은 없다. 태그·시리즈는 에러를 입력할 때 만든다 (D-011, D-020).

// 닫을 때 부모가 알아야 하는 것: 바뀐 게 있으면 목록·태그 칩을 다시 불러오고, 지운 태그는 필터에서 뺀다
export type ManageResult = { changed: boolean; deletedTagIds: number[] }

type Props = {
  onClose: (result: ManageResult) => void
}

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: T[] }
type Target = { kind: 'tag' | 'series'; id: number; name: string; count: number }

const GONE = '이미 삭제된 항목이에요.'

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function isGone(error: unknown) {
  return error instanceof ApiError && error.status === 404
}

type TagRowProps = {
  tag: Tag
  onRenamed: () => void
  onAskDelete: () => void
  onGone: () => void
}

function TagRow({ tag, onRenamed, onAskDelete, onGone }: TagRowProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(tag.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startEdit() {
    setName(tag.name)
    setError(null)
    setEditing(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (saving || !name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await renameTag(tag.id, name)
      setEditing(false)
      onRenamed()
    } catch (err) {
      if (isGone(err)) onGone()
      else setError(messageOf(err)) // 같은 이름(409)이면 입력값을 그대로 둔다
    } finally {
      setSaving(false)
    }
  }

  // 입력 중 Esc는 모달이 아니라 이 줄의 수정만 닫는다
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <li className="manage-row">
        <form className="manage-edit" onSubmit={save}>
          <input
            className="manage-input"
            aria-label="태그 이름"
            value={name}
            disabled={saving}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button type="submit" className="btn-primary manage-btn" disabled={saving || !name.trim()}>
            {saving ? '저장 중…' : '저장'}
          </button>
          <button type="button" className="btn-secondary manage-btn" disabled={saving} onClick={() => setEditing(false)}>
            취소
          </button>
          {error && <p className="manage-error">{error}</p>}
        </form>
      </li>
    )
  }
  return (
    <li className="manage-row">
      <span className="manage-name">#{tag.name}</span>
      <span className="manage-count">{tag.error_count}개 기록</span>
      <button type="button" className="btn-secondary manage-btn" onClick={startEdit}>
        이름 변경
      </button>
      <button type="button" className="btn-danger manage-btn" onClick={onAskDelete}>
        삭제
      </button>
    </li>
  )
}

type SeriesRowProps = {
  series: Series
  onUpdated: (series: Series) => void
  onAskDelete: () => void
  onGone: () => void
}

function SeriesRow({ series, onUpdated, onAskDelete, onGone }: SeriesRowProps) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <li className="manage-row">
        <SeriesEditForm
          series={series}
          onSaved={(updated) => {
            setEditing(false)
            onUpdated(updated)
          }}
          onCancel={() => setEditing(false)}
          onGone={onGone}
        />
      </li>
    )
  }
  return (
    <li className="manage-row">
      <span className="manage-name">
        {series.name}
        {series.description && <span className="manage-desc">{series.description}</span>}
      </span>
      <span className="manage-count">{series.error_count}개 기록</span>
      <button type="button" className="btn-secondary manage-btn" onClick={() => setEditing(true)}>
        이름·설명 수정
      </button>
      <button type="button" className="btn-danger manage-btn" onClick={onAskDelete}>
        삭제
      </button>
    </li>
  )
}

function ManageModal({ onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const changed = useRef(false)
  const deletedTagIds = useRef<number[]>([])
  const [tags, setTags] = useState<Load<Tag>>({ status: 'loading' })
  const [series, setSeries] = useState<Load<Series>>({ status: 'loading' })
  const [tagsKey, setTagsKey] = useState(0)
  const [seriesKey, setSeriesKey] = useState(0)
  // 다른 곳에서 이미 지워진 항목을 건드렸다는 안내
  const [notice, setNotice] = useState<string | null>(null)
  const [target, setTarget] = useState<Target | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // 삭제 확인 버튼을 빠르게 두 번 눌러도 요청은 한 번만 보낸다
  const busy = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  // 다시 불러올 때는 목록을 "불러오는 중"으로 바꾸지 않고, 새 목록이 올 때까지 이전 목록을 둔다
  useEffect(() => {
    const controller = new AbortController()
    fetchTags(controller.signal)
      .then((items) => setTags({ status: 'ready', items }))
      .catch(() => {
        if (!controller.signal.aborted) setTags({ status: 'error' })
      })
    return () => controller.abort()
  }, [tagsKey])

  useEffect(() => {
    const controller = new AbortController()
    fetchSeries(controller.signal)
      .then((items) => setSeries({ status: 'ready', items }))
      .catch(() => {
        if (!controller.signal.aborted) setSeries({ status: 'error' })
      })
    return () => controller.abort()
  }, [seriesKey])

  function close() {
    ref.current?.close() // 닫으면 모달을 연 버튼으로 포커스가 돌아간다
    onClose({ changed: changed.current, deletedTagIds: deletedTagIds.current })
  }

  function tagChanged() {
    changed.current = true
    setNotice(null)
    setTagsKey((k) => k + 1) // 이름순이 바뀔 수 있어서 서버 순서로 다시 받는다
  }

  function seriesChanged(updated: Series) {
    changed.current = true
    setNotice(null)
    setSeries((prev) =>
      prev.status === 'ready' ? { status: 'ready', items: prev.items.map((s) => (s.id === updated.id ? updated : s)) } : prev,
    )
  }

  function itemGone(kind: 'tag' | 'series') {
    changed.current = true
    setNotice(GONE)
    if (kind === 'tag') setTagsKey((k) => k + 1)
    else setSeriesKey((k) => k + 1)
  }

  function askDelete(next: Target) {
    setDeleteError(null)
    setTarget(next)
  }

  async function confirmDelete() {
    if (!target || busy.current) return
    busy.current = true
    setDeleting(true)
    setDeleteError(null)
    try {
      if (target.kind === 'tag') {
        await deleteTag(target.id)
        deletedTagIds.current.push(target.id)
        setTags((prev) => (prev.status === 'ready' ? { status: 'ready', items: prev.items.filter((t) => t.id !== target.id) } : prev))
      } else {
        await deleteSeries(target.id)
        setSeries((prev) => (prev.status === 'ready' ? { status: 'ready', items: prev.items.filter((s) => s.id !== target.id) } : prev))
      }
      changed.current = true
      setNotice(null)
      setTarget(null)
    } catch (err) {
      if (isGone(err)) {
        itemGone(target.kind)
        setTarget(null)
      } else {
        // 창은 열어 둔 채 안내만 바꾼다. 같은 버튼으로 다시 시도할 수 있다.
        setDeleteError(messageOf(err))
      }
    } finally {
      setDeleting(false)
      busy.current = false
    }
  }

  const retry = (reload: () => void, setLoading: () => void) => (
    <p className="manage-error">
      불러오지 못했어요.
      <button
        type="button"
        className="btn-secondary manage-btn"
        onClick={() => {
          setLoading()
          reload()
        }}
      >
        다시 시도
      </button>
    </p>
  )

  return (
    <>
      <dialog
        ref={ref}
        className="manage-dialog"
        aria-labelledby="manage-title"
        onCancel={(e) => {
          // Esc
          e.preventDefault()
          close()
        }}
        onClick={(e) => {
          // 안쪽 내용이 아니라 창 바깥(어두운 배경)을 누른 경우
          if (e.target === e.currentTarget) close()
        }}
      >
        <div className="manage-body">
          <header className="manage-header">
            <h2 id="manage-title" className="manage-title">
              태그·시리즈 관리
            </h2>
            <button type="button" className="manage-close" aria-label="닫기" onClick={close}>
              ×
            </button>
          </header>

          <div aria-live="polite">{notice && <p className="manage-notice">{notice}</p>}</div>

          <section aria-labelledby="manage-tags-title">
            <h3 id="manage-tags-title" className="manage-section">
              태그
            </h3>
            {tags.status === 'loading' && <p className="hint">불러오는 중…</p>}
            {tags.status === 'error' && retry(() => setTagsKey((k) => k + 1), () => setTags({ status: 'loading' }))}
            {tags.status === 'ready' &&
              (tags.items.length === 0 ? (
                <p className="hint">아직 태그가 없어요.</p>
              ) : (
                <ul className="manage-list">
                  {tags.items.map((tag) => (
                    <TagRow
                      key={tag.id}
                      tag={tag}
                      onRenamed={tagChanged}
                      onAskDelete={() => askDelete({ kind: 'tag', id: tag.id, name: tag.name, count: tag.error_count })}
                      onGone={() => itemGone('tag')}
                    />
                  ))}
                </ul>
              ))}
          </section>

          <section aria-labelledby="manage-series-title">
            <h3 id="manage-series-title" className="manage-section">
              시리즈
            </h3>
            {series.status === 'loading' && <p className="hint">불러오는 중…</p>}
            {series.status === 'error' && retry(() => setSeriesKey((k) => k + 1), () => setSeries({ status: 'loading' }))}
            {series.status === 'ready' &&
              (series.items.length === 0 ? (
                <p className="hint">아직 시리즈가 없어요.</p>
              ) : (
                <ul className="manage-list">
                  {series.items.map((item) => (
                    <SeriesRow
                      key={item.id}
                      series={item}
                      onUpdated={seriesChanged}
                      onAskDelete={() => askDelete({ kind: 'series', id: item.id, name: item.name, count: item.error_count })}
                      onGone={() => itemGone('series')}
                    />
                  ))}
                </ul>
              ))}
          </section>
        </div>
      </dialog>

      {target && (
        <ConfirmDialog
          title={target.kind === 'tag' ? `#${target.name} 태그를 지울까요?` : `'${target.name}' 시리즈를 지울까요?`}
          confirmLabel="삭제"
          busyLabel="삭제 중…"
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => {
            setTarget(null)
            setDeleteError(null)
          }}
        >
          <p className="confirm-text">
            {target.count > 0
              ? `${target.count}개 기록에서 ${target.kind === 'tag' ? '태그가 빠져요' : '시리즈가 비워져요'}. 기록은 지워지지 않아요.`
              : '되돌릴 수 없어요.'}
          </p>
        </ConfirmDialog>
      )}
    </>
  )
}

export default ManageModal
