import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import ConfirmDialog from '../features/records/ConfirmDialog'
import { deleteError, getError, type ErrorDetail as Detail } from '../features/records/errorsApi'
import ErrorDetail from '../features/records/ErrorDetail'
import { downloadMarkdown, printRecord } from '../features/records/exportActions'
import RecordEditForm from '../features/records/RecordEditForm'
import FeedbackBox from '../features/solve/FeedbackBox'
import SummaryEditForm from '../features/solve/SummaryEditForm'
import { useFeedback } from '../features/solve/useFeedback'
import '../features/records/records.css'

// S-003 에러 일기 상세 (/records/:id, D-037, SCREEN-SPEC_6). 담당 팀원 1 (D-031, D-039).
// 기록 삭제(A-011, D-043)가 여기 있다. 확인 창을 거쳐 지우고 들어온 목록으로 돌아간다.
// 기록 수정(A-010, D-047)은 같은 화면의 편집 모드다. 저장하면 응답으로 상세를 바꿔 보여준다.
// 미해결 기록의 "이어서 해결하기"(D-075)는 /solve?retry={id}로 이동한다.
// 한 줄 정리 수정(A-007)과 AI 피드백(A-016)은 features/solve/의 공용 컴포넌트를 쓴다 (D-064). 둘은 동시에 열지 않는다.
// 내보내기(D-079 예정): 화면이 이미 불러온 detail로 Markdown 내려받기·PDF(인쇄)를 한다. 버튼은 기존 버튼 줄에 있어서
// 편집·정리 수정 중이나 삭제 중에는 같이 숨고, 저장하지 않은 편집 값은 내보내지 않는다.

// 응답이 어느 요청의 결과인지 key로 구분한다. 현재 key와 다르면 아직 불러오는 중이다.
// detail: 성공, null: 없는 ID(404), 'error': 불러오기 실패
type DetailResult = { key: string; detail: Detail | null | 'error' }

// "시도 2개와 한 줄 정리도 함께 지워지고 되돌릴 수 없어요." 처럼 지워지는 것만 이름을 붙인다
function deleteNotice(detail: Detail) {
  const parts = []
  if (detail.attempts.length > 0) parts.push(`시도 ${detail.attempts.length}개`)
  if (detail.summary) parts.push('한 줄 정리')
  return parts.length > 0 ? `${parts.join('와 ')}도 함께 지워지고 되돌릴 수 없어요.` : '되돌릴 수 없어요.'
}

function RecordDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [reloadKey, setReloadKey] = useState(0)
  const [result, setResult] = useState<DetailResult | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editingSummary, setEditingSummary] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteFailure, setDeleteFailure] = useState<string | null>(null)
  // 다른 곳에서 이미 지워진 기록이었다 (삭제 요청이 404)
  const [gone, setGone] = useState(false)
  // 내보내기에 실패한 기록의 ID. 다른 기록으로 옮기면 안내가 따라가지 않게 ID로 기억한다.
  const [exportFailedId, setExportFailedId] = useState<number | null>(null)
  // 확인 버튼을 빠르게 두 번 눌러도 요청은 한 번만 보낸다
  const busy = useRef(false)

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
  const feedback = useFeedback(validId ? errorId : null)

  function closeConfirm() {
    setConfirming(false)
    setDeleteFailure(null)
  }

  // 내려받기·인쇄가 예외를 던지면 버튼 근처에 안내를 보여준다
  function exportRecord(kind: 'markdown' | 'pdf', target: Detail) {
    try {
      if (kind === 'markdown') downloadMarkdown(target)
      else printRecord(target)
      setExportFailedId(null)
    } catch {
      setExportFailedId(target.id)
    }
  }

  async function confirmDelete() {
    if (busy.current) return
    busy.current = true
    setDeleting(true)
    setDeleteFailure(null)
    try {
      const outcome = await deleteError(errorId)
      if (outcome === 'not-found') {
        setConfirming(false)
        setGone(true)
        return
      }
      // 지운 상세 주소는 방문 기록에 남기지 않고 들어온 목록으로 바꿔 끼운다
      navigate(backTo, { replace: true })
    } catch (e) {
      // 창은 열어 둔 채 안내만 바꾼다. 같은 버튼으로 다시 시도할 수 있다.
      setDeleteFailure(e instanceof Error ? e.message : String(e))
    } finally {
      setDeleting(false)
      busy.current = false
    }
  }

  return (
    <>
      <Link className="back-link" to={backTo}>
        ← 내 기록
      </Link>
      <h1 className="page-title">에러 일기</h1>

      <div aria-live="polite">
        {gone ? (
          <p className="record-state">
            이미 삭제된 기록이에요.
            <Link className="btn-secondary" to={backTo}>
              내 기록으로
            </Link>
          </p>
        ) : loading ? (
          <p className="record-state">불러오는 중…</p>
        ) : detail === 'error' ? (
          <p className="record-state record-error">
            기록을 불러오지 못했어요.
            <button type="button" className="btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>
              다시 시도
            </button>
          </p>
        ) : detail ? (
          <ErrorDetail
            detail={detail}
            feedbackSection={
              <FeedbackBox
                feedback={feedback.feedback ?? detail.ai_feedback}
                status={feedback.status}
                canRequest={detail.attempts.length > 0 || Boolean(detail.summary)}
                onRequest={() => feedback.request(detail.id)}
              />
            }
            actions={
              editing ? (
                <RecordEditForm
                  detail={detail}
                  onSaved={(updated) => {
                    setResult({ key, detail: updated })
                    setEditing(false)
                  }}
                  onCancel={() => setEditing(false)}
                  onGone={() => {
                    setEditing(false)
                    setGone(true)
                  }}
                />
              ) : editingSummary ? (
                // 정리 수정 중에는 버튼 줄을 숨기고 폼만 보인다. 기록 수정(편집 모드)과 같은 방식이다.
                <SummaryEditForm
                  errorId={detail.id}
                  status={detail.status}
                  initial={detail.summary}
                  onSaved={(summary) => {
                    // 정리를 바꾸고 피드백을 다시 받아 덮어쓴다 (A-007 → A-016)
                    setResult({ key, detail: { ...detail, summary } })
                    setEditingSummary(false)
                    void feedback.request(detail.id)
                  }}
                  onCancel={() => setEditingSummary(false)}
                />
              ) : (
                <>
                  {/* 미해결 기록만 에러 해결 화면에서 이어서 해결한다. 편집·정리 수정 중에는 버튼 줄이 숨겨져 같이 숨는다 (D-075) */}
                  {detail.status === 'unresolved' && (
                    <button type="button" className="btn-primary" onClick={() => navigate(`/solve?retry=${detail.id}`)}>
                      이어서 해결하기
                    </button>
                  )}
                  <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
                    태그·시리즈·상황 수정
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setEditingSummary(true)}>
                    {detail.summary ? '한 줄 정리 수정' : '한 줄 정리 쓰기'}
                  </button>
                  <button type="button" className="btn-danger" onClick={() => setConfirming(true)}>
                    삭제
                  </button>
                  {/* 상세를 불러온 상태에서만 이 줄이 보이고, 삭제 중에는 숨긴다. 버튼 줄의 오른쪽 끝에 둔다 */}
                  {!deleting && (
                    <div className="export-buttons">
                      <button type="button" className="btn-secondary" onClick={() => exportRecord('markdown', detail)}>
                        Markdown 내려받기
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => exportRecord('pdf', detail)}>
                        PDF로 인쇄
                      </button>
                    </div>
                  )}
                  {exportFailedId === detail.id && (
                    <p role="alert" className="edit-error">
                      내보내지 못했어요. 다시 시도해 주세요.
                    </p>
                  )}
                </>
              )
            }
          />
        ) : (
          <p className="record-state">
            기록을 찾을 수 없어요.
            <Link className="btn-secondary" to="/records">
              내 기록으로
            </Link>
          </p>
        )}
      </div>

      {confirming && detail && detail !== 'error' && (
        <ConfirmDialog
          title="이 기록을 지울까요?"
          confirmLabel="삭제"
          busyLabel="삭제 중…"
          busy={deleting}
          error={deleteFailure}
          onConfirm={confirmDelete}
          onCancel={closeConfirm}
        >
          <p className="confirm-text">{deleteNotice(detail)}</p>
        </ConfirmDialog>
      )}
    </>
  )
}

export default RecordDetailPage
