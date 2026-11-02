import { createPublicMessageRequestSchema, type PublicMessage } from '@localshare/contracts'
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type DragEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'

import { ImageLightbox } from './components/chat/image-lightbox'
import { MessageContextMenu } from './components/chat/message-context-menu'
import { MessageSearch } from './components/chat/message-search'
import { Button } from './components/ui/button'
import { copyImage, copyText } from './lib/clipboard'
import { describeHealth } from './lib/health'
import { createClientRequestId, formatBytes, messageTime } from './lib/public-chat'
import { connectPublicRealtime } from './lib/public-realtime'
import { usePublicChatStore } from './stores/public-chat-store'
import { useServiceStore } from './stores/service-store'

const COMPOSER_HINT_HIDDEN_KEY = 'localshare.composer-hint-hidden'
const MESSAGE_FILTERS = [
  { id: 'all', label: '所有' },
  { id: 'media', label: '图片与视频' },
  { id: 'files', label: '文件列表' },
] as const

type MessageFilter = (typeof MESSAGE_FILTERS)[number]['id']

function composerHintIsVisible() {
  try {
    return window.localStorage.getItem(COMPOSER_HINT_HIDDEN_KEY) !== '1'
  } catch {
    return true
  }
}

function scrollMessageListToLatest(
  messageList: HTMLDivElement | null,
  behavior: ScrollBehavior = 'auto',
) {
  messageList?.scrollTo({
    top: messageList.scrollHeight,
    behavior,
  })
}

export function App() {
  const [draft, setDraft] = useState('')
  const [draftError, setDraftError] = useState<string | null>(null)
  const [composerHintVisible, setComposerHintVisible] = useState(composerHintIsVisible)
  const [dragActive, setDragActive] = useState(false)
  const [messageFilter, setMessageFilter] = useState<MessageFilter>('all')
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [viewerImageId, setViewerImageId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    messageId: string
    x: number
    y: number
  } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimerRef = useRef<number | null>(null)
  const messageListRef = useRef<HTMLDivElement>(null)
  const messageContentRef = useRef<HTMLDivElement>(null)
  const stickToLatestRef = useRef(true)
  const lastMessageSeqRef = useRef(0)

  const health = useServiceStore((state) => state.health)
  const healthState = useServiceStore((service) => service.state)
  const checkHealth = useServiceStore((service) => service.check)

  const visitor = usePublicChatStore((state) => state.visitor)
  const conversation = usePublicChatStore((state) => state.conversation)
  const messages = usePublicChatStore((state) => state.messages)
  const hasMore = usePublicChatStore((state) => state.hasMore)
  const loading = usePublicChatStore((state) => state.loading)
  const loadingOlder = usePublicChatStore((state) => state.loadingOlder)
  const refreshing = usePublicChatStore((state) => state.refreshing)
  const sending = usePublicChatStore((state) => state.sending)
  const uploading = usePublicChatStore((state) => state.uploading)
  const uploadProgress = usePublicChatStore((state) => state.uploadProgress)
  const uploadFileIndex = usePublicChatStore((state) => state.uploadFileIndex)
  const uploadFileTotal = usePublicChatStore((state) => state.uploadFileTotal)
  const uploadFileName = usePublicChatStore((state) => state.uploadFileName)
  const recallingMessageId = usePublicChatStore((state) => state.recallingMessageId)
  const realtimeConnected = usePublicChatStore((state) => state.realtimeConnected)
  const chatError = usePublicChatStore((state) => state.error)
  const initializeChat = usePublicChatStore((state) => state.initialize)
  const refreshChat = usePublicChatStore((state) => state.refresh)
  const loadOlder = usePublicChatStore((state) => state.loadOlder)
  const sendMessage = usePublicChatStore((state) => state.send)
  const sendFiles = usePublicChatStore((state) => state.sendFiles)
  const recallMessage = usePublicChatStore((state) => state.recall)
  const receiveMessage = usePublicChatStore((state) => state.receiveMessage)
  const receiveMessageRecalled = usePublicChatStore((state) => state.receiveMessageRecalled)
  const setRealtimeConnected = usePublicChatStore((state) => state.setRealtimeConnected)

  useEffect(() => {
    void checkHealth()
    void initializeChat()

    const disconnectRealtime = connectPublicRealtime({
      onMessage: receiveMessage,
      onMessageRecalled: receiveMessageRecalled,
      onConnected: () => {
        setRealtimeConnected(true)
        void refreshChat()
      },
      onDisconnected: () => setRealtimeConnected(false),
    })

    const timer = window.setInterval(() => {
      void refreshChat()
    }, 15_000)

    return () => {
      window.clearInterval(timer)
      disconnectRealtime()
    }
  }, [
    checkHealth,
    initializeChat,
    receiveMessage,
    receiveMessageRecalled,
    refreshChat,
    setRealtimeConnected,
  ])

  useEffect(
    () => () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    const latestSeq = messages.at(-1)?.seq ?? 0
    if (latestSeq > lastMessageSeqRef.current) {
      lastMessageSeqRef.current = latestSeq
      stickToLatestRef.current = true
      const frame = window.requestAnimationFrame(() => {
        scrollMessageListToLatest(messageListRef.current)
      })
      return () => window.cancelAnimationFrame(frame)
    }

    lastMessageSeqRef.current = latestSeq
  }, [messages])

  useEffect(() => {
    stickToLatestRef.current = true
    const frame = window.requestAnimationFrame(() => {
      scrollMessageListToLatest(messageListRef.current)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [messageFilter])

  useEffect(() => {
    if (!highlightedMessageId) return

    stickToLatestRef.current = false
    const highlightTimer = window.setTimeout(() => setHighlightedMessageId(null), 2_400)
    const frame = window.requestAnimationFrame(() => {
      const messageList = messageListRef.current
      const message = messageList?.querySelector<HTMLElement>(
        `[data-message-id="${highlightedMessageId}"]`,
      )
      if (!messageList || !message) return

      const listBounds = messageList.getBoundingClientRect()
      const messageBounds = message.getBoundingClientRect()
      messageList.scrollTo({
        top:
          messageList.scrollTop +
          messageBounds.top -
          listBounds.top -
          (messageList.clientHeight - messageBounds.height) / 2,
        behavior: 'smooth',
      })
    })

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(highlightTimer)
    }
  }, [highlightedMessageId, messages])

  useEffect(() => {
    const messageContent = messageContentRef.current
    if (!messageContent) return

    let frame = 0
    const observer = new ResizeObserver(() => {
      if (!stickToLatestRef.current) return
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        scrollMessageListToLatest(messageListRef.current)
      })
    })

    observer.observe(messageContent)
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const parsed = createPublicMessageRequestSchema.safeParse({
      text: draft,
      clientRequestId: createClientRequestId(),
    })

    if (!parsed.success) {
      setDraftError('请输入 1–2000 个字符的消息')
      return
    }

    setDraftError(null)
    const sent = await sendMessage(parsed.data)
    if (sent) setDraft('')
  }

  const sendSelectedFiles = (files: File[]) => {
    if (files.length === 0) return
    setDraftError(null)
    void sendFiles(files)
  }

  const dragContainsFiles = (event: DragEvent<HTMLElement>) =>
    Array.from(event.dataTransfer.types).includes('Files')

  const handleDragEnter = (event: DragEvent<HTMLFormElement>) => {
    if (!dragContainsFiles(event)) return
    event.preventDefault()
    setDragActive(true)
  }

  const handleDragOver = (event: DragEvent<HTMLFormElement>) => {
    if (!dragContainsFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDragActive(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLFormElement>) => {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return
    setDragActive(false)
  }

  const handleDrop = (event: DragEvent<HTMLFormElement>) => {
    if (!dragContainsFiles(event)) return
    event.preventDefault()
    setDragActive(false)
    sendSelectedFiles(Array.from(event.dataTransfer.files))
  }

  const handleComposerPaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const itemImages = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))
    const images =
      itemImages.length > 0
        ? itemImages
        : Array.from(event.clipboardData.files).filter((file) => file.type.startsWith('image/'))

    if (images.length === 0) return
    event.preventDefault()
    sendSelectedFiles(images)
  }

  const pauseStickingToLatest = () => {
    stickToLatestRef.current = false
  }

  const handleMediaLoaded = () => {
    if (stickToLatestRef.current) {
      scrollMessageListToLatest(messageListRef.current)
    }
  }

  const dismissComposerHint = () => {
    setComposerHintVisible(false)
    try {
      window.localStorage.setItem(COMPOSER_HINT_HIDDEN_KEY, '1')
    } catch {
      // The preference still applies for this page when storage is unavailable.
    }
  }

  const showNotice = (message: string) => {
    setNotice(message)
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current)
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null)
      noticeTimerRef.current = null
    }, 2_000)
  }

  const handleCopyMessageText = async (message: PublicMessage) => {
    try {
      await copyText(message.text)
      showNotice('文字已复制')
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '复制失败')
    }
  }

  const handleCopyMessageImage = async (message: PublicMessage) => {
    if (!message.attachment) return

    try {
      const copied = await copyImage(message.attachment.url)
      showNotice(copied === 'image' ? '图片已复制' : '已复制图片地址')
    } catch (error) {
      showNotice(error instanceof Error ? error.message : '复制图片失败')
    }
  }

  const handleRecallMessage = async (message: PublicMessage) => {
    const recalled = await recallMessage(message.id)
    if (!recalled) return

    if (viewerImageId === message.id) setViewerImageId(null)
    showNotice('消息已撤回')
  }

  const handleMessageContextMenu = (
    event: ReactMouseEvent<HTMLElement>,
    message: PublicMessage,
  ) => {
    if (message.recalledAt) return

    const ownMessage = visitor?.id === message.senderId
    const canCopy = message.text.length > 0 || message.attachment?.kind === 'image'
    if (!ownMessage && !canCopy) return

    event.preventDefault()
    setContextMenu({
      messageId: message.id,
      x: event.clientX,
      y: event.clientY,
    })
  }

  const handleSelectSearchResult = (message: PublicMessage) => {
    setMessageFilter('all')
    setContextMenu(null)
    receiveMessage(message)
    setHighlightedMessageId(message.id)
  }

  const composerDisabled = sending || uploading || loading || !visitor
  const composerStatus =
    draftError ??
    chatError ??
    (uploading
      ? `正在发送 ${uploadFileIndex}/${uploadFileTotal} · ${uploadFileName} · ${uploadProgress}%`
      : sending
        ? '正在发送消息…'
        : null)
  const imageMessages = messages.filter(
    (message) => !message.recalledAt && message.attachment?.kind === 'image',
  )
  const visibleMessages = messages.filter((message) => {
    if (messageFilter === 'all') return true
    if (message.recalledAt || !message.attachment) return false
    if (messageFilter === 'media') {
      return message.attachment.kind === 'image' || message.attachment.kind === 'video'
    }
    return message.attachment.kind === 'file'
  })
  const contextMessage = contextMenu
    ? messages.find((message) => message.id === contextMenu.messageId)
    : undefined
  const isOnline = healthState === 'online'

  return (
    <main className="mx-auto flex h-screen w-full max-w-6xl flex-col overflow-hidden px-4 py-5 sm:px-8 sm:py-8">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">LocalShare</h1>
        </div>
        <div className="flex items-center gap-3">
          {visitor ? (
            <span className="rounded-full bg-muted px-3 py-2 text-xs text-muted-foreground">
              {visitor.displayName}
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {realtimeConnected ? '实时已连接' : '正在连接实时服务'}
          </span>
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs">
            <span
              className={`size-2 rounded-full ${isOnline ? 'bg-primary' : 'bg-amber-500'}`}
              aria-hidden="true"
            />
            <span>{describeHealth(health)}</span>
          </div>
        </div>
      </header>

      <section className="flex min-h-0 flex-1 py-5 sm:py-7">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-border bg-card shadow-[0_24px_80px_-48px_rgba(25,45,30,0.45)]">
          <div className="shrink-0 border-b border-border">
            <div className="flex items-center justify-between px-5 py-4 sm:px-7">
              <h2 className="text-xl font-semibold tracking-tight">
                {conversation?.title ?? '公共频道'}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={refreshing ? '正在刷新消息' : '刷新消息'}
                title="刷新消息"
                disabled={refreshing}
                onClick={() => void refreshChat()}
              >
                <svg
                  viewBox="0 0 24 24"
                  className={`size-4.5 ${refreshing ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path d="M20 7v5h-5" />
                  <path d="M4 17v-5h5" />
                  <path d="M6.1 9a7 7 0 0 1 11.4-2L20 9M4 15l2.5 2a7 7 0 0 0 11.4-2" />
                </svg>
              </Button>
            </div>
            <div className="flex items-center gap-2 px-4 sm:px-6">
              <div
                role="tablist"
                aria-label="消息分类"
                className="flex min-w-0 flex-1 gap-1 overflow-x-auto"
              >
                {MESSAGE_FILTERS.map((filter) => {
                  const selected = messageFilter === filter.id
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls="message-list"
                      className={`shrink-0 rounded-t-lg border-b-2 px-3 py-2.5 text-sm transition ${
                        selected
                          ? 'border-primary bg-primary/10 font-medium text-primary'
                          : 'border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      }`}
                      onClick={() => {
                        setMessageFilter(filter.id)
                        setContextMenu(null)
                      }}
                    >
                      {filter.label}
                    </button>
                  )
                })}
              </div>
              <MessageSearch onSelectMessage={handleSelectSearchResult} />
            </div>
          </div>

          <div
            ref={messageListRef}
            id="message-list"
            aria-label="消息列表"
            className="chat-message-scrollbar min-h-0 flex-1 overflow-y-auto bg-background/40 px-4 py-6 sm:px-7"
            aria-live="polite"
            onWheel={pauseStickingToLatest}
            onTouchMove={pauseStickingToLatest}
            onPointerDown={pauseStickingToLatest}
          >
            <div ref={messageContentRef} className="space-y-4">
              {hasMore ? (
                <div className="flex justify-center pb-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={loadingOlder}
                    onClick={() => void loadOlder()}
                  >
                    {loadingOlder ? '加载中…' : '加载更早消息'}
                  </Button>
                </div>
              ) : null}
              {loading ? (
                <p className="py-10 text-center text-sm text-muted-foreground">正在载入公共频道…</p>
              ) : visibleMessages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                  <p className="font-medium">
                    {messageFilter === 'all'
                      ? '还没有消息'
                      : messageFilter === 'media'
                        ? '还没有图片或视频'
                        : '还没有文件'}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {messageFilter === 'all'
                      ? '发送第一条消息，局域网里的访问者都能看到。'
                      : '发送对应类型的附件后，会显示在这里。'}
                  </p>
                </div>
              ) : (
                visibleMessages.map((message) => {
                  const ownMessage = visitor?.id === message.senderId
                  return (
                    <article
                      key={message.id}
                      data-message-id={message.id}
                      className={`flex ${ownMessage ? 'justify-end' : 'justify-start'}`}
                      onContextMenu={(event) => handleMessageContextMenu(event, message)}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                          highlightedMessageId === message.id
                            ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-card'
                            : ''
                        } ${
                          message.recalledAt
                            ? 'rounded-b-md border border-border bg-muted text-muted-foreground'
                            : ownMessage
                              ? 'rounded-br-md bg-primary text-primary-foreground'
                              : 'rounded-bl-md border border-border bg-card'
                        }`}
                      >
                        <div
                          className={`mb-1 flex items-center gap-2 text-xs ${
                            ownMessage && !message.recalledAt
                              ? 'text-primary-foreground/75'
                              : 'text-muted-foreground'
                          }`}
                        >
                          <span>{message.senderName}</span>
                          <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
                        </div>
                        {message.recalledAt ? (
                          <p className="text-sm italic">
                            {ownMessage ? '你撤回了一条消息' : '消息已撤回'}
                          </p>
                        ) : (
                          <>
                            {message.attachment?.kind === 'image' ? (
                              <button
                                type="button"
                                aria-label={`查看图片 ${message.attachment.name}`}
                                className="group relative mb-2 block w-full cursor-zoom-in overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                                onClick={() => setViewerImageId(message.id)}
                              >
                                <span className="flex min-h-20 items-center justify-center">
                                  <img
                                    src={message.attachment.url}
                                    alt={message.attachment.name}
                                    loading="lazy"
                                    className="max-h-80 w-full object-contain"
                                    onLoad={handleMediaLoaded}
                                  />
                                </span>
                                <span className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full truncate bg-black/65 px-3 py-2 text-left text-xs text-white backdrop-blur-sm transition-transform duration-200 group-hover:translate-y-0 group-focus-visible:translate-y-0">
                                  {message.attachment.name}
                                </span>
                              </button>
                            ) : null}
                            {message.attachment?.kind === 'video' ? (
                              <video
                                src={message.attachment.url}
                                controls
                                preload="metadata"
                                className="mb-2 max-h-80 w-full rounded-xl bg-black"
                                onLoadedMetadata={handleMediaLoaded}
                              />
                            ) : null}
                            {message.attachment?.kind === 'file' ? (
                              <a
                                href={message.attachment.url}
                                download={message.attachment.name}
                                className="mb-2 flex items-center gap-2 py-0.5 text-sm"
                              >
                                <svg
                                  viewBox="0 0 24 24"
                                  className="size-5 shrink-0 opacity-75"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.7"
                                  aria-hidden="true"
                                >
                                  <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
                                  <path d="M14 3v6h6M8 13h8M8 17h6" />
                                </svg>
                                <span className="min-w-0 flex-1 truncate">
                                  {message.attachment.name}
                                </span>
                                <span className="shrink-0 text-xs opacity-60">
                                  {formatBytes(message.attachment.sizeBytes)}
                                </span>
                              </a>
                            ) : null}
                            {message.text ? (
                              <p className="whitespace-pre-wrap break-words text-sm leading-6">
                                {message.text}
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    </article>
                  )
                })
              )}
            </div>
          </div>

          <form
            className={`relative shrink-0 border-t border-border p-3 sm:p-4 ${
              dragActive ? 'bg-primary/5' : ''
            }`}
            onSubmit={(event) => void submit(event)}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {dragActive ? (
              <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-card/95 text-sm font-medium text-primary">
                松开鼠标即可发送文件
              </div>
            ) : null}
            <div className="flex items-center gap-0.5">
              <input
                id="image-input"
                aria-label="选择图片文件"
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? [])
                  event.currentTarget.value = ''
                  sendSelectedFiles(files)
                }}
              />
              <button
                type="button"
                aria-label="添加图片"
                title="添加图片"
                disabled={composerDisabled}
                className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                onClick={() => document.getElementById('image-input')?.click()}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  aria-hidden="true"
                >
                  <rect x="3" y="4" width="18" height="16" rx="3" />
                  <circle cx="9" cy="10" r="1.5" />
                  <path d="m4 17 5-5 4 4 2-2 5 5" />
                </svg>
              </button>

              <input
                id="file-input"
                aria-label="选择文件"
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? [])
                  event.currentTarget.value = ''
                  sendSelectedFiles(files)
                }}
              />
              <button
                type="button"
                aria-label="添加文件"
                title="添加文件"
                disabled={composerDisabled}
                className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                onClick={() => document.getElementById('file-input')?.click()}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  aria-hidden="true"
                >
                  <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
                  <path d="M14 3v6h6M8 13h8M8 17h6" />
                </svg>
              </button>
            </div>

            <textarea
              id="message-input"
              aria-label="消息内容"
              aria-describedby={composerStatus || composerHintVisible ? 'composer-hint' : undefined}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value)
                setDraftError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
              onPaste={handleComposerPaste}
              placeholder="输入消息，Enter 发送，Shift+Enter 换行"
              rows={4}
              maxLength={2_000}
              disabled={composerDisabled}
              className="mt-1 min-h-28 w-full resize-none border-0 bg-transparent px-2 py-1 text-[15px] leading-7 outline-none placeholder:text-muted-foreground/80 disabled:cursor-not-allowed disabled:opacity-60"
            />

            {composerStatus || composerHintVisible ? (
              <div className="px-2 pt-1">
                <div className="flex items-center gap-3">
                  <p
                    id="composer-hint"
                    aria-live="polite"
                    className={`min-w-0 flex-1 text-xs ${
                      draftError || chatError ? 'text-red-600' : 'text-muted-foreground'
                    }`}
                  >
                    {composerStatus ?? 'Enter 发送 · Shift+Enter 换行'}
                  </p>
                  {composerHintVisible && !composerStatus ? (
                    <button
                      type="button"
                      aria-label="隐藏输入提示"
                      title="隐藏输入提示"
                      className="inline-flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      onClick={dismissComposerHint}
                    >
                      <svg
                        viewBox="0 0 20 20"
                        className="size-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden="true"
                      >
                        <path d="m5 5 10 10M15 5 5 15" />
                      </svg>
                    </button>
                  ) : null}
                </div>
                {uploading ? (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </form>
        </div>
      </section>

      {contextMenu && contextMessage && !contextMessage.recalledAt ? (
        <MessageContextMenu
          message={contextMessage}
          ownMessage={visitor?.id === contextMessage.senderId}
          x={contextMenu.x}
          y={contextMenu.y}
          recalling={recallingMessageId === contextMessage.id}
          onClose={() => setContextMenu(null)}
          onCopyText={() => void handleCopyMessageText(contextMessage)}
          onCopyImage={() => void handleCopyMessageImage(contextMessage)}
          onRecall={() => void handleRecallMessage(contextMessage)}
        />
      ) : null}

      {viewerImageId ? (
        <ImageLightbox
          key={viewerImageId}
          activeImageId={viewerImageId}
          images={imageMessages}
          onChange={setViewerImageId}
          onClose={() => setViewerImageId(null)}
        />
      ) : null}

      {notice ? (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background shadow-lg"
        >
          {notice}
        </div>
      ) : null}
    </main>
  )
}
