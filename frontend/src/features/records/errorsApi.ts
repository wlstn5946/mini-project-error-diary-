// 에러 등록 API 호출 (팀원 1). 컴포넌트에서 fetch를 직접 쓰지 않고 이 파일을 거친다.

// A-002 POST /api/errors 요청 (API-SPEC_5 6절)
export type ErrorCreateBody = {
  error_message: string
  situation: string | null
  // 시리즈는 기존 ID와 새 이름 중 하나만 보낸다. 둘 다 null이면 시리즈 없음.
  series_id: number | null
  new_series_name: string | null
  tag_ids: number[]
  new_tag_names: string[]
}

type NamedItem = { id: number; name: string }

// A-002 응답 (201)
export type SavedError = {
  id: number
  error_message: string
  situation: string | null
  status: 'unresolved' | 'resolved'
  series: NamedItem | null
  tags: NamedItem[]
  created_at: string
}

const SAVE_FAILED = '에러를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'

// 실패하면 화면에 보여줄 문구를 담아 예외를 던진다. 서버가 준 안내 문구(detail 문자열)가 있으면 그것을 쓴다.
export async function createError(body: ErrorCreateBody): Promise<SavedError> {
  let res: Response
  try {
    res = await fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error(SAVE_FAILED)
  }
  if (!res.ok) {
    const detail = await res.json().then((data) => data?.detail, () => null)
    throw new Error(typeof detail === 'string' ? detail : SAVE_FAILED)
  }
  return (await res.json()) as SavedError
}

export type ErrorStatus = 'unresolved' | 'resolved'

// 화면 표시용 한글 (D-028)
export const STATUS_LABELS: Record<ErrorStatus, string> = {
  unresolved: '미해결',
  resolved: '해결',
}

// A-008 GET /api/errors 응답 항목 (API-SPEC_6 6절)
export type ErrorListItem = {
  id: number
  error_message: string
  status: ErrorStatus
  series: NamedItem | null
  tags: NamedItem[]
  attempt_count: number
  created_at: string
  resolved_at: string | null
}

// 내 기록 필터. 모두 선택이고, 함께 쓰면 모두 만족하는 기록만 온다 (D-036)
export type ErrorFilters = {
  status: ErrorStatus | null
  tagIds: number[]
  q: string
}

// A-008. 서버 오류·네트워크 오류면 예외를 던지므로 호출하는 쪽에서 처리한다.
export async function listErrors(filters: ErrorFilters, signal?: AbortSignal): Promise<ErrorListItem[]> {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  for (const id of filters.tagIds) params.append('tag_id', String(id))
  if (filters.q.trim()) params.set('q', filters.q.trim())
  const query = params.toString()
  const res = await fetch(`/api/errors${query ? `?${query}` : ''}`, { signal })
  if (!res.ok) throw new Error(`GET /api/errors ${res.status}`)
  return (await res.json()) as ErrorListItem[]
}

// A-009 GET /api/errors/{id} 응답 (API-SPEC_6 6절)
export type ErrorDetail = ErrorListItem & {
  situation: string | null
  summary: string | null
  attempts: { seq: number; action: string; result: 'solved' | 'failed' | 'partial'; created_at: string }[]
}

// A-009. 없는 ID(404)면 null을 돌려준다. 그 밖의 서버 오류·네트워크 오류는 예외를 던진다.
export async function getError(id: number, signal?: AbortSignal): Promise<ErrorDetail | null> {
  const res = await fetch(`/api/errors/${id}`, { signal })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GET /api/errors/${id} ${res.status}`)
  return (await res.json()) as ErrorDetail
}

// A-003 POST /api/errors/search 응답의 항목 (API-SPEC_5 6절). 해결된 기록만, 유사도 높은 순으로 온다.
export type SimilarError = {
  id: number
  error_message: string
  // 0~100 (%)
  similarity: number
  // 내 한 줄 정리 = 해결법
  summary: string
  attempt_count: number
  tags: NamedItem[]
  resolved_at: string
}

// 비슷한 기록을 찾지 못해도 화면이 멈추지 않게, 실패하면 예외 대신 null을 돌려준다. 호출하는 쪽은 바로 AI로 넘어간다.
export async function searchSimilarErrors(errorMessage: string): Promise<SimilarError[] | null> {
  try {
    const res = await fetch('/api/errors/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error_message: errorMessage }),
    })
    if (!res.ok) return null
    return (await res.json()) as SimilarError[]
  } catch {
    return null
  }
}

export type DeleteResult = 'deleted' | 'not-found'

const DELETE_FAILED = '기록을 지우지 못했어요. 잠시 뒤 다시 시도해 주세요.'

// A-011 DELETE /api/errors/{id}. 이미 지워진 기록(404)은 'not-found'로 돌려주고, 그 밖의 실패는 화면에 보여줄 문구를 담아 예외를 던진다.
export async function deleteError(id: number): Promise<DeleteResult> {
  let res: Response
  try {
    res = await fetch(`/api/errors/${id}`, { method: 'DELETE' })
  } catch {
    throw new Error(DELETE_FAILED)
  }
  if (res.status === 404) return 'not-found'
  if (!res.ok) throw new Error(DELETE_FAILED)
  return 'deleted'
}
