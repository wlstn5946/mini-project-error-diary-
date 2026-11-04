import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import {
  createError,
  searchSimilarErrors,
  type AttemptInput,
  type ErrorCreateBody,
  type SavedError,
  type SimilarError,
} from '../features/records/errorsApi'
import ErrorMessageView from '../components/ErrorMessageView'
import SeriesSelect, { type SeriesChoice } from '../features/records/SeriesSelect'
import SimilarRecords from '../features/records/SimilarRecords'
import '../features/records/SimilarRecords.css'
import TagInput, { type TagsValue } from '../features/records/TagInput'
import AiSuggestionCard from '../features/solve/AiSuggestionCard'
import AttemptForm from '../features/solve/AttemptForm'
import SaveResult from '../features/solve/SaveResult'
import { PreviousAttempts, ReadOnlyLabels, RetryNotice } from '../features/solve/RetryParts'
import {
  createAttempts,
  requestSuggestion,
  RESULT_LABELS,
  type AttemptBody,
  type PreviousAttempt,
  type Suggestion,
} from '../features/solve/solveApi'
import { useFeedback } from '../features/solve/useFeedback'
import { parseRetryId, useRetryRecord, type RetryState } from '../features/solve/useRetryRecord'
import '../features/solve/solve.css'

// S-001 에러 해결 (R-001 ~ R-004, SCREEN-SPEC_7). 탭은 에러 입력 / AI 제안 → 시도 기록 / 결과 3개다 (D-064).
// 에러 메시지 입력이 멈추면 A-003으로 비슷한 기록을 자동으로 찾는다. "해당 없음 → AI에게 묻기"를 누르면 입력을 잠그고 A-005로 간다.
// 에러와 시도는 화면에만 모아 두고, "기록 저장"을 누를 때 A-002 한 번으로 저장한다. 이어서 결과 탭에서 A-016으로 AI 피드백을 받는다.
// 비슷한 기록의 "이 방법 적용"도 A-002로 저장(시도 1개, 해결됨)하고 결과 탭을 보여준다.
// 이어서 해결하기(D-075 ~ D-077): /solve?retry={id}는 미해결 기록을 불러와(A-009) 입력은 잠그고 이어서 시도를 모은다.
// 이때는 A-002 대신 A-006으로 이번에 새로 한 시도만 저장하고, A-005의 previous_attempts에는 기존 실패·일부 해결 시도를 함께 넣는다.
// 일반 모드(retry 없음)의 동작은 그대로다. 아래 SolveFlow가 본체이고, SolvePage는 retry를 읽어 SolveFlow를 고른다.

type Tab = 'input' | 'analysis' | 'result'

// 입력이 멈추고 잠시 뒤에 비슷한 기록을 찾는다
const SEARCH_DELAY_MS = 300
const SEARCH_FAILED_NOTICE = '비슷한 기록을 확인하지 못했어요.'
const APPLY_FAILED = '이 방법을 적용하지 못했어요. 입력한 내용은 그대로 있으니 다시 시도해 주세요.'

const EMPTY_TAGS: TagsValue = { existingIds: [], newNames: [] }

// 어느 에러 메시지의 검색 결과인지 query로 구분한다. 현재 메시지와 다르면 아직 찾는 중이다. items가 null이면 실패.
type SimilarResult = { query: string; items: SimilarError[] | null }

type FlowProps = {
  // 이어서 해결하기 모드일 때만 있다. 불러온 기록과 A-003 결과, 첫 탭이 담겨 있다
  retry?: Extract<RetryState, { status: 'ready' }>
  // "새 에러 입력": 주소의 retry를 지운다. 그러면 SolveFlow가 일반 모드로 새로 만들어진다
  onLeaveRetry: () => void
}

function SolveFlow({ retry, onLeaveRetry }: FlowProps) {
  const navigate = useNavigate()
  const detail = retry?.detail
  // 입력 잠금(locked)과 별개의 모드다. 입력은 잠겨 있어도 AI에게 물을 수 있어야 한다.
  const retrying = detail !== undefined
  // 이미 저장된 시도. 일반 모드에서는 비어 있다
  const existingAttempts: AttemptInput[] = detail ? detail.attempts.map((a) => ({ action: a.action, result: a.result })) : []
  const enteredAtAi = retry?.entryTab === 'analysis'
  const [tab, setTab] = useState<Tab>(retry?.entryTab ?? 'input')
  // 바뀌면 시리즈·태그 컴포넌트를 새로 만들어 입력을 비운다 ("새 에러 입력")
  const [formKey, setFormKey] = useState(0)
  const [errorMessage, setErrorMessage] = useState(detail?.error_message ?? '')
  const [situation, setSituation] = useState(detail?.situation ?? '')
  // null이면 새 시리즈 이름이 비었거나 중복이다
  const [seriesChoice, setSeriesChoice] = useState<SeriesChoice | null>({ kind: 'none' })
  const [tagsValue, setTagsValue] = useState<TagsValue>(EMPTY_TAGS)
  // "AI에게 묻기"(또는 "이 방법 적용" 성공)를 누르면 입력을 잠근다. 시도 기록이 그때의 에러 메시지에 대한 것이기 때문이다 (D-064)
  // 이어서 해결하기에서 비슷한 기록이 0건이면 들어오자마자 AI에게 묻는 상태로 시작한다
  const [locked, setLocked] = useState(enteredAtAi)
  // 비슷한 기존 기록 (A-003). 이어서 해결하기는 들어올 때 이미 한 번 찾아 왔다
  const [similar, setSimilar] = useState<SimilarResult | null>(
    detail ? { query: detail.error_message.trim(), items: retry.similar } : null,
  )
  const [applyingId, setApplyingId] = useState<number | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [loading, setLoading] = useState(enteredAtAi)
  const [result, setResult] = useState<Suggestion | null>(null)
  // 화면에 모아 둔 시도 (아직 저장하지 않음). 이번에 쓰는 시도는 폼에 있고 여기에 없다
  const [collected, setCollected] = useState<AttemptInput[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // "기록 저장"으로 A-002에 저장된 기록. 있으면 결과 탭을 보여준다
  const [saved, setSaved] = useState<SavedError | null>(null)
  const feedback = useFeedback(saved?.id ?? null)
  // 저장 버튼을 빠르게 두 번 눌러도 요청은 한 번만 보낸다
  const busy = useRef(false)

  const message = errorMessage.trim()
  // 에러 메시지·상황·시리즈·태그를 고칠 수 없는 상태: AI에게 물었거나 저장했거나, 이어서 해결하는 중이다
  const inputLocked = locked || retrying

  // 입력이 멈추고 300ms 뒤 A-003을 부른다. 메시지가 바뀌면 이전 요청은 취소하고, 늦게 온 응답은 버린다.
  // 이어서 해결하기는 메시지를 고칠 수 없고 들어올 때 이미 찾았으므로 부르지 않는다.
  useEffect(() => {
    if (locked || retrying || !message) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      const items = await searchSimilarErrors(message, controller.signal)
      if (!controller.signal.aborted) setSimilar({ query: message, items })
    }, SEARCH_DELAY_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [message, locked, retrying])

  // 새 결과가 올 때까지 이전 결과를 그대로 두어 목록이 깜빡이지 않게 한다. 대신 그동안 "이 방법 적용"은 막는다.
  const searchShown = !locked && message ? similar : null
  const searchPending = !locked && message !== '' && similar?.query !== message
  const matches = searchShown?.items ?? []

  // 뒤로 가기로 흐름을 버린 뒤 늦게 도착한 AI 응답을 버리기 위한 번호
  const suggestSeq = useRef(0)

  async function suggest(errorText: string, history: AttemptInput[]) {
    const seq = ++suggestSeq.current
    setLoading(true)
    setResult(null)
    // 해결된 시도는 다음 방법을 묻지 않으므로 실패·일부 해결만 보낸다
    // 이어서 해결하기는 이미 저장된 실패·일부 해결 시도도 함께 보낸다 (D-076)
    const previous: PreviousAttempt[] = [...existingAttempts, ...history].flatMap((a) =>
      a.result === 'solved' ? [] : [{ action: a.action, result: a.result }],
    )
    // requestSuggestion은 실패해도 예외 없이 unavailable을 돌려준다
    const suggestion = await requestSuggestion(errorText, previous)
    if (seq !== suggestSeq.current) return
    setResult(suggestion)
    setLoading(false)
  }

  // AI 제안 탭의 "← 에러 입력으로 돌아가기": 입력 잠금을 풀고 에러 입력 탭으로 간다.
  // 시도 기록이 이전 에러 메시지에 대한 것이므로 모아 둔 시도와 AI 제안은 버린다 (아직 저장 전이라 서버에는 영향이 없다)
  function backToInput() {
    if (saved || saving || busy.current) return
    suggestSeq.current++
    setLocked(false)
    setLoading(false)
    setResult(null)
    setCollected([])
    setSaveError(null)
    setApplyError(null)
    setTab('input')
  }

  // 비슷한 기록이 0건이라 바로 AI 탭으로 들어왔다: 들어올 때 한 번만 A-005를 부른다 (StrictMode에서도 한 번)
  const autoAsked = useRef(false)
  useEffect(() => {
    if (!enteredAtAi || autoAsked.current) return
    autoAsked.current = true
    void suggest(message, [])
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 진입할 때 한 번만 부른다
  }, [])

  // 일반 모드는 A-002로 에러와 시도를 함께 저장하고, 이어서 해결하기는 A-006으로 이번 시도만 저장한다 (D-077)
  // reusedFromId는 "이 방법 적용"으로 고른 기록의 ID다. 원본과 연결하는 것은 서버가 한다 (D-080)
  function persist(
    choice: SeriesChoice,
    attempts: AttemptInput[],
    summary: string | null,
    reusedFromId: number | null = null,
  ): Promise<SavedError> {
    if (detail) return createAttempts(detail.id, { attempts, summary, reused_from_id: reusedFromId })
    return createError(buildErrorBody(choice, attempts, summary, reusedFromId))
  }

  function buildErrorBody(
    choice: SeriesChoice,
    attempts: AttemptInput[],
    summary: string | null,
    reusedFromId: number | null,
  ): ErrorCreateBody {
    return {
      error_message: message,
      situation: situation.trim() || null,
      series_id: choice.kind === 'existing' ? choice.series.id : null,
      new_series_name: choice.kind === 'new' ? choice.name : null,
      tag_ids: tagsValue.existingIds,
      new_tag_names: tagsValue.newNames,
      attempts,
      summary,
      reused_from_id: reusedFromId,
    }
  }

  // 저장에 성공했다: 결과 탭으로 가고, 입력은 이미 잠겨 있다. 이어서 AI 피드백을 받는다.
  function showSaved(record: SavedError) {
    setLocked(true)
    setSaved(record)
    setTab('result')
    void feedback.request(record.id)
  }

  // "해당 없음 → AI에게 묻기": 입력을 잠그고 AI 제안 탭으로 가서 A-005를 부른다. 아무것도 저장하지 않는다.
  function askAi() {
    if (!message || locked || seriesChoice === null) return
    setLocked(true)
    setCollected([])
    setSaveError(null)
    setApplyError(null)
    setTab('analysis')
    void suggest(message, [])
  }

  // "해결 안 됨 → 다음 방법 제안받기": 이번 시도를 화면 목록에 추가하고 이전 시도를 붙여 A-005를 다시 부른다 (D-027, 저장은 안 함)
  function nextSuggestion(body: AttemptBody) {
    const history = [...collected, { action: body.action, result: body.result }]
    setCollected(history)
    setSaveError(null)
    void suggest(message, history)
  }

  // "기록 저장": 모아 둔 시도 + 이번 시도를 A-002로 저장한다. 실패하면 입력과 모은 시도를 그대로 두고 다시 누르면 다시 저장한다.
  async function saveRecord(body: AttemptBody) {
    if (!message || seriesChoice === null || busy.current) return
    busy.current = true
    setSaving(true)
    setSaveError(null)
    let record: SavedError
    try {
      const attempts = [...collected, { action: body.action, result: body.result }]
      record = await persist(seriesChoice, attempts, body.summary)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
      return
    } finally {
      setSaving(false)
      busy.current = false
    }
    showSaved(record)
  }

  // "같은 에러예요, 이 방법 적용": 시도 1개(해결됨, 고른 기록의 한 줄 정리 복사)로 저장하고 결과 탭을 보여준다 (D-041 변경, D-064)
  async function applyMatch(match: SimilarError) {
    if (!message || seriesChoice === null || busy.current) return
    busy.current = true
    setApplyingId(match.id)
    setApplyError(null)
    let record: SavedError
    try {
      // 시도 문구는 타임라인 표시용으로 남기고, 원본 연결은 reused_from_id로 한다 (D-080)
      record = await persist(
        seriesChoice,
        [{ action: `기존 기록 #${match.id}의 해결 방법 적용`, result: 'solved' }],
        match.summary,
        match.id,
      )
    } catch (e) {
      setApplyError(e instanceof Error ? `${e.message} 입력한 내용은 그대로 있어요.` : APPLY_FAILED)
      return
    } finally {
      setApplyingId(null)
      busy.current = false
    }
    showSaved(record)
  }

  // 결과 탭에서 한 줄 정리를 고쳤다: 정리를 바꾸고 피드백을 다시 받아 덮어쓴다 (A-007 → A-016)
  function summaryChanged(summary: string | null) {
    if (!saved) return
    setSaved({ ...saved, summary })
    void feedback.request(saved.id)
  }

  function startNewError() {
    // 이어서 해결하기: 주소의 retry를 지우면 SolveFlow가 일반 모드로 새로 만들어져 모든 상태가 초기화된다
    if (retrying) {
      onLeaveRetry()
      return
    }
    setFormKey((k) => k + 1)
    setTab('input')
    setErrorMessage('')
    setSituation('')
    setSeriesChoice({ kind: 'none' })
    setTagsValue(EMPTY_TAGS)
    setLocked(false)
    setSimilar(null)
    setApplyingId(null)
    setApplyError(null)
    setLoading(false)
    setResult(null)
    setCollected([])
    setSaving(false)
    setSaveError(null)
    setSaved(null)
    feedback.reset()
  }

  const stateTabs: { tab: Tab; label: string }[] = [
    { tab: 'input', label: '에러 입력' },
    { tab: 'analysis', label: 'AI 제안 → 시도 기록' },
    { tab: 'result', label: '결과' },
  ]

  return (
    <>
      <h1 className="page-title">에러 해결</h1>

      <div className="tabs" role="tablist">
        {stateTabs.map((t) => (
          // 탭은 지금 어느 단계인지만 보여 준다. 단계 이동은 각 단계의 버튼으로만 한다.
          <div
            key={t.tab}
            role="tab"
            id={`tab-${t.tab}`}
            aria-selected={tab === t.tab}
            aria-controls={`panel-${t.tab}`}
            className="tab"
          >
            {t.label}
            {t.tab === 'analysis' && loading && <span className="tab-badge">분석 중…</span>}
            {t.tab === 'analysis' && !loading && result && !saved && <span className="tab-badge done">완료</span>}
            {t.tab === 'result' && saved && <span className="tab-badge done">저장됨</span>}
          </div>
        ))}
      </div>

      {/* 탭을 바꿔도 선택이 남도록 언마운트하지 않고 숨긴다. 시안 ①처럼 에러 메시지 위에 둔다. */}
      <div hidden={tab !== 'input'} key={formKey}>
        {inputLocked && (
          <p className="locked-notice">
            {saved
              ? '저장한 에러예요.'
              : retrying
                ? '미해결 기록을 이어서 해결하고 있어요.'
                : 'AI에게 물은 에러예요. 아직 저장하지 않았어요.'}{' '}
            내용을 바꾸려면 새 에러로 입력해 주세요.
            <button type="button" className="btn-secondary" onClick={startNewError}>
              새 에러 입력
            </button>
          </p>
        )}
        {detail ? (
          <ReadOnlyLabels detail={detail} />
        ) : (
          <>
            <SeriesSelect onChange={setSeriesChoice} disabled={locked} />
            <TagInput onChange={setTagsValue} disabled={locked} suggestedTags={matches.flatMap((m) => m.tags)} errorText={searchShown?.query ?? ''} />
          </>
        )}
      </div>

      {tab === 'input' && (
        <section role="tabpanel" id="panel-input" aria-labelledby="tab-input">
          <label className="field-label" htmlFor="error-message">
            에러 메시지
          </label>
          <textarea
            id="error-message"
            className="code-input"
            rows={5}
            maxLength={10000}
            placeholder="에러 메시지나 Traceback을 붙여넣으세요"
            value={errorMessage}
            readOnly={inputLocked}
            onChange={(e) => {
              setErrorMessage(e.target.value)
              setApplyError(null)
            }}
          />
          <label className="field-label" htmlFor="situation">
            상황 (선택)
          </label>
          <input
            id="situation"
            className="situation-input"
            placeholder="예: 새로 만든 가상환경에서 처음 실행함"
            value={situation}
            disabled={inputLocked}
            onChange={(e) => setSituation(e.target.value)}
          />
          {detail && <PreviousAttempts detail={detail} />}

          {!locked && message && (
            <div aria-live="polite">
              {searchPending && <p className="hint">비슷한 기록을 찾는 중…</p>}
              {!searchPending && searchShown?.items === null && <p className="hint">{SEARCH_FAILED_NOTICE}</p>}
            </div>
          )}
          {matches.length > 0 && (
            <SimilarRecords
              matches={matches}
              applyingId={applyingId}
              busy={searchPending || saving || applyingId !== null || seriesChoice === null}
              error={applyError}
              onApply={applyMatch}
            />
          )}

          {!locked && (
            <div className="similar-footer">
              <button
                type="button"
                className="btn-ask-ai"
                disabled={!message || seriesChoice === null || applyingId !== null}
                onClick={askAi}
              >
                해당 없음 → AI에게 묻기
              </button>
            </div>
          )}
          {!locked && seriesChoice === null && <p className="hint">시리즈 이름을 확인해 주세요.</p>}
          {locked && (loading || result) && !saved && (
            <p className="hint">
              {loading ? 'AI가 분석하는 중이에요.' : '분석이 끝났어요.'} 결과는 위의 &quot;AI 제안 → 시도 기록&quot; 탭에서 볼 수 있어요.
            </p>
          )}
        </section>
      )}

      {tab === 'analysis' && (
        <section role="tabpanel" id="panel-analysis" aria-labelledby="tab-analysis">
          {!saved && (
            <button type="button" className="btn-secondary" disabled={saving} onClick={backToInput}>
              ← 에러 입력으로 돌아가기
            </button>
          )}
          {!locked && <p className="empty">아직 AI에게 묻지 않았어요. &quot;에러 입력&quot; 탭에서 에러를 입력해 주세요.</p>}

          {locked && <ErrorMessageView text={errorMessage} />}

          {detail && <PreviousAttempts detail={detail} />}

          {collected.length > 0 && (
            <ul className="attempt-history" aria-label="화면에 모아 둔 시도">
              {collected.map((a, i) => (
                <li key={i}>
                  {/* 번호는 보기용이다. 실제 seq는 저장할 때 서버가 기존 시도 다음 번호부터 매긴다 (D-077) */}
                  <span className={`attempt-badge ${a.result}`}>
                    시도 {existingAttempts.length + i + 1} · {RESULT_LABELS[a.result]}
                  </span>
                  {a.action}
                </li>
              ))}
            </ul>
          )}

          {locked && !saved && (
            <>
              {loading && (
                <p className="empty">
                  {collected.length ? '✨ AI가 다음 방법을 찾는 중이에요…' : '✨ AI가 에러를 분석하는 중이에요…'}
                </p>
              )}
              {result?.status === 'unavailable' && collected.length > 0 && (
                <p className="attempt-notice">시도는 화면에 모아 뒀어요. &quot;기록 저장&quot;을 누르면 함께 저장돼요.</p>
              )}
              {result && <AiSuggestionCard result={result} retrying={loading} onRetry={() => suggest(message, collected)} />}
              {result && !loading && (
                <AttemptForm
                  key={collected.length + 1}
                  seq={existingAttempts.length + collected.length + 1}
                  saving={saving}
                  error={saveError}
                  onSave={saveRecord}
                  onNext={nextSuggestion}
                />
              )}
            </>
          )}

          {saved && <p className="attempt-notice">기록을 저장했어요. 결과는 &quot;결과&quot; 탭에서 볼 수 있어요.</p>}
        </section>
      )}

      {tab === 'result' && (
        <section role="tabpanel" id="panel-result" aria-labelledby="tab-result">
          {saved ? (
            <>
              <ErrorMessageView text={saved.error_message} />
              <SaveResult
                saved={saved}
                feedback={feedback.feedback ?? null}
                feedbackStatus={feedback.status}
                onRequestFeedback={() => feedback.request(saved.id)}
                onSummaryChanged={summaryChanged}
                onNewError={startNewError}
                onViewDiary={() => navigate(`/records/${saved.id}`)}
              />
            </>
          ) : (
            <p className="empty">아직 저장한 기록이 없어요.</p>
          )}
        </section>
      )}
    </>
  )
}

function SolvePage() {
  const [params, setParams] = useSearchParams()
  // 숫자가 아니면 일반 모드로 처리한다
  const retry = useRetryRecord(parseRetryId(params.get('retry')))

  function leaveRetry() {
    setParams({}, { replace: true })
  }

  if (retry.status === 'off') return <SolveFlow key="new" onLeaveRetry={leaveRetry} />
  if (retry.status !== 'ready') {
    return (
      <>
        <h1 className="page-title">에러 해결</h1>
        <RetryNotice state={retry} onNewError={leaveRetry} />
      </>
    )
  }
  return <SolveFlow key={`retry-${retry.detail.id}`} retry={retry} onLeaveRetry={leaveRetry} />
}

export default SolvePage
