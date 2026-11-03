// 이름 변경·삭제 요청(A-012, A-013)의 실패를 화면에 보여줄 문구로 바꾼다 (팀원 1).

export class ApiError extends Error {
  // 서버가 준 상태 코드. 네트워크 오류면 null
  status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.status = status
  }
}

export const JSON_HEADERS = { 'Content-Type': 'application/json' }
export const RENAME_FAILED = '저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
export const DELETE_FAILED = '삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요.'

const KNOWN: Record<number, string> = {
  404: '이미 삭제된 항목이에요.',
  409: '이미 있는 이름이에요.', // D-049
}

// 성공이면 Response를 돌려주고, 실패하면 화면에 보여줄 문구를 담은 ApiError를 던진다.
export async function send(url: string, init: RequestInit, fallback: string): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new ApiError(fallback, null)
  }
  if (res.ok) return res
  // 422는 서버가 준 안내 문구(detail 문자열)가 있으면 그것을 쓴다
  const detail = res.status === 422 ? await res.json().then((data) => data?.detail, () => null) : null
  throw new ApiError(KNOWN[res.status] ?? (typeof detail === 'string' ? detail : fallback), res.status)
}
