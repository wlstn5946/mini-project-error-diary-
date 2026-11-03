import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { listErrors, type ErrorFilters, type ErrorListItem, type ErrorStatus } from '../features/records/errorsApi'
import RecordFilters from '../features/records/RecordFilters'
import RecordList from '../features/records/RecordList'
import SeriesView from '../features/records/SeriesView'
import { type TagManageResult } from '../features/records/TagManageModal'
import TagView from '../features/records/TagView'
import '../features/records/records.css'

// S-002 내 기록 (R-005, D-035, SCREEN-SPEC_6). 담당 팀원 1 (D-039).
// 필터 값은 URL 쿼리(?status=…&tag_id=…&q=…)에 둔다. 상세에 갔다가 뒤로 와도 필터가 남는다 (D-036).
// 태그 관리는 태그별 탭, 시리즈 수정·삭제는 시리즈별 탭에서 한다 (D-062, D-063).
// 탭은 날짜별 / 태그별 / 시리즈별이고 주소 쿼리(?view=tag, ?view=series&series_id=N)에 둔다 (D-042, D-055).
// 태그별 탭은 고른 태그(tag_id)만으로 거르고, 시리즈별 탭에서는 검색·상태·태그 필터를 숨긴다.

type View = 'date' | 'tag' | 'series'

const VIEW_TABS: { view: View; label: string }[] = [
  { view: 'date', label: '날짜별' },
  { view: 'tag', label: '태그별' },
  { view: 'series', label: '시리즈별' },
]

// 검색은 입력이 멈추고 잠시 뒤에 요청한다
const SEARCH_DELAY_MS = 300

function readFilters(params: URLSearchParams): ErrorFilters {
  const status = params.get('status')
  const tagIds = params
    .getAll('tag_id')
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0)
  // 오래된 기록(?stale=1)은 미해결만 뜻하므로 켜져 있으면 status는 쓰지 않는다 (D-078)
  const stale = params.get('stale') === '1'
  return {
    status: !stale && (status === 'unresolved' || status === 'resolved') ? status : null,
    tagIds: [...new Set(tagIds)],
    q: (params.get('q') ?? '').trim(),
    stale,
  }
}

// 응답이 어느 필터의 결과인지 key로 구분한다. 현재 필터와 key가 다르면 아직 불러오는 중이다.
type ListResult = { key: string; items: ErrorListItem[] | null }

function RecordsPage() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const filters = readFilters(params)
  const [searchText, setSearchText] = useState(filters.q)
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState<ListResult | null>(null)

  const view: View = params.get('view') === 'series' ? 'series' : params.get('view') === 'tag' ? 'tag' : 'date'
  const seriesView = view === 'series'
  const tagView = view === 'tag'
  const rawSeriesId = Number(params.get('series_id'))
  // 연 시리즈. 시리즈별 탭이 아니거나 숫자가 아니면 null (카드만 보임)
  const seriesId = seriesView && Number.isInteger(rawSeriesId) && rawSeriesId > 0 ? rawSeriesId : null

  // 태그별 탭은 고른 태그만으로 거른다. 날짜별 탭의 검색·상태 값이 주소에 남아 있어도 쓰지 않는다 (D-055).
  const listFilters: ErrorFilters = tagView ? { status: null, tagIds: filters.tagIds, q: '', stale: false } : filters
  const key = JSON.stringify([listFilters, reloadKey, view])
  const loading = result?.key !== key
  const hasFilters = filters.status !== null || filters.tagIds.length > 0 || filters.q !== '' || filters.stale

  // 필터를 바꿀 때마다 방문 기록이 쌓이지 않게 현재 주소를 바꾼다.
  // 이전 주소를 받아 고치므로, 검색 예약 사이에 바뀐 다른 필터를 덮지 않는다.
  function updateParams(change: (next: URLSearchParams) => void) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        change(next)
        return next
      },
      { replace: true },
    )
  }

  // 입력이 멈추고 잠시 뒤 검색어를 주소에 반영한다. 주소와 같으면 아무것도 하지 않는다.
  const currentQ = filters.q
  useEffect(() => {
    const q = searchText.trim()
    if (q === currentQ) return
    const timer = setTimeout(() => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (q) next.set('q', q)
          else next.delete('q')
          return next
        },
        { replace: true },
      )
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [searchText, currentQ, setParams])

  // 필터(key)가 바뀌면 다시 불러온다. 필터 값은 key에서 꺼내 쓴다.
  // 이전 요청은 취소한다. 늦게 온 이전 응답이 최신 결과를 덮지 않게 하기 위해서다.
  useEffect(() => {
    const [keyFilters, , keyView] = JSON.parse(key) as [ErrorFilters, number, View]
    if (keyView === 'series') return // 시리즈별 탭은 이 목록을 쓰지 않는다. 다른 탭으로 돌아오면 다시 불러온다.
    // 태그별 탭에서 고른 태그가 없으면 묻지 않는다. 화면은 안내 문구를 따로 보여준다.
    if (keyView === 'tag' && keyFilters.tagIds.length === 0) return
    const controller = new AbortController()
    listErrors(keyFilters, controller.signal)
      .then((items) => setResult({ key, items }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, items: null })
      })
    return () => controller.abort()
  }, [key])

  // 상태 칩을 누르면 "오래된 기록"은 꺼진다 (같은 줄의 칩 하나만 켜진다)
  function changeStatus(status: ErrorStatus | null) {
    updateParams((next) => {
      next.delete('stale')
      if (status) next.set('status', status)
      else next.delete('status')
    })
  }

  // "오래된 기록" 칩: 켜면 상태 칩은 모두 꺼진다 (미해결 + 14일 이상, D-078)
  function changeStale(stale: boolean) {
    updateParams((next) => {
      next.delete('status')
      if (stale) next.set('stale', '1')
      else next.delete('stale')
    })
  }

  function toggleTag(tagId: number) {
    const tagIds = filters.tagIds.includes(tagId)
      ? filters.tagIds.filter((id) => id !== tagId)
      : [...filters.tagIds, tagId]
    updateParams((next) => {
      next.delete('tag_id')
      for (const id of tagIds) next.append('tag_id', String(id))
    })
  }

  function clearFilters() {
    setSearchText('')
    updateParams((next) => {
      next.delete('status')
      next.delete('stale')
      next.delete('tag_id')
      next.delete('q')
    })
  }

  // 탭을 바꾼다. 날짜별 필터 값은 주소에 그대로 두어서 날짜별로 돌아오면 필터가 남는다.
  function showView(next: View) {
    updateParams((nextParams) => {
      nextParams.delete('series_id')
      if (next === 'date') nextParams.delete('view')
      else nextParams.set('view', next)
    })
  }

  // 시리즈를 열고 닫는 것은 방문 기록에 남겨서 브라우저 뒤로 가기가 시리즈 목록으로 돌아가게 한다.
  function openSeries(id: number | null) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('view', 'series')
      if (id === null) next.delete('series_id')
      else next.set('series_id', String(id))
      return next
    })
  }

  function closeTagManage({ changed, deletedTagIds }: TagManageResult) {
    if (!changed) return
    // 태그 이름이 바뀌었을 수 있어서 목록을 다시 불러온다 (태그 칩은 태그별 탭이 직접 다시 받는다)
    setReloadKey((k) => k + 1)
    // 지운 태그가 필터에 걸려 있으면 필터에서 뺀다 (없는 태그로 거르면 항상 빈 결과라서)
    if (deletedTagIds.some((id) => filters.tagIds.includes(id))) {
      const remaining = filters.tagIds.filter((id) => !deletedTagIds.includes(id))
      updateParams((next) => {
        next.delete('tag_id')
        for (const id of remaining) next.append('tag_id', String(id))
      })
    }
  }

  // 날짜별·태그별 탭이 같이 쓰는 목록 영역 (불러오는 중·실패·빈 결과·목록)
  const recordListArea = loading ? (
    <p className="record-state">불러오는 중…</p>
  ) : result.items === null ? (
    <p className="record-state record-error">
      기록을 불러오지 못했어요.
      <button type="button" className="btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>
        다시 시도
      </button>
    </p>
  ) : result.items.length === 0 ? (
    tagView ? (
      <p className="record-state">고른 태그를 모두 가진 기록이 없어요.</p>
    ) : hasFilters ? (
      <p className="record-state">
        {filters.stale && !filters.q && filters.tagIds.length === 0
          ? '14일 이상 지난 미해결 기록이 없어요.'
          : '조건에 맞는 기록이 없어요.'}
        <button type="button" className="btn-secondary" onClick={clearFilters}>
          필터 지우기
        </button>
      </p>
    ) : (
      <p className="record-state">
        아직 기록이 없어요. 에러 해결에서 첫 에러를 입력해 보세요.
        <Link className="btn-primary" to="/solve">
          에러 해결로
        </Link>
      </p>
    )
  ) : (
    <RecordList items={result.items} backTo={location.pathname + location.search} flat={tagView} />
  )

  return (
    <>
      <div className="records-header">
        <h1 className="page-title">내 기록</h1>
      </div>

      <div className="view-tabs" role="tablist">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.view}
            type="button"
            role="tab"
            aria-selected={view === tab.view}
            className="view-tab"
            onClick={() => showView(tab.view)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {seriesView ? (
        <SeriesView
          seriesId={seriesId}
          backTo={location.pathname + location.search}
          reloadSignal={reloadKey}
          onOpen={openSeries}
          onBack={() => openSeries(null)}
        />
      ) : tagView ? (
        <TagView
          tagIds={filters.tagIds}
          onToggleTag={toggleTag}
          resultCount={!loading && result.items ? result.items.length : null}
          onManageClosed={closeTagManage}
        >
          {filters.tagIds.length === 0 ? (
            <p className="record-state">위에서 태그를 눌러 기록을 모아 보세요.</p>
          ) : (
            recordListArea
          )}
        </TagView>
      ) : (
        <>
          <RecordFilters
            searchText={searchText}
            onSearchTextChange={setSearchText}
            status={filters.status}
            onStatusChange={changeStatus}
            stale={filters.stale}
            onStaleChange={changeStale}
            tagIds={filters.tagIds}
            onToggleTag={toggleTag}
          />

          <div aria-live="polite">{recordListArea}</div>
        </>
      )}

    </>
  )
}

export default RecordsPage
