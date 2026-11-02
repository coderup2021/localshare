import { healthStatusSchema, type HealthStatus } from '@localshare/contracts'
import axios from 'axios'

export async function fetchAdminHealth(): Promise<HealthStatus> {
  const response = await axios.get('/api/v1/health/live', { timeout: 5_000 })
  return healthStatusSchema.parse(response.data)
}

export function statusLabel(state: 'idle' | 'checking' | 'online' | 'offline'): string {
  const labels = {
    idle: '等待检查',
    checking: '检查中',
    online: '服务在线',
    offline: '服务离线',
  } as const

  return labels[state]
}
