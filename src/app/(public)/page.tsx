import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Clock3, FileText, Link2, Lock, Search, ShieldCheck } from 'lucide-react'
import { buttonClasses } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { getPublicInstitution, getPublicSummary } from '@/lib/stats'

export const metadata: Metadata = {
  title: 'SINC-P — File a grievance',
}

const STEPS = [
  {
    icon: FileText,
    title: 'Say what happened',
    body: 'Pick a category, describe it in your own words, attach a photo if you have one. Anonymously if you would rather, and the form tells you plainly what anonymous does and does not hide.',
  },
  {
    icon: Clock3,
    title: 'A clock starts',
    body: 'Not a promise, a deadline. The UGC gives the committee a fixed window and this system counts it in working days, escalates when it runs out, and records the breach permanently.',
  },
  {
    icon: Link2,
    title: 'Nobody can quietly edit it',
    body: 'Every step is chained to the one before it. A remark changed after the fact breaks the chain at a nameable point, which is the question an auditor is actually asking.',
  },
]

export default async function PublicHomePage() {
  const institution = await getPublicInstitution()
  const summary = institution ? await getPublicSummary().catch(() => null) : null

  if (!institution) {
    return (
      <EmptyState
        title="No institution configured"
        description="Run the seed, or create an institution, before opening the public site."
      />
    )
  }

  return (
    <div data-surface="public" className="-mx-4 -my-6">
      {/* Hero. The colour field sits behind everything and is purely decorative, so it
          is aria-hidden and pointer-events-none: it must never intercept a tap from
          someone trying to reach the button underneath. */}
      <section className="relative isolate overflow-hidden px-4 pt-16 pb-14 sm:pt-24 sm:pb-20">
        <div aria-hidden className="aurora pointer-events-none absolute inset-0 -z-10 opacity-70" />

        <div className="mx-auto max-w-3xl text-center">
          <p className="animate-fade-rise text-sm font-medium tracking-wide text-fg-muted uppercase">
            {institution.name}
          </p>

          <h1
            className="animate-fade-rise mt-4 text-4xl font-extrabold tracking-tight text-balance text-fg sm:text-6xl"
            style={{ animationDelay: '60ms' }}
          >
            Your complaint gets a <span className="text-gradient">deadline</span>, not a
            shrug.
          </h1>

          <p
            className="animate-fade-rise mx-auto mt-6 max-w-2xl text-lg text-pretty text-fg-muted"
            style={{ animationDelay: '120ms' }}
          >
            A statutory channel for academic, hostel, fee and welfare grievances, built to the
            UGC (Redressal of Grievances of Students) Regulations, 2023. Time-bound resolution, an
            Ombudsperson you can appeal to, and a record of every step that nobody can rewrite.
          </p>

          <div
            className="animate-fade-rise mt-9 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: '180ms' }}
          >
            <Link
              href="/login?returnTo=%2Fmy%2Fnew"
              className={`${buttonClasses('primary')} lift group gap-2 px-6 py-3 text-base`}
            >
              File a grievance
              <ArrowRight
                aria-hidden
                className="size-4 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
            <Link href="/status" className={`${buttonClasses('secondary')} lift gap-2 px-6 py-3 text-base`}>
              <Search aria-hidden className="size-4" />
              Check an existing one
            </Link>
          </div>

          <p
            className="animate-fade-rise mt-5 text-xs text-fg-muted"
            style={{ animationDelay: '240ms' }}
          >
            No account needed to check a reference number.
          </p>
        </div>

        {/* Live proof, not marketing numbers. Everything below is computed from the
            institution's own record and is the same data the transparency page shows. */}
        {summary && summary.totalFiled > 0 && (
          <dl className="stagger mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="grievances filed" value={summary.totalFiled.toLocaleString('en-IN')} />
            <Stat
              label="median days to close"
              value={summary.medianDays === null ? '—' : summary.medianDays.toFixed(1)}
            />
            <Stat
              label="inside the window"
              value={summary.withinWindowPct === null ? '—' : `${summary.withinWindowPct}%`}
            />
            <Stat label="statutory window" value={`${institution.slaResolutionDays}d`} />
          </dl>
        )}
      </section>

      <div aria-hidden className="rule-gradient mx-auto h-px w-full max-w-5xl" />

      {/* How it works */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold tracking-tight text-fg sm:text-3xl">
            What happens after you press submit
          </h2>
          <div className="stagger mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className="lift rounded-xl border border-border bg-surface p-6 shadow-card"
              >
                <div className="flex size-10 items-center justify-center rounded-lg bg-accent-soft-bg text-accent-soft-fg">
                  <step.icon aria-hidden className="size-5" />
                </div>
                <h3 className="mt-4 flex items-baseline gap-2 font-semibold text-fg">
                  <span className="text-xs tabular-nums text-fg-muted">0{i + 1}</span>
                  {step.title}
                </h3>
                <p className="mt-2 text-sm text-pretty text-fg-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The three statutory facts, stated without decoration. */}
      <section className="px-4 pb-20">
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
          <Panel
            icon={Clock3}
            title="The windows"
            href="/disclosures"
            cta="Read the procedure"
          >
            <ul className="space-y-1.5">
              <li>
                Committee report: <strong className="text-fg">{institution.slaResolutionDays} working days</strong>
              </li>
              <li>
                Appeal to the Ombudsperson: <strong className="text-fg">{institution.slaAppealWindowDays} days</strong>
              </li>
              <li>
                Ombudsperson decision: <strong className="text-fg">{institution.slaOmbudspersonDays} days</strong>
              </li>
            </ul>
          </Panel>

          <Panel icon={ShieldCheck} title="Who reads it" href="/disclosures" cta="See the committee">
            <p>
              The Students&apos; Grievance Redressal Committee, with the Ombudsperson hearing
              appeals. Their names, and how to reach them without going through the office your
              grievance is about, are published.
            </p>
          </Panel>

          <Panel icon={Lock} title="How it is doing" href="/transparency" cta="See the numbers">
            <p>
              Median closure time by category, published without a login. Any figure from fewer
              than five grievances is withheld, because in one department a count of one is a
              name.
            </p>
          </Panel>
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface/70 p-4 text-center backdrop-blur-sm">
      <dt className="order-2 mt-1 text-xs text-fg-muted">{label}</dt>
      <dd className="text-3xl font-bold tabular-nums text-gradient">{value}</dd>
    </div>
  )
}

function Panel({
  icon: Icon,
  title,
  href,
  cta,
  children,
}: {
  icon: typeof Clock3
  title: string
  href: string
  cta: string
  children: React.ReactNode
}) {
  return (
    <div className="lift flex flex-col rounded-xl border border-border bg-surface p-6 shadow-card">
      <h2 className="flex items-center gap-2 font-semibold text-fg">
        <Icon aria-hidden className="size-4 text-accent" />
        {title}
      </h2>
      <div className="mt-3 flex-1 text-sm text-fg-muted">{children}</div>
      <Link
        href={href}
        className="group mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent"
      >
        {cta}
        <ArrowRight
          aria-hidden
          className="size-3.5 transition-transform group-hover:translate-x-0.5"
        />
      </Link>
    </div>
  )
}
