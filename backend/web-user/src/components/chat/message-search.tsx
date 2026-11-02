import type { PublicMessage } from '@localshare/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'

import { searchPublicMessages } from '../../lib/public-chat'

type MessageSearchProps = {
  onSelectMessage: (message: PublicMessage) => void
}

const SEARCH_DELAY_MS = 500

function resultTitle(message: PublicMessage) {
  return message.attachment?.name || message.text || '消息'
}

function resultType(message: PublicMessage) {
  if (message.attachment?.kind === 'image') return '图片'
  if (message.attachment?.kind === 'video') return '视频'
  if (message.attachment?.kind === 'file') return '文件'
  return '文字'
}

export function MessageSearch({ onSelectMessage }: MessageSearchProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PublicMessage[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<number | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const sequenceRef = useRef(0)

  const clearPendingSearch = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    requestRef.current?.abort()
    requestRef.current = null
  }, [])

  const closeSearch = useCallback(() => {
    clearPendingSearch()
    setOpen(false)
    setSearching(false)
  }, [clearPendingSearch])

  useEffect(() => {
    if (open) {
      window.requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        closeSearch()
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [closeSearch, open])

  useEffect(
    () => () => {
      clearPendingSearch()
    },
    [clearPendingSearch],
  )

  const handleQueryChange = (value: string) => {
    setQuery(value)
    setError(null)
    clearPendingSearch()

    const trimmed = value.trim()
    const sequence = sequenceRef.current + 1
    sequenceRef.current = sequence
    if (!trimmed) {
      setResults([])
      setSearching(false)
      return
    }

    setResults([])
    setSearching(true)
    timerRef.current = window.setTimeout(async () => {
      const controller = new AbortController()
      requestRef.current = controller

      try {
        const response = await searchPublicMessages(trimmed, controller.signal)
        if (sequence === sequenceRef.current) {
          setResults(response.messages)
        }
      } catch (searchError) {
        if (!controller.signal.aborted && sequence === sequenceRef.current) {
          setError(searchError instanceof Error ? searchError.message : '搜索失败')
        }
      } finally {
        if (sequence === sequenceRef.current) {
          setSearching(false)
        }
      }
    }, SEARCH_DELAY_MS)
  }

  const selectResult = (message: PublicMessage) => {
    closeSearch()
    setQuery('')
    setResults([])
    setError(null)
    onSelectMessage(message)
  }

  return (
    <div ref={containerRef} className="relative flex items-center justify-end">
      <div
        className={`shrink-0 overflow-hidden transition-all duration-300 ${
          open ? 'w-40 opacity-100 sm:w-64' : 'w-0 opacity-0'
        }`}
      >
        <input
          ref={inputRef}
          type="search"
          aria-label="消息搜索关键词"
          value={query}
          disabled={!open}
          maxLength={200}
          placeholder="搜索消息或文件名"
          className="h-9 w-full rounded-l-full border border-r-0 border-border bg-background px-3 text-sm outline-none focus:border-primary"
          onChange={(event) => handleQueryChange(event.target.value)}
        />
      </div>
      <button
        type="button"
        aria-label={open ? '关闭消息搜索' : '搜索消息'}
        title={open ? '关闭消息搜索' : '搜索消息'}
        aria-expanded={open}
        aria-controls="message-search-results"
        className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full transition ${
          open
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
        onClick={() => (open ? closeSearch() : setOpen(true))}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 4 4" />
        </svg>
      </button>

      {open && query.trim() ? (
        <div
          id="message-search-results"
          aria-label="搜索结果"
          className="search-results-scrollbar absolute right-0 top-full z-30 mt-2 max-h-80 w-[min(22rem,calc(100vw-4rem))] overflow-y-auto rounded-2xl border border-border bg-card p-2 shadow-[0_20px_60px_-24px_rgba(20,30,24,0.55)]"
        >
          {searching ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">搜索中…</p>
          ) : error ? (
            <p className="px-3 py-4 text-center text-xs text-red-600">{error}</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              没有找到匹配的消息
            </p>
          ) : (
            <ul className="space-y-1">
              {results.map((message) => (
                <li key={message.id}>
                  <button
                    type="button"
                    className="w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-muted"
                    onClick={() => selectResult(message)}
                  >
                    <span className="flex items-center gap-2">
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {resultType(message)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {resultTitle(message)}
                      </span>
                    </span>
                    {message.attachment && message.text ? (
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {message.text}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
