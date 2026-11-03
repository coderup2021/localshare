import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import Electrobun, {
  ApplicationMenu,
  BrowserView,
  BrowserWindow,
  Updater,
  Utils,
} from 'electrobun/main'

import type { ConnectionStatus, DesktopRPC, DiscoveredServer } from '../shared/rpc'
import { DiscoveryClient, normalizeManualServerUrl } from './discovery-client'
import { navigationRuleForServer, probeServer } from './server-connection'
import { SettingsStore, type SavedServer } from './settings'

const DEV_VIEW_URL = 'http://127.0.0.1:5173/'
const SETTINGS_PATH = join(
  process.env.LOCALSHARE_DESKTOP_USER_DATA ?? Utils.paths.userData,
  'settings.json',
)
const settings = new SettingsStore(SETTINGS_PATH)

let pickerWindow: BrowserWindow | null = null
let pickerRpcClient: ReturnType<typeof createPickerRpc> | null = null
let remoteWindow: BrowserWindow | null = null
let discovery: DiscoveryClient | null = null
let pickerMode: 'startup' | 'switch' = 'startup'
let connecting = false
let autoCandidateId: string | null = null
let autoConnectTimer: ReturnType<typeof setTimeout> | null = null
let currentRemote: SavedServer | null = null

function sendSnapshot() {
  const snapshot = discovery?.snapshot() ?? { servers: [], scanning: false }
  pickerRpcClient?.send.snapshotUpdated(snapshot)
  updateAutoConnect(snapshot.servers)
}

function sendConnectionStatus(status: ConnectionStatus) {
  pickerRpcClient?.send.connectionStatus(status)
}

function clearAutoConnect() {
  autoCandidateId = null
  if (autoConnectTimer) clearTimeout(autoConnectTimer)
  autoConnectTimer = null
}

function updateAutoConnect(servers: DiscoveredServer[]) {
  if (pickerMode !== 'startup' || connecting || servers.length !== 1) {
    clearAutoConnect()
    return
  }

  const candidate = servers[0]
  if (!candidate || autoCandidateId === candidate.serverId) return

  clearAutoConnect()
  autoCandidateId = candidate.serverId
  autoConnectTimer = setTimeout(() => {
    const current = discovery?.snapshot().servers ?? []
    if (current.length === 1 && current[0]?.serverId === candidate.serverId && !connecting) {
      void connectToServer(candidate)
    }
  }, 2_000)
}

async function getPickerViewUrl() {
  if (process.env.LOCALSHARE_DESKTOP_VIEW_URL) {
    return process.env.LOCALSHARE_DESKTOP_VIEW_URL
  }

  if ((await Updater.localInfo.channel()) === 'dev') {
    try {
      await fetch(DEV_VIEW_URL, { method: 'HEAD' })
      return DEV_VIEW_URL
    } catch {
      // The production view bundle is used when Vite is not running.
    }
  }

  return 'views://mainview/index.html'
}

function createPickerRpc() {
  return BrowserView.defineRPC<DesktopRPC>({
    maxRequestTime: 30_000,
    handlers: {
      requests: {
        getSnapshot: () =>
          discovery?.snapshot() ?? {
            servers: [],
            scanning: false,
          },
        scanNow: () => discovery?.scanNow() ?? { servers: [], scanning: false },
        connect: async ({ serverId }) => {
          const server = discovery
            ?.snapshot()
            .servers.find((candidate) => candidate.serverId === serverId)
          if (!server) {
            sendConnectionStatus({
              phase: 'error',
              code: 'SERVER_NOT_FOUND',
              message: '该服务器已离线，请重新扫描。',
            })
            return { accepted: false }
          }
          return { accepted: await connectToServer(server) }
        },
        connectManual: async ({ address }) => {
          clearAutoConnect()
          let url: string
          try {
            url = normalizeManualServerUrl(address)
          } catch (error) {
            sendConnectionStatus({
              phase: 'error',
              code: 'MANUAL_ADDRESS_INVALID',
              message: error instanceof Error ? error.message : '服务器地址无效',
            })
            return { accepted: false }
          }

          const server: SavedServer = {
            serverId: `manual:${url}`,
            name: new URL(url).host,
            url,
            lastConnectedAt: new Date().toISOString(),
          }
          return { accepted: await openServer(server) }
        },
      },
      messages: {},
    },
  })
}

async function startDiscovery() {
  await discovery?.stop()
  discovery = new DiscoveryClient({
    port: Number(process.env.LOCALSHARE_DISCOVERY_PORT ?? 49_777),
    clientVersion: '0.1.0',
    onChange: sendSnapshot,
    logger: console,
  })

  try {
    await discovery.start()
    sendSnapshot()
  } catch (error) {
    sendConnectionStatus({
      phase: 'error',
      code: 'DISCOVERY_UNAVAILABLE',
      message: `无法启动 UDP 自动发现：${error instanceof Error ? error.message : '未知错误'}`,
    })
  }
}

async function openPicker(mode: 'startup' | 'switch') {
  clearAutoConnect()
  pickerMode = mode
  if (pickerWindow) {
    pickerWindow.activate()
    sendSnapshot()
    return
  }

  const rpc = createPickerRpc()
  const window = new BrowserWindow({
    title: mode === 'switch' ? '切换 LocalShare 服务器' : '连接 LocalShare',
    url: await getPickerViewUrl(),
    frame: {
      width: 760,
      height: 700,
    },
    rpc,
  })
  pickerWindow = window
  pickerRpcClient = rpc

  window.webview.on('dom-ready', () => {
    writeTestMarker('picker-ready', { mode })
    sendSnapshot()
    sendConnectionStatus({ phase: 'idle' })
  })
  window.on('close', () => {
    if (pickerWindow?.id === window.id) {
      pickerWindow = null
      pickerRpcClient = null
      clearAutoConnect()
      void discovery?.stop()
      discovery = null
    }
  })

  await startDiscovery()
}

async function connectToServer(server: DiscoveredServer) {
  return openServer({
    serverId: server.serverId,
    name: server.name,
    url: server.webUrl,
    lastConnectedAt: new Date().toISOString(),
  })
}

async function openServer(server: SavedServer): Promise<boolean> {
  if (connecting) return false
  clearAutoConnect()
  connecting = true
  sendConnectionStatus({ phase: 'checking', serverName: server.name })

  if (!(await probeServer(server.url))) {
    connecting = false
    sendConnectionStatus({
      phase: 'error',
      code: 'SERVER_UNREACHABLE',
      message: `无法连接 ${server.name}，请确认服务端正在运行。`,
    })
    return false
  }

  sendConnectionStatus({ phase: 'opening', serverName: server.name })
  const acceptedServer = {
    ...server,
    lastConnectedAt: new Date().toISOString(),
  }
  settings.saveLastServer(acceptedServer)

  remoteWindow?.close()
  const window = new BrowserWindow({
    title: `LocalShare · ${acceptedServer.name}`,
    url: acceptedServer.url,
    frame: {
      width: 1180,
      height: 800,
    },
    sandbox: true,
    spellCheck: true,
    navigationRules: `^*,${navigationRuleForServer(acceptedServer.url)}`,
  })
  remoteWindow = window
  currentRemote = acceptedServer
  connecting = false
  installApplicationMenu()

  window.webview.on('dom-ready', () => {
    writeTestMarker('server-ready', { name: acceptedServer.name, url: acceptedServer.url })
  })
  window.webview.on('will-navigate', (event) => {
    const target = navigationTarget(event)
    if (!target) return
    try {
      const targetUrl = new URL(target)
      if (
        (targetUrl.protocol === 'http:' || targetUrl.protocol === 'https:') &&
        targetUrl.origin !== new URL(acceptedServer.url).origin
      ) {
        Utils.openExternal(target)
      }
    } catch {
      // Navigation rules still block malformed targets.
    }
  })
  window.on('close', () => {
    if (remoteWindow?.id === window.id) {
      remoteWindow = null
      currentRemote = null
      installApplicationMenu()
    }
  })

  const picker = pickerWindow
  pickerWindow = null
  pickerRpcClient = null
  picker?.close()
  await discovery?.stop()
  discovery = null
  window.activate()
  return true
}

function navigationTarget(event: unknown): string | null {
  if (!event || typeof event !== 'object') return null
  const data = 'data' in event && event.data && typeof event.data === 'object' ? event.data : null
  if (!data || !('detail' in data) || typeof data.detail !== 'string') return null
  return data.detail
}

function menuAction(event: unknown): string | null {
  if (!event || typeof event !== 'object') return null
  const data = 'data' in event && event.data && typeof event.data === 'object' ? event.data : null
  if (!data || !('action' in data) || typeof data.action !== 'string') return null
  return data.action
}

function writeTestMarker(phase: string, data: Record<string, unknown>) {
  if (!process.env.LOCALSHARE_DESKTOP_TEST_OUTPUT) return
  appendFileSync(
    process.env.LOCALSHARE_DESKTOP_TEST_OUTPUT,
    `${JSON.stringify({ phase, at: new Date().toISOString(), ...data })}\n`,
  )
}

function installApplicationMenu() {
  ApplicationMenu.setApplicationMenu([
    {
      label: 'LocalShare Desktop',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: '服务器',
      submenu: [
        {
          label: '切换服务器…',
          action: 'switch-server',
          accelerator: 'CommandOrControl+K',
        },
        {
          label: '重新加载当前服务器',
          action: 'reload-server',
          accelerator: 'CommandOrControl+R',
          enabled: currentRemote !== null,
        },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
  ])
}

installApplicationMenu()

Electrobun.events.on('application-menu-clicked', (event) => {
  const action = menuAction(event)
  if (action === 'switch-server') {
    void openPicker('switch')
  } else if (action === 'reload-server' && currentRemote) {
    remoteWindow?.webview.loadURL(currentRemote.url)
  }
})

mkdirSync(dirname(SETTINGS_PATH), { recursive: true })
const lastServer = settings.load().lastServer
if (lastServer && (await probeServer(lastServer.url))) {
  if (!(await openServer(lastServer))) {
    await openPicker('startup')
  }
} else {
  await openPicker('startup')
}

process.on('SIGINT', () => {
  void discovery?.stop().finally(() => process.exit(130))
})
process.on('SIGTERM', () => {
  void discovery?.stop().finally(() => process.exit(143))
})
if (process.platform === 'win32') {
  process.on('SIGBREAK', () => {
    void discovery?.stop().finally(() => process.exit(143))
  })
}
