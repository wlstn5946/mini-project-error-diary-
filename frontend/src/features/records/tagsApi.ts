// 태그 API 호출 (팀원 1). 컴포넌트에서 fetch를 직접 쓰지 않고 이 파일을 거친다.
import { DELETE_FAILED, GONE_OR_TAKEN, RENAME_FAILED, jsonInit, request } from '../../api'

// A-004 GET /api/tags 응답 항목 (API-SPEC_7 6절)
export type Tag = {
  id: number
  name: string
  // 이 태그가 붙은 에러 수 (D-050)
  error_count: number
  created_at: string
  // 이 태그의 별칭 (이름순, D-114). 합치면 합쳐진 태그 이름이 별칭이 된다 (D-113)
  aliases: { id: number; name: string }[]
}

// 태그 이름과 별칭의 최대 글자 수 (D-115). 정규화(앞뒤 공백·앞의 #을 지움)한 뒤 센다. 실제 보장은 서버가 한다.
export const TAG_NAME_MAX = 20
export const TAG_NAME_TOO_LONG = `태그 이름은 ${TAG_NAME_MAX}자까지 쓸 수 있어요.`
export const ALIAS_TOO_LONG = `별칭은 ${TAG_NAME_MAX}자까지 쓸 수 있어요.`

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

const MERGE_FAILED = '합치지 못했어요. 잠시 뒤 다시 시도해 주세요.'

// A-022 POST /api/tags/{tagId}/merge. tagId(합쳐질 태그)를 지우고 intoTagId(남을 태그)에 모은다 (D-113).
// 404는 "이미 삭제된 항목이에요.", 그 밖의 실패는 서버 안내 문구를 ApiError에 담아 던진다. 성공하면 남은 태그를 돌려준다.
export async function mergeTag(tagId: number, intoTagId: number): Promise<Tag> {
  const res = await request(`/api/tags/${tagId}/merge`, jsonInit('POST', { into_tag_id: intoTagId }), MERGE_FAILED, {
    404: GONE_OR_TAKEN[404],
  })
  return (await res.json()) as Tag
}

const ALIAS_ADD_FAILED = '별칭을 추가하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
const ALIAS_DELETE_FAILED = '별칭을 지우지 못했어요. 잠시 뒤 다시 시도해 주세요.'

// A-023 POST /api/tags/{tagId}/aliases (D-114). 태그 이름·다른 별칭과 같으면(409) 서버 안내 문구를 ApiError에 담아 던진다.
// 404는 "이미 삭제된 항목이에요."이다.
export async function addAlias(tagId: number, name: string): Promise<{ id: number; name: string }> {
  const res = await request(`/api/tags/${tagId}/aliases`, jsonInit('POST', { name }), ALIAS_ADD_FAILED, {
    404: GONE_OR_TAKEN[404],
  })
  return (await res.json()) as { id: number; name: string }
}

// A-024 DELETE /api/tags/{tagId}/aliases/{aliasId}. 기록은 영향이 없다.
export async function deleteAlias(tagId: number, aliasId: number): Promise<void> {
  await request(`/api/tags/${tagId}/aliases/${aliasId}`, { method: 'DELETE' }, ALIAS_DELETE_FAILED, {
    404: GONE_OR_TAKEN[404],
  })
}

// A-012 DELETE /api/tags/{id}. 쓰이는 태그도 지울 수 있다 (D-050)
export async function deleteTag(id: number): Promise<void> {
  await request(`/api/tags/${id}`, { method: 'DELETE' }, DELETE_FAILED, GONE_OR_TAKEN)
}
