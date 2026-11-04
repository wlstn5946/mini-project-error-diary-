import { keyLine } from '../errorText'

// 에러 메시지를 터미널처럼 보여주고 핵심 줄(D-117)만 강조한다. 복사하면 원문 그대로다.
// 핵심 줄이 없으면(index -1) 강조하지 않는다.
export default function ErrorMessageView({ text }: { text: string }) {
  // 줄바꿈(\r\n·\r·\n)을 줄 끝에 붙인 채로 나눠, keyLine의 줄 번호와 같은 줄을 센다.
  const lines = text.split(/(?<=\n)|(?<=\r)(?!\n)/)
  const { index } = keyLine(text)
  return (
    <pre className="code-view">
      {lines.map((line, i) => (
        <span key={i} className={i === index ? 'code-line code-line-error' : 'code-line'}>
          {line}
        </span>
      ))}
    </pre>
  )
}
