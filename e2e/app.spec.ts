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

  const secondContext = await browser.newContext()
  const secondPage = await secondContext.newPage()
  const secondBrowserErrors = collectBrowserErrors(secondPage)
  await secondPage.goto(baseURL)
  await expect(secondPage.getByRole('heading', { name: '公共频道' })).toBeVisible()
  await expect(secondPage.getByText('实时已连接')).toBeVisible()

  const message = `E2E public message ${Date.now()}`
  const composer = page.getByLabel('消息内容')
  const messageList = page.getByLabel('消息列表')
  const composerHint = page.getByText('Enter 发送 · Shift+Enter 换行', { exact: true })
  await expect(page.getByRole('button', { name: '发送', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('添加文件夹')).toHaveCount(0)
  await expect(composerHint).toBeVisible()
  await expect(messageList).toBeVisible()
  await expect(messageList).toHaveCSS('overflow-y', 'auto')
  await expect(page.locator('main')).toHaveCSS('overflow', 'hidden')
  await composer.fill(message)
  await composer.press('Shift+Enter')
  await composer.type('second line')
  await expect(composer).toHaveValue(`${message}\nsecond line`)
  await expect(page.locator('article').filter({ hasText: message })).toHaveCount(0)
  const windowScrollY = await page.evaluate(() => Number(Reflect.get(globalThis, 'scrollY')))
  await composer.press('Enter')
  await expect(page.locator('article').filter({ hasText: message })).toBeVisible()
  await expect
    .poll(() =>
      messageList.evaluate((element) => {
        const remaining = element.scrollHeight - element.clientHeight - element.scrollTop
        return Math.abs(remaining)
      }),
    )
    .toBeLessThan(3)
  expect(await page.evaluate(() => Number(Reflect.get(globalThis, 'scrollY')))).toBe(windowScrollY)
  await expect(secondPage.locator('article').filter({ hasText: message })).toBeVisible({
    timeout: 5_000,
  })

  const attachmentName = `e2e-${Date.now()}.txt`
  await page.getByLabel('选择文件', { exact: true }).setInputFiles({
    name: attachmentName,
    mimeType: 'text/plain',
    buffer: Buffer.from('LocalShare attachment E2E'),
  })

  const attachmentArticle = page.locator('article').filter({ hasText: attachmentName })
  await expect(attachmentArticle).toBeVisible()
  await expect(page.getByLabel('待发送附件')).toHaveCount(0)
  await expect(secondPage.locator('article').filter({ hasText: attachmentName })).toBeVisible({
    timeout: 5_000,
  })

  const attachmentURL = await attachmentArticle.getByRole('link').getAttribute('href')
  expect(attachmentURL).toBeTruthy()
  const attachmentResponse = await page.request.get(attachmentURL ?? '')
  expect(attachmentResponse.status()).toBe(200)
  expect(await attachmentResponse.text()).toBe('LocalShare attachment E2E')

  const imageName = `pixel-${Date.now()}.png`
  await page.getByLabel('选择图片文件', { exact: true }).setInputFiles({
    name: imageName,
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nH0AAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await expect(page.getByRole('img', { name: imageName })).toBeVisible()
  await expect(secondPage.getByRole('img', { name: imageName })).toBeVisible({
    timeout: 5_000,
  })

  const droppedFileName = `dropped-${Date.now()}.txt`
  const dataTransfer = await page.evaluateHandle((name) => {
    const DataTransferConstructor = Reflect.get(globalThis, 'DataTransfer')
    const transfer = new DataTransferConstructor()
    transfer.items.add(new File(['LocalShare drag and drop E2E'], name, { type: 'text/plain' }))
    return transfer
  }, droppedFileName)
  const composerForm = page.locator('form')
  await composerForm.dispatchEvent('dragenter', { dataTransfer })
  await expect(page.getByText('松开鼠标即可发送文件')).toBeVisible()
  await composerForm.dispatchEvent('dragover', { dataTransfer })
  await composerForm.dispatchEvent('drop', { dataTransfer })
  await dataTransfer.dispose()

  await expect(page.locator('article').filter({ hasText: droppedFileName })).toBeVisible()
  await expect(secondPage.locator('article').filter({ hasText: droppedFileName })).toBeVisible({
    timeout: 5_000,
  })
  await expect(page.getByText('松开鼠标即可发送文件')).toHaveCount(0)

  await expect(composerHint).toBeVisible()
  await page.getByRole('button', { name: '隐藏输入提示' }).click()
  await expect(composerHint).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: '公共频道' })).toBeVisible()
  await expect(composerHint).toHaveCount(0)
  expect(
    await page.evaluate(() => {
      const storage = Reflect.get(globalThis, 'localStorage') as {
        getItem(key: string): string | null
      }
      return storage.getItem('localshare.composer-hint-hidden')
    }),
  ).toBe('1')

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

test('non-loopback browser can send public messages', async ({ browser }) => {
  const remoteURL = lanBaseURL()
  test.skip(!remoteURL, 'No non-loopback IPv4 interface is available')
  if (!remoteURL) return

  const context = await browser.newContext()
  const page = await context.newPage()
  const browserErrors = collectBrowserErrors(page)

  await page.goto(remoteURL)
  await expect(page.getByRole('heading', { name: '公共频道' })).toBeVisible()
  await expect(page.getByText('实时已连接')).toBeVisible()

  const message = `LAN E2E message ${Date.now()}`
  const composer = page.getByLabel('消息内容')
  await composer.fill(message)
  await composer.press('Enter')
  await expect(page.locator('article').filter({ hasText: message })).toBeVisible()
  expect(browserErrors).toEqual([])

  await context.close()
})
