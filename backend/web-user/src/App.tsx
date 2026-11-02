import { createPublicMessageRequestSchema, type PublicMessage } from '@localshare/contracts'
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'

import { ImageLightbox } from './components/chat/image-lightbox'
import { MessageContextMenu } from './components/chat/message-context-menu'
import { Button } from './components/ui/button'
import { copyImage, copyText } from './lib/clipboard'
import { describeHealth } from './lib/health'
import { createClientRequestId, formatBytes, messageTime } from './lib/public-chat'
import { connectPublicRealtime } from './lib/public-realtime'
import { usePublicChatStore } from './stores/public-chat-store'
import { useServiceStore } from './stores/service-store'

const COMPOSER_HINT_HIDDEN_KEY = 'localshare.composer-hint-hidden'

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
  const contextMessage = contextMenu
    ? messages.find((message) => message.id === contextMenu.messageId)
    : undefined
  const isOnline = healthState === 'online'

  return (
    <main className="mx-auto flex h-screen w-full max-w-6xl flex-col overflow-hidden px-4 py-5 sm:px-8 sm:py-8">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Local network
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">LocalShare</h1>
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
          <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-7">
            <div>
              <p className="text-xs font-medium text-primary">公开会话</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                {conversation?.title ?? '公共频道'}
              </h2>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={refreshing}
              onClick={() => void refreshChat()}
            >
              {refreshing ? '刷新中…' : '刷新消息'}
            </Button>
          </div>

          <div
            ref={messageListRef}
            aria-label="消息列表"
            className="min-h-0 flex-1 overflow-y-auto bg-background/40 px-4 py-6 sm:px-7"
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
              ) : messages.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                  <p className="font-medium">还没有消息</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    发送第一条消息，局域网里的访问者都能看到。
                  </p>
                </div>
              ) : (
                messages.map((message) => {
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
                                className="mb-2 block cursor-zoom-in overflow-hidden rounded-xl"
                                onClick={() => setViewerImageId(message.id)}
                              >
                                <img
                                  src={message.attachment.url}
                                  alt={message.attachment.name}
                                  loading="lazy"
                                  className="max-h-80 w-full object-contain"
                                  onLoad={handleMediaLoaded}
                                />
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
                                className="mb-2 flex items-center justify-between gap-4 rounded-xl border border-current/15 px-3 py-2 text-sm"
                              >
                                <span className="truncate">{message.attachment.name}</span>
                                <span className="shrink-0 text-xs opacity-70">
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
            className={`relative shrink-0 border-t border-border p-4 sm:p-5 ${
              dragActive ? 'bg-primary/5' : ''
            }`}
            onSubmit={(event) => void submit(event)}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {dragActive ? (
              <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-[1.75rem] border-2 border-dashed border-primary bg-card/95 text-sm font-medium text-primary shadow-lg">
                松开鼠标即可发送文件
              </div>
            ) : null}
            <div className="overflow-hidden rounded-[1.75rem] border border-border bg-card shadow-[0_18px_55px_-32px_rgba(25,45,30,0.55)]">
              <div className="flex items-center gap-1 px-3 py-2 sm:px-4">
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
                  className="inline-flex size-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
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
                  className="inline-flex size-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
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
                aria-describedby={
                  composerStatus || composerHintVisible ? 'composer-hint' : undefined
                }
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
                placeholder="输入消息，Enter 发送，Shift+Enter 换行"
                rows={4}
                maxLength={2_000}
                disabled={composerDisabled}
                className="min-h-32 w-full resize-none border-0 bg-transparent px-5 py-2 text-[15px] leading-7 outline-none placeholder:text-muted-foreground/80 disabled:cursor-not-allowed disabled:opacity-60 sm:px-6"
              />

              {composerStatus || composerHintVisible ? (
                <div className="border-t border-border/70 px-4 py-2.5 sm:px-5">
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
            </div>
          </form>
        </div>
      </section>

      <footer className="shrink-0 border-t border-border pt-4 text-xs text-muted-foreground">
        Web 入口 7777 · API 5678 · 公开消息仅保存在本地
      </footer>

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
