import { useEffect, useState } from 'react'
import { fetchSeries, type Series } from './seriesApi'
import './SeriesSelect.css'

// 에러 입력 시 시리즈 지정 (R-001, D-006). 시안 에러해결창_예시.png ①의 "시리즈 (선택)" 부분.
// 새 시리즈는 여기서 저장하지 않고 이름만 부모에게 넘긴다. 에러를 저장할 때 함께 만든다. (D-011)

export type SeriesChoice =
  | { kind: 'none' }
  | { kind: 'existing'; series: Series }
  | { kind: 'new'; name: string }

type Props = {
  // null: 새 시리즈 이름이 비었거나 기존 이름과 겹쳐서 아직 쓸 수 없는 상태
  onChange: (choice: SeriesChoice | null) => void
  // 에러가 저장된 뒤에는 고칠 수 없게 잠근다 (D-034)
  disabled?: boolean
  // 기록 수정(A-010)에서 현재 시리즈를 처음부터 골라 두는 용도. 없으면 "선택 안 함"으로 시작한다.
  initialSeriesId?: number | null
}

type Status = 'loading' | 'ready' | 'error'
type Mode = 'select' | 'new'

// 시리즈 이름 중복 비교: 앞뒤 공백을 빼고 대소문자를 구분하지 않는다. (D-017)
function sameName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function SeriesSelect({ onChange, disabled = false, initialSeriesId = null }: Props) {
  const [status, setStatus] = useState<Status>('loading')
  const [seriesList, setSeriesList] = useState<Series[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const [mode, setMode] = useState<Mode>('select')
  // <select>의 value. ''이면 "선택 안 함"
  const [selectedId, setSelectedId] = useState(initialSeriesId === null ? '' : String(initialSeriesId))
  const [newName, setNewName] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetchSeries(controller.signal)
      .then((list) => {
        setSeriesList(list)
        setStatus('ready')
      })
      .catch(() => {
        // 화면을 떠나 요청을 취소한 경우는 무시한다. 그 밖의 실패는 안내만 하고 화면은 그대로 쓸 수 있다.
        if (!controller.signal.aborted) setStatus('error')
      })
    return () => controller.abort()
  }, [reloadKey])

  const duplicate = newName.trim() ? seriesList.find((s) => sameName(s.name, newName)) : undefined

  function choiceFor(nextMode: Mode, id: string, name: string): SeriesChoice | null {
    if (nextMode === 'select') {
      const series = seriesList.find((s) => String(s.id) === id)
      return series ? { kind: 'existing', series } : { kind: 'none' }
    }
    const trimmed = name.trim()
    if (!trimmed || seriesList.some((s) => sameName(s.name, trimmed))) return null
    return { kind: 'new', name: trimmed }
  }

  function changeSelected(id: string) {
    setSelectedId(id)
    onChange(choiceFor('select', id, newName))
  }

  function changeNewName(name: string) {
    setNewName(name)
    onChange(choiceFor('new', selectedId, name))
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode)
    onChange(choiceFor(nextMode, selectedId, newName))
  }

  function reload() {
    setStatus('loading')
    setReloadKey((k) => k + 1)
  }

  return (
    <div className="series-select">
      <label className="field-label" htmlFor={mode === 'select' ? 'series-select' : 'series-new-name'}>
        시리즈 (선택)
      </label>

      <div className="series-row">
        {mode === 'select' ? (
          <select
            id="series-select"
            className="series-control"
            value={selectedId}
            disabled={disabled || status !== 'ready'}
            onChange={(e) => changeSelected(e.target.value)}
          >
            <option value="">{status === 'loading' ? '불러오는 중…' : '선택 안 함'}</option>
            {seriesList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            id="series-new-name"
            className="series-control"
            placeholder="새 시리즈 이름"
            value={newName}
            aria-invalid={Boolean(duplicate)}
            aria-describedby="series-message"
            disabled={disabled}
            onChange={(e) => changeNewName(e.target.value)}
            autoFocus
          />
        )}

        {mode === 'select' ? (
          // 목록을 불러오는 중에는 중복 확인을 할 수 없어서 막아 둔다.
          <button
            type="button"
            className="btn-secondary"
            disabled={disabled || status === 'loading'}
            onClick={() => switchMode('new')}
          >
            + 새 시리즈
          </button>
        ) : (
          <button type="button" className="btn-secondary" disabled={disabled} onClick={() => switchMode('select')}>
            취소
          </button>
        )}
      </div>

      {/* 잠긴 뒤에는 입력 안내가 필요 없다 */}
      <div id="series-message" aria-live="polite" hidden={disabled}>
        {mode === 'select' && status === 'error' && (
          <p className="series-error">
            시리즈 목록을 불러오지 못했어요. 시리즈 없이 계속하거나 새로 만들 수 있어요.
            <button type="button" className="btn-secondary series-retry" onClick={reload}>
              다시 시도
            </button>
          </p>
        )}
        {mode === 'new' && duplicate && (
          <p className="series-error">이미 있는 시리즈예요. &quot;취소&quot;를 누르고 목록에서 골라 주세요.</p>
        )}
        {mode === 'new' && !duplicate && status === 'error' && (
          <p className="hint">목록을 불러오지 못해 이름이 겹치는지 확인하지 못했어요.</p>
        )}
        {mode === 'new' && !duplicate && status === 'ready' && (
          <p className="hint">새 시리즈는 에러를 저장할 때 함께 만들어져요.</p>
        )}
        {mode === 'select' && status !== 'error' && (
          <p className="hint">기존 시리즈를 고르거나 바로 새로 만들 수 있어요.</p>
        )}
      </div>
    </div>
  )
}

export default SeriesSelect
