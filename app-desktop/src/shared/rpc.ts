import type { RPCSchema } from 'electrobun/main'

import type { DiscoveredServer, DiscoverySnapshot } from '../bun/discovery-client'

export type ConnectionStatus = {
  phase: 'idle' | 'checking' | 'opening' | 'error'
  serverName?: string
  code?: string
  message?: string
}

export type DesktopRPC = {
  bun: RPCSchema<{
    requests: {
      getSnapshot: {
        params: Record<string, never>
        response: DiscoverySnapshot
      }
      scanNow: {
        params: Record<string, never>
        response: DiscoverySnapshot
      }
      connect: {
        params: { serverId: string }
        response: { accepted: boolean }
      }
      connectManual: {
        params: { address: string }
        response: { accepted: boolean }
      }
    }
    messages: Record<string, never>
  }>
  webview: RPCSchema<{
    requests: Record<string, never>
    messages: {
      snapshotUpdated: DiscoverySnapshot
      connectionStatus: ConnectionStatus
    }
  }>
}

export type { DiscoveredServer, DiscoverySnapshot }
