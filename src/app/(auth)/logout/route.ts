import { NextResponse } from 'next/server'
import { destroySession, getSession } from '@/lib/auth/session'
import { logAuthEvent } from '@/lib/auth/events'
import { clientIp, requestUserAgent } from '@/lib/auth/request-meta'

/**
 * POST only. A GET logout is CSRF-able and, worse, gets fired by link prefetchers and
 * antivirus scanners that follow every anchor on the page — users then get silently
 * signed out for no reason they can see.
 */
export async function POST(request: Request) {
  const session = await getSession()

  if (session) {
    await logAuthEvent({
      kind: 'logout',
      institutionId: session.institutionId,
      userId: session.user.id,
      email: session.user.email,
      ipAddress: await clientIp(),
      userAgent: await requestUserAgent(),
    })
  }

  await destroySession()
  return NextResponse.redirect(new URL('/', request.url), { status: 303 })
}
