import { Link } from 'react-router'
import { STATUS_LABELS, type ErrorListItem } from './errorsApi'

// 내 기록 날짜별 목록 (S-002, 시안 내기록창 ①). 항목을 누르면 상세(/records/:id, D-037)로 간다.

type Props = {
  items: ErrorListItem[]
  // 상세에서 "← 내 기록"으로 돌아올 목록 주소 (필터 포함)
  backTo: string
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

function RecordList({ items, backTo }: Props) {
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
                  <span className={`status-badge ${item.status}`}>{STATUS_LABELS[item.status]}</span>
                  <span className="record-main">
                    <span className="record-title">{firstLine(item.error_message)}</span>
                    <span className="record-meta">
                      {item.series && <span>{item.series.name}</span>}
                      <span>시도 {item.attempt_count}회</span>
                      {item.tags.map((tag) => (
                        <span key={tag.id} className="record-tag">
                          #{tag.name}
                        </span>
                      ))}
                    </span>
                  </span>
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
