import dgram from 'node:dgram'
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os'
import {
  DISCOVERY_MAX_PACKET_BYTES,
  DISCOVERY_PROTOCOL,
  DISCOVERY_PROTOCOL_VERSION,
  discoveryResponseSchema,
  isIPv4Address,
  isPrivateIPv4Address,
} from '@localshare/contracts'

export type DiscoveredServer = {
  serverId: string
  name: string
  address: string
  webUrl: string
  webPort: number
  serverVersion: string
  lastSeenAt: number
}

export type DiscoverySnapshot = {
  servers: DiscoveredServer[]
  scanning: boolean
}

type DiscoveryClientOptions = {
  port: number
  clientVersion: string
  scanIntervalMs?: number
  ttlMs?: number
  now?: () => number
  onChange: (snapshot: DiscoverySnapshot) => void
  logger?: Pick<Console, 'warn'>
}

function ipv4ToNumber(address: string): number | null {
  if (!isIPv4Address(address)) return null
  return address
    .split('.')
    .map(Number)
    .reduce((value, part) => ((value << 8) | part) >>> 0, 0)
}

function numberToIPv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.')
}

export function directedBroadcastAddress(address: string, netmask: string): string | null {
  const ip = ipv4ToNumber(address)
  const mask = ipv4ToNumber(netmask)
  if (ip === null || mask === null) return null
  return numberToIPv4(((ip & mask) | (~mask >>> 0)) >>> 0)
}

export function discoveryTargets(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>,
  port: number,
): Array<{ address: string; port: number }> {
  const addresses = new Set<string>(['127.0.0.1', '255.255.255.255'])

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      const broadcast = directedBroadcastAddress(entry.address, entry.netmask)
      if (broadcast && broadcast !== '0.0.0.0') addresses.add(broadcast)
    }
  }

  return Array.from(addresses, (address) => ({ address, port }))
}

export function normalizeManualServerUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('请输入服务器地址')

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  const url = new URL(candidate)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('服务器地址必须使用 http 或 https')
  }
  if (url.username || url.password) throw new Error('服务器地址不能包含账户信息')
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    throw new Error('请输入服务器根地址，不要包含路径、查询参数或片段')
  }

  return `${url.origin}/`
}

export class DiscoveryClient {
  private readonly socket = dgram.createSocket('udp4')
  private readonly servers = new Map<string, DiscoveredServer>()
  private readonly pendingRequests = new Map<string, number>()
  private readonly scanIntervalMs: number
  private readonly ttlMs: number
  private readonly now: () => number
  private scanTimer: NodeJS.Timeout | null = null
  private cleanupTimer: NodeJS.Timeout | null = null
  private started = false
  private stopped = false

  constructor(private readonly options: DiscoveryClientOptions) {
    this.scanIntervalMs = options.scanIntervalMs ?? 3_000
    this.ttlMs = options.ttlMs ?? 10_000
    this.now = options.now ?? Date.now
  }

  async start(): Promise<void> {
    if (this.started) return

    await new Promise<void>((resolve, reject) => {
      const fail = (error: Error) => {
        this.socket.off('listening', ready)
        try {
          this.socket.close()
        } catch {
          // The failed bind may not have created a closeable socket handle.
        }
        reject(error)
      }
      const ready = () => {
        this.socket.off('error', fail)
        resolve()
      }

      this.socket.once('error', fail)
      this.socket.once('listening', ready)
      this.socket.bind(0, '0.0.0.0')
    })

    this.started = true
    this.socket.setBroadcast(true)
    this.socket.on('message', (packet, sender) => this.handlePacket(packet, sender.address))
    this.socket.on('error', (error) => this.options.logger?.warn(error.message))
    this.scanNow()
    this.scanTimer = setInterval(() => this.scanNow(), this.scanIntervalMs)
    this.cleanupTimer = setInterval(() => this.removeExpired(), Math.min(1_000, this.ttlMs))
  }

  scanNow(): DiscoverySnapshot {
    if (!this.started || this.stopped) return this.snapshot()

    const requestId = crypto.randomUUID()
    const now = this.now()
    this.pendingRequests.set(requestId, now + this.ttlMs)
    this.prunePendingRequests(now)

    const packet = Buffer.from(
      JSON.stringify({
        protocol: DISCOVERY_PROTOCOL,
        version: DISCOVERY_PROTOCOL_VERSION,
        type: 'query',
        requestId,
        client: 'desktop',
        clientVersion: this.options.clientVersion,
      }),
    )

    for (const target of discoveryTargets(networkInterfaces(), this.options.port)) {
      this.socket.send(packet, target.port, target.address, (error) => {
        if (error) this.options.logger?.warn(`UDP discovery send failed: ${error.message}`)
      })
    }

    return this.snapshot()
  }

  snapshot(): DiscoverySnapshot {
    this.removeExpired()
    return {
      servers: Array.from(this.servers.values()).sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
      scanning: this.started && !this.stopped,
    }
  }

  async stop(): Promise<void> {
    if (this.stopped) return
    this.stopped = true
    if (this.scanTimer) clearInterval(this.scanTimer)
    if (this.cleanupTimer) clearInterval(this.cleanupTimer)
    this.scanTimer = null
    this.cleanupTimer = null
    this.socket.removeAllListeners()

    if (this.started) {
      await new Promise<void>((resolve) => this.socket.close(() => resolve()))
    }
    this.started = false
  }

  private handlePacket(packet: Buffer, sourceAddress: string) {
    if (this.stopped || packet.byteLength > DISCOVERY_MAX_PACKET_BYTES) return
    if (!isPrivateIPv4Address(sourceAddress)) return

    let input: unknown
    try {
      input = JSON.parse(packet.toString('utf8'))
    } catch {
      return
    }

    const parsed = discoveryResponseSchema.safeParse(input)
    if (!parsed.success || !this.pendingRequests.has(parsed.data.requestId)) return

    const server: DiscoveredServer = {
      serverId: parsed.data.serverId,
      name: parsed.data.serverName,
      address: sourceAddress,
      webUrl: `http://${sourceAddress}:${parsed.data.webPort}/`,
      webPort: parsed.data.webPort,
      serverVersion: parsed.data.serverVersion,
      lastSeenAt: this.now(),
    }
    this.servers.set(server.serverId, server)
    this.options.onChange(this.snapshot())
  }

  private removeExpired() {
    const cutoff = this.now() - this.ttlMs
    let changed = false
    for (const [serverId, server] of this.servers) {
      if (server.lastSeenAt < cutoff) {
        this.servers.delete(serverId)
        changed = true
      }
    }
    this.prunePendingRequests(this.now())
    if (changed) this.options.onChange(this.snapshot())
  }

  private prunePendingRequests(now: number) {
    for (const [requestId, expiresAt] of this.pendingRequests) {
      if (expiresAt < now) this.pendingRequests.delete(requestId)
    }
  }
}
