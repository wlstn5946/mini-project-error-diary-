import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import { getError, type ErrorDetail as Detail } from '../features/records/errorsApi'
import ErrorDetail from '../features/records/ErrorDetail'
import '../features/records/records.css'

// S-003 에러 일기 상세 (/records/:id, D-037, SCREEN-SPEC_5). 담당 팀원 1 (D-031, D-039).

// 응답이 어느 요청의 결과인지 key로 구분한다. 현재 key와 다르면 아직 불러오는 중이다.
// detail: 성공, null: 없는 ID(404), 'error': 불러오기 실패
type DetailResult = { key: string; detail: Detail | null | 'error' }

function RecordDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState<DetailResult | null>(null)

  // 목록에서 넘겨준 주소(필터 포함)로 돌아간다. 주소로 바로 들어왔으면 /records로 간다.
  const state = location.state as { backTo?: string } | null
  const backTo = state?.backTo?.startsWith('/records') ? state.backTo : '/records'

  const errorId = Number(id)
  const validId = Number.isInteger(errorId) && errorId > 0
  const key = `${id}|${reloadKey}`
  const loading = validId && result?.key !== key

  useEffect(() => {
    if (!validId) return
    const controller = new AbortController()
    getError(errorId, controller.signal)
      .then((detail) => setResult({ key, detail }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, detail: 'error' })
      })
    return () => controller.abort()
  }, [key, validId, errorId])

  const detail = validId ? result?.detail : null

  return (
    <>
      <Link className="back-link" to={backTo}>
        ← 내 기록
      </Link>
      <h1 className="page-title">에러 일기</h1>

      <div aria-live="polite">
        {loading ? (
          <p className="record-state">불러오는 중…</p>
        ) : detail === 'error' ? (
          <p className="record-state record-error">
            기록을 불러오지 못했어요.
            <button type="button" className="btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>
              다시 시도
            </button>
          </p>
        ) : detail ? (
          <ErrorDetail detail={detail} />
        ) : (
          <p className="record-state">
            기록을 찾을 수 없어요.
            <Link className="btn-secondary" to="/records">
              내 기록으로
            </Link>
          </p>
        )}
      </div>
    </>
  )
}

export default RecordDetailPage
