import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import dgram from 'node:dgram'
import {
  DISCOVERY_PROTOCOL,
  DISCOVERY_PROTOCOL_VERSION,
  discoveryResponseSchema,
} from '@localshare/contracts'

import { startLanDiscovery, type LanDiscovery } from './lan-discovery'

const temporaryDirectories: string[] = []
const discoveryServers: LanDiscovery[] = []

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'localshare-discovery-'))
  temporaryDirectories.push(directory)
  return directory
}

async function startTestDiscovery(dataDir = temporaryDirectory()) {
  const server = await startLanDiscovery({
    dataDir,
    host: '127.0.0.1',
    port: 0,
    webPort: 7777,
    serverVersion: '0.2.0',
    serverName: 'Test LocalShare',
    logger: { info() {}, warn() {}, error() {} },
  })
  discoveryServers.push(server)
  return server
}

afterEach(async () => {
  await Promise.all(discoveryServers.splice(0).map((server) => server.close()))
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('LAN discovery server', () => {
  test('returns a correlated unicast response and keeps its server identity stable', async () => {
    const dataDir = temporaryDirectory()
    const server = await startTestDiscovery(dataDir)
    const requestId = crypto.randomUUID()
    const client = dgram.createSocket('udp4')

    const response = await new Promise<ReturnType<typeof discoveryResponseSchema.parse>>(
      (resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Discovery response timed out')), 2_000)
        client.once('message', (packet) => {
          clearTimeout(timeout)
          try {
            resolve(discoveryResponseSchema.parse(JSON.parse(packet.toString('utf8'))))
          } catch (error) {
            reject(error)
          }
        })
        client.send(
          JSON.stringify({
            protocol: DISCOVERY_PROTOCOL,
            version: DISCOVERY_PROTOCOL_VERSION,
            type: 'query',
            requestId,
            client: 'desktop',
            clientVersion: '0.1.0',
          }),
          server.address.port,
          '127.0.0.1',
        )
      },
    )
    client.close()

    expect(response.requestId).toBe(requestId)
    expect(response.serverId).toBe(server.serverId)
    expect(response.webPort).toBe(7777)

    await server.close()
    discoveryServers.splice(discoveryServers.indexOf(server), 1)

    const identity = JSON.parse(readFileSync(join(dataDir, 'server-identity.json'), 'utf8')) as {
      serverId: string
    }
    const restarted = await startTestDiscovery(dataDir)
    expect(restarted.serverId).toBe(identity.serverId)
  })

  test('ignores malformed and unsupported packets', async () => {
    const server = await startTestDiscovery()
    const client = dgram.createSocket('udp4')
    let received = false
    client.on('message', () => {
      received = true
    })

    client.send('not-json', server.address.port, '127.0.0.1')
    client.send(
      JSON.stringify({
        protocol: DISCOVERY_PROTOCOL,
        version: 99,
        type: 'query',
        requestId: crypto.randomUUID(),
        client: 'desktop',
        clientVersion: '0.1.0',
      }),
      server.address.port,
      '127.0.0.1',
    )

    await Bun.sleep(150)
    client.close()
    expect(received).toBe(false)
  })

  test('fails instead of silently starting when the UDP port is occupied', async () => {
    const occupied = dgram.createSocket('udp4')
    await new Promise<void>((resolve) => occupied.bind(0, '127.0.0.1', resolve))
    const port = occupied.address().port

    try {
      await expect(
        startLanDiscovery({
          dataDir: temporaryDirectory(),
          host: '127.0.0.1',
          port,
          webPort: 7777,
          serverVersion: '0.2.0',
          logger: { info() {}, warn() {}, error() {} },
        }),
      ).rejects.toThrow()
    } finally {
      occupied.close()
    }
  })
})
