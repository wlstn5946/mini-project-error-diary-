import { useEffect, useState } from 'react'
import StaleDot from '../../components/StaleDot'
import { listErrors, type ErrorStatus } from './errorsApi'
import { fetchTags, type Tag } from './tagsApi'

// 내 기록 검색·필터 (S-002, 시안 내기록창 ①②). 값은 부모가 URL 쿼리로 들고 있다 (D-036).
// 상태 칩 줄: 전체 / 미해결만 / 해결만 / 오래된 기록(미해결 + 등록 14일 이상, 빨간 불, D-078)

type Props = {
  searchText: string
  onSearchTextChange: (text: string) => void
  status: ErrorStatus | null
  onStatusChange: (status: ErrorStatus | null) => void
  // "오래된 기록" 칩이 켜져 있는가. 켜면 상태 칩은 모두 꺼진다
  stale: boolean
  onStaleChange: (stale: boolean) => void
  tagIds: number[]
  onToggleTag: (tagId: number) => void
  // 값이 바뀌면 태그 목록을 다시 불러온다 (관리 모달에서 태그를 바꾼 뒤)
  reloadSignal?: number
}

type TagStatus = 'loading' | 'ready' | 'error'

const STATUS_CHIPS: { value: ErrorStatus | null; label: string }[] = [
  { value: null, label: '전체' },
  { value: 'unresolved', label: '미해결만' },
  { value: 'resolved', label: '해결만' },
]

function RecordFilters({
  searchText,
  onSearchTextChange,
  status,
  onStatusChange,
  stale,
  onStaleChange,
  tagIds,
  onToggleTag,
  reloadSignal = 0,
}: Props) {
  const [tagStatus, setTagStatus] = useState<TagStatus>('loading')
  const [tags, setTags] = useState<Tag[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  // 상태 칩 옆 개수 (시안 ①). 필터와 상관없는 전체 기록 기준이다. 못 불러오면 개수만 숨긴다.
  const [counts, setCounts] = useState<Record<'all' | ErrorStatus | 'stale', number> | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    listErrors({ status: null, tagIds: [], q: '', stale: false }, controller.signal)
      .then((items) => {
        const resolved = items.filter((item) => item.status === 'resolved').length
        const staleCount = items.filter((item) => item.is_stale).length
        setCounts({ all: items.length, resolved, unresolved: items.length - resolved, stale: staleCount })
      })
      .catch(() => {
        if (!controller.signal.aborted) setCounts(null)
      })
    return () => controller.abort()
  }, [reloadSignal])

  useEffect(() => {
    const controller = new AbortController()
    fetchTags(controller.signal)
      .then((list) => {
        setTags(list)
        setTagStatus('ready')
      })
      .catch(() => {
        // 태그 목록이 실패해도 검색·상태 필터는 그대로 쓸 수 있다
        if (!controller.signal.aborted) setTagStatus('error')
      })
    return () => controller.abort()
  }, [reloadKey, reloadSignal])

  function reloadTags() {
    setTagStatus('loading')
    setReloadKey((k) => k + 1)
  }

  return (
    <div className="record-filters">
      <input
        type="search"
        className="record-search"
        placeholder="에러 메시지 검색"
        aria-label="에러 메시지 검색"
        maxLength={200}
        value={searchText}
        onChange={(e) => onSearchTextChange(e.target.value)}
      />

      <div className="chip-row" role="group" aria-label="상태">
        {STATUS_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            className="filter-chip"
            aria-pressed={!stale && status === chip.value}
            onClick={() => onStatusChange(chip.value)}
          >
            {chip.label}
            {counts && <span className="chip-count">{counts[chip.value ?? 'all']}</span>}
          </button>
        ))}
        {/* 해결만 바로 옆, 같은 모양의 칩. 오래된 기록이 있으면(개수 1 이상) 빨간 불이 깜빡인다 (D-078) */}
        <button
          type="button"
          className="filter-chip stale-chip"
          aria-pressed={stale}
          title="미해결인 채로 14일 이상 지난 기록"
          onClick={() => onStaleChange(!stale)}
        >
          {counts && counts.stale > 0 && <StaleDot label="오래된 기록이 있어요" />}
          오래된 기록
          {counts && <span className="chip-count">{counts.stale}</span>}
        </button>
      </div>

      <div className="chip-row" role="group" aria-label="태그">
        {tagStatus === 'loading' && <span className="hint">태그 불러오는 중…</span>}
        {tagStatus === 'error' && (
          <span className="record-error">
            태그를 불러오지 못했어요.
            <button type="button" className="btn-secondary record-retry" onClick={reloadTags}>
              다시 시도
            </button>
          </span>
        )}
        {tagStatus === 'ready' &&
          tags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className="filter-chip tag"
              aria-pressed={tagIds.includes(tag.id)}
              onClick={() => onToggleTag(tag.id)}
            >
              #{tag.name}
              <span className="chip-count">{tag.error_count}</span>
            </button>
          ))}
      </div>
      {tagStatus === 'ready' && tags.length > 0 && (
        <p className="hint">태그를 여러 개 누르면 모두 포함한 기록만 보여요</p>
      )}
    </div>
  )
}

export default RecordFilters
