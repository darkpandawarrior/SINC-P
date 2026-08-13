import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { getSession } from '@/lib/auth/session'
import { CSRF_FIELD, readCsrfToken } from '@/lib/auth/csrf'
import { isSafeReturnTo } from '@/lib/auth/return-to'
import { LoginForm } from './LoginForm'

export const metadata = { title: 'Sign in — SINC-P' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>
}) {
  if (await getSession()) redirect('/')

  const { returnTo } = await searchParams
  // Validated here as well as on submit. An unvalidated value rendered into the form
  // is a phishing hop: //evil.example is a protocol-relative URL that reads as a path.
  const safeReturnTo = isSafeReturnTo(returnTo) ? returnTo : undefined
  const csrfToken = await readCsrfToken()

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-16">
      <div>
        <h1 className="text-2xl font-semibold text-fg">Sign in</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Grievance redressal portal. Use the address your institution issued you.
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-medium text-fg">Institution account</h2>
        </CardHeader>
        <CardBody>
          <LoginForm csrfToken={csrfToken} csrfField={CSRF_FIELD} returnTo={safeReturnTo} />
        </CardBody>
      </Card>

      <p className="text-sm text-fg-muted">
        Need to check a grievance without an account?{' '}
        <Link href="/status" className="underline underline-offset-2">
          Look it up by reference number
        </Link>
        .
      </p>

      {process.env.NODE_ENV !== 'production' && (
        <Alert variant="info" title="Demo accounts">
          <p className="text-sm">
            Password for every seeded account: <code className="font-mono">SincpDemo#2026</code>
          </p>
          <ul className="mt-2 space-y-0.5 font-mono text-xs">
            <li>aarav.sharma@rit-bhopal.sincp.demo — student</li>
            <li>anjali.rao@rit-bhopal.sincp.demo — moderator</li>
            <li>suresh.iyer@rit-bhopal.sincp.demo — redressal officer</li>
            <li>ramesh.chandran@rit-bhopal.sincp.demo — ombudsperson</li>
            <li>meera.joshi@rit-bhopal.sincp.demo — institution admin</li>
          </ul>
        </Alert>
      )}
    </main>
  )
}
