// AI 제안·시도 기록·한 줄 정리·AI 피드백 API 호출 (팀원 2). 컴포넌트에서 fetch를 직접 쓰지 않고 이 파일을 거친다. 서버 호출은 api.ts의 request()로 한다 (D-056).
import { ApiError, jsonInit, request } from '../../api'
import { RECORDS_CHANGED_EVENT, type AttemptInput, type SavedError } from '../records/errorsApi'

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

// A-006 요청 (API-SPEC). 이어서 해결할 때 이번에 새로 한 시도만 보낸다. 기존 시도는 다시 보내지 않고 seq는 서버가 매긴다 (D-076, D-077)
export type AttemptsBody = {
  // 1개 이상. 해결됨은 마지막 시도에만 올 수 있다
  attempts: AttemptInput[]
  // 내 한 줄 정리. 마지막 시도가 해결됨이면 필수, 그 밖에는 선택(비우면 기존 정리를 그대로 둔다)
  summary: string | null
  // "이 방법 적용"으로 고른 기록의 ID. 이 기록의 값이 비어 있을 때만 서버가 채운다 (D-080)
  reused_from_id?: number | null
}

// 실패 이유를 화면에서 나눠 보여주려고 상태 코드를 함께 담는다 (409: 이미 해결된 에러 등). 공용 ApiError와 같다.
export const AttemptSaveError = ApiError

const SAVE_FAILED = '시도를 저장하지 못했어요. 입력한 내용은 그대로 있으니 다시 시도해 주세요.'

// A-006. 성공하면 A-002 응답과 같은 모양(기존 시도 + 이번 시도 전체)을 돌려준다 (201).
// 서버가 준 안내(409 "이미 해결된 에러예요." 등)가 있으면 그 문구를 그대로 쓴다.
export async function createAttempts(errorId: number, body: AttemptsBody): Promise<SavedError> {
  const res = await request(`/api/errors/${errorId}/attempts`, jsonInit('POST', body), SAVE_FAILED)
  const saved = (await res.json()) as SavedError
  // 상태가 바뀌었을 수 있어 사이드바 통계(D-074)가 숫자를 다시 불러오게 한다. errorsApi.ts(팀원 1)는 건드리지 않는다.
  window.dispatchEvent(new Event(RECORDS_CHANGED_EVENT))
  return saved
}
