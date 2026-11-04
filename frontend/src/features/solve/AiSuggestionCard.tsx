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
      {result.masked_count > 0 && <p className="ai-masked">🔒 민감해 보이는 정보 {result.masked_count}개를 가리고 보냈어요</p>}
      <p className="ai-label">추정 원인</p>
      <p className="ai-text">{result.cause}</p>
      <p className="ai-label">해결 제안</p>
      <ol className="ai-list">
        {result.solutions.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      {result.references.length > 0 && (
        <div className="ai-references">
          <p className="ai-label">📂 내 기록에서 참고했어요</p>
          <ul className="ai-reference-list">
            {result.references.map((r) => (
              // 새 탭: 같은 탭으로 이동하면 아직 저장하지 않은 입력·시도가 사라진다 (D-065)
              <li key={r.id}>
                <a href={`/records/${r.id}`} target="_blank" rel="noopener">
                  #{r.id} {r.title}
                </a>{' '}
                — {r.summary}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default AiSuggestionCard
