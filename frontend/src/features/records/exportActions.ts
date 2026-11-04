import { exportFileName, seriesExportFileName, seriesToMarkdown, toMarkdown } from './exportMarkdown'
import { getError, type ErrorDetail } from './errorsApi'
import { listSeriesErrors, type Series } from './seriesApi'

// 에러 일기 내보내기의 브라우저 동작: Markdown 내려받기와 PDF(인쇄) (S-003, D-079 예정).
// 파일 내용·이름은 exportMarkdown.ts의 순수 함수가 만들고, 여기서는 브라우저 API만 부른다.

// 인쇄할 때만 body에 붙는 클래스. 인쇄용 CSS는 이 클래스 안에서만 적용된다 (records.css)
export const PRINTING_CLASS = 'printing-record'

// 글을 .md 파일로 내려받는다. 실패하면 예외를 던지므로 부르는 쪽이 안내를 보여준다.
function downloadText(fileName: string, text: string) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    // 일부 브라우저는 문서에 붙어 있어야 클릭이 내려받기로 처리된다
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    // 내려받기가 시작되기 전에 주소가 풀리지 않게 한 박자 늦춘다
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

export function downloadMarkdown(detail: ErrorDetail) {
  downloadText(exportFileName(detail, 'md'), toMarkdown(detail))
}

// 상세 요청을 동시에 보내는 최대 개수 (D-119)
const SERIES_EXPORT_CONCURRENCY = 3

// 시리즈 전체를 Markdown 파일 하나로 내려받는다 (D-119).
// A-008로 순서를 받고, 기록마다 A-009를 동시에 최대 3개씩 불러 진행 상황을 알린다.
// 하나라도 실패하거나 없으면(null) 파일을 만들지 않고 예외를 던진다. 취소(signal)도 예외(AbortError 등)로 끝난다.
export async function exportSeriesMarkdown(
  series: Series,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
) {
  const items = await listSeriesErrors(series.id, signal)
  const total = items.length
  const details: ErrorDetail[] = new Array(total)
  let next = 0
  let done = 0
  let failed = false
  onProgress(0, total)

  async function worker() {
    while (!failed && next < total) {
      const index = next++
      try {
        const detail = await getError(items[index].id, signal)
        if (!detail) throw new Error('기록을 찾을 수 없어요.')
        details[index] = detail
      } catch (err) {
        failed = true // 남은 요청은 더 시작하지 않는다
        throw err
      }
      onProgress(++done, total)
    }
  }

  await Promise.all(Array.from({ length: Math.min(SERIES_EXPORT_CONCURRENCY, total) }, worker))
  signal?.throwIfAborted()
  downloadText(seriesExportFileName(series), seriesToMarkdown(series, details))
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
