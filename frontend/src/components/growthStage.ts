// 사이드바 성장 식물의 단계 계산 (D-155). 해결 수(A-017 resolved)에서 그때그때 계산하고 저장하지 않는다.

export const GROWTH_STAGES = 5

// 1 ~ 5단계. 10개마다 오르고 40개 이상은 5단계다.
export function growthStage(resolved: number): number {
  return Math.min(Math.floor(resolved / 10), GROWTH_STAGES - 1) + 1
}

// 다음 단계까지 남은 개수. 5단계에서는 쓰지 않는다.
export function untilNextStage(resolved: number): number {
  return 10 - (resolved % 10)
}
