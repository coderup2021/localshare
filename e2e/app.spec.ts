import { networkInterfaces } from 'node:os'
import { expect, test, type Page } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:7777'

function lanBaseURL() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        return `http://${address.address}:7777`
      }
    }
  }
  return null
}

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

test('user message is visible to another anonymous browser', async ({ browser, page, request }) => {
  const browserErrors = collectBrowserErrors(page)

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LocalShare' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '公共频道' })).toBeVisible()
  await expect(page.getByText('本地服务已连接')).toBeVisible()

  const message = `E2E public message ${Date.now()}`
  await page.getByLabel('消息内容').fill(message)
  await page.getByRole('button', { name: '发送' }).click()
  await expect(page.getByText(message)).toBeVisible()

  const secondContext = await browser.newContext()
  const secondPage = await secondContext.newPage()
  const secondBrowserErrors = collectBrowserErrors(secondPage)
  await secondPage.goto(baseURL)
  await expect(secondPage.getByText(message)).toBeVisible()
  expect(secondBrowserErrors).toEqual([])
  await secondContext.close()

  const readiness = await request.get('/api/v1/health/ready')
  expect(readiness.status()).toBe(200)
  await expect(readiness.json()).resolves.toMatchObject({
    status: 'ok',
    checks: { database: 'up' },
  })
  expect(browserErrors).toEqual([])
})

test('admin logs in through /admin and reaches the API', async ({ page }) => {
  const browserErrors = collectBrowserErrors(page)

  await page.goto('/admin/')
  await expect(page.getByRole('heading', { name: '管理员登录' })).toBeVisible()
  await page.getByLabel('密码').fill('12345678')
  await page.getByRole('button', { name: /登\s*录/ }).click()

  await expect(page.getByRole('heading', { name: '工程概览' })).toBeVisible()
  await expect(page.getByText('服务在线')).toBeVisible()
  await expect(page.getByText('管理员账户')).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: '工程概览' })).toBeVisible()

  await page.getByRole('button', { name: '修改密码' }).click()
  await expect(page.getByRole('dialog', { name: '修改管理员密码' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: /退\s*出\s*登\s*录/ }).click()
  await expect(page.getByRole('heading', { name: '管理员登录' })).toBeVisible()
  expect(browserErrors).toEqual([])
})

test('non-loopback browser is read-only', async ({ browser }) => {
  const remoteURL = lanBaseURL()
  test.skip(!remoteURL, 'No non-loopback IPv4 interface is available')
  if (!remoteURL) return

  const context = await browser.newContext()
  const page = await context.newPage()
  const browserErrors = collectBrowserErrors(page)

  await page.goto(remoteURL)
  await expect(page.getByRole('heading', { name: '公共频道' })).toBeVisible()
  await expect(
    page.getByText('当前为只读模式：只有通过 127.0.0.1 访问本地机时可以发送消息。'),
  ).toBeVisible()
  await expect(page.getByLabel('消息内容')).toBeDisabled()
  await expect(page.getByRole('button', { name: '发送' })).toBeDisabled()
  expect(browserErrors).toEqual([])

  await context.close()
})
