import Mascot from '../../components/Mascot'
import { Link } from 'react-router'
import type { ErrorDetail } from '../records/errorsApi'
import '../records/TagInput.css'
import { RESULT_LABELS } from './solveApi'
import type { RetryState } from './useRetryRecord'

// 이어서 해결하기(D-075) 모드의 화면 조각. 읽기 전용이라 입력 컴포넌트(SeriesSelect, TagInput)를 쓰지 않는다.

type NoticeProps = {
  state: Exclude<RetryState, { status: 'off' } | { status: 'ready' }>
  onNewError: () => void
}

// 기록을 불러오지 못했을 때의 안내. 어느 경우에도 화면이 멈추지 않고 다음 행동 버튼이 있다.
export function RetryNotice({ state, onNewError }: NoticeProps) {
  if (state.status === 'loading') return <p className="empty">기록을 불러오는 중…</p>
  return (
    <>
      {/* 화면 단위 실패에만 캐릭터를 둔다 (D-154) */}
      {state.status === 'error' && <Mascot name="error-sign" size={120} />}
    <p className="locked-notice" role="status">
      {state.status === 'not-found' && (
        <>
          기록을 찾을 수 없어요.
          <button type="button" className="btn-secondary" onClick={onNewError}>
            새 에러 입력
          </button>
        </>
      )}
      {state.status === 'resolved' && (
        <>
          이미 해결된 기록이에요.
          <Link className="btn-secondary" to={`/records/${state.id}`}>
            에러 일기 보기
          </Link>
        </>
      )}
      {state.status === 'error' && (
        <>
          기록을 불러오지 못했어요.
          <button type="button" className="btn-secondary" onClick={state.reload}>
            다시 시도
          </button>
          <button type="button" className="btn-secondary" onClick={onNewError}>
            새 에러 입력
          </button>
        </>
      )}
    </p>
    </>
  )
}

// 시리즈·태그는 이 화면에서 고치지 않는다. 고치려면 상세의 "태그·시리즈·상황 수정"(A-010)을 쓴다.
export function ReadOnlyLabels({ detail }: { detail: ErrorDetail }) {
  return (
    <div className="retry-labels" aria-label="시리즈와 태그">
      <span className="field-label">시리즈 · 태그</span>
      {detail.series && <span className="tag-chip">시리즈 {detail.series.name}</span>}
      {detail.tags.map((t) => (
        <span key={t.id} className="tag-chip">
          #{t.name}
        </span>
      ))}
      {!detail.series && detail.tags.length === 0 && <span className="hint">없음</span>}
    </div>
  )
}

// 이미 저장된 시도(읽기 전용). 이번에 모으는 시도는 이 목록 뒤로 번호가 이어진다.
export function PreviousAttempts({ detail }: { detail: ErrorDetail }) {
  return (
    <section aria-label="이전 시도">
      <p className="field-label">이전 시도 {detail.attempts.length}개</p>
      {detail.attempts.length === 0 ? (
        <p className="hint">아직 저장된 시도가 없어요.</p>
      ) : (
        <ul className="attempt-history">
          {detail.attempts.map((a) => (
            <li key={a.seq}>
              <span className={`attempt-badge ${a.result}`}>
                시도 {a.seq} · {RESULT_LABELS[a.result]}
              </span>
              {a.action}
            </li>
          ))}
        </ul>
      )}
      {detail.summary && (
        <p className="hint">
          기존 한 줄 정리: {detail.summary} (시도 폼의 한 줄 정리를 비워 두고 저장하면 이 정리가 그대로 남아요)
        </p>
      )}
    </section>
  )
}
