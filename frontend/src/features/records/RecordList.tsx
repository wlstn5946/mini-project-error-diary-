import { useState } from 'react'
import { Link } from 'react-router'
import StaleDot from '../../components/StaleDot'
import { STATUS_LABELS, type ErrorListItem } from './errorsApi'

// 내 기록 날짜별 목록 (S-002, 시안 내기록창 ①). 항목을 누르면 상세(/records/:id, D-037)로 간다.

type Props = {
  items: ErrorListItem[]
  // 상세에서 "← 내 기록"으로 돌아올 목록 주소 (필터 포함)
  backTo: string
  // true면 날짜 제목 없이 한 줄로 보여준다 (태그별 보기)
  flat?: boolean
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 제목은 에러 메시지의 첫 줄 (해결 완료 영역과 같은 규칙)
function firstLine(message: string) {
  return message.split('\n').find((line) => line.trim()) ?? message
}

// "2026-10-30" → "10월 30일 (목)". created_at은 한국 시간(D-015)이라 날짜 부분을 그대로 쓴다.
// 요일은 브라우저 시간대와 상관없게 UTC로 계산한다.
function dateLabel(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return `${m}월 ${d}일 (${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`
}

// "2026-10-30T…" → "10/30"
function shortDate(iso: string) {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${m}/${d}`
}

type ContentProps = {
  item: ErrorListItem
  // 날짜 제목이 없는 목록(태그별, 시리즈별)에서는 항목에 날짜를 보여준다
  showDate?: boolean
  // 시리즈별 보기에서는 시리즈 이름이 겹치므로 숨긴다
  showSeries?: boolean
  // 시리즈별 보기는 묶지 않으므로 재사용 기록에 표시용 "재사용" 배지만 붙인다 (D-081)
  reuseBadge?: boolean
}

// 항목의 내용: 윗줄에 상태 배지와 제목(첫 줄), 아랫줄에 시리즈·날짜·시도 횟수·태그. 모든 목록이 같이 쓴다.
export function RecordItemContent({ item, showDate = false, showSeries = true, reuseBadge = false }: ContentProps) {
  return (
    <span className="record-main">
      <span className="record-head">
        <span className={`status-badge ${item.status}`}>{STATUS_LABELS[item.status]}</span>
        {/* 오래된 기록(미해결 + 등록 14일 이상)은 깜빡이는 빨간 불로 알린다 (D-078) */}
        {item.is_stale && <StaleDot label="등록한 지 14일 이상 지난 미해결 기록" />}
        <span className="record-title">{firstLine(item.error_message)}</span>
        {reuseBadge && item.reused_from_id !== null && <span className="reuse-badge">재사용</span>}
      </span>
      <span className="record-meta">
        {showSeries && item.series && <span className="record-series">{item.series.name}</span>}
        {showDate && <span>{shortDate(item.created_at)}</span>}
        <span>시도 {item.attempt_count}회</span>
        {item.tags.map((tag) => (
          <span key={tag.id} className="record-tag">
            #{tag.name}
          </span>
        ))}
      </span>
    </span>
  )
}

// 받은 목록 안에서 재사용 기록을 원본 아래로 묶는다 (D-081). 묶기는 이 목록 안에서만 한다.
// 원본이 목록에 없는 재사용 기록(예: 태그 필터에 자식만 걸림)은 묶지 않고 단독 줄로 두고 "원본 #N" 링크를 단다.
type Row = { item: ErrorListItem; children: ErrorListItem[] }

function buildRows(items: ErrorListItem[]): Row[] {
  const ids = new Set(items.map((item) => item.id))
  const childrenOf = new Map<number, ErrorListItem[]>()
  const rows: Row[] = []
  for (const item of items) {
    if (item.reused_from_id !== null && ids.has(item.reused_from_id)) {
      childrenOf.set(item.reused_from_id, [...(childrenOf.get(item.reused_from_id) ?? []), item])
    } else {
      rows.push({ item, children: [] })
    }
  }
  for (const row of rows) {
    // 상세 타임라인과 같게 날짜순(오래된 것 먼저)으로 둔다
    row.children = [...(childrenOf.get(row.item.id) ?? [])].sort(
      (a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id,
    )
  }
  return rows
}

type RowProps = {
  row: Row
  backTo: string
  // 날짜 제목이 없는 목록(태그별)에서는 항목에 날짜를 보여준다
  showDate: boolean
}

function RecordRow({ row, backTo, showDate }: RowProps) {
  // 접힘이 기본이다 (D-081)
  const [open, setOpen] = useState(false)
  const { item, children } = row
  return (
    <li>
      <div className="record-row">
        <Link className="record-item" to={`/records/${item.id}`} state={{ backTo }}>
          <RecordItemContent item={item} showDate={showDate} />
        </Link>
        {item.reused_from_id !== null && (
          <Link className="reuse-origin-link" to={`/records/${item.reused_from_id}`} state={{ backTo }}>
            원본 #{item.reused_from_id}
          </Link>
        )}
        {item.reuse_count > 0 &&
          (children.length > 0 ? (
            <button
              type="button"
              className="reuse-badge"
              aria-expanded={open}
              aria-label={`재사용 ${item.reuse_count}, 재사용 기록 ${open ? '접기' : '펼치기'}`}
              onClick={() => setOpen(!open)}
            >
              재사용 {item.reuse_count} {open ? '▴' : '▾'}
            </button>
          ) : (
            // 재사용 기록이 이 결과에 없으면 펼칠 것이 없어 표시만 한다
            <span className="reuse-badge">재사용 {item.reuse_count}</span>
          ))}
      </div>
      {open && (
        <ul className="record-children">
          {children.map((child) => (
            <li key={child.id}>
              <Link className="record-item" to={`/records/${child.id}`} state={{ backTo }}>
                <RecordItemContent item={child} showDate />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function RecordList({ items, backTo, flat = false }: Props) {
  const rows = buildRows(items)

  // 날짜 제목 없이 한 줄로 늘어놓는 목록 (태그별 보기)
  if (flat) {
    return (
      <ul className="record-items">
        {rows.map((row) => (
          <RecordRow key={row.item.id} row={row} backTo={backTo} showDate />
        ))}
      </ul>
    )
  }

  // 서버가 최근 등록 순으로 주므로 순서대로 날짜별로 묶으면 최근 날짜가 위에 온다. 접힌 재사용 기록은 원본의 날짜 아래에 들어간다.
  const groups: { date: string; rows: Row[] }[] = []
  for (const row of rows) {
    const date = row.item.created_at.slice(0, 10)
    const last = groups.at(-1)
    if (last?.date === date) last.rows.push(row)
    else groups.push({ date, rows: [row] })
  }

  return (
    <div className="record-list">
      {groups.map((group) => (
        <section key={group.date} aria-label={dateLabel(group.date)}>
          <h2 className="record-date">
            {dateLabel(group.date)} <span className="record-date-count">{group.rows.length}개</span>
          </h2>
          <ul className="record-items">
            {group.rows.map((row) => (
              <RecordRow key={row.item.id} row={row} backTo={backTo} showDate={false} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default RecordList
