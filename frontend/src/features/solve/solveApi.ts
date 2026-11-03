// AI 제안·시도 기록·한 줄 정리·AI 피드백 API 호출 (팀원 2). 컴포넌트에서 fetch를 직접 쓰지 않고 이 파일을 거친다. 서버 호출은 api.ts의 request()로 한다 (D-056).
import { ApiError, jsonInit, request } from '../../api'

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
    const res = await request(
      '/api/ai-suggestions',
      jsonInit('POST', { error_message: errorMessage, previous_attempts: previousAttempts }),
      UNAVAILABLE,
    )
    return (await res.json()) as Suggestion
  } catch {
    return { status: 'unavailable', confidence: null, cause: null, solutions: [], message: UNAVAILABLE }
  }
}

// A-016 응답. 실패해도 200 + unavailable이다
export type FeedbackResult = { status: 'ok' | 'unavailable'; feedback: string | null; message: string | null }

export const FEEDBACK_UNAVAILABLE = '피드백을 가져오지 못했어요.'

// A-016. 서버 꺼짐·네트워크 오류여도 예외를 던지지 않고 unavailable로 돌려준다. 화면이 멈추지 않게 하기 위해서다.
export async function requestFeedback(errorId: number): Promise<FeedbackResult> {
  try {
    const res = await request(`/api/errors/${errorId}/feedback`, { method: 'POST' }, FEEDBACK_UNAVAILABLE)
    return (await res.json()) as FeedbackResult
  } catch {
    return { status: 'unavailable', feedback: null, message: FEEDBACK_UNAVAILABLE }
  }
}

const SUMMARY_FAILED = '한 줄 정리를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'

// A-007. 성공하면 저장된 정리(비우면 null)를 돌려준다. 실패하면 화면에 보여줄 문구를 담은 ApiError를 던진다 (422, 404)
export async function updateSummary(errorId: number, summary: string): Promise<string | null> {
  const res = await request(`/api/errors/${errorId}/summary`, jsonInit('PATCH', { summary }), SUMMARY_FAILED)
  return ((await res.json()) as { summary: string | null }).summary
}

export type AttemptBody = { action: string; result: AttemptResult; summary: string | null }

// A-006 응답 (201)
export type AttemptSaved = {
  attempt: { id: number; error_id: number; seq: number; action: string; result: AttemptResult; created_at: string }
  error: { id: number; status: 'unresolved' | 'resolved'; summary: string | null; resolved_at: string | null }
}

// 실패 이유를 화면에서 나눠 보여주려고 상태 코드를 함께 담는다 (409: 이미 해결된 에러 등). 공용 ApiError와 같다.
export const AttemptSaveError = ApiError

const SAVE_FAILED = '시도를 저장하지 못했어요. 입력한 내용은 그대로 있으니 다시 시도해 주세요.'

// A-006. 서버가 준 안내(409 "이미 해결된 에러예요." 등)가 있으면 그 문구를 그대로 쓴다.
export async function createAttempt(errorId: number, body: AttemptBody): Promise<AttemptSaved> {
  const res = await request(`/api/errors/${errorId}/attempts`, jsonInit('POST', body), SAVE_FAILED)
  return (await res.json()) as AttemptSaved
}
