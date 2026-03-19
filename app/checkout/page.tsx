import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { TestPlanBypassCard } from '@/components/checkout/test-plan-bypass-card'
import { buttonVariants } from '@/components/ui/button'
import { getAppUrlFromHeaders } from '@/lib/app-url'
import { PLAN_DETAILS } from '@/lib/plans'
import { createCheckoutSession } from '@/lib/stripe'
import { isTestPlanBypassEnabled } from '@/lib/test-plan-bypass'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const PLANS = [
  { id: 'base', priceEnvKey: 'STRIPE_PRICE_BASE' },
  { id: 'standard', priceEnvKey: 'STRIPE_PRICE_STANDARD' },
  { id: 'pro', priceEnvKey: 'STRIPE_PRICE_PRO' },
] as const

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { plan } = await searchParams
  const testBypassEnabled = isTestPlanBypassEnabled()

  if (plan) {
    const selectedPlan = PLANS.find(item => item.id === plan)
    if (selectedPlan) {
      const priceId = process.env[selectedPlan.priceEnvKey]
      if (priceId) {
        const url = await createCheckoutSession(userId, priceId, plan, await getAppUrlFromHeaders())
        redirect(url)
      }
    }
  }

  return (
    <div className="page-shell">
      <div className="mx-auto max-w-7xl">
        <div className="page-panel">
          <div className="page-header">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Checkout</span>
            <h1 className="page-title">Seleziona il piano operativo</h1>
            <p className="page-subtitle">Pagamento una tantum con Stripe. Nessun rinnovo automatico.</p>
          </div>

          {testBypassEnabled ? <TestPlanBypassCard /> : null}

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {PLANS.map(plan => {
              const detail = PLAN_DETAILS[plan.id]

              return (
                <div
                  key={plan.id}
                  className={cn(
                    'rounded-[28px] border p-6',
                    plan.id === 'standard' ? 'border-slate-900 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50'
                  )}
                >
                  {plan.id === 'standard' ? (
                    <span className="inline-flex rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                      Piu scelto
                    </span>
                  ) : null}
                  <p className={cn('mt-4 text-xs font-semibold uppercase tracking-[0.28em]', plan.id === 'standard' ? 'text-slate-300' : 'text-slate-500')}>
                    {detail.name}
                  </p>
                  <p className="mt-3 text-4xl font-display">{detail.priceLabel}</p>
                  <p className={cn('mt-3 text-sm leading-7', plan.id === 'standard' ? 'text-slate-300' : 'text-slate-600')}>
                    {detail.description}
                  </p>
                  <ul className={cn('mt-6 space-y-3 text-sm', plan.id === 'standard' ? 'text-slate-200' : 'text-slate-700')}>
                    {detail.features.map(feature => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                  <Link
                    href={`/checkout?plan=${plan.id}`}
                    className={cn(
                      buttonVariants(plan.id === 'standard' ? 'secondary' : 'primary'),
                      'mt-8 w-full',
                      plan.id === 'standard' && 'border-slate-700 bg-slate-900 text-white hover:bg-slate-800',
                      testBypassEnabled && plan.id !== 'standard' && 'border border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-100'
                    )}
                  >
                    Acquista {detail.name}
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
