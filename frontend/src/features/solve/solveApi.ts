// AI 제안·시도 기록 API 호출 (팀원 2). 컴포넌트에서 fetch를 직접 쓰지 않고 이 파일을 거친다.

export type Confidence = '높음' | '보통' | '낮음'
export type AttemptResult = 'solved' | 'failed' | 'partial' // D-028

// 화면 표시용 한글 (D-028)
export const RESULT_LABELS: Record<AttemptResult, string> = {
  solved: '해결됨',
  failed: '해결 안 됨',
  partial: '일부 해결',
}

// A-005 응답 (API-SPEC_5 6절)
export type Suggestion = {
  status: 'ok' | 'unavailable'
  confidence: Confidence | null
  cause: string | null
  solutions: string[]
  message: string | null
}

export type PreviousAttempt = { action: string; result: 'failed' | 'partial' }

export const UNAVAILABLE = '지금은 AI 분석을 가져오지 못했어요. 잠시 뒤 다시 시도해 주세요.'

// A-005. 서버 꺼짐·네트워크 오류여도 예외를 던지지 않고 unavailable로 돌려준다. 화면이 멈추지 않게 하기 위해서다.
export async function requestSuggestion(errorMessage: string, previousAttempts: PreviousAttempt[]): Promise<Suggestion> {
  try {
    const res = await fetch('/api/ai-suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error_message: errorMessage, previous_attempts: previousAttempts }),
    })
    if (!res.ok) throw new Error(String(res.status))
    return (await res.json()) as Suggestion
  } catch {
    return { status: 'unavailable', confidence: null, cause: null, solutions: [], message: UNAVAILABLE }
  }
}

export type AttemptBody = { action: string; result: AttemptResult; summary: string | null }

// A-006 응답 (201)
export type AttemptSaved = {
  attempt: { id: number; error_id: number; seq: number; action: string; result: AttemptResult; created_at: string }
  error: { id: number; status: 'unresolved' | 'resolved'; summary: string | null; resolved_at: string | null }
}

// 실패 이유를 화면에서 나눠 보여주려고 상태 코드를 함께 담는다 (409: 이미 해결된 에러 등)
export class AttemptSaveError extends Error {
  status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.status = status
  }
}

const SAVE_FAILED = '시도를 저장하지 못했어요. 입력한 내용은 그대로 있으니 다시 시도해 주세요.'

// A-006
export async function createAttempt(errorId: number, body: AttemptBody): Promise<AttemptSaved> {
  let res: Response
  try {
    res = await fetch(`/api/errors/${errorId}/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new AttemptSaveError(SAVE_FAILED, null)
  }
  if (!res.ok) {
    const detail = await res.json().then((data) => data?.detail, () => null)
    throw new AttemptSaveError(typeof detail === 'string' ? detail : SAVE_FAILED, res.status)
  }
  return (await res.json()) as AttemptSaved
}
