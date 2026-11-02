import { createPublicMessageRequestSchema } from '@localshare/contracts'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { Button } from './components/ui/button'
import { describeHealth } from './lib/health'
import { createClientRequestId, formatBytes, messageTime } from './lib/public-chat'
import { connectPublicRealtime } from './lib/public-realtime'
import { usePublicChatStore } from './stores/public-chat-store'
import { useServiceStore } from './stores/service-store'

export function App() {
  const [draft, setDraft] = useState('')
  const [draftError, setDraftError] = useState<string | null>(null)
  const messageEndRef = useRef<HTMLDivElement>(null)
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
  const realtimeConnected = usePublicChatStore((state) => state.realtimeConnected)
  const chatError = usePublicChatStore((state) => state.error)
  const initializeChat = usePublicChatStore((state) => state.initialize)
  const refreshChat = usePublicChatStore((state) => state.refresh)
  const loadOlder = usePublicChatStore((state) => state.loadOlder)
  const sendMessage = usePublicChatStore((state) => state.send)
  const sendFiles = usePublicChatStore((state) => state.sendFiles)
  const receiveMessage = usePublicChatStore((state) => state.receiveMessage)
  const setRealtimeConnected = usePublicChatStore((state) => state.setRealtimeConnected)

  useEffect(() => {
    void checkHealth()
    void initializeChat()

    const disconnectRealtime = connectPublicRealtime({
      onMessage: receiveMessage,
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
  }, [checkHealth, initializeChat, receiveMessage, refreshChat, setRealtimeConnected])

  useEffect(() => {
    const latestSeq = messages.at(-1)?.seq ?? 0
    if (latestSeq > lastMessageSeqRef.current) {
      messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
    lastMessageSeqRef.current = latestSeq
  }, [messages])

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

  const composerDisabled = sending || uploading || loading || !visitor
  const isOnline = healthState === 'online'

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-8 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
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

      <section className="flex flex-1 py-5 sm:py-7">
        <div className="mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-border bg-card shadow-[0_24px_80px_-48px_rgba(25,45,30,0.45)]">
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
            className="flex-1 space-y-4 overflow-y-auto bg-background/40 px-4 py-6 sm:px-7"
            aria-live="polite"
          >
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
                    className={`flex ${ownMessage ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        ownMessage
                          ? 'rounded-br-md bg-primary text-primary-foreground'
                          : 'rounded-bl-md border border-border bg-card'
                      }`}
                    >
                      <div
                        className={`mb-1 flex items-center gap-2 text-xs ${
                          ownMessage ? 'text-primary-foreground/75' : 'text-muted-foreground'
                        }`}
                      >
                        <span>{message.senderName}</span>
                        <time dateTime={message.createdAt}>{messageTime(message.createdAt)}</time>
                      </div>
                      {message.attachment?.kind === 'image' ? (
                        <img
                          src={message.attachment.url}
                          alt={message.attachment.name}
                          loading="lazy"
                          className="mb-2 max-h-80 w-full rounded-xl object-contain"
                        />
                      ) : null}
                      {message.attachment?.kind === 'video' ? (
                        <video
                          src={message.attachment.url}
                          controls
                          preload="metadata"
                          className="mb-2 max-h-80 w-full rounded-xl bg-black"
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
                    </div>
                  </article>
                )
              })
            )}
            <div ref={messageEndRef} />
          </div>

          <form
            className="border-t border-border p-4 sm:p-5"
            onSubmit={(event) => void submit(event)}
          >
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
                aria-describedby="composer-status"
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

              <div className="border-t border-border/70 px-4 py-2.5 sm:px-5">
                <p
                  id="composer-status"
                  aria-live="polite"
                  className={`text-xs ${
                    draftError || chatError ? 'text-red-600' : 'text-muted-foreground'
                  }`}
                >
                  {draftError ??
                    chatError ??
                    (uploading
                      ? `正在发送 ${uploadFileIndex}/${uploadFileTotal} · ${uploadFileName} · ${uploadProgress}%`
                      : sending
                        ? '正在发送消息…'
                        : 'Enter 发送 · Shift+Enter 换行')}
                </p>
                {uploading ? (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </form>
        </div>
      </section>

      <footer className="border-t border-border pt-4 text-xs text-muted-foreground">
        Web 入口 7777 · API 5678 · 公开消息仅保存在本地
      </footer>
    </main>
  )
}
