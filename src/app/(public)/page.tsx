import type { Metadata } from 'next'
import Link from 'next/link'
import { FileText, ScrollText, Search, ShieldCheck } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { buttonClasses } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { getPublicInstitution } from '@/lib/stats'

export const metadata: Metadata = {
  title: 'SINC-P — File a grievance',
}

const STEPS = [
  {
    title: 'Sign in with your institute email',
    body: 'Students file with their institute-issued account. No separate registration form to lose track of.',
  },
  {
    title: 'Pick a category and describe the issue',
    body: 'You may file anonymously — your identity is withheld from the committee UI, though the record is retained for audit as UGC requires.',
  },
  {
    title: 'Track it by reference number',
    body: 'Every filing gets a reference like "RITB-2026-00042". Check its status any time, with or without signing back in.',
  },
]

export default async function PublicHomePage() {
  const institution = await getPublicInstitution()

  if (!institution) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Not configured yet"
        description="This deployment has no institution set up. Run the seed script or create one through the admin console before students can file."
      />
    )
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <p className="text-sm font-medium text-accent">{institution.name}</p>
        <h1 className="text-3xl font-semibold text-fg">Student Grievance Redressal</h1>
        <p className="max-w-2xl text-fg-muted">
          A statutory channel for academic, hostel, fee and welfare grievances, built to the UGC
          (Redressal of Grievances of Students) Regulations, 2023 — time-bound resolution, an
          Ombudsperson appeal tier, and a tamper-evident record of every step.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/login?returnTo=%2Fmy%2Fnew" className={buttonClasses('primary')}>
            Sign in to file a grievance
          </Link>
          <Link href="/status" className={buttonClasses('secondary')}>
            Check an existing grievance
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <Card key={step.title}>
            <CardBody className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Step {i + 1}
              </span>
              <p className="font-medium text-fg">{step.title}</p>
              <p className="text-sm text-fg-muted">{step.body}</p>
            </CardBody>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex items-center gap-2">
            <ScrollText aria-hidden className="size-4 text-accent" />
            <h2 className="text-sm font-semibold text-fg">Statutory windows</h2>
          </CardHeader>
          <CardBody className="flex flex-col gap-1 text-sm text-fg-muted">
            <p>Resolution: within {institution.slaResolutionDays} days of filing.</p>
            <p>Appeal to the Ombudsperson: within {institution.slaAppealWindowDays} days of a decision.</p>
            <p>Ombudsperson hearing: within {institution.slaOmbudspersonDays} days of an appeal.</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center gap-2">
            <FileText aria-hidden className="size-4 text-accent" />
            <h2 className="text-sm font-semibold text-fg">Disclosures</h2>
          </CardHeader>
          <CardBody className="flex flex-col gap-2 text-sm text-fg-muted">
            <p>SGRC composition, the Ombudsperson&apos;s contact, and the full grievance procedure.</p>
            <Link href="/disclosures" className="text-sm font-medium text-accent hover:text-accent-hover">
              Read the disclosure page →
            </Link>
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center gap-2">
            <Search aria-hidden className="size-4 text-accent" />
            <h2 className="text-sm font-semibold text-fg">How we&apos;re doing</h2>
          </CardHeader>
          <CardBody className="flex flex-col gap-2 text-sm text-fg-muted">
            <p>Anonymised closure times and volume by category, published without a login.</p>
            <Link href="/transparency" className="text-sm font-medium text-accent hover:text-accent-hover">
              View transparency data →
            </Link>
          </CardBody>
        </Card>
      </section>
    </div>
  )
}
