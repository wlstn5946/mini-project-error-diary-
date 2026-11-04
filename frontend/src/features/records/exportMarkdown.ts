import { keyLine } from '../../errorText'
import { RESULT_LABELS } from '../solve/solveApi'
import { STATUS_LABELS, type ErrorDetail } from './errorsApi'
import type { Series } from './seriesApi'

// 에러 일기 내보내기: Markdown 본문과 파일 이름 (S-003, D-079 예정). 화면 코드와 섞지 않는 순수 함수만 둔다.
// 내용은 화면이 이미 불러온 A-009 응답(detail)으로만 만든다. 저장하지 않은 편집 값은 들어오지 않는다.

const TITLE_MAX = 80
const FILE_TITLE_MAX = 50

// 제목은 에러 메시지의 핵심 줄 (목록·상세와 같은 규칙, D-117). 핵심 줄이 없으면 원문이다.
function titleOf(message: string) {
  return keyLine(message).text || message
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
function section(level: number, title: string, body: string | null | undefined) {
  const text = body?.trim()
  return text ? [`${'#'.repeat(level)} ${title}`, userText(text)] : []
}

function normalizeMessage(detail: ErrorDetail) {
  return detail.error_message.replace(/\r\n?/g, '\n').trimEnd()
}

function titleText(detail: ErrorDetail) {
  return truncate(titleOf(normalizeMessage(detail)).trim().replace(/\s+/g, ' '), TITLE_MAX)
}

type BodyOptions = {
  // 기록 제목의 # 개수. 항목은 level+1, 시도는 level+2로 한 단계씩 내려간다 (사용자 글은 건드리지 않는다)
  level: number
  // 제목 줄에 들어갈 글 (예: "제목" 또는 "3. 제목")
  heading: string
  // 정보 줄에 "- 시리즈: …"를 넣을지 (시리즈 내보내기에서는 파일 제목과 겹쳐 뺀다)
  includeSeries: boolean
}

// 기록 하나의 본문 조각들(꼬리말 제외). 조각은 빈 줄 하나로 이어 붙인다.
function recordBody(detail: ErrorDetail, { level, heading, includeSeries }: BodyOptions): string[] {
  const message = normalizeMessage(detail)
  const item = level + 1
  const attemptLevel = level + 2

  const info = [`- 상태: ${STATUS_LABELS[detail.status]}`]
  if (includeSeries && detail.series) {
    const order = detail.series_order != null ? ` (${detail.series_order}번째)` : ''
    info.push(`- 시리즈: ${detail.series.name}${order}`)
  }
  if (detail.tags.length > 0) info.push(`- 태그: ${detail.tags.map((tag) => `#${tag.name}`).join(' ')}`)
  info.push(`- 기록한 날짜: ${formatIso(detail.created_at)}`)
  if (detail.resolved_at) info.push(`- 해결한 날짜: ${formatIso(detail.resolved_at)}`)

  const attempts = [...detail.attempts]
    .sort((a, b) => a.seq - b.seq)
    .map(
      (a) =>
        `${'#'.repeat(attemptLevel)} 시도 ${a.seq} · ${RESULT_LABELS[a.result]}\n${formatIso(a.created_at)}\n\n${userText(a.action)}`,
    )

  return [
    `${'#'.repeat(level)} ${heading}`,
    info.join('\n'),
    `${'#'.repeat(item)} 에러 메시지`,
    codeBlock(message),
    ...section(item, '상황', detail.situation),
    ...(attempts.length > 0 ? [`${'#'.repeat(item)} 시도 기록`, ...attempts] : []),
    ...section(item, '내 한 줄 정리', detail.summary),
    ...section(item, 'AI 피드백', detail.ai_feedback),
  ]
}

function footer(now: Date) {
  return `---\n\n에러 일기에서 내보냄 · ${formatDateTime(now)}`
}

export function toMarkdown(detail: ErrorDetail, now: Date = new Date()): string {
  const blocks = [...recordBody(detail, { level: 1, heading: titleText(detail), includeSeries: true }), footer(now)]
  return `${blocks.join('\n\n')}\n`
}

// 시리즈 전체를 Markdown 하나로 (D-119). details는 시리즈 안 순서(A-008) 그대로여야 한다.
export function seriesToMarkdown(series: Series, details: ErrorDetail[], now: Date = new Date()): string {
  const resolved = details.filter((d) => d.status === 'resolved').length
  const description = series.description?.trim()

  const header = [
    `# ${series.name}`,
    ...(description ? [userText(description)] : []),
    [`- 기록 ${details.length}개 (해결 ${resolved} · 미해결 ${details.length - resolved})`, `- 내보낸 날짜: ${formatDateTime(now)}`].join(
      '\n',
    ),
    '## 목차',
    details.map((d, i) => `${i + 1}. ${d.status === 'resolved' ? '✔' : '○'} ${titleText(d)}`).join('\n'),
  ]
  const records = details.map((d, i) =>
    recordBody(d, { level: 2, heading: `${i + 1}. ${titleText(d)}`, includeSeries: false }).join('\n\n'),
  )
  const blocks = [header.join('\n\n'), ...records.map((r) => `---\n\n${r}`), footer(now)]
  return `${blocks.join('\n\n')}\n`
}

// 파일 이름에 못 쓰는 글자(: / \ * ? " < > |)·따옴표·공백·줄바꿈·제어 문자는 -로 바꾸고, 연속된 -는 하나로, 50자로 자른다.
function cleanFileTitle(text: string) {
  const cleaned = text.replace(/[\s:/\\*?"'<>|\p{Cc}]+/gu, '-').replace(/^-+|-+$/g, '')
  return Array.from(cleaned).slice(0, FILE_TITLE_MAX).join('').replace(/-+$/g, '')
}

export function seriesExportFileName(series: Series): string {
  const title = cleanFileTitle(series.name)
  return `error-diary-series-${series.id}${title ? `-${title}` : ''}.md`
}

// "error-diary-{id}-{정리한 제목}.{ext}". 파일 이름에 못 쓰는 글자(: / \ * ? " < > |)·따옴표·공백·줄바꿈·제어 문자는 -로 바꾸고,
// 연속된 -는 하나로, 제목 부분은 50자로 자른다. 제목이 비면 "error-diary-{id}.{ext}".
export function exportFileName(detail: ErrorDetail, ext: 'md' | 'pdf'): string {
  const title = cleanFileTitle(titleOf(detail.error_message))
  return `error-diary-${detail.id}${title ? `-${title}` : ''}.${ext}`
}
