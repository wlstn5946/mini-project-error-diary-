import { useEffect, useRef, type ReactNode } from 'react'

// 되돌릴 수 없는 동작 앞의 확인 창 (S-003 기록 삭제, 이후 관리 모달의 태그·시리즈 삭제와 태그 합치기에도 쓴다).
// 브라우저 기본 모달(<dialog>)을 써서 Esc로 닫히고 포커스가 창 안에 갇힌다.

type Props = {
  title: string
  children?: ReactNode
  confirmLabel: string
  busyLabel: string
  busy: boolean
  // 실패하면 창을 닫지 않고 안내를 보여준다. 확인 버튼은 "다시 시도"로 바뀐다.
  error: string | null
  onConfirm: () => void
  onCancel: () => void
  // 확인 버튼을 위험 모양으로 (태그 합치기 등). 기본은 주 버튼 모양이다.
  danger?: boolean
  // 왼쪽에 두는 보조 버튼 (태그 합치기의 "방향 바꾸기"). 처리 중에는 비활성이다.
  leadingAction?: { label: string; onClick: () => void }
}

function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busyLabel,
  busy,
  error,
  onConfirm,
  onCancel,
  danger,
  leadingAction,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        // Esc. 처리 중에는 닫지 않는다.
        e.preventDefault()
        if (!busy) onCancel()
      }}
    >
      <h2 id="confirm-title" className="confirm-title">
        {title}
      </h2>
      {children}
      <div aria-live="polite">{error && <p className="attempt-error">{error}</p>}</div>
      <div className="confirm-actions">
        {leadingAction && (
          <button type="button" className="btn-secondary confirm-lead" disabled={busy} onClick={leadingAction.onClick}>
            {leadingAction.label}
          </button>
        )}
        {/* 처음 포커스는 되돌릴 수 없는 쪽이 아니라 "취소"에 둔다 */}
        <button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>
          취소
        </button>
        <button type="button" className={danger ? 'btn-danger' : 'btn-primary'} disabled={busy} onClick={onConfirm}>
          {busy ? busyLabel : error ? '다시 시도' : confirmLabel}
        </button>
      </div>
    </dialog>
  )
}

export default ConfirmDialog
