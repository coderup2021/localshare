import Electrobun, { Electroview } from 'electrobun/view'

import type { ConnectionStatus, DesktopRPC, DiscoverySnapshot } from '../shared/rpc'

type SnapshotListener = (snapshot: DiscoverySnapshot) => void
type StatusListener = (status: ConnectionStatus) => void

const snapshotListeners = new Set<SnapshotListener>()
const statusListeners = new Set<StatusListener>()

export const desktopRpc = Electroview.defineRPC<DesktopRPC>({
  maxRequestTime: 30_000,
  handlers: {
    requests: {},
    messages: {
      snapshotUpdated: (snapshot) => {
        for (const listener of snapshotListeners) listener(snapshot)
      },
      connectionStatus: (status) => {
        for (const listener of statusListeners) listener(status)
      },
    },
  },
})

new Electrobun.Electroview({ rpc: desktopRpc })

export function onSnapshot(listener: SnapshotListener) {
  snapshotListeners.add(listener)
  return () => snapshotListeners.delete(listener)
}

export function onConnectionStatus(listener: StatusListener) {
  statusListeners.add(listener)
  return () => statusListeners.delete(listener)
}
