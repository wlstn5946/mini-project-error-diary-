// 에러 메시지로 AI(Haiku)에게 태그를 추천받는다 (A-026, D-131). 호출 횟수가 곧 요금이라 아래처럼 줄인다.
// - errorText는 이미 입력이 멈춘 뒤 300ms 값이다. 거기에 AI_DELAY_MS를 더 기다려 입력 후 약 1초에 한 번만 부른다.
// - 너무 짧은 글은 부르지 않고, 같은 글은 다시 부르지 않고(캐시), 새 글이 오면 진행 중인 요청은 취소한다.
// - 실패하면 빈 배열이고 캐시하지 않는다. 화면에 안내를 띄우지 않는다.
import { useEffect, useRef, useState } from 'react'
import { requestTagSuggestions } from './solveApi'

const AI_DELAY_MS = 700
const MIN_LENGTH = 10

export function useAiTagSuggestions(errorText: string): string[] {
  const text = errorText.trim()
  const cache = useRef(new Map<string, string[]>())
  const [done, setDone] = useState<{ text: string; tags: string[] }>({ text: '', tags: [] })

  useEffect(() => {
    if (text.length < MIN_LENGTH) return
    const cached = cache.current.get(text)
    if (cached) {
      setDone({ text, tags: cached })
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      requestTagSuggestions(text, controller.signal).then((tags) => {
        if (tags === null || controller.signal.aborted) return
        cache.current.set(text, tags)
        setDone({ text, tags })
      })
    }, AI_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [text])

  // 지금 글에 대한 결과만 쓴다. 글이 바뀐 직후에는 이전 결과를 보여주지 않는다.
  return done.text === text && text.length >= MIN_LENGTH ? done.tags : []
}
