import type { PublicMessage } from '@localshare/contracts'
import { useEffect, useRef, useState } from 'react'

type ImageLightboxProps = {
  activeImageId: string
  images: PublicMessage[]
  onChange: (imageId: string) => void
  onClose: () => void
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 4

export function ImageLightbox({ activeImageId, images, onChange, onClose }: ImageLightboxProps) {
  const [zoom, setZoom] = useState(1)
  const dialogRef = useRef<HTMLDivElement>(null)
  const index = images.findIndex((image) => image.id === activeImageId)
  const image = index >= 0 ? images[index] : undefined

  useEffect(() => {
    dialogRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      } else if (event.key === 'ArrowLeft' && index > 0) {
        onChange(images[index - 1]!.id)
      } else if (event.key === 'ArrowRight' && index < images.length - 1) {
        onChange(images[index + 1]!.id)
      } else if (event.key === '+' || event.key === '=') {
        setZoom((current) => Math.min(MAX_ZOOM, current + 0.2))
      } else if (event.key === '-') {
        setZoom((current) => Math.max(MIN_ZOOM, current - 0.2))
      } else if (event.key === '0') {
        setZoom(1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeImageId, images, index, onChange, onClose])

  if (!image?.attachment) return null

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 outline-none"
      onClick={onClose}
      onWheel={(event) => {
        event.stopPropagation()
        setZoom((current) => {
          const next = current + (event.deltaY < 0 ? 0.15 : -0.15)
          return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(next.toFixed(2))))
        })
      }}
    >
      <div className="absolute left-4 top-4 rounded-full bg-black/45 px-3 py-1.5 text-xs text-white/80">
        {index + 1} / {images.length}
      </div>

      <button
        type="button"
        aria-label="关闭图片预览"
        className="absolute right-5 top-5 z-10 inline-flex size-10 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-white/20"
        onClick={onClose}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>

      <button
        type="button"
        aria-label="上一张图片"
        disabled={index === 0}
        className="absolute left-4 top-1/2 z-10 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-25"
        onClick={(event) => {
          event.stopPropagation()
          if (index > 0) onChange(images[index - 1]!.id)
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>

      <img
        src={image.attachment.url}
        alt={image.attachment.name}
        draggable={false}
        className="max-h-[82vh] max-w-[82vw] select-none object-contain transition-transform duration-150"
        style={{ transform: `scale(${zoom})` }}
        onClick={(event) => event.stopPropagation()}
      />

      <button
        type="button"
        aria-label="下一张图片"
        disabled={index === images.length - 1}
        className="absolute right-4 top-1/2 z-10 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-25"
        onClick={(event) => {
          event.stopPropagation()
          if (index < images.length - 1) onChange(images[index + 1]!.id)
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>

      <div
        className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/55 p-1.5 text-white"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="缩小图片"
          className="inline-flex size-8 items-center justify-center rounded-full hover:bg-white/15"
          onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current - 0.2))}
        >
          −
        </button>
        <button
          type="button"
          className="min-w-14 text-xs text-white/80"
          aria-label="重置图片缩放"
          onClick={() => setZoom(1)}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          aria-label="放大图片"
          className="inline-flex size-8 items-center justify-center rounded-full hover:bg-white/15"
          onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + 0.2))}
        >
          +
        </button>
      </div>
    </div>
  )
}
