import type { ReactNode } from 'react'
import { Link } from 'react-router'
import ErrorMessageView from '../../components/ErrorMessageView'
import { keyLine } from '../../errorText'
import { RESULT_LABELS } from '../solve/solveApi'
import { STATUS_LABELS, type ErrorDetail as Detail } from './errorsApi'

// 에러 일기 상세 본문 (S-003, 시안 내기록창 ④). 시도 결과 문구는 에러 해결 화면과 같은 것을 쓴다 (D-028, D-031).

type Props = {
  detail: Detail
  // 제목 줄 아래 버튼 영역(삭제, 이후 수정). 상태를 가진 쪽(페이지)이 채운다.
  actions?: ReactNode
  // "✨ AI 피드백" 칸. 한 줄 정리 아래에 둔다 (D-064). 상태를 가진 쪽(페이지)이 채운다.
  feedbackSection?: ReactNode
  // 미리보기 패널용 (S-001 비슷한 기록). 링크는 글자로, 에러 메시지 전체는 접고, 저장된 AI 피드백은 읽기 전용 글로만 보여준다.
  preview?: boolean
}

// "2026-10-28T14:17:00+09:00" → "10월 28일 14:17". 한국 시간 문자열(D-015)을 그대로 잘라 쓴다.
function timeLabel(iso: string) {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${m}월 ${d}일 ${iso.slice(11, 16)}`
}

// "이 방법 적용"이 남긴 시도 문구 (D-069). 재사용 기록이면 "기존 기록 #N"을 원본 상세 링크로 바꿔 보여준다 (D-081).
const REUSE_ACTION = /^기존 기록 #\d+(의 해결 방법 적용)$/

function AttemptText({ action, originId, preview }: { action: string; originId: number | null; preview?: boolean }) {
  const match = REUSE_ACTION.exec(action)
  // 원본이 지워져 연결이 없으면 문구 그대로 보여준다
  if (!match || originId === null) return <>{action}</>
  return (
    <>
      {preview ? <>기존 기록 #{originId}</> : <Link to={`/records/${originId}`}>기존 기록 #{originId}</Link>}
      {match[1]}
    </>
  )
}

// 타임라인 항목: 시도와 이 기록을 재사용한 기록을 날짜순으로 합친다 (D-081)
type TimelineEntry =
  | { kind: 'attempt'; time: string; attempt: Detail['attempts'][number] }
  | { kind: 'reuse'; time: string; reuse: Detail['reuses'][number] }

function ErrorDetail({ detail, actions, feedbackSection, preview = false }: Props) {
  // 제목·타임라인의 에러는 핵심 줄(D-117). 핵심 줄이 없으면 원문이다.
  const title = keyLine(detail.error_message).text || detail.error_message
  const entries: TimelineEntry[] = [
    ...detail.attempts.map((attempt): TimelineEntry => ({ kind: 'attempt', time: attempt.created_at, attempt })),
    ...detail.reuses.map((reuse): TimelineEntry => ({ kind: 'reuse', time: reuse.created_at, reuse })),
  ].sort((a, b) => a.time.localeCompare(b.time)) // 같은 시각이면 시도가 먼저 오도록 정렬은 안정 정렬에 맡긴다
  return (
    <article className="detail">
      <header className="detail-header">
        <span className={`status-badge ${detail.status}`}>{STATUS_LABELS[detail.status]}</span>
        <h2 className="detail-title">{title}</h2>
      </header>
      <p className="record-meta detail-meta">
        <span>{timeLabel(detail.created_at)} 등록</span>
        {detail.series && <span>{detail.series.name}</span>}
        {detail.tags.map((tag) => (
          <span key={tag.id} className="record-tag">
            #{tag.name}
          </span>
        ))}
      </p>

      {actions && <div className="detail-actions">{actions}</div>}

      {/* 미리보기: 핵심 줄은 패널 비교 칸과 제목에 이미 있어 전체 메시지는 접어 둔다 */}
      {preview ? (
        <details className="detail-fulltext">
          <summary>에러 메시지 전체 보기</summary>
          <ErrorMessageView text={detail.error_message} />
        </details>
      ) : (
        <ErrorMessageView text={detail.error_message} />
      )}

      {detail.situation && (
        <section className="detail-section">
          <h3 className="detail-label">상황</h3>
          <p className="ai-text">{detail.situation}</p>
        </section>
      )}

      <section className="detail-section">
        <h3 className="detail-label">시도 기록</h3>
        {/* 시도별 타임라인 (시안 ④): 에러 발생에서 시작해 시도 순서대로 */}
        <ol className="timeline">
          <li className="timeline-item start">
            <span className="timeline-time">{timeLabel(detail.created_at)} · 에러 발생</span>
            <span className="timeline-text">{title}</span>
          </li>
          {entries.map((entry) =>
            entry.kind === 'attempt' ? (
              <li key={`attempt-${entry.attempt.seq}`} className={`timeline-item ${entry.attempt.result}`}>
                <span className="timeline-time">
                  {timeLabel(entry.attempt.created_at)} · 시도 {entry.attempt.seq}{' '}
                  <span className={`attempt-result-badge ${entry.attempt.result}`}>{RESULT_LABELS[entry.attempt.result]}</span>
                </span>
                <span className="timeline-text">
                  <AttemptText action={entry.attempt.action} originId={detail.reused_from_id} preview={preview} />
                </span>
              </li>
            ) : (
              <li key={`reuse-${entry.reuse.id}`} className="timeline-item reuse">
                <span className="timeline-time">{timeLabel(entry.reuse.created_at)} · 이 방법을 다시 적용했어요</span>
                {entry.reuse.situation && <span className="timeline-text">{entry.reuse.situation}</span>}
                <span className="timeline-chips">
                  {entry.reuse.series && <span className="record-series">{entry.reuse.series.name}</span>}
                  {entry.reuse.tags.map((tag) => (
                    <span key={tag.id} className="record-tag">
                      #{tag.name}
                    </span>
                  ))}
                  {preview ? (
                    <span>기록 #{entry.reuse.id}</span>
                  ) : (
                    <Link to={`/records/${entry.reuse.id}`}>기록 #{entry.reuse.id} 보기</Link>
                  )}
                </span>
              </li>
            ),
          )}
        </ol>
        {detail.attempts.length === 0 && <p className="hint">아직 기록한 시도가 없어요.</p>}
      </section>

      {/* 한 줄 정리는 상태와 상관없이 있으면 보여준다 (D-064) */}
      {detail.summary && (
        <section className="detail-summary">
          <h3 className="detail-label">내 한 줄 정리</h3>
          <p className="ai-text">
            <span className="note-mark">{detail.summary}</span>
          </p>
        </section>
      )}

      {feedbackSection}
      {preview && detail.ai_feedback && (
        <section className="detail-section">
          <h3 className="detail-label">✨ AI 피드백</h3>
          <p className="ai-text">{detail.ai_feedback}</p>
        </section>
      )}
    </article>
  )
}

export default ErrorDetail
