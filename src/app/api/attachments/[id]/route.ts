/**
 * Attachment download.
 *
 * The 2019 IDOR this route replaces: `complaint-details.php?cid=N` read the id straight
 * from the query string and rendered whatever row came back, so any logged-in student
 * could read every other student's complaints (and their attachments) by counting
 * upwards. Here, visibility is decided once, by `canView` on the attachment's parent
 * grievance — there is no second path that returns a file.
 *
 * Contract with the (not-yet-built) upload route: `attachments.contentType` must be the
 * value `storage.put()` sniffed from the bytes, never a client-supplied header. This
 * route trusts that column and serves it back verbatim — it does not re-sniff on read.
 */
import { and, eq } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'
import { Readable } from 'node:stream'
import { withTenant } from '@/db/client'
import { attachments, authEvents, grievances, type Attachment } from '@/db/schema'
import { AuthError, requireSession } from '@/lib/auth/session'
import { canView, type Actor } from '@/lib/grievance/policy'
import { StorageError, storage } from '@/lib/storage/local'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The authorisation decision, kept separate from cookie/Next plumbing so it can be
 * exercised directly against a real database in tests without a live HTTP request.
 * Returns null for "does not exist" and "exists but you may not see it" alike — the
 * 2019 bug above told an attacker which one it was, so this must not either.
 */
export async function loadAuthorizedAttachment(
  actor: Actor,
  attachmentId: string,
): Promise<Attachment | null> {
  return withTenant(actor.institutionId, async (tx) => {
    const rows = await tx
      .select({ attachment: attachments, grievance: grievances })
      .from(attachments)
      .innerJoin(grievances, eq(grievances.id, attachments.grievanceId))
      .where(
        and(eq(attachments.id, attachmentId), eq(attachments.institutionId, actor.institutionId)),
      )
      .limit(1)

    const row = rows[0]
    if (!row || !canView(actor, row.grievance)) return null

    await tx.insert(authEvents).values({
      institutionId: actor.institutionId,
      userId: actor.id,
      kind: 'attachment_download',
      detail: { attachmentId: row.attachment.id, grievanceId: row.grievance.id },
    })

    return row.attachment
  })
}

/** Content-Disposition is a header value: strip CR/LF (header injection) and the quote
 *  that would otherwise terminate the filename early. Display-only, never used for I/O. */
function escapeFileName(name: string): string {
  return name.replace(/[\r\n"]/g, '').slice(0, 255)
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'not found' }, { status: 404 })

  let session
  try {
    session = await requireSession()
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
    throw err
  }

  const actor: Actor = {
    id: session.user.id,
    role: session.user.role,
    institutionId: session.institutionId,
  }

  const attachment = await loadAuthorizedAttachment(actor, id)
  if (!attachment) return NextResponse.json({ error: 'not found' }, { status: 404 })

  let file
  try {
    file = await storage.get(attachment.storageKey)
  } catch (err) {
    if (err instanceof StorageError && err.code === 'not-found') {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }
    throw err
  }

  return new NextResponse(Readable.toWeb(file.stream) as ReadableStream, {
    status: 200,
    headers: {
      // Ours, sniffed at upload time — never the value a client sent us. Paired with
      // nosniff so the browser can't second-guess it either.
      'Content-Type': attachment.contentType,
      'Content-Disposition': `attachment; filename="${escapeFileName(attachment.fileName)}"`,
      'Content-Length': String(file.byteSize),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  })
}
