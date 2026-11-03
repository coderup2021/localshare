import { afterEach, describe, expect, test } from 'bun:test'
import dgram from 'node:dgram'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DISCOVERY_PROTOCOL,
  DISCOVERY_PROTOCOL_VERSION,
  discoveryQuerySchema,
  discoveryResponseSchema,
} from '@localshare/contracts'

import {
  DiscoveryClient,
  directedBroadcastAddress,
  discoveryTargets,
  normalizeManualServerUrl,
} from './discovery-client'

const clients: DiscoveryClient[] = []
const sockets: dgram.Socket[] = []
const directories: string[] = []

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.stop()))
  for (const socket of sockets.splice(0)) {
    try {
      socket.close()
    } catch {
      // Already closed by the test.
    }
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('desktop discovery client', () => {
  test('computes directed broadcast addresses and includes loopback', () => {
    expect(directedBroadcastAddress('192.168.10.42', '255.255.255.0')).toBe('192.168.10.255')
    expect(directedBroadcastAddress('10.20.30.40', '255.255.0.0')).toBe('10.20.255.255')

    const targets = discoveryTargets(
      {
        eth0: [
          {
            address: '192.168.10.42',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: '00:00:00:00:00:00',
            internal: false,
            cidr: '192.168.10.42/24',
          },
        ],
      },
      49_777,
    )
    expect(targets).toContainEqual({ address: '127.0.0.1', port: 49_777 })
    expect(targets).toContainEqual({ address: '192.168.10.255', port: 49_777 })
  })

  test('normalizes manual addresses without accepting paths or credentials', () => {
    expect(normalizeManualServerUrl('192.168.1.20:8888')).toBe('http://192.168.1.20:8888/')
    expect(normalizeManualServerUrl('https://localshare.lan')).toBe('https://localshare.lan/')
    expect(() => normalizeManualServerUrl('http://user:pass@host:8888')).toThrow()
    expect(() => normalizeManualServerUrl('http://host:8888/admin')).toThrow()
    expect(() => normalizeManualServerUrl('ftp://host')).toThrow()
  })

  test('receives a correlated response from a LAN server', async () => {
    const responder = dgram.createSocket('udp4')
    sockets.push(responder)
    await new Promise<void>((resolve) => responder.bind(0, '127.0.0.1', resolve))
    const port = responder.address().port
    const serverId = crypto.randomUUID()

    responder.on('message', (packet, sender) => {
      const query = discoveryQuerySchema.parse(JSON.parse(packet.toString('utf8')))
      const response = discoveryResponseSchema.parse({
        protocol: DISCOVERY_PROTOCOL,
        version: DISCOVERY_PROTOCOL_VERSION,
        type: 'response',
        requestId: query.requestId,
        serverId,
        serverName: 'Test LocalShare',
        serverVersion: '0.2.0',
        webPort: 7777,
        capabilities: ['public-chat-v1'],
        issuedAt: new Date().toISOString(),
      })
      responder.send(JSON.stringify(response), sender.port, sender.address)
    })

    const snapshot = await new Promise<ReturnType<DiscoveryClient['snapshot']>>(
      (resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Desktop discovery timed out')), 2_000)
        const client = new DiscoveryClient({
          port,
          clientVersion: '0.1.0',
          scanIntervalMs: 60_000,
          ttlMs: 1_000,
          onChange(next) {
            if (next.servers.length === 1) {
              clearTimeout(timeout)
              resolve(next)
            }
          },
          logger: { warn() {} },
        })
        clients.push(client)
        void client.start()
      },
    )

    expect(snapshot.servers[0]).toMatchObject({
      serverId,
      name: 'Test LocalShare',
      address: '127.0.0.1',
      webUrl: 'http://127.0.0.1:7777/',
    })
  })

  test('accepts multiple server responses for the same broadcast request', async () => {
    const responder = dgram.createSocket('udp4')
    sockets.push(responder)
    await new Promise<void>((resolve) => responder.bind(0, '127.0.0.1', resolve))
    const port = responder.address().port

    responder.on('message', (packet, sender) => {
      const query = discoveryQuerySchema.parse(JSON.parse(packet.toString('utf8')))
      for (const [index, serverId] of [crypto.randomUUID(), crypto.randomUUID()].entries()) {
        const response = discoveryResponseSchema.parse({
          protocol: DISCOVERY_PROTOCOL,
          version: DISCOVERY_PROTOCOL_VERSION,
          type: 'response',
          requestId: query.requestId,
          serverId,
          serverName: `Test LocalShare ${index + 1}`,
          serverVersion: '0.2.0',
          webPort: 7_777 + index,
          capabilities: ['public-chat-v1'],
          issuedAt: new Date().toISOString(),
        })
        responder.send(JSON.stringify(response), sender.port, sender.address)
      }
    })

    const snapshot = await new Promise<ReturnType<DiscoveryClient['snapshot']>>(
      (resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Desktop discovery timed out')), 2_000)
        const client = new DiscoveryClient({
          port,
          clientVersion: '0.1.0',
          scanIntervalMs: 60_000,
          ttlMs: 1_000,
          onChange(next) {
            if (next.servers.length === 2) {
              clearTimeout(timeout)
              resolve(next)
            }
          },
          logger: { warn() {} },
        })
        clients.push(client)
        void client.start()
      },
    )

    expect(snapshot.servers).toHaveLength(2)
  })

  test('persists the last connected server atomically', async () => {
    const { SettingsStore } = await import('./settings')
    const directory = mkdtempSync(join(tmpdir(), 'localshare-desktop-settings-'))
    directories.push(directory)
    const store = new SettingsStore(join(directory, 'settings.json'))
    expect(store.load().lastServer).toBeNull()

    store.saveLastServer({
      serverId: crypto.randomUUID(),
      name: 'Living room server',
      url: 'http://192.168.1.20:8888/',
      lastConnectedAt: new Date().toISOString(),
    })

    expect(store.load().lastServer).toMatchObject({
      name: 'Living room server',
      url: 'http://192.168.1.20:8888/',
    })
  })
})
