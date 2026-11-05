import { useState } from 'react'
import aiLoading from '../assets/mascot/ai-loading.svg'
import errorSign from '../assets/mascot/error-sign.svg'
import solvedSprout from '../assets/mascot/solved-sprout.svg'
import reusedChick from '../assets/mascot/reused-chick.svg'

// 카피바라 캐릭터 그림 (D-154). 감정이 움직이는 순간에만 쓰고, 한 화면에 하나만 둔다.
// 장식이라 스크린 리더가 읽지 않는다(안내는 옆의 글자가 맡는다). 불러오기에 실패하면 아무것도 그리지 않는다.

const SOURCES = {
  'ai-loading': aiLoading,
  'error-sign': errorSign,
  'solved-sprout': solvedSprout,
  'reused-chick': reusedChick,
} as const

export type MascotName = keyof typeof SOURCES

function Mascot({ name, size = 160 }: { name: MascotName; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <img
      className="mascot"
      src={SOURCES[name]}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      decoding="async"
      onError={() => setFailed(true)}
    />
  )
}

export default Mascot
