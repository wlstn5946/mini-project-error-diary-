import { UNAVAILABLE, type Suggestion } from './solveApi'

// A-005 결과 카드 (R-003). pages/SolvePage.tsx에 있던 것을 옮겼다 (D-012).

type Props = {
  result: Suggestion
  retrying: boolean
  onRetry: () => void
}

function AiSuggestionCard({ result, retrying, onRetry }: Props) {
  if (result.status === 'unavailable') {
    return (
      <div className="ai-card unavailable">
        <p className="ai-text">{result.message ?? UNAVAILABLE}</p>
        <button type="button" className="btn-secondary" onClick={onRetry} disabled={retrying}>
          다시 시도
        </button>
      </div>
    )
  }

  return (
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
  )
}

export default AiSuggestionCard
