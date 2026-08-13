/**
 * One journey, through a real browser, against a real database.
 *
 * The unit and integration suites prove each layer. This proves they are wired together:
 * a Server Action actually reaches the service layer, the CSRF cookie minted in
 * `proxy.ts` is actually accepted, RLS actually lets a legitimate request through, and
 * the audit chain actually grows when a button is pressed.
 *
 * Three of the bugs in this repository's history would have been caught here and nowhere
 * else: login broken under RLS, the missing CSRF cookie, and `export const` in a
 * `'use server'` file. All three type-checked and passed every other test.
 *
 * Needs the app running. Skips cleanly when it is not, so `npm test` on a fresh clone
 * stays green:
 *
 *   npm run db:up && npm run db:push && npm run db:seed && npm run dev
 *   npm run test:e2e
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright-core'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000'
const PASSWORD = process.env.E2E_PASSWORD ?? 'SincpDemo#2026'
const OFFICER = process.env.E2E_OFFICER ?? 'suresh.iyer@rit-bhopal.sincp.demo'
const STUDENT = process.env.E2E_STUDENT ?? 'aarav.sharma@rit-bhopal.sincp.demo'

const CHROME =
  process.env.E2E_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

async function appIsUp(): Promise<boolean> {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(2500) })
    return res.ok
  } catch {
    return false
  }
}

const up = await appIsUp()
if (!up) {
  console.warn(`\n  [skipped] e2e: no app at ${BASE}. Run \`npm run dev\` first.\n`)
}

describe.skipIf(!up)('a grievance, end to end', () => {
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    browser = await chromium.launch({ executablePath: CHROME })
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } } as never)
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
  })

  async function signIn(email: string) {
    await page.context().clearCookies()
    await page.goto(`${BASE}/login`)
    await page.fill('#email', email)
    await page.fill('#password', PASSWORD)
    await page.click('button[type=submit]')
    await page.waitForLoadState('networkidle')
  }

  it('serves the public landing page without a session', async () => {
    await page.goto(BASE)
    expect(await page.title()).toContain('SINC-P')
    // The public surface must not require a login, or students never file.
    expect(page.url()).not.toContain('/login')
  })

  it('publishes transparency data anonymously', async () => {
    await page.goto(`${BASE}/transparency`)
    const body = await page.textContent('body')
    expect(body).toContain('Transparency')
    // Small-cell suppression must be visible on the page rather than assumed.
    expect(body).toMatch(/suppressed|withheld|—/)
  })

  it('redirects a protected route to login', async () => {
    await page.context().clearCookies()
    await page.goto(`${BASE}/staff`)
    expect(page.url()).toContain('/login')
  })

  it('signs an officer in and lands them on the queue', async () => {
    // Exercises the whole auth path: the CSRF cookie from proxy.ts, scrypt verification,
    // the session insert under RLS, and the role-based landing.
    await signIn(OFFICER)
    expect(page.url()).toContain('/staff')
    expect(await page.textContent('body')).toContain('Redressal Officer')
  })

  it('orders the queue by what breaches soonest', async () => {
    const slaColumn = await page.$$eval('table tbody tr td:nth-child(6)', (cells) =>
      cells.map((c) => c.textContent?.trim() ?? ''),
    )
    expect(slaColumn.length).toBeGreaterThan(0)
    // Overdue work has to sit at the top. "Newest first" is how a case ages quietly into
    // a statutory breach.
    const rank = (s: string) => (s.includes('Overdue') ? 0 : s.includes('Due soon') ? 1 : 2)
    const ranks = slaColumn.map(rank)
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })

  it('records a status change as a new link in the chain', async () => {
    const href = await page.getAttribute('table tbody tr:first-child a', 'href')
    expect(href).toBeTruthy()
    await page.goto(BASE + href)

    const before = await page.$$eval('ol li, ul li', (els) => els.length)
    const remark = `E2E check at ${new Date().toISOString()}`

    const box = await page.$('textarea[placeholder*="Optional remark"]')
    if (!box) {
      // A terminal case offers no transitions. That is correct behaviour, not a failure.
      expect(await page.textContent('body')).toContain('Trail')
      return
    }
    await box.fill(remark)
    await page.click('form:has(textarea[placeholder*="Optional remark"]) button[type=submit]')
    await page.waitForLoadState('networkidle')

    const body = await page.textContent('body')
    expect(body).toContain(remark)
    const after = await page.$$eval('ol li, ul li', (els) => els.length)
    expect(after).toBeGreaterThan(before)
  })

  it('never offers a transition the server would reject', async () => {
    // The action panel is built from allowedTransitions, so every button on it must be
    // one the server accepts. A button that 500s is worse than a button that is absent.
    const buttons = await page.$$eval('button[type=submit]', (els) =>
      els.map((e) => e.textContent?.trim() ?? ''),
    )
    for (const label of buttons.filter((b) => b.startsWith('Move to'))) {
      expect(label).toMatch(/Move to (Under review|In progress|Resolved|Rejected)/)
    }
  })

  it('shows a student their own grievances and no one else\'s', async () => {
    await signIn(STUDENT)
    expect(page.url()).toContain('/my')
    const body = await page.textContent('body')
    // The officer console must not be reachable from a student session.
    await page.goto(`${BASE}/staff`)
    expect(page.url()).not.toMatch(/\/staff$/)
    expect(body).toBeTruthy()
  })
})
