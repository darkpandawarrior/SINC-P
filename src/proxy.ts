import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Mints the CSRF cookie that every form's hidden field is compared against.
 *
 * This has to live here rather than in a Server Component: components can *read*
 * cookies during render but cannot set them, so a page that tried to mint its own token
 * would render a hidden field with no cookie behind it and every submission would fail
 * the double-submit check.
 *
 * Note the filename. Next 16 deprecated `middleware.ts` in favour of `proxy.ts` with a
 * `proxy` export; a file named middleware.ts here is silently never invoked, which
 * presents as "CSRF always fails" with nothing in the logs.
 *
 * Route protection deliberately does NOT live here. Each route group has its own
 * `_lib/actor.ts` that loads the session and checks the role, because a proxy-level
 * check can only see the URL, and "is this officer allowed to see this grievance" is a
 * question about a database row. Doing authz in both places would mean two sources of
 * truth that drift.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next()

  if (!request.cookies.has('sincp_csrf')) {
    // Web Crypto, not node:crypto — proxy runs in the edge runtime, where node builtins
    // are unavailable.
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')

    response.cookies.set('sincp_csrf', token, {
      httpOnly: true, // readable by the server, never by page JS
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 12,
    })
  }

  return response
}

export const config = {
  // Skip static assets and image optimisation: they never submit a form, and minting a
  // cookie on every asset request is pure overhead.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
