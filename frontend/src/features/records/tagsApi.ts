// 태그 API 호출 (팀원 1). 컴포넌트에서 fetch를 직접 쓰지 않고 이 파일을 거친다.

// A-004 GET /api/tags 응답 항목 (API-SPEC_4 6절)
export type Tag = {
  id: number
  name: string
  created_at: string
}

// 자동 완성용 전체 목록, 이름순. 서버 오류·네트워크 오류면 예외를 던지므로 호출하는 쪽에서 처리한다.
export async function fetchTags(signal?: AbortSignal): Promise<Tag[]> {
  const res = await fetch('/api/tags', { signal })
  if (!res.ok) throw new Error(`GET /api/tags ${res.status}`)
  return (await res.json()) as Tag[]
}
