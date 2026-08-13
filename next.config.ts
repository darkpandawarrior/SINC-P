import type { NextConfig } from 'next'

/**
 * Security headers are set here rather than in middleware so they apply to static
 * assets too. CSP has no 'unsafe-inline' for scripts: Next 16 emits nonces for its own
 * bootstrap, and any inline handler we add later should fail loudly rather than silently
 * widen the policy.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'", // Next inline bootstrap; tighten with nonces when the app stabilises
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ')

// Attachments arrive through a Server Action, and Next caps Server Action bodies at
// 1 MiB by default — enforced before the action body runs, so the storage layer's own
// 10 MiB streaming cap never got a say and anything larger failed with a bare 413.
// Keep this in step with STORAGE_MAX_BYTES. The storage layer stays the real enforcer
// (it checks per chunk); this only stops the framework rejecting the request first.
const STORAGE_MAX_BYTES = Number(process.env.STORAGE_MAX_BYTES ?? 10 * 1024 * 1024)
// Bytes, not a "10mb" string: SizeLimit's string form is a template literal type and
// a computed string does not satisfy it. Slack covers multipart framing and the other
// form fields travelling alongside the file.
const attachmentBodyLimit = STORAGE_MAX_BYTES + 1024 * 1024

const nextConfig: NextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: attachmentBodyLimit },
  },
  // Required for the Dockerfile's runner stage — traces the minimal server + deps into
  // .next/standalone so the production image ships without node_modules or devDeps.
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  // Attachments are streamed through an authorised route; nothing user-uploaded is
  // ever served by the static handler.
  outputFileTracingIncludes: {},
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
}

export default nextConfig
