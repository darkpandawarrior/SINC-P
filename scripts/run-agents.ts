/**
 * Runs the autonomous agents.
 *
 *   npm run agents:run             one sweep, then exit (cron, systemd timer)
 *   npm run agents:run -- --watch  sweep on an interval (a long-running container)
 *   npm run agents:run -- --dry    report what it would do, write nothing
 *
 * Pair with `npm run notify:send`, which drains what this queues. Two processes on
 * purpose: the thing that decides to notify and the thing that talks to a mail server
 * fail for different reasons and should not take each other down.
 */
import { pool } from '../src/db/client'
import { sweepAll, AGENT_NAME } from '../src/lib/agents/sla-watchdog'

const watch = process.argv.includes('--watch')
const dry = process.argv.includes('--dry')
const intervalMs = Number(process.env.AGENT_INTERVAL_MS ?? 15 * 60 * 1000)

async function once(): Promise<void> {
  if (dry) {
    // A dry run is the first thing anyone deploying this will want, because an agent
    // that emails a Registrar's whole committee is not something to discover in
    // production.
    console.log(`[${AGENT_NAME}] --dry is not implemented as a no-write path yet.`)
    console.log(`[${AGENT_NAME}] Run against a copy of the database instead.`)
    return
  }

  const reports = await sweepAll()
  const total = reports.reduce(
    (acc, r) => ({
      scanned: acc.scanned + r.scanned,
      breached: acc.breached + r.breached,
      escalated: acc.escalated + r.escalated,
      notified: acc.notified + r.notified,
      alreadyHandled: acc.alreadyHandled + r.alreadyHandled,
    }),
    { scanned: 0, breached: 0, escalated: 0, notified: 0, alreadyHandled: 0 },
  )

  // Silent when there is nothing to say. A cron that logs every quarter hour trains
  // whoever reads the logs to stop reading them.
  if (total.breached === 0) return

  console.log(
    `[${AGENT_NAME}] ${reports.length} institution(s): ` +
      `${total.breached} breached, ${total.escalated} newly escalated, ` +
      `${total.alreadyHandled} already flagged, ${total.notified} notification(s) queued`,
  )
}

async function main(): Promise<void> {
  if (!watch) {
    await once()
    await pool.end()
    return
  }

  let stopping = false
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      if (stopping) process.exit(1)
      stopping = true
      console.log(`[${AGENT_NAME}] ${sig} received, finishing the current sweep`)
    })
  }

  console.log(`[${AGENT_NAME}] watching, interval ${intervalMs}ms`)
  while (!stopping) {
    try {
      await once()
    } catch (err) {
      // The database restarting must not kill the agent.
      console.error(`[${AGENT_NAME}] sweep failed:`, err instanceof Error ? err.message : err)
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
