// 시리즈 API 호출 (팀원 1). 컴포넌트에서 fetch를 직접 쓰지 않고 이 파일을 거친다.

// A-004 GET /api/series 응답 항목 (API-SPEC_3 6절)
export type Series = {
  id: number
  name: string
  description: string | null
  created_at: string
}

// 최근 만든 순 목록. 서버 오류·네트워크 오류면 예외를 던지므로 호출하는 쪽에서 처리한다.
export async function fetchSeries(signal?: AbortSignal): Promise<Series[]> {
  const res = await fetch('/api/series', { signal })
  if (!res.ok) throw new Error(`GET /api/series ${res.status}`)
  return (await res.json()) as Series[]
}
