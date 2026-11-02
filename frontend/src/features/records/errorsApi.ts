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
