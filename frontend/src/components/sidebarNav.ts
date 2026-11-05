// 사이드바 "내 기록" 하위 보기 3개와 현재 위치 판단 (D-146). Sidebar(부모 강조)와 SidebarStats(하위 항목 강조)가 같이 쓴다.
// 하위 항목은 "내 기록"의 보기 바로가기이고 최상위 메뉴가 아니다(D-005 해석).

export const SUB_VIEWS = [
  { key: 'all', label: '전체', to: '/records' },
  { key: 'resolved', label: '해결', to: '/records?status=resolved' },
  { key: 'unresolved', label: '미해결', to: '/records?status=unresolved' },
] as const

export type SubViewKey = (typeof SUB_VIEWS)[number]['key']

// 주소의 경로와 쿼리 문자열이 하위 항목과 정확히 같을 때만 그 항목이다. 태그·검색·stale 등 다른 조건이 붙으면 해당 없음.
export function matchSubView(pathname: string, search: string): SubViewKey | null {
  for (const view of SUB_VIEWS) {
    const [path, query = ''] = view.to.split('?')
    if (pathname === path && search === (query ? `?${query}` : '')) return view.key
  }
  return null
}

export function isRecordsPath(pathname: string): boolean {
  return pathname === '/records' || pathname.startsWith('/records/')
}
