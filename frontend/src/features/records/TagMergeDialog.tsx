import { useRef, useState } from 'react'
import { ApiError } from '../../api'
import ConfirmDialog from './ConfirmDialog'
import { mergeTag, type Tag } from './tagsApi'

// 태그 합치기 확인 대화상자 (S-002, D-113). 버튼 방식과 드래그 방식이 같은 것을 쓴다.
// source는 합쳐질 태그(A), target은 남을 태그(B)이고 "방향 바꾸기"로 맞바꿀 수 있다. 합치기는 되돌릴 수 없다.

type Props = {
  source: Tag
  target: Tag
  // 합치기에 성공했다 (합쳐져 사라진 태그 id)
  onMerged: (removedTagId: number) => void
  // 서버가 태그를 찾지 못했다(404). 대화상자는 부모가 닫는다
  onGone: () => void
  onCancel: () => void
}

function TagMergeDialog({ source, target, onMerged, onGone, onCancel }: Props) {
  const [flipped, setFlipped] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 합치기 버튼을 빠르게 두 번 눌러도 요청은 한 번만 보낸다
  const sending = useRef(false)

  const from = flipped ? target : source
  const into = flipped ? source : target

  async function confirm() {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError(null)
    try {
      await mergeTag(from.id, into.id)
      onMerged(from.id)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) onGone()
      else setError(err instanceof Error ? err.message : String(err)) // 방향은 그대로 둔다
    } finally {
      setBusy(false)
      sending.current = false
    }
  }

  return (
    <ConfirmDialog
      title="태그를 합칠까요?"
      confirmLabel="합치기"
      busyLabel="합치는 중…"
      busy={busy}
      error={error}
      danger
      leadingAction={{
        label: '⇅ 방향 바꾸기',
        onClick: () => setFlipped((f) => !f),
      }}
      onConfirm={confirm}
      onCancel={onCancel}
    >
      <table className="merge-table">
        <tbody>
          <tr>
            <th scope="row">합쳐질 태그</th>
            <td className="merge-tag">#{from.name}</td>
            <td className="merge-count">기록 {from.error_count}개</td>
          </tr>
          <tr>
            <th scope="row">남을 태그</th>
            <td className="merge-tag">#{into.name}</td>
            <td className="merge-count">기록 {into.error_count}개</td>
          </tr>
        </tbody>
      </table>
      <p className="confirm-text">
        합쳐질 태그가 붙은 기록은 남을 태그로 옮겨지고, 합쳐질 태그 이름은 별칭이 돼요. 되돌릴 수 없어요.
      </p>
    </ConfirmDialog>
  )
}

export default TagMergeDialog
