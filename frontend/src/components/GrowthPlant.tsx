import sprout from '../assets/growth/growth-1-sprout.svg'
import leaves from '../assets/growth/growth-2-leaves.svg'
import leafy from '../assets/growth/growth-3-leafy.svg'
import bud from '../assets/growth/growth-4-bud.svg'
import bloom from '../assets/growth/growth-5-bloom.svg'
import { GROWTH_STAGES, growthStage, untilNextStage } from './growthStage'

// 사이드바 성장 식물 (D-155). 해결 수 10개마다 한 단계 자란다. 누를 수 없고 효과도 없다.
// 해결 수를 모르면(불러오기 전·실패) 그리지 않는다. 그림 파일을 못 불러오면 그림만 빠지고 문구는 남는다.

const IMAGES = [sprout, leaves, leafy, bud, bloom]

function GrowthPlant({ resolved }: { resolved: number | null }) {
  if (resolved === null) return null
  const stage = growthStage(resolved)
  const caption = stage === GROWTH_STAGES ? '활짝 피었어요' : `다음 단계까지 ${untilNextStage(resolved)}개`
  return (
    <figure className="growth-plant">
      <img
        src={IMAGES[stage - 1]}
        alt=""
        aria-hidden="true"
        width={120}
        height={120}
        decoding="async"
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
      />
      <figcaption>{caption}</figcaption>
    </figure>
  )
}

export default GrowthPlant
