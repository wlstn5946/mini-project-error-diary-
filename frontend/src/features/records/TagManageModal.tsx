import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from 'react'
import { ApiError } from '../../api'
import ConfirmDialog from './ConfirmDialog'
import TagMergeDialog from './TagMergeDialog'
import {
  addAlias,
  ALIAS_TOO_LONG,
  deleteAlias,
  deleteTag,
  fetchTags,
  renameTag,
  TAG_NAME_MAX,
  TAG_NAME_TOO_LONG,
  type Tag,
} from './tagsApi'

// 태그·별칭 이름의 글자 수는 앞뒤 공백과 앞의 #을 지운 뒤 센다 (D-115)
function nameLength(raw: string) {
  return raw.trim().replace(/^#+/, '').trim().length
}

// "⚙ 태그 관리" 모달 (S-002, D-063). 태그 이름 변경·삭제·합치기(D-113)를 한다. 태그별 탭에서 연다.
// 새로 만드는 곳은 없다. 태그는 에러를 입력할 때 만든다 (D-020).

// 닫을 때 부모가 알아야 하는 것: 바뀐 게 있으면 목록·태그 칩을 다시 불러오고, 지운 태그는 필터에서 뺀다
export type TagManageResult = { changed: boolean; deletedTagIds: number[] }

type Props = {
  onClose: (result: TagManageResult) => void
}

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: Tag[] }
type Target = { id: number; name: string; count: number }

const GONE = '이미 삭제된 항목이에요.'

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function isGone(error: unknown) {
  return error instanceof ApiError && error.status === 404
}

// 드래그로 합치기 (D-113). 데스크톱용 지름길이고 터치·키보드는 버튼 방식을 쓴다.
// dataTransfer에는 태그 id만 문자열로 넣는다. 이 형식이 아닌 끌기(파일, 다른 글자)는 무시한다.
const DRAG_TYPE = 'application/x-error-diary-tag-id'

function isTagDrag(e: DragEvent) {
  return Array.from(e.dataTransfer.types).includes(DRAG_TYPE)
}

type DragProps = {
  // 손잡이를 보일지. 태그가 1개뿐일 때, 어떤 줄이든 수정·합치기 선택칸이 열려 있을 때, 요청 중일 때는 숨긴다
  showHandle: boolean
  // 지금 끌고 있는 태그 id
  draggedId: number | null
  // 이 줄이 놓을 곳으로 표시된 상태
  dropTarget: boolean
  onStart: () => void
  onEnd: () => void
  onOver: () => void
  onLeave: () => void
  onDrop: (draggedId: number) => void
  // 이름 수정·합치기 선택칸이 열려 있는지 알린다
  // (함수 모양을 고정해 두어 줄의 effect가 매번 다시 실행되지 않게 한다)
  onOpenChange: (tagId: number, open: boolean) => void
}

type TagRowProps = {
  tag: Tag
  drag: DragProps
  onRenamed: () => void
  onAskDelete: () => void
  onGone: () => void
  // 합치기를 고를 수 있는 다른 태그(기록 수 많은 순). 태그가 1개뿐이면 비어 있고 "합치기" 버튼을 숨긴다
  others: Tag[]
  // "다음"을 누르면 확인 대화상자를 연다. 이 줄의 태그가 합쳐질 태그(A), target이 남을 태그(B)
  onAskMerge: (target: Tag) => void
}

function TagRow({ tag, drag, onRenamed, onAskDelete, onGone, others, onAskMerge }: TagRowProps) {
  const [editing, setEditing] = useState(false)
  const [merging, setMerging] = useState(false)
  const [intoId, setIntoId] = useState('')
  // 별칭 입력칸 (D-114)
  const [addingAlias, setAddingAlias] = useState(false)
  const [aliasName, setAliasName] = useState('')
  const [aliasSaving, setAliasSaving] = useState(false)
  const [aliasError, setAliasError] = useState<string | null>(null)
  // 지우는 중인 별칭 id. 같은 ×를 빠르게 두 번 눌러도 요청은 한 번만 보낸다
  const [deletingAliasId, setDeletingAliasId] = useState<number | null>(null)
  const { onOpenChange } = drag

  // 수정·합치기 선택칸·별칭 입력칸이 열려 있는 동안은 어느 줄의 손잡이도 숨긴다
  useEffect(() => {
    onOpenChange(tag.id, editing || merging || addingAlias)
    return () => onOpenChange(tag.id, false)
  }, [editing, merging, addingAlias, onOpenChange, tag.id])
  const [name, setName] = useState(tag.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function startEdit() {
    setMerging(false)
    setAddingAlias(false)
    setName(tag.name)
    setError(null)
    setEditing(true)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (saving || !name.trim()) return
    if (nameLength(name) > TAG_NAME_MAX) {
      setError(TAG_NAME_TOO_LONG) // 입력값은 그대로 둔다
      return
    }
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

  function startAddAlias() {
    setMerging(false)
    setAliasName('')
    setAliasError(null)
    setAddingAlias(true)
  }

  async function saveAlias(e: FormEvent) {
    e.preventDefault()
    if (aliasSaving || !aliasName.trim()) return
    if (nameLength(aliasName) > TAG_NAME_MAX) {
      setAliasError(ALIAS_TOO_LONG) // 입력값은 그대로 둔다
      return
    }
    setAliasSaving(true)
    setAliasError(null)
    try {
      await addAlias(tag.id, aliasName)
      setAddingAlias(false)
      onRenamed() // 별칭이 보이도록 목록을 다시 불러온다
    } catch (err) {
      if (isGone(err)) onGone()
      else setAliasError(messageOf(err)) // 409·422 안내를 입력칸 아래에 보여주고 입력값은 유지한다
    } finally {
      setAliasSaving(false)
    }
  }

  async function removeAlias(aliasId: number) {
    if (deletingAliasId !== null) return
    setDeletingAliasId(aliasId)
    try {
      await deleteAlias(tag.id, aliasId) // 확인 없이 바로 지운다(다시 추가하기 쉬워서)
      onRenamed()
    } catch (err) {
      if (isGone(err)) onGone()
      else setAliasError(messageOf(err))
    } finally {
      setDeletingAliasId(null)
    }
  }

  // 별칭 입력 중 Esc는 모달이 아니라 입력칸만 닫는다
  function onAliasKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setAddingAlias(false)
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
          <button
            type="button"
            className="btn-secondary manage-btn"
            disabled={saving}
            onClick={() => setEditing(false)}
          >
            취소
          </button>
          {error && <p className="manage-error">{error}</p>}
        </form>
      </li>
    )
  }
  // 손잡이(⋮⋮)와 태그 이름(#Python) 글자가 같은 끌기 동작을 쓴다. 별칭·버튼은 끌 수 없다.
  const dragSource = {
    draggable: true,
    onDragStart: (e: DragEvent<HTMLElement>) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData(DRAG_TYPE, String(tag.id))
      const row = e.currentTarget.closest('li')
      if (row) e.dataTransfer.setDragImage(row, 0, 0)
      // 끌기가 시작된 뒤에 표시를 바꾼다(시작하는 순간 화면을 바꾸면 브라우저가 끌기를 취소하는 경우가 있다)
      setTimeout(drag.onStart, 0)
    },
    onDragEnd: drag.onEnd,
  }

  return (
    <li
      className={`manage-row${drag.draggedId === tag.id ? ' is-dragging' : ''}${drag.dropTarget ? ' is-drop-target' : ''}`}
      onDragOver={(e) => {
        if (!isTagDrag(e)) return
        if (drag.draggedId === null || drag.draggedId === tag.id) {
          e.dataTransfer.dropEffect = 'none' // 자기 자신 위에서는 놓을 수 없다
          return
        }
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        drag.onOver()
      }}
      onDragLeave={(e) => {
        // 줄 안의 자식 요소를 지나갈 때는 표시를 지우지 않는다
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) drag.onLeave()
      }}
      onDrop={(e) => {
        if (!isTagDrag(e)) return
        e.preventDefault()
        drag.onDrop(Number(e.dataTransfer.getData(DRAG_TYPE)))
      }}
    >
      {drag.showHandle && (
        <span className="manage-handle" aria-hidden="true" {...dragSource}>
          ⋮⋮
        </span>
      )}
      <span className="manage-name">
        <span
          className={drag.showHandle ? 'manage-name-text is-draggable' : 'manage-name-text'}
          {...(drag.showHandle ? dragSource : {})}
        >
          #{tag.name}
        </span>
        {tag.aliases.length > 0 && (
          <span className="manage-desc">
            별칭:{' '}
            {tag.aliases.map((a) => (
              <span key={a.id} className="manage-alias">
                {a.name}
                <button
                  type="button"
                  className="manage-alias-remove"
                  aria-label={`별칭 ${a.name} 지우기`}
                  disabled={deletingAliasId !== null}
                  onClick={() => removeAlias(a.id)}
                >
                  ×
                </button>
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="manage-count">{tag.error_count}개 기록</span>
      <button type="button" className="btn-secondary manage-btn" onClick={startEdit}>
        이름 변경
      </button>
      <button type="button" className="btn-secondary manage-btn" aria-expanded={addingAlias} onClick={startAddAlias}>
        + 별칭
      </button>
      {others.length > 0 && (
        <button
          type="button"
          className="btn-secondary manage-btn"
          aria-expanded={merging}
          onClick={() => {
            setIntoId('')
            setAddingAlias(false)
            setMerging((m) => !m)
          }}
        >
          합치기
        </button>
      )}
      <button type="button" className="btn-danger manage-btn" onClick={onAskDelete}>
        삭제
      </button>
      {addingAlias && (
        <form className="manage-merge" onSubmit={saveAlias}>
          <input
            className="manage-input"
            aria-label={`#${tag.name}의 새 별칭`}
            placeholder="별칭 입력 (예: 파이썬)"
            value={aliasName}
            disabled={aliasSaving}
            autoFocus
            onChange={(e) => setAliasName(e.target.value)}
            onKeyDown={onAliasKeyDown}
          />
          <button type="submit" className="btn-primary manage-btn" disabled={aliasSaving || !aliasName.trim()}>
            {aliasSaving ? '추가 중…' : '추가'}
          </button>
          <button
            type="button"
            className="btn-secondary manage-btn"
            disabled={aliasSaving}
            onClick={() => setAddingAlias(false)}
          >
            취소
          </button>
          {aliasError && <p className="manage-error">{aliasError}</p>}
        </form>
      )}
      {!addingAlias && aliasError && <p className="manage-error">{aliasError}</p>}
      {merging && (
        <div className="manage-merge">
          <label className="manage-merge-label" htmlFor={`merge-into-${tag.id}`}>
            어느 태그로 합칠까요?
          </label>
          <select id={`merge-into-${tag.id}`} value={intoId} onChange={(e) => setIntoId(e.target.value)}>
            <option value="" disabled>
              태그 고르기
            </option>
            {others.map((other) => (
              <option key={other.id} value={other.id}>
                #{other.name} ({other.error_count}개 기록)
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-primary manage-btn"
            disabled={!intoId}
            onClick={() => {
              const target = others.find((o) => String(o.id) === intoId)
              if (!target) return
              setMerging(false)
              onAskMerge(target)
            }}
          >
            다음
          </button>
          <button type="button" className="btn-secondary manage-btn" onClick={() => setMerging(false)}>
            취소
          </button>
        </div>
      )}
      {drag.dropTarget && drag.draggedId !== null && (
        <span className="manage-drop-hint">놓으면 #{tag.name}으로 합쳐요</span>
      )}
    </li>
  )
}

function TagManageModal({ onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const changed = useRef(false)
  const deletedTagIds = useRef<number[]>([])
  const [tags, setTags] = useState<Load>({ status: 'loading' })
  const [tagsKey, setTagsKey] = useState(0)
  // 다른 곳에서 이미 지워진 항목을 건드렸다는 안내
  const [notice, setNotice] = useState<string | null>(null)
  const [target, setTarget] = useState<Target | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // 합치기 확인 대화상자. source가 합쳐질 태그(A), target이 남을 태그(B)
  const [merge, setMerge] = useState<{ source: Tag; target: Tag } | null>(null)
  // 드래그: 끌고 있는 태그와 지금 놓을 곳으로 표시된 태그 (dragover에서 현재 대상 id를 상태로 둬서 깜빡이지 않게 한다)
  const [draggedId, setDraggedId] = useState<number | null>(null)
  const [overId, setOverId] = useState<number | null>(null)
  // 이름 수정·합치기 선택칸이 열려 있는 줄의 id. 하나라도 있으면 손잡이를 숨긴다
  const [openRowIds, setOpenRowIds] = useState<number[]>([])
  const rowOpenChanged = useCallback((id: number, open: boolean) => {
    setOpenRowIds((prev) => {
      if (open) return prev.includes(id) ? prev : [...prev, id]
      return prev.includes(id) ? prev.filter((x) => x !== id) : prev // 바뀌지 않으면 같은 배열을 돌려줘 다시 그리지 않는다
    })
  }, [])
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

  function close() {
    ref.current?.close() // 닫으면 모달을 연 버튼으로 포커스가 돌아간다
    onClose({ changed: changed.current, deletedTagIds: deletedTagIds.current })
  }

  function tagChanged() {
    changed.current = true
    setNotice(null)
    setTagsKey((k) => k + 1) // 이름순이 바뀔 수 있어서 서버 순서로 다시 받는다
  }

  function itemGone() {
    changed.current = true
    setNotice(GONE)
    setTagsKey((k) => k + 1)
  }

  function endDrag() {
    // 목록 바깥에 놓거나 Esc로 취소해도 dragend가 오므로 표시를 모두 지운다
    setDraggedId(null)
    setOverId(null)
  }

  // 태그를 다른 태그 위에 놓았다. 끈 태그가 A(합쳐질 태그), 놓은 태그가 B(남을 태그)다. 같은 확인 대화상자를 연다.
  function dropOn(targetTag: Tag, droppedId: number) {
    endDrag()
    if (tags.status !== 'ready' || !Number.isInteger(droppedId) || droppedId === targetTag.id) return
    const source = tags.items.find((t) => t.id === droppedId)
    if (!source) {
      setTagsKey((k) => k + 1) // 현재 목록에 없는 태그면 아무것도 하지 않고 목록만 다시 불러온다
      return
    }
    setMerge({ source, target: targetTag })
  }

  function merged(removedTagId: number) {
    // 합쳐져 사라진 태그는 지운 태그처럼 필터에서 뺀다. 내 기록 화면은 닫을 때 다시 불러온다
    deletedTagIds.current.push(removedTagId)
    setMerge(null)
    tagChanged()
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
      await deleteTag(target.id)
      deletedTagIds.current.push(target.id)
      setTags((prev) =>
        prev.status === 'ready'
          ? {
              status: 'ready',
              items: prev.items.filter((t) => t.id !== target.id),
            }
          : prev,
      )
      changed.current = true
      setNotice(null)
      setTarget(null)
    } catch (err) {
      if (isGone(err)) {
        itemGone()
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
              태그 관리
            </h2>
            <button type="button" className="manage-close" aria-label="닫기" onClick={close}>
              ×
            </button>
          </header>

          <div aria-live="polite">{notice && <p className="manage-notice">{notice}</p>}</div>

          {tags.status === 'loading' && <p className="hint">불러오는 중…</p>}
          {tags.status === 'error' && (
            <p className="manage-error">
              불러오지 못했어요.
              <button
                type="button"
                className="btn-secondary manage-btn"
                onClick={() => {
                  setTags({ status: 'loading' })
                  setTagsKey((k) => k + 1)
                }}
              >
                다시 시도
              </button>
            </p>
          )}
          {tags.status === 'ready' &&
            (tags.items.length === 0 ? (
              <p className="hint">아직 태그가 없어요.</p>
            ) : (
              <>
                {tags.items.length > 1 && <p className="hint">태그를 다른 태그 위로 끌어다 놓아도 합칠 수 있어요.</p>}
                <ul className={`manage-list${draggedId !== null ? ' is-dragging-list' : ''}`}>
                  {tags.items.map((tag) => (
                    <TagRow
                      key={tag.id}
                      drag={{
                        showHandle: tags.items.length > 1 && openRowIds.length === 0 && !merge && !target && !deleting,
                        draggedId,
                        dropTarget: overId === tag.id && draggedId !== null && draggedId !== tag.id,
                        onStart: () => setDraggedId(tag.id),
                        onEnd: endDrag,
                        onOver: () => setOverId(tag.id),
                        onLeave: () => setOverId((cur) => (cur === tag.id ? null : cur)),
                        onDrop: (id) => dropOn(tag, id),
                        onOpenChange: rowOpenChanged,
                      }}
                      others={tags.items
                        .filter((t) => t.id !== tag.id)
                        .sort((a, b) => b.error_count - a.error_count || a.name.localeCompare(b.name))}
                      onAskMerge={(target) => setMerge({ source: tag, target })}
                      tag={tag}
                      onRenamed={tagChanged}
                      onAskDelete={() =>
                        askDelete({
                          id: tag.id,
                          name: tag.name,
                          count: tag.error_count,
                        })
                      }
                      onGone={itemGone}
                    />
                  ))}
                </ul>
              </>
            ))}
        </div>
      </dialog>

      {merge && (
        <TagMergeDialog
          source={merge.source}
          target={merge.target}
          onMerged={merged}
          onGone={() => {
            setMerge(null)
            itemGone()
          }}
          onCancel={() => setMerge(null)}
        />
      )}

      {target && (
        <ConfirmDialog
          title={`#${target.name} 태그를 지울까요?`}
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
              ? `${target.count}개 기록에서 태그가 빠져요. 기록은 지워지지 않아요.`
              : '되돌릴 수 없어요.'}
          </p>
        </ConfirmDialog>
      )}
    </>
  )
}

export default TagManageModal
