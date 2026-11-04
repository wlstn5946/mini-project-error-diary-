// 에러 메시지를 터미널처럼 보여주고 마지막 비어 있지 않은 줄(실제 에러)만 강조한다. 복사하면 원문 그대로다.
export default function ErrorMessageView({ text }: { text: string }) {
  const lines = text.split('\n')
  let last = lines.length - 1
  while (last > 0 && lines[last].trim() === '') last--
  return (
    <pre className="code-view">
      {lines.map((line, i) => (
        <span key={i} className={i === last ? 'code-line code-line-error' : 'code-line'}>
          {line}
          {i < lines.length - 1 ? '\n' : ''}
        </span>
      ))}
    </pre>
  )
}
