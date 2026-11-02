import { expect, test, type Page } from '@playwright/test'

function collectBrowserErrors(page: Page) {
  const errors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      const location = message.location().url
      errors.push(location ? `${message.text()} (${location})` : message.text())
    }
  })
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      errors.push(`${response.status()} ${response.url()}`)
    }
  })

  return errors
}

test('user web loads and reaches the API through the unified entry', async ({ page, request }) => {
  const browserErrors = collectBrowserErrors(page)

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LocalShare' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '局域网里的共享空间' })).toBeVisible()
  await expect(page.getByText('本地服务已连接')).toBeVisible()

  const readiness = await request.get('/api/v1/health/ready')
  expect(readiness.status()).toBe(200)
  await expect(readiness.json()).resolves.toMatchObject({
    status: 'ok',
    checks: { database: 'up' },
  })
  expect(browserErrors).toEqual([])
})

test('admin web loads through /admin and reaches the API', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page)

  await page.goto('/admin/')
  await expect(page.getByText('LocalShare Admin')).toBeVisible()
  await expect(page.getByRole('heading', { name: '工程概览' })).toBeVisible()
  await expect(page.getByText('服务在线')).toBeVisible()
  await expect(page.getByText('管理员账户')).toBeVisible()
  expect(browserErrors).toEqual([])
})
