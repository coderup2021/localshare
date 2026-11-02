import { describe, expect, test } from 'bun:test'

import { AdminApiError, authErrorMessage } from './auth'

describe('admin auth messages', () => {
  test('maps invalid credentials to a safe local message', () => {
    expect(authErrorMessage(new AdminApiError('ADMIN_INVALID_CREDENTIALS', 'Invalid'))).toBe(
      '账户或密码不正确',
    )
  })

  test('falls back to the server message', () => {
    expect(authErrorMessage(new AdminApiError('UNKNOWN', 'Unknown failure'))).toBe(
      'Unknown failure',
    )
  })
})
