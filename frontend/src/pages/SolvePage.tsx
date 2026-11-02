import { useState } from 'react'

// S-001 에러 해결 (R-001 ~ R-004). 이번 범위: 탭 2개(에러 입력 / AI 분석)와 AI 분석(A-005)만.
// 유사 기록 검색, 시도 기록, 해결 처리는 아직 없다.

type Tab = 'input' | 'analysis'
type Confidence = '높음' | '보통' | '낮음'

// A-005 응답 (API-SPEC_2 6절)
type Suggestion = {
  status: 'ok' | 'unavailable'
  confidence: Confidence | null
  cause: string | null
  solutions: string[]
  message: string | null
}

const UNAVAILABLE = '지금은 AI 분석을 가져오지 못했어요. 잠시 뒤 다시 시도해 주세요.'

function SolvePage() {
  const [tab, setTab] = useState<Tab>('input')
  const [errorMessage, setErrorMessage] = useState('')
  // 분석에 쓴 에러 메시지. 입력창을 고쳐도 탭 2에는 분석한 원문을 보여준다.
  const [analyzed, setAnalyzed] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Suggestion | null>(null)

  async function findSolution() {
    const message = errorMessage.trim()
    if (!message || loading) return
    setLoading(true)
    setAnalyzed(message)
    setResult(null)
    try {
      const res = await fetch('/api/ai-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error_message: message }),
      })
      if (!res.ok) throw new Error(String(res.status))
      setResult((await res.json()) as Suggestion)
    } catch {
      // 서버 꺼짐·네트워크 오류여도 화면은 멈추지 않고 안내만 보여준다.
      setResult({ status: 'unavailable', confidence: null, cause: null, solutions: [], message: UNAVAILABLE })
    } finally {
      setLoading(false)
    }
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

      {tab === 'input' && (
        <section role="tabpanel" id="panel-input" aria-labelledby="tab-input">
          <label className="field-label" htmlFor="error-message">
            에러 메시지
          </label>
          <textarea
            id="error-message"
            className="code-input"
            rows={10}
            maxLength={10000}
            placeholder="에러 메시지나 Traceback을 붙여넣으세요"
            value={errorMessage}
            onChange={(e) => setErrorMessage(e.target.value)}
          />
          <button
            type="button"
            className="btn-primary"
            disabled={!errorMessage.trim() || loading}
            onClick={findSolution}
          >
            {loading ? '분석 중…' : '해결 방법 찾기'}
          </button>
          {(loading || result) && (
            <p className="hint">
              {loading ? 'AI가 분석하는 중이에요.' : '분석이 끝났어요.'} 결과는 위의 &quot;AI 분석&quot; 탭에서 볼 수 있어요.
            </p>
          )}
        </section>
      )}

      {tab === 'analysis' && (
        <section role="tabpanel" id="panel-analysis" aria-labelledby="tab-analysis">
          {!analyzed && <p className="empty">아직 분석한 에러가 없어요. &quot;에러 입력&quot; 탭에서 에러를 입력해 주세요.</p>}

          {analyzed && <pre className="code-view">{analyzed}</pre>}

          {loading && <p className="empty">✨ AI가 에러를 분석하는 중이에요…</p>}

          {result?.status === 'ok' && (
            <div className="ai-card">
              <h2 className="ai-title">
                ✨ AI 분석 · 확신도 <span className={`confidence c-${result.confidence}`}>{result.confidence}</span>
              </h2>
              <p className="ai-label">추정 원인</p>
              <p className="ai-text">{result.cause}</p>
              <p className="ai-label">해결 제안</p>
              <ol className="ai-list">
                {result.solutions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          )}

          {result?.status === 'unavailable' && (
            <div className="ai-card unavailable">
              <p className="ai-text">{result.message ?? UNAVAILABLE}</p>
              <button type="button" className="btn-secondary" onClick={findSolution} disabled={loading}>
                다시 시도
              </button>
            </div>
          )}
        </section>
      )}
    </>
  )
}

export default SolvePage
