import { healthStatusSchema } from '@localshare/contracts'

export async function probeServer(
  baseUrl: string,
  options: { timeoutMs?: number; fetcher?: typeof fetch } = {},
): Promise<boolean> {
  const fetcher = options.fetcher ?? fetch

  try {
    const response = await fetcher(new URL('/api/v1/health/ready', baseUrl), {
      redirect: 'manual',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(options.timeoutMs ?? 2_500),
    })
    if (!response.ok) return false
    const health = healthStatusSchema.parse(await response.json())
    return health.status === 'ok'
  } catch {
    return false
  }
}

export function navigationRuleForServer(url: string): string {
  return `${new URL(url).origin}/*`
}
