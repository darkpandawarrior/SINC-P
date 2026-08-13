/**
 * Auth audit trail — the security half of the compliance story, distinct from the
 * grievance hash chain in src/lib/grievance/audit.ts.
 *
 * `auth_events.institution_id` is nullable (a login attempt can fail before an
 * institution is ever resolved) but the column is still RLS-tenant-scoped in
 * drizzle/0001_rls.sql: `institution_id = app_current_institution()`. A NULL
 * institution_id can never satisfy that comparison (NULL = anything is NULL, not true),
 * so writing one through the ordinary app-role connection (`withTenant`) would be
 * silently rejected by the policy's WITH CHECK. Route institution-unknown events through
 * `withoutTenantScope`, which runs as the RLS-bypass role, instead.
 */
import { withTenant, withoutTenantScope } from '@/db/client'
import { authEvents } from '@/db/schema'

export type AuthEventKind =
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'denied'
  | 'password_change'

export interface AuthEventInput {
  institutionId: string | null
  userId: string | null
  kind: AuthEventKind
  email?: string | null
  ipAddress: string
  userAgent: string | null
  detail?: Record<string, unknown>
}

export async function logAuthEvent(event: AuthEventInput): Promise<void> {
  const values = {
    institutionId: event.institutionId,
    userId: event.userId,
    kind: event.kind,
    email: event.email ?? null,
    ipAddress: event.ipAddress,
    userAgent: event.userAgent,
    detail: event.detail ?? null,
  }

  if (event.institutionId) {
    await withTenant(event.institutionId, (tx) => tx.insert(authEvents).values(values))
  } else {
    await withoutTenantScope('auth event with no resolved institution', (tx) =>
      tx.insert(authEvents).values(values),
    )
  }
}
