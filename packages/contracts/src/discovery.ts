import { z } from 'zod'

export const DISCOVERY_PROTOCOL = 'localshare-discovery' as const
export const DISCOVERY_PROTOCOL_VERSION = 1 as const
export const DISCOVERY_PORT = 49_777 as const
export const DISCOVERY_MAX_PACKET_BYTES = 1_024 as const

const discoveryEnvelopeSchema = z.object({
  protocol: z.literal(DISCOVERY_PROTOCOL),
  version: z.literal(DISCOVERY_PROTOCOL_VERSION),
  requestId: z.uuid(),
})

export const discoveryQuerySchema = discoveryEnvelopeSchema.extend({
  type: z.literal('query'),
  client: z.literal('desktop'),
  clientVersion: z.string().min(1).max(64),
})

export type DiscoveryQuery = z.infer<typeof discoveryQuerySchema>

export const discoveryResponseSchema = discoveryEnvelopeSchema.extend({
  type: z.literal('response'),
  serverId: z.uuid(),
  serverName: z.string().min(1).max(255),
  serverVersion: z.string().min(1).max(64),
  webPort: z.number().int().min(1).max(65_535),
  capabilities: z.tuple([z.literal('public-chat-v1')]),
  issuedAt: z.iso.datetime(),
})

export type DiscoveryResponse = z.infer<typeof discoveryResponseSchema>

function ipv4Parts(address: string): [number, number, number, number] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address)
  if (!match) return null

  const parts = match.slice(1).map(Number)
  if (parts.some((part) => part > 255)) return null
  return parts as [number, number, number, number]
}

export function isIPv4Address(address: string): boolean {
  return ipv4Parts(address) !== null
}

export function isPrivateIPv4Address(address: string): boolean {
  const parts = ipv4Parts(address)
  if (!parts) return false

  const [first, second] = parts
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127)
  )
}
