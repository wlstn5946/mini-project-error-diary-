import type { SimilarError } from './errorsApi'

// 비슷한 기존 기록 (시안 에러해결창_예시.png ①). 시안의 "재사용 N회" 배지와 "에러 일기 보기" 버튼은 이번 범위에서 뺐다 (SCREEN-SPEC_4).
// "해당 없음 → AI에게 묻기" 버튼은 입력창 쪽(SolvePage)에 하나만 둔다 (D-064).
// 목록은 유사도 높은 순으로 오고, 위 두 개만 보이며 나머지는 스크롤로 본다 (CSS .similar-list).

type Props = {
  matches: SimilarError[]
  // "이 방법 적용"을 처리 중인 기록 ID
  applyingId: number | null
  busy: boolean
  error: string | null
  onApply: (match: SimilarError) => void
}

// "2026-11-02T15:40:00+09:00" → "11/2"
function shortDate(iso: string): string {
  const [, month, day] = iso.slice(0, 10).split('-')
  return `${Number(month)}/${Number(day)}`
}

function SimilarRecords({ matches, applyingId, busy, error, onApply }: Props) {
  return (
    <>
      <section className="similar-box" aria-labelledby="similar-title">
        <h2 id="similar-title" className="similar-heading">
          📂 비슷한 기존 기록 {matches.length}건을 찾았어요
        </h2>
        <div className="similar-list" tabIndex={0} aria-label="비슷한 기존 기록 목록">
          {matches.map((m) => {
            // 에러는 첫 줄만 제목으로 쓴다. Traceback 전체는 입력칸에 있다.
            const title = m.error_message.split('\n').find((line) => line.trim()) ?? m.error_message
            return (
              <article key={m.id} className="similar-card">
                <div className="similar-badges">
                  <span className="similar-badge percent">유사도 {m.similarity}%</span>
                  <span className="similar-badge resolved">해결</span>
                </div>
                <h3 className="similar-title" title={title}>
                  {title}
                </h3>
                <p className="similar-meta">
                  {shortDate(m.resolved_at)}
                  {m.attempt_count > 0 && ` · 시도 ${m.attempt_count}회 만에 해결`}
                  {m.tags.map((t) => (
                    <span key={t.id} className="similar-tag">
                      {t.name}
                    </span>
                  ))}
                </p>
                <p className="similar-solution">
                  💡 <strong>해결법:</strong> {m.summary}
                </p>
                <button type="button" className="btn-apply" disabled={busy} onClick={() => onApply(m)}>
                  {applyingId === m.id ? '적용 중…' : '✔ 같은 에러예요, 이 방법 적용'}
                </button>
              </article>
            )
          })}
        </div>
        {error && <p className="save-error">{error}</p>}
      </section>
    </>
  )
}

export default SimilarRecords
