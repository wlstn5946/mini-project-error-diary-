// 시리즈 API 호출 (팀원 1). 컴포넌트에서 fetch를 직접 쓰지 않고 이 파일을 거친다.
import { DELETE_FAILED, JSON_HEADERS, RENAME_FAILED, send } from './apiError'

// A-004 GET /api/series 응답 항목 (API-SPEC_7 6절)
export type Series = {
  id: number
  name: string
  description: string | null
  // 이 시리즈에 속한 에러 수 (D-050)
  error_count: number
  created_at: string
}

// 최근 만든 순 목록. 서버 오류·네트워크 오류면 예외를 던지므로 호출하는 쪽에서 처리한다.
export async function fetchSeries(signal?: AbortSignal): Promise<Series[]> {
  const res = await fetch('/api/series', { signal })
  if (!res.ok) throw new Error(`GET /api/series ${res.status}`)
  return (await res.json()) as Series[]
}

// A-013 PATCH /api/series/{id}. 보낸 필드만 바뀌고, description을 null로 보내면 설명을 지운다 (D-054).
// 실패하면 화면에 보여줄 문구를 담은 ApiError를 던진다 (같은 이름 409, 이미 삭제됨 404)
export async function updateSeries(
  id: number,
  change: { name?: string; description?: string | null },
): Promise<Series> {
  const res = await send(
    `/api/series/${id}`,
    { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(change) },
    RENAME_FAILED,
  )
  return (await res.json()) as Series
}

// A-013 DELETE /api/series/{id}. 속한 기록은 남고 시리즈 소속만 비워진다 (D-050)
export async function deleteSeries(id: number): Promise<void> {
  await send(`/api/series/${id}`, { method: 'DELETE' }, DELETE_FAILED)
}
