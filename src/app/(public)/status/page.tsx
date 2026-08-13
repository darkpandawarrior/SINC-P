import type { Metadata } from 'next'
import { StatusLookupForm } from './StatusLookupForm'

export const metadata: Metadata = {
  title: 'SINC-P — Check status',
  description: 'Look up a grievance by reference number, no account needed.',
}

export default function StatusPage() {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-fg">Check a grievance&apos;s status</h1>
        <p className="max-w-2xl text-fg-muted">
          Enter the reference number you received when filing and the email address you filed
          with. No account or sign-in required.
        </p>
      </section>
      <StatusLookupForm />
    </div>
  )
}
