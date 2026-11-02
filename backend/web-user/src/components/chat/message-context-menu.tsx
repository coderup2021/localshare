import type { PublicMessage } from '@localshare/contracts'
import { useEffect } from 'react'

type MessageContextMenuProps = {
  message: PublicMessage
  ownMessage: boolean
  x: number
  y: number
  recalling: boolean
  onClose: () => void
  onCopyText: () => void
  onCopyImage: () => void
  onRecall: () => void
}

export function MessageContextMenu({
  message,
  ownMessage,
  x,
  y,
  recalling,
  onClose,
  onCopyText,
  onCopyImage,
  onRecall,
}: MessageContextMenuProps) {
  const canCopyText = message.text.length > 0
  const canCopyImage = message.attachment?.kind === 'image'
  const itemCount = Number(canCopyText) + Number(canCopyImage) + Number(ownMessage)
  const menuWidth = 160
  const menuHeight = itemCount * 38 + 12
  const left = Math.min(x, Math.max(8, window.innerWidth - menuWidth - 8))
  const top = Math.min(y, Math.max(8, window.innerHeight - menuHeight - 8))

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const run = (action: () => void) => {
    onClose()
    action()
  }

  return (
    <div
      className="fixed inset-0 z-40"
      onPointerDown={onClose}
      onContextMenu={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div
        role="menu"
        aria-label="消息操作"
        className="absolute min-w-40 overflow-hidden rounded-xl border border-border bg-card p-1.5 shadow-[0_18px_55px_-20px_rgba(20,30,24,0.55)]"
        style={{ left, top }}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        {canCopyText ? (
          <button
            type="button"
            role="menuitem"
            className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() => run(onCopyText)}
          >
            复制文字
          </button>
        ) : null}
        {canCopyImage ? (
          <button
            type="button"
            role="menuitem"
            className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
            onClick={() => run(onCopyImage)}
          >
            复制图片
          </button>
        ) : null}
        {ownMessage ? (
          <button
            type="button"
            role="menuitem"
            disabled={recalling}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            onClick={() => run(onRecall)}
          >
            {recalling ? '正在撤回…' : '撤回消息'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
