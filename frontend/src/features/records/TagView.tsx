import { useEffect, useState, type ReactNode } from 'react'
import { fetchTags, type Tag } from './tagsApi'
import TagManageModal, { type TagManageResult } from './TagManageModal'

// "태그별" 탭 (S-002, D-055, 시안 내기록창 ②). 태그 칩을 눌러 그 태그가 붙은 기록을 모아 본다.
// 캡션 줄의 "⚙ 태그 관리"로 태그 이름 변경·삭제 모달을 연다 (D-063).
// 고른 태그는 부모가 URL 쿼리(tag_id)로 들고 있고, 기록 목록은 부모가 children으로 넘긴다.

type Props = {
  tagIds: number[]
  onToggleTag: (tagId: number) => void
  // 고른 태그를 모두 가진 기록 수. 아직 모르면 null
  resultCount: number | null
  // 태그 관리 모달이 닫혔을 때. 바뀐 게 있으면 부모가 기록 목록을 다시 받고 지운 태그를 필터에서 뺀다
  onManageClosed: (result: TagManageResult) => void
  children: ReactNode
}

type TagStatus = 'loading' | 'ready' | 'error'

function TagView({ tagIds, onToggleTag, resultCount, onManageClosed, children }: Props) {
  const [tagStatus, setTagStatus] = useState<TagStatus>('loading')
  const [tags, setTags] = useState<Tag[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const [managing, setManaging] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetchTags(controller.signal)
      .then((list) => {
        // 많이 쓴 순, 같으면 이름순
        setTags([...list].sort((a, b) => b.error_count - a.error_count || a.name.localeCompare(b.name)))
        setTagStatus('ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) setTagStatus('error')
      })
    return () => controller.abort()
  }, [reloadKey])

  function reloadTags() {
    setTagStatus('loading')
    setReloadKey((k) => k + 1)
  }

  function closeManage(result: TagManageResult) {
    setManaging(false)
    if (result.changed) setReloadKey((k) => k + 1) // 태그 칩을 다시 불러온다
    onManageClosed(result)
  }

  const selectedNames = tags.filter((tag) => tagIds.includes(tag.id)).map((tag) => `#${tag.name}`)

  return (
    <div className="tag-view">
      {tagStatus === 'loading' && <p className="record-state">불러오는 중…</p>}
      {tagStatus === 'error' && (
        <p className="record-state record-error">
          태그를 불러오지 못했어요.
          <button type="button" className="btn-secondary" onClick={reloadTags}>
            다시 시도
          </button>
        </p>
      )}
      {tagStatus === 'ready' && tags.length === 0 && (
        <p className="record-state">아직 태그가 없어요. 에러를 입력할 때 태그를 붙일 수 있어요.</p>
      )}
      {tagStatus === 'ready' && tags.length > 0 && (
        <>
          <div className="tag-view-caption-row">
            <p className="tag-view-caption">태그 {tags.length}개 · 많이 쓴 순</p>
            <button type="button" className="btn-secondary manage-btn" onClick={() => setManaging(true)}>
              ⚙ 태그 관리
            </button>
          </div>
          <div className="chip-row" role="group" aria-label="태그">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className="filter-chip tag-chip"
                aria-pressed={tagIds.includes(tag.id)}
                onClick={() => onToggleTag(tag.id)}
              >
                {tag.name} <span className="chip-count">{tag.error_count}</span>
              </button>
            ))}
          </div>
          <h2 className="tag-view-heading">
            {selectedNames.length > 0 ? (
              <>
                {selectedNames.join(' + ')} 기록
                {resultCount !== null && <span className="record-date-count">{resultCount}개</span>}
              </>
            ) : (
              '고른 태그가 없어요'
            )}
          </h2>
          <div aria-live="polite">{children}</div>
          <p className="hint">태그를 여러 개 누르면 모두 포함한 기록만 보여요 (예: Python + 패키지)</p>
        </>
      )}
      {managing && <TagManageModal onClose={closeManage} />}
    </div>
  )
}

export default TagView
