import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { getInsights, type Insights, type RateItem } from './insightsApi'

// 내 기록 "통계" 탭 (Q-006, D-129). 담당 팀원 1.
// 다음에 에러를 만났을 때 도움이 되는 정보만 보여 준다. 연속 기록일·레벨·추이 그래프는 넣지 않는다 (D-003).
const BACK_TO = '/records?view=stats'
const FEW = 5 // 분모가 이보다 작으면 퍼센트가 부풀려 보이지 않게 안내한다

function percent(item: RateItem): string {
  return item.rate === null ? '—' : `${Math.round(item.rate * 100)}%`
}

function fewNote(item: RateItem) {
  return item.denominator > 0 && item.denominator < FEW ? <span className="insight-few"> (기록이 적어요)</span> : null
}

// 주소의 날짜(2026-11-05T…)를 "11/5"로 줄인다
function shortDate(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${Number(m[1])}/${Number(m[2])}` : iso
}

function InsightsView() {
  const [data, setData] = useState<Insights | null>(null)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setFailed(false)
    getInsights(controller.signal)
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [reloadKey])

  if (failed) {
    return (
      <p className="record-state record-error">
        통계를 불러오지 못했어요.
        <button type="button" className="btn-secondary" onClick={() => setReloadKey((k) => k + 1)}>
          다시 시도
        </button>
      </p>
    )
  }
  if (!data) return <p className="record-state">불러오는 중…</p>
  if (data.resolve_rate.denominator === 0) return <p className="record-state">기록이 쌓이면 여기에 통계가 보여요.</p>

  const { resolve_rate: resolve, reuse_rate: reuse, apply_success: apply } = data

  return (
    <div className="insights">
      <div className="insight-cards">
        <Link className="insight-card" to="/records?status=resolved">
          <span className="insight-name">해결률</span>
          <span className="insight-big">
            {percent(resolve)}
            {fewNote(resolve)}
          </span>
          <span className="insight-sub">
            {resolve.numerator}/{resolve.denominator}건
          </span>
        </Link>

        <div className="insight-card">
          <span className="insight-name">재사용 해결</span>
          <span className="insight-big">{reuse.numerator}회</span>
          <span className="insight-sub">
            {reuse.rate === null ? '아직 해결한 기록이 없어요' : `해결의 ${percent(reuse)}`}
            {fewNote(reuse)}
          </span>
        </div>

        <div className="insight-card">
          <span className="insight-name">써 보기 성공률</span>
          <span className="insight-big">
            {percent(apply)}
            {fewNote(apply)}
          </span>
          <span className="insight-sub">
            {apply.rate === null
              ? `아직 없어요 · ${shortDate(data.apply_since)} 이후`
              : `${apply.denominator}번 중 ${apply.numerator}번 · ${shortDate(data.apply_since)} 이후`}
          </span>
        </div>

        <Link className="insight-card" to="/records?stale=1">
          <span className="insight-name">
            {data.stale_unresolved > 0 && <span className="insight-dot" aria-hidden="true" />}
            오래된 미해결
          </span>
          <span className="insight-big">{data.stale_unresolved}개</span>
          <span className="insight-sub">14일 이상 지난 미해결</span>
        </Link>
      </div>

      <section className="insight-section" aria-labelledby="insight-top">
        <h2 id="insight-top" className="insight-title">
          자주 만나는 에러
        </h2>
        {data.top_errors.length === 0 ? (
          <p className="insight-empty">아직 에러 기록이 없어요.</p>
        ) : (
          <ul className="insight-top">
            {data.top_errors.map((group, i) => {
              const open = openIdx === i
              return (
                <li key={i}>
                  <button
                    type="button"
                    className="insight-top-row"
                    aria-expanded={open}
                    onClick={() => setOpenIdx(open ? null : i)}
                  >
                    <span className="insight-top-title">{group.title}</span>
                    <span className="insight-top-meta">
                      {group.count}건 · 해결 {group.resolved} · 미해결 {group.unresolved}
                    </span>
                  </button>
                  {open && (
                    <ul className="insight-top-records">
                      {group.records.map((r) => (
                        <li key={r.id}>
                          <Link to={`/records/${r.id}`} state={{ backTo: BACK_TO }}>
                            #{r.id} · {shortDate(r.created_at)} · {r.status === 'resolved' ? '해결' : '미해결'}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="insight-section" aria-labelledby="insight-tags">
        <h2 id="insight-tags" className="insight-title">
          태그별 미해결
        </h2>
        {data.tag_unresolved.length === 0 ? (
          <p className="insight-empty">태그가 붙은 기록이 아직 없어요.</p>
        ) : (
          <ul className="insight-tags">
            {data.tag_unresolved.map((t) => (
              <li key={t.id}>
                <Link className="insight-tag-row" to={`/records?tag_id=${t.id}&status=unresolved`}>
                  <span className="insight-tag-name">{t.name}</span>
                  <span className="insight-bar" aria-hidden="true">
                    <span className="insight-bar-fill" style={{ width: `${(t.unresolved / t.total) * 100}%` }} />
                  </span>
                  <span className="insight-tag-count">
                    미해결 {t.unresolved} / {t.total}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="insight-avg">
        {data.avg_attempts_fresh === null
          ? '새로 푼 에러가 아직 없어요.'
          : `새로 푼 에러는 평균 ${data.avg_attempts_fresh}번 시도 만에 해결했어요 (재사용 제외)`}
      </p>
    </div>
  )
}

export default InsightsView
