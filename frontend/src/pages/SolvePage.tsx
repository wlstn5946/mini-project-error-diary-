import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { createError, searchSimilarErrors, type ErrorCreateBody, type SavedError, type SimilarError } from '../features/records/errorsApi'
import SeriesSelect, { type SeriesChoice } from '../features/records/SeriesSelect'
import SimilarRecords from '../features/records/SimilarRecords'
import '../features/records/SimilarRecords.css'
import TagInput, { type TagsValue } from '../features/records/TagInput'
import AiSuggestionCard from '../features/solve/AiSuggestionCard'
import AttemptForm from '../features/solve/AttemptForm'
import ResolvedSummary from '../features/solve/ResolvedSummary'
import {
  AttemptSaveError,
  createAttempt,
  requestSuggestion,
  RESULT_LABELS,
  type AttemptBody,
  type AttemptResult,
  type PreviousAttempt,
  type Suggestion,
} from '../features/solve/solveApi'
import '../features/solve/solve.css'

// S-001 에러 해결 (R-001 ~ R-004, SCREEN-SPEC_4 화면 흐름).
// 해결 방법 찾기 → A-003 비슷한 기존 기록 검색 → 0건이거나 "해당 없음"이면 A-002로 에러 저장(D-025)
// → A-005 AI 제안 → A-006 시도 기록 → 해결됨이면 해결 완료, 아니면 이전 시도를 붙여 A-005 다시 (D-027)
// 비슷한 기록의 "이 방법 적용": A-002로 새 기록 저장 → A-006으로 해결됨 처리(한 줄 정리 복사) → 내 기록으로 이동 (D-036)

type Tab = 'input' | 'analysis'
type SavedAttempt = { seq: number; action: string; result: AttemptResult }

const SEARCH_FAILED_NOTICE = '비슷한 기록을 확인하지 못해 바로 AI에게 물었어요.'
const APPLY_FAILED = '이 방법을 적용하지 못했어요. 입력한 내용은 그대로 있으니 다시 시도해 주세요.'

const EMPTY_TAGS: TagsValue = { existingIds: [], newNames: [] }

function SolvePage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('input')
  // 바뀌면 시리즈·태그 컴포넌트를 새로 만들어 입력을 비운다 ("새 에러 입력")
  const [formKey, setFormKey] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [situation, setSituation] = useState('')
  // null이면 새 시리즈 이름이 비었거나 중복이다
  const [seriesChoice, setSeriesChoice] = useState<SeriesChoice | null>({ kind: 'none' })
  const [tagsValue, setTagsValue] = useState<TagsValue>(EMPTY_TAGS)
  // A-002로 저장된 에러. 저장된 뒤에는 입력을 잠근다 (D-034)
  const [saved, setSaved] = useState<SavedError | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  // 비슷한 기존 기록 (A-003). null이면 보여줄 것이 없다
  const [searching, setSearching] = useState(false)
  const [matches, setMatches] = useState<SimilarError[] | null>(null)
  const [searchNotice, setSearchNotice] = useState<string | null>(null)
  const [applyingId, setApplyingId] = useState<number | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Suggestion | null>(null)
  const [attempts, setAttempts] = useState<SavedAttempt[]>([])
  const [attemptSaving, setAttemptSaving] = useState(false)
  const [attemptError, setAttemptError] = useState<string | null>(null)
  // 이미 해결된 에러라 더 기록할 수 없다 (A-006 409, D-032)
  const [closed, setClosed] = useState(false)
  const [resolvedSummary, setResolvedSummary] = useState<string | null>(null)
  // 저장 버튼을 빠르게 두 번 눌러도 요청은 한 번만 보낸다
  const busy = useRef(false)

  const locked = saved !== null

  async function askAi(message: string, history: SavedAttempt[]) {
    setLoading(true)
    setResult(null)
    // 해결된 시도는 다음 방법을 묻지 않으므로 실패·일부 해결만 보낸다
    const previous: PreviousAttempt[] = history.flatMap((a) =>
      a.result === 'solved' ? [] : [{ action: a.action, result: a.result }],
    )
    // requestSuggestion은 실패해도 예외 없이 unavailable을 돌려준다
    setResult(await requestSuggestion(message, previous))
    setLoading(false)
  }

  function buildErrorBody(message: string, choice: SeriesChoice): ErrorCreateBody {
    return {
      error_message: message,
      situation: situation.trim() || null,
      series_id: choice.kind === 'existing' ? choice.series.id : null,
      new_series_name: choice.kind === 'new' ? choice.name : null,
      tag_ids: tagsValue.existingIds,
      new_tag_names: tagsValue.newNames,
    }
  }

  // "해결 방법 찾기": 먼저 비슷한 기존 기록을 찾는다 (A-003). 있으면 보여주고, 없거나 확인하지 못하면 바로 AI로 간다.
  async function findSolution() {
    const message = errorMessage.trim()
    if (!message || locked || seriesChoice === null || busy.current) return
    busy.current = true
    setSearching(true)
    setSaveError(null)
    setSearchNotice(null)
    setApplyError(null)
    setMatches(null)
    const found = await searchSimilarErrors(message)
    setSearching(false)
    busy.current = false
    if (found && found.length > 0) {
      setMatches(found)
      return
    }
    if (found === null) setSearchNotice(SEARCH_FAILED_NOTICE)
    await saveAndAsk()
  }

  // 새 에러로 확정: A-002로 미해결 저장(D-025) → A-005 AI 제안. 이미 저장된 에러가 있으면 다시 저장하지 않는다.
  async function saveAndAsk() {
    const message = errorMessage.trim()
    if (!message || seriesChoice === null || busy.current) return
    busy.current = true
    setSaving(true)
    setSaveError(null)
    let error: SavedError
    try {
      error = saved ?? (await createError(buildErrorBody(message, seriesChoice)))
    } catch (e) {
      // 저장이 안 되면 AI로 넘어가지 않는다. 시도는 error_id가 있어야 저장되기 때문이다. 입력값은 그대로 둔다.
      setSaveError(e instanceof Error ? e.message : String(e))
      return
    } finally {
      setSaving(false)
      busy.current = false
    }
    setSaved(error)
    await askAi(error.error_message, [])
  }

  // "해당 없음 → AI에게 묻기"
  async function noMatch() {
    setMatches(null)
    setApplyError(null)
    await saveAndAsk()
  }

  // "같은 에러예요, 이 방법 적용": 새 기록을 저장하고 고른 기록의 한 줄 정리를 복사해 해결됨으로 처리한 뒤 내 기록으로 간다 (D-036)
  async function applyMatch(match: SimilarError) {
    const message = errorMessage.trim()
    if (!message || seriesChoice === null || busy.current) return
    busy.current = true
    setApplyingId(match.id)
    setApplyError(null)
    try {
      // 저장은 됐는데 해결 처리가 실패한 뒤 다시 누르면 이미 저장한 에러를 이어서 쓴다
      const error = saved ?? (await createError(buildErrorBody(message, seriesChoice)))
      setSaved(error)
      try {
        await createAttempt(error.id, {
          action: `기존 기록 #${match.id}의 해결 방법 적용`,
          result: 'solved',
          summary: match.summary,
        })
      } catch (e) {
        // 이미 해결로 저장된 에러(응답만 놓친 경우)면 성공으로 본다
        if (!(e instanceof AttemptSaveError && e.status === 409 && e.message.includes('이미 해결'))) throw e
      }
    } catch (e) {
      setApplyError(e instanceof Error ? `${e.message} 입력한 내용은 그대로 있어요.` : APPLY_FAILED)
      setApplyingId(null)
      busy.current = false
      return
    }
    busy.current = false
    navigate('/records')
  }

  async function saveAttempt(body: AttemptBody) {
    if (!saved || busy.current) return
    busy.current = true
    setAttemptSaving(true)
    setAttemptError(null)
    let res
    try {
      res = await createAttempt(saved.id, body)
    } catch (e) {
      if (e instanceof AttemptSaveError && e.status === 409 && e.message.includes('이미 해결')) setClosed(true)
      setAttemptError(e instanceof Error ? e.message : String(e))
      return
    } finally {
      setAttemptSaving(false)
      busy.current = false
    }
    const history = [...attempts, { seq: res.attempt.seq, action: res.attempt.action, result: res.attempt.result }]
    setAttempts(history)
    if (res.error.status === 'resolved') {
      setResolvedSummary(res.error.summary ?? '')
      return
    }
    // 해결 안 됨·일부 해결: 실패 시도를 붙여 다음 방법을 묻는다 (D-027, D-029)
    await askAi(saved.error_message, history)
  }

  function startNewError() {
    setFormKey((k) => k + 1)
    setTab('input')
    setErrorMessage('')
    setSituation('')
    setSeriesChoice({ kind: 'none' })
    setTagsValue(EMPTY_TAGS)
    setSaved(null)
    setSaveError(null)
    setMatches(null)
    setSearchNotice(null)
    setApplyingId(null)
    setApplyError(null)
    setResult(null)
    setAttempts([])
    setAttemptError(null)
    setClosed(false)
    setResolvedSummary(null)
  }

  return (
    <>
      <h1 className="page-title">에러 해결</h1>

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          id="tab-input"
          aria-selected={tab === 'input'}
          aria-controls="panel-input"
          className="tab"
          onClick={() => setTab('input')}
        >
          에러 입력
        </button>
        <button
          type="button"
          role="tab"
          id="tab-analysis"
          aria-selected={tab === 'analysis'}
          aria-controls="panel-analysis"
          className="tab"
          onClick={() => setTab('analysis')}
        >
          AI 분석
          {loading && <span className="tab-badge">분석 중…</span>}
          {!loading && result && <span className="tab-badge done">완료</span>}
        </button>
      </div>

      {/* 탭을 바꿔도 선택이 남도록 언마운트하지 않고 숨긴다. 시안 ①처럼 에러 메시지 위에 둔다. */}
      <div hidden={tab !== 'input'} key={formKey}>
        {locked && (
          <p className="locked-notice">
            저장된 에러예요. 내용을 바꾸려면 새 에러로 입력해 주세요.
            <button type="button" className="btn-secondary" onClick={startNewError}>
              새 에러 입력
            </button>
          </p>
        )}
        <SeriesSelect onChange={setSeriesChoice} disabled={locked} />
        <TagInput onChange={setTagsValue} disabled={locked} />
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
            readOnly={locked}
            onChange={(e) => {
              setErrorMessage(e.target.value)
              // 메시지가 바뀌면 지금 보이는 비슷한 기록은 더 이상 맞지 않는다
              setMatches(null)
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
            disabled={locked}
            onChange={(e) => setSituation(e.target.value)}
          />
          {!locked && (
            <button
              type="button"
              className="btn-primary"
              disabled={!errorMessage.trim() || searching || saving || applyingId !== null || seriesChoice === null}
              onClick={findSolution}
            >
              {searching ? '검색 중…' : saving ? '저장 중…' : '해결 방법 찾기'}
            </button>
          )}
          {!locked && seriesChoice === null && <p className="hint">시리즈 이름을 확인해 주세요.</p>}
          {saveError && <p className="save-error">{saveError} 입력한 내용은 그대로 있어요.</p>}
          {searchNotice && <p className="hint">{searchNotice}</p>}
          {matches && matches.length > 0 && (
            <SimilarRecords
              matches={matches}
              applyingId={applyingId}
              busy={saving || applyingId !== null}
              error={applyError}
              onApply={applyMatch}
              onNone={noMatch}
            />
          )}
          {(loading || result) && (
            <p className="hint">
              {loading ? 'AI가 분석하는 중이에요.' : '분석이 끝났어요.'} 결과는 위의 &quot;AI 분석&quot; 탭에서 볼 수 있어요.
            </p>
          )}
        </section>
      )}

      {tab === 'analysis' && (
        <section role="tabpanel" id="panel-analysis" aria-labelledby="tab-analysis">
          {!saved && <p className="empty">아직 분석한 에러가 없어요. &quot;에러 입력&quot; 탭에서 에러를 입력해 주세요.</p>}

          {saved && <pre className="code-view">{saved.error_message}</pre>}

          {attempts.length > 0 && (
            <ul className="attempt-history" aria-label="저장한 시도">
              {attempts.map((a) => (
                <li key={a.seq}>
                  <span className={`attempt-badge ${a.result}`}>
                    시도 {a.seq} · {RESULT_LABELS[a.result]}
                  </span>
                  {a.action}
                </li>
              ))}
            </ul>
          )}

          {saved && resolvedSummary !== null && (
            <ResolvedSummary
              errorMessage={saved.error_message}
              attemptCount={attempts.length}
              tagNames={saved.tags.map((t) => t.name)}
              seriesName={saved.series?.name ?? null}
              summary={resolvedSummary}
              onNewError={startNewError}
            />
          )}

          {saved && resolvedSummary === null && (
            <>
              {loading && (
                <p className="empty">
                  {attempts.length ? '✨ AI가 다음 방법을 찾는 중이에요…' : '✨ AI가 에러를 분석하는 중이에요…'}
                </p>
              )}
              {result?.status === 'unavailable' && attempts.length > 0 && (
                <p className="attempt-notice">실패한 시도는 저장됐어요.</p>
              )}
              {result && (
                <AiSuggestionCard result={result} retrying={loading} onRetry={() => askAi(saved.error_message, attempts)} />
              )}
              {closed ? (
                <p className="attempt-error">{attemptError}</p>
              ) : (
                result &&
                !loading && (
                  <AttemptForm
                    key={attempts.length + 1}
                    seq={attempts.length + 1}
                    saving={attemptSaving}
                    error={attemptError}
                    onSubmit={saveAttempt}
                  />
                )
              )}
            </>
          )}
        </section>
      )}
    </>
  )
}

export default SolvePage
