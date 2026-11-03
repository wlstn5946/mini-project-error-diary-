// 태그 API 호출 (팀원 1). 컴포넌트에서 fetch를 직접 쓰지 않고 이 파일을 거친다.
import { DELETE_FAILED, GONE_OR_TAKEN, RENAME_FAILED, jsonInit, request } from '../../api'

// A-004 GET /api/tags 응답 항목 (API-SPEC_7 6절)
export type Tag = {
  id: number
  name: string
  // 이 태그가 붙은 에러 수 (D-050)
  error_count: number
  created_at: string
}

// 자동 완성용 전체 목록, 이름순. 서버 오류·네트워크 오류면 예외를 던지므로 호출하는 쪽에서 처리한다.
export async function fetchTags(signal?: AbortSignal): Promise<Tag[]> {
  const res = await request('/api/tags', { signal })
  return (await res.json()) as Tag[]
}

// A-012 PATCH /api/tags/{id}. 실패하면 화면에 보여줄 문구를 담은 ApiError를 던진다 (같은 이름 409, 이미 삭제됨 404)
export async function renameTag(id: number, name: string): Promise<Tag> {
  const res = await request(`/api/tags/${id}`, jsonInit('PATCH', { name }), RENAME_FAILED, GONE_OR_TAKEN)
  return (await res.json()) as Tag
}

// A-012 DELETE /api/tags/{id}. 쓰이는 태그도 지울 수 있다 (D-050)
export async function deleteTag(id: number): Promise<void> {
  await request(`/api/tags/${id}`, { method: 'DELETE' }, DELETE_FAILED, GONE_OR_TAKEN)
}
