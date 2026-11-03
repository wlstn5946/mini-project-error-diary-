// 시리즈 API 호출 (팀원 1). 컴포넌트에서 fetch를 직접 쓰지 않고 이 파일을 거친다.
import { DELETE_FAILED, GONE_OR_TAKEN, RENAME_FAILED, jsonInit, request } from '../../api'
import type { ErrorListItem } from './errorsApi'

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
  const res = await request('/api/series', { signal })
  return (await res.json()) as Series[]
}

// A-015 POST /api/series. 이름은 필수, 설명은 없거나 비우면 null (D-061).
// 실패하면 화면에 보여줄 문구를 담은 ApiError를 던진다 (같은 이름 409)
export async function createSeries(input: { name: string; description: string | null }): Promise<Series> {
  const res = await request('/api/series', jsonInit('POST', input), RENAME_FAILED, GONE_OR_TAKEN)
  return (await res.json()) as Series
}

// A-013 PATCH /api/series/{id}. 보낸 필드만 바뀌고, description을 null로 보내면 설명을 지운다 (D-054).
// 실패하면 화면에 보여줄 문구를 담은 ApiError를 던진다 (같은 이름 409, 이미 삭제됨 404)
export async function updateSeries(
  id: number,
  change: { name?: string; description?: string | null },
): Promise<Series> {
  const res = await request(`/api/series/${id}`, jsonInit('PATCH', change), RENAME_FAILED, GONE_OR_TAKEN)
  return (await res.json()) as Series
}

// A-013 DELETE /api/series/{id}. 속한 기록은 남고 시리즈 소속만 비워진다 (D-050)
export async function deleteSeries(id: number): Promise<void> {
  await request(`/api/series/${id}`, { method: 'DELETE' }, DELETE_FAILED, GONE_OR_TAKEN)
}

const REORDER_FAILED = '순서를 바꾸지 못했어요. 다시 시도해 주세요.'

// A-008 GET /api/errors?series_id=N. 그 시리즈의 기록을 시리즈 안 순서대로 (D-042, D-051).
// 서버 오류·네트워크 오류면 예외를 던지므로 호출하는 쪽에서 처리한다.
export async function listSeriesErrors(seriesId: number, signal?: AbortSignal): Promise<ErrorListItem[]> {
  const res = await request(`/api/errors?series_id=${seriesId}`, { signal })
  return (await res.json()) as ErrorListItem[]
}

// A-014 PUT /api/series/{id}/order. 그 시리즈의 기록 ID 전체를 원하는 순서로 보내 바꿔 끼운다 (D-051).
// 실패하면 화면에 보여줄 문구를 담은 ApiError를 던진다 (없는 시리즈 404, 기록이 맞지 않으면 422)
export async function reorderSeries(seriesId: number, errorIds: number[]): Promise<ErrorListItem[]> {
  const res = await request(`/api/series/${seriesId}/order`, jsonInit('PUT', { error_ids: errorIds }), REORDER_FAILED, GONE_OR_TAKEN)
  return (await res.json()) as ErrorListItem[]
}
