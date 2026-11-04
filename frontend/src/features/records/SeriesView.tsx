import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ApiError } from '../../api'
import type { ErrorListItem } from './errorsApi'
import { RecordItemContent, RetryButton } from './RecordList'
import { exportSeriesMarkdown } from './exportActions'
import ConfirmDialog from './ConfirmDialog'
import SeriesCreateForm from './SeriesCreateForm'
import SeriesEditForm from './SeriesEditForm'
import { deleteSeries, fetchSeries, listSeriesErrors, reorderSeries, type Series } from './seriesApi'

// "시리즈별" 탭 (S-002, D-042, D-061, D-062). 새 시리즈 만들기, 시리즈 이름·설명 수정·삭제도 여기서 한다.
// 시리즈 카드가 항상 위에 있고, 시리즈를 열면 그 아래에 시리즈 안 순서대로 기록 목록이 보인다.
// 시리즈 안 순서 번호는 목록 위치(1부터)로 보여준다. 빈 번호가 있어도 번호가 이어진다. (D-051)
// 시리즈가 없는 기록은 이 탭에 나오지 않는다. (D-053)

type Props = {
  // 연 시리즈. null이면 카드만 보인다
  seriesId: number | null
  // 상세에서 "← 내 기록"으로 돌아올 주소 (이 탭과 연 시리즈 포함)
  backTo: string
  // 값이 바뀌면 다시 불러온다 (기록 목록이 바뀐 뒤)
  reloadSignal: number
  onOpen: (seriesId: number) => void
  onBack: () => void
}

// 응답이 어느 요청의 결과인지 key로 구분한다. 현재 key와 다르면 아직 불러오는 중이다. items가 null이면 실패.
type SeriesResult = { key: string; items: Series[] | null }
type ErrorsResult = { key: string; items: ErrorListItem[] | null }

const MOVE_FAILED = '순서를 바꾸지 못했어요. 다시 시도해 주세요.'
const GONE = '이미 삭제된 항목이에요.'
const EXPORT_FAILED = '일부 기록을 불러오지 못해 내보내지 않았어요. 다시 시도해 주세요.'

type DetailProps = {
  series: Series
  backTo: string
  onSeriesChanged: (series: Series) => void
  // 다른 곳에서 이미 지워진 시리즈
  onGone: () => void
  // 시리즈를 지웠다. notice는 이미 지워져 있던 경우의 안내
  onDeleted: (notice: string | null) => void
  onNew: () => void
}

function SeriesDetail({ series, backTo, onSeriesChanged, onGone, onDeleted, onNew }: DetailProps) {
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<ErrorsResult | null>(null)
  const [editing, setEditing] = useState(false)
  const [moving, setMoving] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // 삭제 확인 버튼을 빠르게 두 번 눌러도 요청은 한 번만 보낸다
  const deleteBusy = useRef(false)
  // 화살표를 빠르게 여러 번 눌러도 요청은 하나씩만 보낸다
  const busy = useRef(false)
  // 시리즈 Markdown 내보내기 (D-119). progress가 있으면 내보내는 중
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const exportBusy = useRef(false)
  const exportController = useRef<AbortController | null>(null)
  const exporting = progress !== null

  const key = `${series.id}|${retry}`
  const loading = result?.key !== key

  useEffect(() => {
    const controller = new AbortController()
    listSeriesErrors(series.id, controller.signal)
      .then((items) => setResult({ key, items }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, items: null })
      })
    return () => controller.abort()
  }, [key, series.id])

  // 다른 시리즈로 옮기거나 화면을 떠나면 진행 중인 내보내기를 취소한다 (안내 없음)
  useEffect(() => () => exportController.current?.abort(), [])

  async function exportMarkdown() {
    if (exportBusy.current) return
    exportBusy.current = true
    const controller = new AbortController()
    exportController.current = controller
    setExportError(null)
    setProgress({ done: 0, total: 0 })
    try {
      await exportSeriesMarkdown(series, (done, total) => !controller.signal.aborted && setProgress({ done, total }), controller.signal)
    } catch {
      if (!controller.signal.aborted) setExportError(EXPORT_FAILED)
    } finally {
      exportBusy.current = false
      if (!controller.signal.aborted) setProgress(null)
    }
  }

  async function move(index: number, delta: -1 | 1) {
    if (busy.current || exportBusy.current || result?.items == null) return
    const previous = result.items
    const target = index + delta
    if (target < 0 || target >= previous.length) return
    const next = [...previous]
    ;[next[index], next[target]] = [next[target], next[index]]

    busy.current = true
    setMoving(true)
    setMoveError(null)
    setResult({ key, items: next }) // 화면을 먼저 바꾸고, 서버에는 전체 순서를 보낸다
    try {
      const saved = await reorderSeries(series.id, next.map((item) => item.id))
      setResult({ key, items: saved })
    } catch (err) {
      setResult({ key, items: previous }) // 저장하지 못하면 원래 순서로 되돌린다
      if (err instanceof ApiError && err.status === 404) {
        onGone()
        return
      }
      setMoveError(err instanceof ApiError && err.status === 422 ? err.message : MOVE_FAILED)
      // 화면과 서버의 기록이 어긋난 경우(422)에는 서버 목록을 다시 받는다
      if (err instanceof ApiError && err.status === 422) setRetry((k) => k + 1)
    } finally {
      busy.current = false
      setMoving(false)
    }
  }

  async function confirmDelete() {
    if (deleteBusy.current) return
    deleteBusy.current = true
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteSeries(series.id)
      onDeleted(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) onDeleted(GONE)
      else {
        // 창은 열어 둔 채 안내만 바꾼다. 같은 버튼으로 다시 시도할 수 있다.
        setDeleteError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      deleteBusy.current = false
      setDeleting(false)
    }
  }

  return (
    <div className="series-detail">
      <header className="series-header">
        <div>
          <h2 className="series-name">{series.name}</h2>
          {series.description && <p className="series-desc">{series.description}</p>}
        </div>
        <button type="button" className="btn-secondary manage-btn" onClick={onNew}>
          + 새 시리즈
        </button>
      </header>

      <div aria-live="polite">
        {moveError && <p className="manage-error">{moveError}</p>}
        {exportError && <p className="manage-error">{exportError}</p>}
      </div>

      {loading ? (
        <p className="record-state">불러오는 중…</p>
      ) : result.items === null ? (
        <p className="record-state record-error">
          기록을 불러오지 못했어요.
          <button type="button" className="btn-secondary" onClick={() => setRetry((k) => k + 1)}>
            다시 시도
          </button>
        </p>
      ) : result.items.length === 0 ? (
        <p className="record-state">이 시리즈에 속한 기록이 없어요.</p>
      ) : (
        <ol className="series-items">
          {result.items.map((item, index, all) => (
            <li key={item.id} className="series-item">
              <span className="series-no">{index + 1}</span>
              <Link className="record-item series-link" to={`/records/${item.id}`} state={{ backTo }}>
                <RecordItemContent item={item} showDate showSeries={false} reuseBadge />
              </Link>
              <RetryButton item={item} />
              <span className="series-arrows">
                <button
                  type="button"
                  className="btn-secondary arrow-btn"
                  aria-label={`${index + 1}번째 기록을 위로`}
                  disabled={moving || exporting || index === 0}
                  onClick={() => move(index, -1)}
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="btn-secondary arrow-btn"
                  aria-label={`${index + 1}번째 기록을 아래로`}
                  disabled={moving || exporting || index === all.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ▼
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}

      {editing ? (
        <SeriesEditForm
          series={series}
          onSaved={(updated) => {
            setEditing(false)
            onSeriesChanged(updated)
          }}
          onCancel={() => setEditing(false)}
          onGone={onGone}
        />
      ) : (
        <div className="series-actions">
          <button type="button" className="btn-secondary manage-btn" onClick={() => setEditing(true)}>
            시리즈 이름·설명 수정
          </button>
          <button
            type="button"
            className="btn-secondary manage-btn"
            disabled={!result?.items?.length || loading || moving || exporting}
            onClick={exportMarkdown}
          >
            {progress ? (progress.total ? `불러오는 중 ${progress.done}/${progress.total}` : '불러오는 중…') : '시리즈 Markdown 내려받기'}
          </button>
          <button
            type="button"
            className="btn-danger manage-btn"
            disabled={exporting}
            onClick={() => {
              setDeleteError(null)
              setConfirmingDelete(true)
            }}
          >
            시리즈 삭제
          </button>
        </div>
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title={`'${series.name}' 시리즈를 지울까요?`}
          confirmLabel="삭제"
          busyLabel="삭제 중…"
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => {
            setConfirmingDelete(false)
            setDeleteError(null)
          }}
        >
          <p className="confirm-text">
            {series.error_count > 0
              ? `${series.error_count}개 기록에서 시리즈가 비워져요. 기록은 지워지지 않아요.`
              : '되돌릴 수 없어요.'}
          </p>
        </ConfirmDialog>
      )}
    </div>
  )
}

function SeriesView({ seriesId, backTo, reloadSignal, onOpen, onBack }: Props) {
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<SeriesResult | null>(null)
  const [creating, setCreating] = useState(false)
  // 이미 지워져 있던 시리즈를 지우려 했다는 안내
  const [notice, setNotice] = useState<string | null>(null)

  const key = `${retry}|${reloadSignal}`
  const loading = result?.key !== key

  useEffect(() => {
    const controller = new AbortController()
    fetchSeries(controller.signal)
      .then((items) => setResult({ key, items }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, items: null })
      })
    return () => controller.abort()
  }, [key])

  function replaceSeries(updated: Series) {
    setResult((prev) =>
      prev?.items ? { ...prev, items: prev.items.map((s) => (s.id === updated.id ? updated : s)) } : prev,
    )
  }

  function created(newSeries: Series) {
    setCreating(false)
    setNotice(null)
    setRetry((k) => k + 1) // 목록을 다시 받고
    onOpen(newSeries.id) // 새 시리즈를 연다
  }

  function deleted(message: string | null) {
    setNotice(message)
    setRetry((k) => k + 1) // 카드 목록을 다시 받는다
    onBack() // 시리즈 선택을 닫는다 (series_id 제거)
  }

  const createForm = creating && <SeriesCreateForm onCreated={created} onCancel={() => setCreating(false)} />

  const guide = (
    <aside className="series-guide">
      <h3 className="series-guide-title">시리즈 지정 방법</h3>
      <ul>
        <li>시리즈별 탭에서 새로 만들기</li>
        <li>에러 해결 창에서 에러를 입력할 때 시리즈를 고르거나 새로 만들기</li>
        <li>에러 일기 상세에서 나중에 지정·변경·해제</li>
        <li>에러 하나는 시리즈 하나에만 속하고, 지정하면 마지막 순서로 추가</li>
      </ul>
    </aside>
  )

  if (loading) return <p className="record-state">불러오는 중…</p>
  if (result.items === null) {
    return (
      <p className="record-state record-error">
        시리즈를 불러오지 못했어요.
        <button type="button" className="btn-secondary" onClick={() => setRetry((k) => k + 1)}>
          다시 시도
        </button>
      </p>
    )
  }

  if (result.items.length === 0) {
    return (
      <>
        <div aria-live="polite">{notice && <p className="manage-notice">{notice}</p>}</div>
        <p className="record-state">
          아직 시리즈가 없어요. 새 시리즈를 만들거나, 에러를 입력할 때 만들 수 있어요.
          {!creating && (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              + 새 시리즈
            </button>
          )}
        </p>
        {createForm}
        {guide}
      </>
    )
  }

  // 시리즈 카드는 시리즈를 열어도 위에 그대로 두고, 연 시리즈만 강조한다 (시안 ③)
  const cards = (
    <ul className="series-cards">
      {result.items.map((s) => (
        <li key={s.id}>
          <button type="button" className="series-card" aria-pressed={s.id === seriesId} onClick={() => onOpen(s.id)}>
            <span className="series-card-name">{s.name}</span>
            <span className="series-card-count">에러 {s.error_count}개</span>
          </button>
        </li>
      ))}
    </ul>
  )

  const series = seriesId === null ? null : result.items.find((s) => s.id === seriesId)
  return (
    <>
      <div aria-live="polite">{notice && <p className="manage-notice">{notice}</p>}</div>
      {cards}
      {createForm}
      {seriesId === null ? (
        <p className="record-state">
          시리즈를 눌러 같은 주제의 에러를 순서대로 보세요.
          {!creating && (
            <button type="button" className="btn-secondary" onClick={() => setCreating(true)}>
              + 새 시리즈
            </button>
          )}
        </p>
      ) : series ? (
        <SeriesDetail
          key={series.id}
          series={series}
          backTo={backTo}
          onSeriesChanged={replaceSeries}
          onGone={() => setRetry((k) => k + 1)}
          onDeleted={deleted}
          onNew={() => setCreating(true)}
        />
      ) : (
        // 주소에 남은 예전 시리즈 ID이거나 다른 곳에서 지운 시리즈
        <p className="record-state">
          시리즈를 찾을 수 없어요.
          <button type="button" className="btn-secondary" onClick={onBack}>
            선택 닫기
          </button>
        </p>
      )}
      {guide}
    </>
  )
}

export default SeriesView
