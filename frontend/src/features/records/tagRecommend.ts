// 에러 메시지를 읽고 내 태그 중에서 붙일 만한 태그를 추천한다 (규칙 기반, D-120).
// 화면 코드와 섞지 않는 순수 함수만 둔다. Gemini·새 API 없이 이미 불러온 태그 목록(A-004, 별칭 포함)만 쓴다.
import { keyLine } from '../../errorText'
import type { Tag } from './tagsApi'

// 앞뒤 공백 → 앞의 # → 다시 앞뒤 공백 순서로 지운다. (D-019)
export function normalizeTag(raw: string) {
  return raw.trim().replace(/^#+/, '').trim()
}

// 같은 태그 판단용 값. 서버의 name_key와 같은 규칙이다. (D-019)
export function tagKey(name: string) {
  return normalizeTag(name).toLowerCase()
}

export type Recommendation = { tag: { id: number; name: string }; reason: string }

type Input = {
  message: string
  allTags: Tag[]
  // ① 비슷한 기록의 태그 (D-081)
  similarTags: { id: number; name: string }[]
  chosenKeys: ReadonlySet<string>
  max: number
}

const HANGUL = /[ㄱ-ㆎ가-힣]/
const isLatinOrDigit = (c: string | undefined) => c !== undefined && /[A-Za-z0-9]/.test(c)
const isLatin = (c: string | undefined) => c !== undefined && /[A-Za-z]/.test(c)

// 메시지 안에서 이름이 맞은 원문 조각을 돌려준다. 못 찾으면 null.
// 한글이 든 이름은 조사가 붙으므로 포함 여부로, 그 밖의 이름은 단어 경계로 맞춘다.
// 단어 경계: 앞 글자가 영문자·숫자가 아니고, 뒤 글자가 영문자가 아닐 때(뒤의 숫자는 허용: python3.12).
// indexOf로 찾으므로 C++, .NET, Node.js 같은 특수 문자를 이스케이프할 필요가 없다.
function findInMessage(message: string, lowerMessage: string, key: string): string | null {
  const byContain = HANGUL.test(key)
  let from = 0
  while (from <= lowerMessage.length - key.length) {
    const at = lowerMessage.indexOf(key, from)
    if (at < 0) return null
    const end = at + key.length
    if (byContain || (!isLatinOrDigit(lowerMessage[at - 1]) && !isLatin(lowerMessage[end]))) {
      return message.slice(at, end)
    }
    from = at + 1
  }
  return null
}

// 핵심 줄의 따옴표('…' 또는 "…") 안 이름 전체와, 그것을 . / 로 나눈 조각들 (원문 표기)
function quotedNames(line: string): string[] {
  const out: string[] = []
  for (const m of line.matchAll(/'([^']+)'|"([^"]+)"/g)) {
    const whole = (m[1] ?? m[2]).trim()
    out.push(whole, ...whole.split(/[./]/).map((p) => p.trim()))
  }
  return out.filter((s) => s !== '')
}

// 근거 순서: ① 비슷한 기록 → ② 이름 → ③ 별칭 → ④ 핵심 줄의 따옴표 안 이름.
// 같은 태그는 가장 앞 근거 하나로 한 번만 보여준다. 이미 붙인 태그는 뺀다.
export function recommendTags({ message, allTags, similarTags, chosenKeys, max }: Input): Recommendation[] {
  const result: Recommendation[] = []
  const seen = new Set<string>(chosenKeys)
  const add = (tag: { id: number; name: string }, reason: string) => {
    const key = tagKey(tag.name)
    if (seen.has(key)) return
    seen.add(key)
    result.push({ tag: { id: tag.id, name: tag.name }, reason })
  }

  // ① (이름 길이 제한 없음)
  for (const t of similarTags) add(t, '비슷한 기록에 붙은 태그예요')

  const lowerMessage = message.toLowerCase()
  // 정규화한 이름이 1글자인 태그·별칭은 ②③④에서 뺀다
  const usable = (name: string) => tagKey(name).length >= 2

  if (message.trim() !== '') {
    for (const t of allTags) {
      if (!usable(t.name)) continue
      const hit = findInMessage(message, lowerMessage, tagKey(t.name))
      if (hit) add(t, `에러에 '${hit}'이(가) 있어요`)
    }
    for (const t of allTags) {
      for (const a of t.aliases) {
        if (!usable(a.name)) continue
        const hit = findInMessage(message, lowerMessage, tagKey(a.name))
        if (hit) {
          add(t, `에러에 별칭 '${hit}'이(가) 있어요`)
          break
        }
      }
    }

    const names = quotedNames(keyLine(message).text)
    if (names.length > 0) {
      for (const t of allTags) {
        const keys = new Set([t.name, ...t.aliases.map((a) => a.name)].filter(usable).map(tagKey))
        const hit = names.find((n) => keys.has(tagKey(n)))
        if (hit) add(t, `핵심 줄의 이름 '${hit}'와(과) 같아요`)
      }
    }
  }

  return result.slice(0, max)
}
