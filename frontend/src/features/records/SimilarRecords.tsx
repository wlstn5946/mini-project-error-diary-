import { useRef, useState } from 'react'
import { keyLine } from '../../errorText'
import type { SimilarError } from './errorsApi'
import RecordPreviewPanel from './RecordPreviewPanel'

// 비슷한 기존 기록 (시안 에러해결창_예시.png ①). "재사용 N회" 배지는 같은 해결법을 묶은 카드에 단다 (D-121). "에러 일기 보기"는 대표 기록(뿌리)의 미리보기를 오른쪽 패널로 연다. 페이지를 떠나지 않아 입력 중인 내용이 지켜진다 (D-152, D-127 변경).
// "이 방법 써 보기"는 저장하지 않고 시도 1로 시작한다 (D-128, D-069 변경).
// "해당 없음 → AI에게 묻기" 버튼은 입력창 쪽(SolvePage)에 하나만 둔다 (D-064).
// 목록은 유사도 높은 순으로 오고, 위 두 개만 보이며 나머지는 스크롤로 본다 (CSS .similar-list).

type Props = {
  matches: SimilarError[]
  busy: boolean
  // 지금 입력 중인 에러 메시지. 패널 비교 칸의 "내 에러"에 쓴다 (D-152)
  myErrorMessage: string
  onApply: (match: SimilarError) => void
}

// "2026-11-02T15:40:00+09:00" → "11/2"
function shortDate(iso: string): string {
  const [, month, day] = iso.slice(0, 10).split('-')
  return `${Number(month)}/${Number(day)}`
}

function SimilarRecords({ matches, busy, myErrorMessage, onApply }: Props) {
  const [previewing, setPreviewing] = useState<SimilarError | null>(null)
  // 패널을 닫으면 포커스를 누른 버튼으로 돌려준다
  const opener = useRef<HTMLElement | null>(null)
  const closePreview = () => {
    setPreviewing(null)
    opener.current?.focus()
  }

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
                  💡 <strong>해결법:</strong> <span className="note-mark">{m.summary}</span>
                </p>
                <div className="similar-actions">
                  <button type="button" className="btn-apply" disabled={busy} onClick={() => onApply(m)}>
                    ✔ 같은 에러예요, 이 방법 써 보기
                  </button>
                  {/* 읽기만 하므로 busy여도 막지 않는다 (D-152) */}
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={(e) => {
                      opener.current = e.currentTarget
                      setPreviewing(m)
                    }}
                  >
                    에러 일기 보기
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </section>
      {previewing && (
        <RecordPreviewPanel
          match={previewing}
          myErrorMessage={myErrorMessage}
          busy={busy}
          onApply={onApply}
          onClose={closePreview}
        />
      )}
    </>
  )
}

export default SimilarRecords
