import { RESULT_LABELS } from '../solve/solveApi'
import { STATUS_LABELS, type ErrorDetail } from './errorsApi'

// 에러 일기 내보내기: Markdown 본문과 파일 이름 (S-003, D-079 예정). 화면 코드와 섞지 않는 순수 함수만 둔다.
// 내용은 화면이 이미 불러온 A-009 응답(detail)으로만 만든다. 저장하지 않은 편집 값은 들어오지 않는다.

const TITLE_MAX = 80
const FILE_TITLE_MAX = 50

// 제목은 에러 메시지의 첫 줄 (목록·상세와 같은 규칙)
function firstLine(message: string) {
  return message.split('\n').find((line) => line.trim()) ?? message
}

// 글자 수로 자른다. 이모지 같은 글자가 반으로 쪼개지지 않게 코드 포인트 단위로 센다.
function truncate(text: string, max: number) {
  const chars = Array.from(text)
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : text
}

// 한국 시간 "2026-10-27 14:05". 브라우저 시간대와 상관없이 같은 값이 나온다 (D-015)
function formatDateTime(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}

// API의 한국 시간 문자열(D-015)을 그대로 잘라 쓴다. "2026-10-27T14:05:00+09:00" → "2026-10-27 14:05"
function formatIso(iso: string) {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
}

// 에러 메시지를 감싸는 펜스. 메시지 안의 가장 긴 백틱 묶음보다 하나 더 길게(최소 3개) 해서 코드 블록이 중간에 끊기지 않게 한다.
function codeBlock(text: string) {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}\n${text}\n${fence}`
}

// 사용자가 쓴 글은 이스케이프하지 않고 그대로 둔다(사용자가 쓴 Markdown을 살린다).
// 대신 줄바꿈이 미리보기에서 한 줄로 합쳐지지 않게, 이어지는 줄 끝에 공백 두 개(강제 줄바꿈)를 붙인다.
function userText(text: string) {
  const lines = text.replace(/\r\n?/g, '\n').trim().split('\n')
  return lines.map((line, i) => (line.trim() && lines[i + 1]?.trim() ? `${line.trimEnd()}  ` : line)).join('\n')
}

// 값이 없는 칸은 칸째로 뺀다. 빈 문자열(공백뿐 포함)도 값이 없는 것으로 본다.
function section(title: string, body: string | null | undefined) {
  const text = body?.trim()
  return text ? [`## ${title}`, userText(text)] : []
}

export function toMarkdown(detail: ErrorDetail, now: Date = new Date()): string {
  const message = detail.error_message.replace(/\r\n?/g, '\n').trimEnd()
  const title = truncate(firstLine(message).trim().replace(/\s+/g, ' '), TITLE_MAX)

  const info = [`- 상태: ${STATUS_LABELS[detail.status]}`]
  if (detail.series) {
    const order = detail.series_order != null ? ` (${detail.series_order}번째)` : ''
    info.push(`- 시리즈: ${detail.series.name}${order}`)
  }
  if (detail.tags.length > 0) info.push(`- 태그: ${detail.tags.map((tag) => `#${tag.name}`).join(' ')}`)
  info.push(`- 기록한 날짜: ${formatIso(detail.created_at)}`)
  if (detail.resolved_at) info.push(`- 해결한 날짜: ${formatIso(detail.resolved_at)}`)

  const attempts = [...detail.attempts]
    .sort((a, b) => a.seq - b.seq)
    .map((a) => `### 시도 ${a.seq} · ${RESULT_LABELS[a.result]}\n${formatIso(a.created_at)}\n\n${userText(a.action)}`)

  const blocks = [
    `# ${title}`,
    info.join('\n'),
    '## 에러 메시지',
    codeBlock(message),
    ...section('상황', detail.situation),
    ...(attempts.length > 0 ? ['## 시도 기록', ...attempts] : []),
    ...section('내 한 줄 정리', detail.summary),
    ...section('AI 피드백', detail.ai_feedback),
    `---\n\n에러 일기에서 내보냄 · ${formatDateTime(now)}`,
  ]
  return `${blocks.join('\n\n')}\n`
}

// "error-diary-{id}-{정리한 제목}.{ext}". 파일 이름에 못 쓰는 글자(: / \ * ? " < > |)·따옴표·공백·줄바꿈·제어 문자는 -로 바꾸고,
// 연속된 -는 하나로, 제목 부분은 50자로 자른다. 제목이 비면 "error-diary-{id}.{ext}".
export function exportFileName(detail: ErrorDetail, ext: 'md' | 'pdf'): string {
  const cleaned = firstLine(detail.error_message)
    .replace(/[\s:/\\*?"'<>|\p{Cc}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  const title = Array.from(cleaned).slice(0, FILE_TITLE_MAX).join('').replace(/-+$/g, '')
  return `error-diary-${detail.id}${title ? `-${title}` : ''}.${ext}`
}
