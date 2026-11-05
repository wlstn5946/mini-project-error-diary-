import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { keyLine } from '../errorText'
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
import { useAiTagSuggestions } from '../features/solve/useAiTagSuggestions'
import { useFeedback } from '../features/solve/useFeedback'
import { parseRetryId, useRetryRecord, type RetryState } from '../features/solve/useRetryRecord'
import '../features/solve/solve.css'

// S-001 에러 해결 (R-001 ~ R-004, SCREEN-SPEC_7). 단계는 에러 입력 / AI 제안·시도 기록 / 결과 3개다 (D-064, D-141).
// 에러 메시지 입력이 멈추면 A-003으로 비슷한 기록을 자동으로 찾는다. "해당 없음 → AI에게 묻기"를 누르면 입력을 잠그고 A-005로 간다.
// 에러와 시도는 화면에만 모아 두고, "기록 저장"을 누를 때 A-002 한 번으로 저장한다. 이어서 결과 탭에서 A-016으로 AI 피드백을 받는다.
// 비슷한 기록의 "이 방법 써 보기"는 저장하지 않는다. 원본 해결법을 시도 1로 채운 시도 기록 화면으로 가고, 결과는 사용자가 고른다 (D-128, D-069 변경).
// 적용한 방법 자체가 해결됐을 때만 원본과 연결(reused_from_id)해서 저장하고, 해결 안 됨이면 AI 제안으로 이어간다.
// 이어서 해결하기(D-075 ~ D-077): /solve?retry={id}는 미해결 기록을 불러와(A-009) 입력은 잠그고 이어서 시도를 모은다.
// 이때는 A-002 대신 A-006으로 이번에 새로 한 시도만 저장하고, A-005의 previous_attempts에는 기존 실패·일부 해결 시도를 함께 넣는다.
// 일반 모드(retry 없음)의 동작은 그대로다. 아래 SolveFlow가 본체이고, SolvePage는 retry를 읽어 SolveFlow를 고른다.

type Tab = 'input' | 'analysis' | 'result'

// 입력이 멈추고 잠시 뒤에 비슷한 기록을 찾는다
const SEARCH_DELAY_MS = 300
const SEARCH_FAILED_NOTICE = '비슷한 기록을 확인하지 못했어요.'

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
  // 에러 메시지 칸은 내용만큼 늘어난다(비어 있으면 CSS 최소 높이 120px, 최대 420px 뒤에는 스크롤). 숨겨진 탭에서는 높이를 잴 수 없어 탭이 바뀔 때도 맞춘다 (D-140)
  const messageRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = messageRef.current
    if (!el || tab !== 'input') return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [errorMessage, tab])
  const [situation, setSituation] = useState(detail?.situation ?? '')
  // null이면 새 시리즈 이름이 비었거나 중복이다
  const [seriesChoice, setSeriesChoice] = useState<SeriesChoice | null>({ kind: 'none' })
  const [tagsValue, setTagsValue] = useState<TagsValue>(EMPTY_TAGS)
  // "AI에게 묻기"(또는 "이 방법 써 보기")를 누르면 입력을 잠근다. 시도 기록이 그때의 에러 메시지에 대한 것이기 때문이다 (D-064)
  // 이어서 해결하기에서 비슷한 기록이 0건이면 들어오자마자 AI에게 묻는 상태로 시작한다
  const [locked, setLocked] = useState(enteredAtAi)
  // 비슷한 기존 기록 (A-003). 이어서 해결하기는 들어올 때 이미 한 번 찾아 왔다
  const [similar, setSimilar] = useState<SimilarResult | null>(
    detail ? { query: detail.error_message.trim(), items: retry.similar } : null,
  )
  // 지금 써 보는 기존 기록 ("이 방법 써 보기", 아직 저장 전, D-128)
  const [applied, setApplied] = useState<SimilarError | null>(null)
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
  // 적용 시도 문구. 타임라인 표시용이고, 원본 연결은 reused_from_id로 한다 (D-080)
  const appliedAction = applied ? `기존 기록 #${applied.id}의 해결 방법 적용` : null
  // 적용 중이고 아직 모은 시도가 없으면 AI 결과 없이 시도 1 폼을 보여 준다
  const applyingFirst = applied !== null && collected.length === 0
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
  const aiTags = useAiTagSuggestions(searchShown?.query ?? '') // 입력 후 약 1초, 같은 글은 다시 부르지 않는다 (D-131)

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
    // 내 기록에서 참고할 태그: 일반 모드는 고른 기존 태그, 이어서 해결하기는 그 기록의 태그 (D-123)
    const tagIds = detail ? detail.tags.map((t) => t.id) : tagsValue.existingIds
    // requestSuggestion은 실패해도 예외 없이 unavailable을 돌려준다
    const suggestion = await requestSuggestion(errorText, previous, tagIds)
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
    setApplied(null)
    setSaveError(null)
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
      // 적용한 방법 자체가 해결됐을 때만 원본과 연결한다: 시도가 이번 하나뿐이고 그게 적용 시도이며 해결됨 (D-128)
      const reusedFromId =
        applied && collected.length === 0 && body.action === appliedAction && body.result === 'solved' ? applied.id : null
      record = await persist(seriesChoice, attempts, body.summary, reusedFromId)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
      return
    } finally {
      setSaving(false)
      busy.current = false
    }
    showSaved(record)
  }

  // "이 방법 써 보기": 저장하지 않고 시도 1을 채운 채 시도 기록 화면으로 간다. 결과는 사용자가 고른다 (D-128, D-069 변경)
  function applyMatch(match: SimilarError) {
    if (!message || seriesChoice === null || busy.current) return
    suggestSeq.current++
    setApplied(match)
    setLocked(true)
    setLoading(false)
    setCollected([])
    setResult(null)
    setSaveError(null)
    setTab('analysis')
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
    setApplied(null)
    setLoading(false)
    setResult(null)
    setCollected([])
    setSaving(false)
    setSaveError(null)
    setSaved(null)
    feedback.reset()
  }

  const steps: { tab: Tab; label: string }[] = [
    { tab: 'input', label: '에러 입력' },
    { tab: 'analysis', label: 'AI 제안 · 시도 기록' },
    { tab: 'result', label: '결과' },
  ]
  const stepIndex = steps.findIndex((t) => t.tab === tab)

  return (
    <>
      <h1 className="page-title">에러 해결</h1>

      {/* 단계 표시(D-108, D-141): 눌리지 않는 번호 스텝이다. 지금 단계는 번호가 인디고로 채워지고, 지난 단계는 ✓로 보인다.
          단계 이동은 각 단계의 버튼으로만 한다. 내 기록의 밑줄 탭(눌리는 탭)과 일부러 다르게 만들었다. */}
      <ol className="steps" aria-label="진행 단계">
        {steps.map((t, i) => {
          const current = i === stepIndex
          return (
            <li key={t.tab} className={`step${current ? ' current' : i < stepIndex ? ' past' : ''}`} aria-current={current ? 'step' : undefined}>
              <span className="step-num" aria-hidden="true">
                {i < stepIndex ? '✓' : i + 1}
              </span>
              <span className="step-label">{t.label}</span>
              {t.tab === 'analysis' && loading && <span className="step-badge">분석 중…</span>}
              {t.tab === 'analysis' && !loading && result && !saved && <span className="step-badge done">완료</span>}
              {t.tab === 'result' && saved && <span className="step-badge done">저장됨</span>}
            </li>
          )
        })}
      </ol>

      {/* 에러 입력 단계 전체. 단계가 바뀌어도 시리즈·태그 선택이 남도록 언마운트하지 않고 숨긴다.
          순서는 에러 메시지 → 시리즈 → 태그 → 상황이다(D-139): 태그 추천이 에러 메시지를 읽으므로 붙여넣기가 맨 위, 추천은 그 아래로 흐른다. */}
      <div hidden={tab !== 'input'} key={formKey} role="group" aria-label="에러 입력 단계">
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
        <label className="field-label" htmlFor="error-message">
          에러 메시지
        </label>
        <div className="code-input-box">
          {/* 잠겨 있을 때(저장·분석 중)는 붙여넣을 일이 없어 안내를 숨긴다 */}
          {!inputLocked && (
            <p className="code-input-hint" id="error-message-hint">
              Traceback 전체를 붙여넣으면 더 정확해요
            </p>
          )}
          <textarea
            ref={messageRef}
            id="error-message"
            className="code-input"
            rows={3}
            maxLength={10000}
            placeholder="에러 메시지나 Traceback을 붙여넣으세요"
            aria-describedby="error-message-hint"
            value={errorMessage}
            readOnly={inputLocked}
            onChange={(e) => setErrorMessage(e.target.value)}
          />
        </div>
        {detail ? (
          <ReadOnlyLabels detail={detail} />
        ) : (
          <>
            <SeriesSelect onChange={setSeriesChoice} disabled={locked} />
            <TagInput onChange={setTagsValue} disabled={locked} suggestedTags={matches.flatMap((m) => m.tags)} errorText={searchShown?.query ?? ''} aiTags={aiTags} />
          </>
        )}

        {tab === 'input' && (
          <section>
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
                busy={searchPending || saving || seriesChoice === null}
                onApply={applyMatch}
              />
            )}

            {!locked && (
              <div className="similar-footer">
                <button
                  type="button"
                  className="btn-ask-ai"
                  disabled={!message || seriesChoice === null}
                  aria-describedby={!message ? 'ask-ai-hint' : undefined}
                  onClick={askAi}
                >
                  해당 없음 → AI에게 묻기
                </button>
              </div>
            )}
            {/* 비교할 에러가 없을 때 버튼이 꺼져 있는 이유를 알려 준다 (D-145) */}
            {!locked && !message && (
              <p className="hint similar-footer-hint" id="ask-ai-hint">
                에러 메시지를 붙여넣으면 내 기록부터 찾아볼게요
              </p>
            )}
            {!locked && seriesChoice === null && <p className="hint">시리즈 이름을 확인해 주세요.</p>}
            {locked && (loading || result || applied) && !saved && (
              <p className="hint">
                {loading ? 'AI가 분석하는 중이에요.' : result ? '분석이 끝났어요.' : '기존 기록의 방법을 써 보는 중이에요.'} 결과는 위의 &quot;AI 제안 · 시도 기록&quot; 단계에서 볼 수 있어요.
              </p>
            )}
          </section>
        )}
      </div>

      {tab === 'analysis' && (
        <section aria-label="AI 제안·시도 기록 단계">
          {!saved && (
            <button type="button" className="btn-secondary back-to-input" disabled={saving} onClick={backToInput}>
              ← 에러 입력으로 돌아가기
            </button>
          )}
          {!locked && <p className="empty">아직 AI에게 묻지 않았어요. &quot;에러 입력&quot; 단계에서 에러를 입력해 주세요.</p>}

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
              {applyingFirst && <AppliedRecordCard match={applied} />}
              {(applyingFirst || (result && !loading)) && (
                <AttemptForm
                  key={collected.length + 1}
                  seq={existingAttempts.length + collected.length + 1}
                  saving={saving}
                  error={saveError}
                  onSave={saveRecord}
                  onNext={nextSuggestion}
                  initialAction={applyingFirst ? (appliedAction ?? undefined) : undefined}
                  actionReadOnly={applyingFirst}
                  initialSummary={applyingFirst ? applied.summary : undefined}
                />
              )}
            </>
          )}

          {saved && <p className="attempt-notice">기록을 저장했어요. 결과는 &quot;결과&quot; 단계에서 볼 수 있어요.</p>}
        </section>
      )}

      {tab === 'result' && (
        <section aria-label="결과 단계">
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

// "이 방법 써 보기"로 고른 기존 기록. 아직 저장 전이라는 것을 보여 주려고 기존 similar-card 모양을 다시 쓴다 (D-128)
function AppliedRecordCard({ match }: { match: SimilarError }) {
  const title = keyLine(match.error_message).text || match.error_message
  return (
    <article className="similar-card" aria-label="써 보는 기존 기록">
      <h3 className="similar-title" title={title}>
        📂 기존 기록 #{match.id}의 방법을 써 보는 중
      </h3>
      <p className="similar-meta">{title}</p>
      <p className="similar-solution">
        💡 <strong>해결법:</strong> {match.summary}
      </p>
      <div className="similar-actions">
        <Link
          className="btn-secondary similar-diary-link"
          to={`/records/${match.id}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="에러 일기 보기 (새 탭에서 열림)"
        >
          에러 일기 보기 ↗
        </Link>
      </div>
    </article>
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
