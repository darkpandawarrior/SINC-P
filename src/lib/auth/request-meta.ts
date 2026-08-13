/**
 * Request metadata for Server Actions, which (unlike Route Handlers) never receive a
 * Request object directly — `next/headers` is the only way in.
 */
import { headers } from 'next/headers'

export async function clientIp(): Promise<string> {
  const h = await headers()
  // nginx sets both in docs/deployment.md's vhost; X-Real-IP is the single true client
  // address, X-Forwarded-For may be a comma-separated chain if there's more than one
  // proxy in front — the first hop is the client.
  return h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '0.0.0.0'
}

export async function requestUserAgent(): Promise<string | null> {
  const h = await headers()
  return h.get('user-agent')?.slice(0, 512) ?? null
}
