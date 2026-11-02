import { healthStatusSchema, type HealthStatus } from '@localshare/contracts'
import axios from 'axios'

const api = axios.create({
  baseURL: '/',
  timeout: 5_000,
})

export async function fetchHealth(signal?: AbortSignal): Promise<HealthStatus> {
  const response = await api.get('/api/v1/health/live', signal ? { signal } : {})
  return healthStatusSchema.parse(response.data)
}

export function describeHealth(status: HealthStatus | null): string {
  if (!status) return '正在连接本地服务'
  return status.status === 'ok' ? '本地服务已连接' : '本地服务状态异常'
}
