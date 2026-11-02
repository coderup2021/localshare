import { useEffect } from 'react'

import { Button } from './components/ui/button'
import { describeHealth } from './lib/health'
import { useServiceStore } from './stores/service-store'

export function App() {
  const health = useServiceStore((state) => state.health)
  const state = useServiceStore((service) => service.state)
  const error = useServiceStore((service) => service.error)
  const check = useServiceStore((service) => service.check)

  useEffect(() => {
    void check()
  }, [check])

  const isOnline = state === 'online'

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-8 sm:px-8">
      <header className="flex items-center justify-between border-b border-border pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
            Local network
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">LocalShare</h1>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs">
          <span
            className={`size-2 rounded-full ${isOnline ? 'bg-primary' : 'bg-amber-500'}`}
            aria-hidden="true"
          />
          <span>{describeHealth(health)}</span>
        </div>
      </header>

      <section className="flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-2xl rounded-[2rem] border border-border bg-card p-7 shadow-[0_24px_80px_-48px_rgba(25,45,30,0.45)] sm:p-10">
          <div className="mb-8 flex items-start justify-between gap-6">
            <div>
              <p className="text-sm font-medium text-primary">公共频道</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">局域网里的共享空间</h2>
              <p className="mt-3 max-w-lg leading-7 text-muted-foreground">
                工程基础已经就绪。下一步会在这里接入公共消息、图片、视频和文件传输。
              </p>
            </div>
            <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
              M0
            </span>
          </div>

          <div className="rounded-2xl border border-dashed border-border bg-background/60 p-5">
            <p className="text-sm font-medium">消息区域</p>
            <p className="mt-2 text-sm text-muted-foreground">
              API 健康检查通过后，消息链路将在后续里程碑启用。
            </p>
            {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button type="button" onClick={() => void check()}>
              {state === 'checking' ? '检查中…' : '重新检查服务'}
            </Button>
            <Button type="button" variant="outline" disabled>
              发送消息（即将开放）
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border pt-5 text-xs text-muted-foreground">
        Web 入口 7777 · API 5678 · 数据仅保存在本地
      </footer>
    </main>
  )
}
