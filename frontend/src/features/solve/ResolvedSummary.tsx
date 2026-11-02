// 해결 완료 (시안 ③). AI 피드백, 해결까지 걸린 시간, 에러 일기 보기, 한 줄 정리 수정은 이번 범위에서 뺐다 (SCREEN-SPEC_4).

type Props = {
  errorMessage: string
  attemptCount: number
  tagNames: string[]
  seriesName: string | null
  summary: string
  onNewError: () => void
}

function ResolvedSummary({ errorMessage, attemptCount, tagNames, seriesName, summary, onNewError }: Props) {
  // 에러는 첫 줄만 보여준다. Traceback 전체는 위의 코드 영역에 있다.
  const firstLine = errorMessage.split('\n').find((line) => line.trim()) ?? errorMessage
  const labels = [...tagNames, ...(seriesName ? [seriesName] : [])]

  return (
    <section className="resolved" aria-labelledby="resolved-title">
      <div className="resolved-banner">
        <h2 id="resolved-title" className="resolved-title">
          ✔ 해결로 저장했어요
        </h2>
        <p className="resolved-sub">다음에 같은 에러가 나면 이 기록이 먼저 보여요</p>
      </div>

      <dl className="resolved-table">
        <dt>에러</dt>
        <dd>{firstLine}</dd>
        <dt>시도</dt>
        <dd>{attemptCount}회</dd>
        <dt>태그 · 시리즈</dt>
        <dd>{labels.length ? labels.join(' · ') : '없음'}</dd>
      </dl>

      <div className="resolved-summary">
        <p className="ai-label">내 한 줄 정리</p>
        <p className="ai-text">{summary}</p>
      </div>

      <button type="button" className="btn-primary" onClick={onNewError}>
        새 에러 입력
      </button>
    </section>
  )
}

export default ResolvedSummary
