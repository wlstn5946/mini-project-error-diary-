import { Link } from 'react-router'
import { keyLine } from '../../errorText'
import type { SimilarError } from './errorsApi'

// 비슷한 기존 기록 (시안 에러해결창_예시.png ①). "재사용 N회" 배지는 같은 해결법을 묶은 카드에 단다 (D-121). "에러 일기 보기"는 대표 기록(뿌리)의 상세를 새 탭으로 연다. 입력 중인 내용을 지키기 위해서다 (D-127).
// "이 방법 써 보기"는 저장하지 않고 시도 1로 시작한다 (D-128, D-069 변경).
// "해당 없음 → AI에게 묻기" 버튼은 입력창 쪽(SolvePage)에 하나만 둔다 (D-064).
// 목록은 유사도 높은 순으로 오고, 위 두 개만 보이며 나머지는 스크롤로 본다 (CSS .similar-list).

type Props = {
  matches: SimilarError[]
  busy: boolean
  onApply: (match: SimilarError) => void
}

// "2026-11-02T15:40:00+09:00" → "11/2"
function shortDate(iso: string): string {
  const [, month, day] = iso.slice(0, 10).split('-')
  return `${Number(month)}/${Number(day)}`
}

function SimilarRecords({ matches, busy, onApply }: Props) {
  return (
    <>
      <section className="similar-box" aria-labelledby="similar-title">
        <h2 id="similar-title" className="similar-heading">
          📂 비슷한 기존 기록 {matches.length}건을 찾았어요
        </h2>
        <div className="similar-list" tabIndex={0} aria-label="비슷한 기존 기록 목록">
          {matches.map((m) => {
            // 에러는 핵심 줄만 제목으로 쓴다(D-117). Traceback 전체는 입력칸에 있다.
            const title = keyLine(m.error_message).text || m.error_message
            return (
              <article key={m.id} className="similar-card">
                <div className="similar-badges">
                  <span className="similar-badge percent">유사도 {m.similarity}%</span>
                  {m.matched_by === 'key_line' && <span className="similar-badge key-line">핵심 줄 일치</span>}
                  <span className="similar-badge resolved">해결</span>
                  {m.reuse_count > 0 && <span className="similar-badge reuse">재사용 {m.reuse_count}회</span>}
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
                <div className="similar-actions">
                  <button type="button" className="btn-apply" disabled={busy} onClick={() => onApply(m)}>
                    ✔ 같은 에러예요, 이 방법 써 보기
                  </button>
                  {/* 새 탭: 같은 탭으로 이동하면 아직 저장하지 않은 입력이 사라진다 (D-127). 읽기만 하므로 busy여도 막지 않는다 */}
                  <Link
                    className="btn-secondary similar-diary-link"
                    to={`/records/${m.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="에러 일기 보기 (새 탭에서 열림)"
                  >
                    에러 일기 보기 ↗
                  </Link>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </>
  )
}

export default SimilarRecords
