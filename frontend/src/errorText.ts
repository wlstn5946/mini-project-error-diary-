// 에러 메시지의 "핵심 줄" 찾기 (D-117). 제목 표시와 비슷한 기록 유사도 보정(D-118)에 함께 쓴다.
// 저장하지 않고 필요할 때 계산한다.

const NAME = '[\\w$]+'
const ERROR_SHAPED: RegExp[] = [
  // a) 점이 들어갈 수 있는 이름 + Error / Exception / Exit / Interrupt 로 끝나는 단어
  new RegExp(`^(?:${NAME}\\.)*[\\w$]*(?:Error|Exception|Exit|Interrupt)\\b`),
  // b) 점이 하나 이상 들어간 이름 + 콜론
  new RegExp(`^${NAME}(?:\\.${NAME})+:`),
  // c) Exception in thread … (Java)
  /^Exception in thread/,
  // d) error / fatal / ERROR / FATAL / Error 다음에 : 또는 [ 또는 공백
  /^(?:error|fatal|ERROR|FATAL|Error)[:[ \t]/,
]
const STACK_LINE = /^at\s/
const GUIDE_LINE: RegExp[] = [/^(?:hint|note|help|tip):/i, STACK_LINE, /^File "/, /^[\^~]+$/]

export type KeyLine = { text: string; index: number }

// 규칙을 바꾸면 반대쪽 구현(backend/app/error_text.py)과 D-117의 테스트 사례를 함께 고친다(D-117).
// 비어 있는 메시지는 { text: '', index: -1 }이다. 화면은 이때 원문을 그대로 보여준다.
export function keyLine(message: string): KeyLine {
  const candidates: KeyLine[] = []
  message.split(/\r\n|\r|\n/).forEach((line, index) => {
    const text = line.trim()
    if (text) candidates.push({ text, index })
  })
  if (candidates.length === 0) return { text: '', index: -1 }
  for (let i = candidates.length - 1; i >= 0; i--) {
    const { text } = candidates[i]
    if (STACK_LINE.test(text)) continue
    if (ERROR_SHAPED.some((p) => p.test(text))) return candidates[i]
  }
  for (let i = candidates.length - 1; i >= 0; i--) {
    if (!GUIDE_LINE.some((p) => p.test(candidates[i].text))) return candidates[i]
  }
  return candidates[candidates.length - 1]
}
