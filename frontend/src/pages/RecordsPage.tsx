import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { listErrors, type ErrorFilters, type ErrorListItem, type ErrorStatus } from '../features/records/errorsApi'
import ManageModal, { type ManageResult } from '../features/records/ManageModal'
import RecordFilters from '../features/records/RecordFilters'
import RecordList from '../features/records/RecordList'
import '../features/records/records.css'

// S-002 내 기록 (R-005, D-035, SCREEN-SPEC_6). 담당 팀원 1 (D-039).
// 필터 값은 URL 쿼리(?status=…&tag_id=…&q=…)에 둔다. 상세에 갔다가 뒤로 와도 필터가 남는다 (D-036).
// "⚙ 관리"로 태그·시리즈 이름 변경·삭제 모달을 연다 (D-042).

// 검색은 입력이 멈추고 잠시 뒤에 요청한다
const SEARCH_DELAY_MS = 300

function readFilters(params: URLSearchParams): ErrorFilters {
  const status = params.get('status')
  const tagIds = params
    .getAll('tag_id')
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0)
  return {
    status: status === 'unresolved' || status === 'resolved' ? status : null,
    tagIds: [...new Set(tagIds)],
    q: (params.get('q') ?? '').trim(),
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
  const [managing, setManaging] = useState(false)
  // 관리 모달에서 바뀐 게 있으면 올려서 태그 칩을 다시 불러온다
  const [tagsVersion, setTagsVersion] = useState(0)

  const key = JSON.stringify([filters, reloadKey])
  const loading = result?.key !== key
  const hasFilters = filters.status !== null || filters.tagIds.length > 0 || filters.q !== ''

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
    const [keyFilters] = JSON.parse(key) as [ErrorFilters, number]
    const controller = new AbortController()
    listErrors(keyFilters, controller.signal)
      .then((items) => setResult({ key, items }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, items: null })
      })
    return () => controller.abort()
  }, [key])

  function changeStatus(status: ErrorStatus | null) {
    updateParams((next) => (status ? next.set('status', status) : next.delete('status')))
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
      next.delete('tag_id')
      next.delete('q')
    })
  }

  function closeManage({ changed, deletedTagIds }: ManageResult) {
    setManaging(false)
    if (!changed) return
    // 태그 이름·시리즈 이름·소속이 바뀌었을 수 있어서 목록과 태그 칩을 다시 불러온다
    setReloadKey((k) => k + 1)
    setTagsVersion((v) => v + 1)
    // 지운 태그가 필터에 걸려 있으면 필터에서 뺀다 (없는 태그로 거르면 항상 빈 결과라서)
    if (deletedTagIds.some((id) => filters.tagIds.includes(id))) {
      const remaining = filters.tagIds.filter((id) => !deletedTagIds.includes(id))
      updateParams((next) => {
        next.delete('tag_id')
        for (const id of remaining) next.append('tag_id', String(id))
      })
    }
  }

  return (
    <>
      <div className="records-header">
        <h1 className="page-title">내 기록</h1>
        <button type="button" className="btn-secondary" onClick={() => setManaging(true)}>
          ⚙ 관리
        </button>
      </div>

      <RecordFilters
        searchText={searchText}
        onSearchTextChange={setSearchText}
        status={filters.status}
        onStatusChange={changeStatus}
        tagIds={filters.tagIds}
        onToggleTag={toggleTag}
        reloadSignal={tagsVersion}
      />

      <div aria-live="polite">
        {loading ? (
          <p className="record-state">불러오는 중…</p>
        ) : result.items === null ? (
          <p className="record-state record-error">
            기록을 불러오지 못했어요.
            <button type="button" className="btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>
              다시 시도
            </button>
          </p>
        ) : result.items.length === 0 ? (
          hasFilters ? (
            <p className="record-state">
              조건에 맞는 기록이 없어요.
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
          <RecordList items={result.items} backTo={location.pathname + location.search} />
        )}
      </div>

      {managing && <ManageModal onClose={closeManage} />}
    </>
  )
}

export default RecordsPage
