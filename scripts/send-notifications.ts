/**
 * Drains the notification outbox.
 *
 * Run it from cron, a systemd timer, or the Docker Compose sidecar. It is safe to run
 * two at once: `claimBatch` uses FOR UPDATE SKIP LOCKED, so concurrent senders take
 * disjoint work rather than sending the same message twice.
 *
 *   npm run notify:send              one sweep, then exit (cron)
 *   npm run notify:send -- --watch   sweep every 30s (a long-running container)
 *
 * With NOTIFY_TRANSPORT unset it prints to stdout instead of sending, which is what you
 * want in development and what you must not leave set in production.
 */
import { pool } from '../src/db/client'
import { sweep } from '../src/lib/notify/sender'
import { getTransport } from '../src/lib/notify/transport'

const watch = process.argv.includes('--watch')
const intervalMs = Number(process.env.NOTIFY_INTERVAL_MS ?? 30_000)

async function once(): Promise<void> {
  const result = await sweep()
  if (result.claimed === 0) return
  const parts = [`sent ${result.sent}`, `failed ${result.failed}`]
  if (result.deadLettered > 0) parts.push(`dead-lettered ${result.deadLettered}`)
  console.log(`[notify] claimed ${result.claimed}: ${parts.join(', ')}`)
}

async function main(): Promise<void> {
  const transport = getTransport()
  console.log(`[notify] transport=${transport.name}${watch ? ` interval=${intervalMs}ms` : ''}`)
  if (transport.name === 'log' && process.env.NODE_ENV === 'production') {
    console.warn('[notify] WARNING: NOTIFY_TRANSPORT is not set, so nothing is actually being sent.')
  }

  if (!watch) {
    await once()
    await pool.end()
    return
  }

  let stopping = false
  // Finish the sweep in flight rather than dying mid-batch and leaving rows claimed.
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      if (stopping) process.exit(1)
      stopping = true
      console.log(`[notify] ${sig} received, finishing the current sweep`)
    })
  }

  while (!stopping) {
    try {
      await once()
    } catch (err) {
      // A sweep failing must not kill the daemon: the database may just be restarting.
      console.error('[notify] sweep failed:', err instanceof Error ? err.message : err)
    }
    if (stopping) break
    await new Promise((r) => setTimeout(r, intervalMs))
  }

  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
