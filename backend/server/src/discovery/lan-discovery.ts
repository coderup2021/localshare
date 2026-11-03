import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import dgram from 'node:dgram'
import {
  DISCOVERY_MAX_PACKET_BYTES,
  DISCOVERY_PROTOCOL,
  DISCOVERY_PROTOCOL_VERSION,
  discoveryQuerySchema,
  discoveryResponseSchema,
  type DiscoveryResponse,
} from '@localshare/contracts'
import { z } from 'zod'

const serverIdentitySchema = z.object({
  serverId: z.uuid(),
  createdAt: z.iso.datetime(),
})

type ServerIdentity = z.infer<typeof serverIdentitySchema>

export type LanDiscoveryOptions = {
  dataDir: string
  host: string
  port: number
  webPort: number
  serverVersion: string
  serverName?: string
  logger?: Pick<Console, 'info' | 'warn' | 'error'>
}

export type LanDiscovery = {
  address: {
    address: string
    family: 'IPv4'
    port: number
  }
  serverId: string
  close: () => Promise<void>
}

type RateLimitEntry = {
  windowStartedAt: number
  count: number
}

function loadOrCreateIdentity(dataDir: string): ServerIdentity {
  const path = join(dataDir, 'server-identity.json')

  try {
    return serverIdentitySchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(`Server discovery identity is invalid: ${path}`, { cause: error })
    }
  }

  const identity = serverIdentitySchema.parse({
    serverId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  })
  const temporary = `${path}.${process.pid}.tmp`
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(temporary, `${JSON.stringify(identity, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, path)
  return identity
}

function createRateLimiter(limit = 5, windowMs = 1_000) {
  const entries = new Map<string, RateLimitEntry>()
  const maxEntries = 4_096

  return (address: string, now: number) => {
    if (!entries.has(address) && entries.size >= maxEntries) {
      for (const [key, entry] of entries) {
        if (now - entry.windowStartedAt >= windowMs) entries.delete(key)
      }
      if (entries.size >= maxEntries) return false
    }

    const current = entries.get(address)
    if (!current || now - current.windowStartedAt >= windowMs) {
      entries.set(address, { windowStartedAt: now, count: 1 })
      return true
    }

    if (current.count >= limit) return false
    current.count += 1
    return true
  }
}

export async function startLanDiscovery(options: LanDiscoveryOptions): Promise<LanDiscovery> {
  const identity = loadOrCreateIdentity(options.dataDir)
  const logger = options.logger ?? console
  const serverName = (options.serverName ?? `LocalShare (${hostname()})`).slice(0, 255)
  const isAllowed = createRateLimiter()
  const socket = dgram.createSocket('udp4')
  let closed = false

  const address = await new Promise<LanDiscovery['address']>((resolve, reject) => {
    const fail = (error: Error) => {
      socket.removeAllListeners()
      try {
        socket.close()
      } catch {
        // The bind may have failed before a socket handle was created.
      }
      reject(error)
    }

    socket.once('error', fail)
    socket.bind({ address: options.host, port: options.port }, () => {
      socket.off('error', fail)
      const bound = socket.address()
      resolve({
        address: bound.address,
        family: 'IPv4',
        port: bound.port,
      })
    })
  })

  socket.on('error', (error) => {
    logger.error('LocalShare UDP discovery socket error', error)
  })

  socket.on('message', (packet, sender) => {
    if (closed || packet.byteLength > DISCOVERY_MAX_PACKET_BYTES) return
    if (!isAllowed(sender.address, Date.now())) return

    let input: unknown
    try {
      input = JSON.parse(packet.toString('utf8'))
    } catch {
      return
    }

    const parsed = discoveryQuerySchema.safeParse(input)
    if (!parsed.success) return

    const response: DiscoveryResponse = discoveryResponseSchema.parse({
      protocol: DISCOVERY_PROTOCOL,
      version: DISCOVERY_PROTOCOL_VERSION,
      type: 'response',
      requestId: parsed.data.requestId,
      serverId: identity.serverId,
      serverName,
      serverVersion: options.serverVersion,
      webPort: options.webPort,
      capabilities: ['public-chat-v1'],
      issuedAt: new Date().toISOString(),
    })

    socket.send(JSON.stringify(response), sender.port, sender.address, (error) => {
      if (error) logger.warn(`Could not send LocalShare discovery response: ${error.message}`)
    })
  })

  return {
    address,
    serverId: identity.serverId,
    close: () =>
      new Promise<void>((resolve) => {
        if (closed) {
          resolve()
          return
        }

        closed = true
        socket.close(() => resolve())
      }),
  }
}
