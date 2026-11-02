import {
  ADMIN_USERNAME,
  adminOptionalSessionResponseSchema,
  adminPasswordChangeResponseSchema,
  adminSessionResponseSchema,
  apiErrorSchema,
  type AdminIdentity,
  type AdminLoginRequest,
  type AdminPasswordChangeRequest,
} from '@localshare/contracts'
import axios from 'axios'

const api = axios.create({
  baseURL: '/',
  timeout: 10_000,
})

export class AdminApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'AdminApiError'
  }
}

function normalizeError(error: unknown): AdminApiError {
  if (axios.isAxiosError(error)) {
    const parsed = apiErrorSchema.safeParse(error.response?.data)
    if (parsed.success) {
      return new AdminApiError(parsed.data.error.code, parsed.data.error.message)
    }
  }

  return new AdminApiError(
    'ADMIN_REQUEST_FAILED',
    error instanceof Error ? error.message : '无法连接本地服务',
  )
}

export async function fetchAdminSession(): Promise<AdminIdentity | null> {
  try {
    const response = await api.get('/api/v1/admin/auth/session')
    return adminOptionalSessionResponseSchema.parse(response.data).admin
  } catch (error) {
    throw normalizeError(error)
  }
}

export async function loginAdmin(password: string): Promise<AdminIdentity> {
  const request: AdminLoginRequest = {
    username: ADMIN_USERNAME,
    password,
  }

  try {
    const response = await api.post('/api/v1/admin/auth/login', request)
    return adminSessionResponseSchema.parse(response.data).admin
  } catch (error) {
    throw normalizeError(error)
  }
}

export async function logoutAdmin(): Promise<void> {
  try {
    await api.post('/api/v1/admin/auth/logout')
  } catch (error) {
    throw normalizeError(error)
  }
}

export async function changeAdminPassword(request: AdminPasswordChangeRequest): Promise<void> {
  try {
    const response = await api.patch('/api/v1/admin/auth/password', request)
    adminPasswordChangeResponseSchema.parse(response.data)
  } catch (error) {
    throw normalizeError(error)
  }
}

export function authErrorMessage(error: AdminApiError): string {
  const messages: Record<string, string> = {
    ADMIN_INVALID_CREDENTIALS: '账户或密码不正确',
    ADMIN_PASSWORD_INVALID: '当前密码不正确',
    ADMIN_PASSWORD_UNCHANGED: '新密码不能与当前密码相同',
    ADMIN_RATE_LIMITED: '登录尝试过于频繁，请稍后再试',
    ADMIN_UNAUTHORIZED: '登录已过期，请重新登录',
    INVALID_REQUEST: '请输入有效信息',
  }

  return messages[error.code] ?? error.message
}
