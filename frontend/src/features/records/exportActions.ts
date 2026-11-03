import { exportFileName, toMarkdown } from './exportMarkdown'
import type { ErrorDetail } from './errorsApi'

// 에러 일기 내보내기의 브라우저 동작: Markdown 내려받기와 PDF(인쇄) (S-003, D-079 예정).
// 파일 내용·이름은 exportMarkdown.ts의 순수 함수가 만들고, 여기서는 브라우저 API만 부른다.

// 인쇄할 때만 body에 붙는 클래스. 인쇄용 CSS는 이 클래스 안에서만 적용된다 (records.css)
export const PRINTING_CLASS = 'printing-record'

// Markdown을 파일로 내려받는다. 실패하면 예외를 던지므로 부르는 쪽이 안내를 보여준다.
export function downloadMarkdown(detail: ErrorDetail) {
  const blob = new Blob([toMarkdown(detail)], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = exportFileName(detail, 'md')
    // 일부 브라우저는 문서에 붙어 있어야 클릭이 내려받기로 처리된다
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    // 내려받기가 시작되기 전에 주소가 풀리지 않게 한 박자 늦춘다
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

// 인쇄 대화상자가 열려 있는 동안 다시 부르면 "원래 제목"이 바뀐 제목으로 저장되므로 한 번에 하나만 처리한다
let printing = false

// 브라우저 인쇄로 PDF를 만든다. 사용자가 인쇄 대화상자에서 "PDF로 저장"을 고른다.
// 탭 제목을 파일 이름으로 잠시 바꾼다. 많은 브라우저가 이 값을 PDF 기본 파일 이름으로 쓰지만 브라우저마다 다를 수 있다.
export function printRecord(detail: ErrorDetail) {
  if (printing) return
  printing = true
  const originalTitle = document.title

  // 인쇄를 마치거나 취소하면 클래스와 제목을 되돌린다. 여러 번 불려도 한 번만 되돌린다.
  function restore() {
    window.removeEventListener('afterprint', restore)
    document.body.classList.remove(PRINTING_CLASS)
    document.title = originalTitle
    printing = false
  }

  document.body.classList.add(PRINTING_CLASS)
  document.title = exportFileName(detail, 'pdf').replace(/\.pdf$/, '')
  window.addEventListener('afterprint', restore)
  try {
    window.print()
  } catch (err) {
    // 인쇄를 시작하지 못했으면 afterprint가 오지 않으므로 바로 되돌리고 부르는 쪽에 알린다
    restore()
    throw err
  }
}
