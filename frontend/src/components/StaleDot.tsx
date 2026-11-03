// 깜빡이는 작은 빨간 불. 등록한 지 14일 이상 지난 미해결 기록("오래된 기록")이 있다는 표시다 (D-078).
// "오래된 기록" 버튼, 사이드바 미해결 칸, 목록 항목이 같이 쓴다. 모양과 깜빡임은 index.css의 .stale-dot이 정한다.
// 불은 눈으로만 보여서 스크린 리더용 이름(label)과 마우스를 올렸을 때 설명(title)을 같이 준다.

type Props = {
  label: string
}

function StaleDot({ label }: Props) {
  return <span className="stale-dot" role="img" aria-label={label} title={label} />
}

export default StaleDot
