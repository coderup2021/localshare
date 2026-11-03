import { type FormEvent, useEffect, useState } from 'react'

import type { ConnectionStatus, DiscoveredServer, DiscoverySnapshot } from '../shared/rpc'
import { desktopRpc, onConnectionStatus, onSnapshot } from './rpc-client'

const emptySnapshot: DiscoverySnapshot = { servers: [], scanning: false }
const idleStatus: ConnectionStatus = { phase: 'idle' }

function ServerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
      <path
        d="M4 5.5h16v5H4zm0 8h16v5H4zM7 8h.01M7 16h.01"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        d="M20 11a8 8 0 1 0-2.35 5.65M20 5v6h-6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function serverAddress(server: DiscoveredServer) {
  const url = new URL(server.webUrl)
  return url.port ? `${url.hostname}:${url.port}` : url.hostname
}

export function App() {
  const [snapshot, setSnapshot] = useState(emptySnapshot)
  const [status, setStatus] = useState(idleStatus)
  const [manualVisible, setManualVisible] = useState(false)
  const [manualAddress, setManualAddress] = useState('')

  useEffect(() => {
    const unsubscribeSnapshot = onSnapshot(setSnapshot)
    const unsubscribeStatus = onConnectionStatus(setStatus)
    void desktopRpc.request.getSnapshot({}).then(setSnapshot)
    return () => {
      unsubscribeSnapshot()
      unsubscribeStatus()
    }
  }, [])

  const scanNow = async () => {
    const next = await desktopRpc.request.scanNow({})
    setSnapshot(next)
  }

  const connect = async (serverId: string) => {
    await desktopRpc.request.connect({ serverId })
  }

  const connectManual = async (event: FormEvent) => {
    event.preventDefault()
    await desktopRpc.request.connectManual({ address: manualAddress })
  }

  const busy = status.phase === 'checking' || status.phase === 'opening'

  return (
    <main className="picker-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <section className="picker-card" aria-labelledby="picker-title">
        <header className="picker-header">
          <img className="brand-mark" src="/brand-icon.svg" alt="" aria-hidden="true" />
          <div>
            <p className="eyebrow">LocalShare Desktop</p>
            <h1 id="picker-title">连接局域网服务器</h1>
            <p className="subtitle">自动发现同一网络中的 LocalShare 服务，或直接输入地址。</p>
          </div>
        </header>

        <div className="scan-row">
          <div className="scan-state" role="status">
            <span className={snapshot.scanning ? 'pulse-dot active' : 'pulse-dot'} />
            {snapshot.scanning ? '正在扫描局域网…' : '自动发现未运行'}
          </div>
          <button
            type="button"
            className="quiet-button"
            onClick={() => void scanNow()}
            disabled={busy}
          >
            <RefreshIcon />
            重新扫描
          </button>
        </div>

        {status.phase === 'error' ? (
          <div className="notice error" role="alert">
            {status.message}
          </div>
        ) : null}
        {busy ? (
          <div className="notice progress" role="status">
            {status.phase === 'checking'
              ? `正在检查 ${status.serverName ?? '服务器'}…`
              : `正在打开 ${status.serverName ?? '服务器'}…`}
          </div>
        ) : null}

        <div className="server-list" aria-label="已发现的服务器">
          {snapshot.servers.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">
                <ServerIcon />
              </span>
              <strong>暂未发现服务器</strong>
              <p>请确认服务端已启动，并允许 UDP 49777 通过防火墙。</p>
            </div>
          ) : (
            snapshot.servers.map((server) => (
              <article className="server-card" key={server.serverId}>
                <div className="server-icon">
                  <ServerIcon />
                </div>
                <div className="server-details">
                  <strong>{server.name}</strong>
                  <span>{serverAddress(server)}</span>
                  <small>LocalShare {server.serverVersion}</small>
                </div>
                <button
                  type="button"
                  className="connect-button"
                  onClick={() => void connect(server.serverId)}
                  disabled={busy}
                >
                  连接
                </button>
              </article>
            ))
          )}
        </div>

        <div className="manual-area">
          <button
            type="button"
            className="manual-toggle"
            onClick={() => setManualVisible((visible) => !visible)}
          >
            {manualVisible ? '收起手动连接' : '找不到服务器？手动连接'}
          </button>
          {manualVisible ? (
            <form className="manual-form" onSubmit={(event) => void connectManual(event)}>
              <label htmlFor="manual-address">服务器地址</label>
              <div className="manual-controls">
                <input
                  id="manual-address"
                  value={manualAddress}
                  onChange={(event) => setManualAddress(event.target.value)}
                  placeholder="192.168.1.20:8888"
                  autoComplete="url"
                  disabled={busy}
                />
                <button type="submit" disabled={busy || manualAddress.trim().length === 0}>
                  连接
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </section>

      <p className="picker-footer">IPv4 局域网自动发现 · 跨网段时请手动输入地址</p>
    </main>
  )
}
