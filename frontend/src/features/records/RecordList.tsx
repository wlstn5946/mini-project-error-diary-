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
}

// 항목의 내용: 윗줄에 상태 배지와 제목(첫 줄), 아랫줄에 시리즈·날짜·시도 횟수·태그. 모든 목록이 같이 쓴다.
export function RecordItemContent({ item, showDate = false, showSeries = true }: ContentProps) {
  return (
    <span className="record-main">
      <span className="record-head">
        <span className={`status-badge ${item.status}`}>{STATUS_LABELS[item.status]}</span>
        {/* 오래된 기록(미해결 + 등록 14일 이상)은 깜빡이는 빨간 불로 알린다 (D-078) */}
        {item.is_stale && <StaleDot label="등록한 지 14일 이상 지난 미해결 기록" />}
        <span className="record-title">{firstLine(item.error_message)}</span>
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

function RecordList({ items, backTo, flat = false }: Props) {
  // 날짜 제목 없이 한 줄로 늘어놓는 목록 (태그별 보기)
  if (flat) {
    return (
      <ul className="record-items">
        {items.map((item) => (
          <li key={item.id}>
            <Link className="record-item" to={`/records/${item.id}`} state={{ backTo }}>
              <RecordItemContent item={item} showDate />
            </Link>
          </li>
        ))}
      </ul>
    )
  }

  // 서버가 최근 등록 순으로 주므로 순서대로 날짜별로 묶으면 최근 날짜가 위에 온다
  const groups: { date: string; items: ErrorListItem[] }[] = []
  for (const item of items) {
    const date = item.created_at.slice(0, 10)
    const last = groups.at(-1)
    if (last?.date === date) last.items.push(item)
    else groups.push({ date, items: [item] })
  }

  return (
    <div className="record-list">
      {groups.map((group) => (
        <section key={group.date} aria-label={dateLabel(group.date)}>
          <h2 className="record-date">
            {dateLabel(group.date)} <span className="record-date-count">{group.items.length}개</span>
          </h2>
          <ul className="record-items">
            {group.items.map((item) => (
              <li key={item.id}>
                <Link className="record-item" to={`/records/${item.id}`} state={{ backTo }}>
                  <RecordItemContent item={item} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default RecordList
