import { useEffect, useMemo, useRef, useState } from 'react'
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

  // 태그 칩은 자주 쓰는 순(기록 많은 순, 같으면 이름순 그대로)으로 한 줄만 보여 주고 나머지는 "+ 더 보기"로 펼친다 (D-133).
  // "+ 더 보기"는 마지막으로 보이는 칩 바로 뒤에 붙는다(D-147). 칩 폭은 글자로 정해져 줄바꿈 없이 한 번 재 두고(measuring),
  // 컨테이너 폭이 바뀔 때마다 "칩 k개 + 버튼"이 한 줄에 들어가는 가장 큰 k를 다시 계산한다.
  const sortedTags = useMemo(() => [...tags].sort((a, b) => b.error_count - a.error_count), [tags])
  const chipsRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  // 잰 칩 폭(순서는 sortedTags와 같다)과 "+ 더 보기" 버튼 폭. sig가 다르면 태그가 바뀐 것이라 다시 잰다.
  const [measured, setMeasured] = useState<{ sig: string; widths: number[]; more: number } | null>(null)
  const [fitCount, setFitCount] = useState<number | null>(null)
  // 글꼴이 늦게 불러와져 칩 폭이 달라지면 한 번 다시 재도록 sig에 섞는다(한 번만 바뀐다)
  const [fontsLoaded, setFontsLoaded] = useState(false)
  useEffect(() => {
    let alive = true
    void document.fonts?.ready.then(() => {
      if (alive) setFontsLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [])
  const sig = `${fontsLoaded ? 1 : 0}#` + sortedTags.map((t) => `${t.id}:${t.name}:${t.error_count}`).join('|')
  const measuring = tagStatus === 'ready' && sortedTags.length > 0 && measured?.sig !== sig

  useEffect(() => {
    const el = chipsRef.current
    if (!el || tagStatus !== 'ready') return
    const GAP = 8
    function measure() {
      if (!el) return
      let m = measured
      if (measuring) {
        const chips = Array.from(el.querySelectorAll<HTMLElement>('[data-tag-id]'))
        const more = el.querySelector<HTMLElement>('[data-more]')
        if (chips.length !== sortedTags.length || !more) return
        m = { sig, widths: chips.map((c) => c.offsetWidth), more: more.offsetWidth }
        setMeasured(m)
      }
      if (!m) return
      const width = el.clientWidth
      const total = m.widths.reduce((sum, w) => sum + w, 0) + GAP * (m.widths.length - 1)
      let k = m.widths.length
      if (total > width) {
        // 칩 k개 + 버튼이 한 줄에 들어가는 가장 큰 k (최소 1개는 보인다)
        k = 0
        let used = m.more
        for (const w of m.widths) {
          if (used + GAP + w > width) break
          used += GAP + w
          k += 1
        }
        k = Math.max(k, 1)
      }
      setFitCount(k)
      // 주소로 들어온 선택 태그가 접힌 칸에 숨으면 선택 상태가 안 보이므로 펼친다
      if (sortedTags.slice(k).some((t) => tagIds.includes(t.id))) setExpanded(true)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [sortedTags, tagStatus, tagIds, measured, measuring, sig])

  const hiddenFrom = fitCount ?? sortedTags.length
  const overflowCount = sortedTags.length - hiddenFrom
  const collapsed = !expanded && overflowCount > 0

  return (
    <div className="record-filters">
      <input
        type="search"
        className="record-search"
        placeholder="에러·해결법 검색"
        aria-label="에러·해결법 검색"
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

      <div
        ref={chipsRef}
        className={measuring ? 'tag-filter-chips measuring' : 'tag-filter-chips'}
        role="group"
        aria-label="태그"
      >
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
          sortedTags.map((tag, i) => (
            <button
              key={tag.id}
              type="button"
              data-tag-id={tag.id}
              className={tag.error_count === 0 ? 'filter-chip tag empty' : 'filter-chip tag'}
              aria-pressed={tagIds.includes(tag.id)}
              // 접힌 칩은 화면에서 빠져 키보드·스크린 리더에서도 건너뛴다. 재는 중에는 모두 그린다
              hidden={!measuring && collapsed && i >= hiddenFrom}
              onClick={() => onToggleTag(tag.id)}
            >
              #{tag.name}
              <span className="chip-count">{tag.error_count}</span>
            </button>
          ))}
        {/* 마지막 보이는 칩 바로 뒤에 붙는다. 펼치면 "접기"가 마지막 칩 뒤에 붙는다 */}
        {tagStatus === 'ready' && (measuring || overflowCount > 0) && (
          <button
            type="button"
            data-more
            className="filter-chip tag-more"
            aria-expanded={expanded}
            aria-label={expanded ? '태그 접기' : `태그 ${overflowCount}개 더 보기`}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? '접기' : '+ 더 보기'}
          </button>
        )}
      </div>
      {tagStatus === 'ready' && tags.length > 0 && (
        <p className="hint">태그를 여러 개 누르면 모두 포함한 기록만 보여요</p>
      )}
    </div>
  )
}

export default RecordFilters
