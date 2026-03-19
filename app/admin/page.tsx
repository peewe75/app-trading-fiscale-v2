import { PlanBadge } from '@/components/plan-badge'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { isTestBypassPayment } from '@/lib/test-plan-bypass'
import { formatCurrency, formatDate } from '@/lib/utils'

function getRelatedEmail(relation: { email?: string }[] | { email?: string } | null | undefined) {
  return Array.isArray(relation) ? relation[0]?.email ?? '-' : relation?.email ?? '-'
}

export default async function AdminDashboardPage() {
  const supabase = createSupabaseServiceClient()

  const [usersResult, reportsResult, paymentsResult, latestReportsResult, latestPaymentsResult] = await Promise.all([
    supabase.from('users').select('plan'),
    supabase.from('reports').select('id'),
    supabase.from('payments').select('amount_cents, status, stripe_session_id, stripe_payment_intent_id'),
    supabase
      .from('reports')
      .select('id, filename, year, status, created_at, users(email)')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('payments')
      .select('id, plan, amount_cents, status, created_at, stripe_session_id, stripe_payment_intent_id, users(email)')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  const users = usersResult.data ?? []
  const reports = reportsResult.data ?? []
  const payments = paymentsResult.data ?? []
  const latestReports = latestReportsResult.data ?? []
  const latestPayments = latestPaymentsResult.data ?? []

  const revenueCents = payments
    .filter(payment => payment.status === 'succeeded' && !isTestBypassPayment(payment))
    .reduce((total, payment) => total + payment.amount_cents, 0)

  const breakdown = {
    base: users.filter(user => user.plan === 'base').length,
    standard: users.filter(user => user.plan === 'standard').length,
    pro: users.filter(user => user.plan === 'pro').length,
  }

  return (
    <div className="space-y-6">
      <div className="page-panel">
        <div className="page-header">
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Admin overview</span>
          <h1 className="page-title">Statistiche piattaforma</h1>
          <p className="page-subtitle">
            Monitoraggio sintetico di utenti, report generati e pagamenti ricevuti.
          </p>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <div className="stat-card">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Utenti totali</p>
            <p className="mt-3 text-4xl font-display text-slate-950">{users.length}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Report generati</p>
            <p className="mt-3 text-4xl font-display text-slate-950">{reports.length}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Fatturato totale</p>
            <p className="mt-3 text-4xl font-display text-slate-950">{formatCurrency(revenueCents / 100)}</p>
          </div>
        </div>
      </div>

      <div className="page-panel">
        <div className="page-header">
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Piani attivi</span>
          <h2 className="page-title text-3xl">Breakdown utenti per piano</h2>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {(['base', 'standard', 'pro'] as const).map(plan => (
            <div key={plan} className="stat-card">
              <PlanBadge plan={plan} />
              <p className="mt-4 text-3xl font-display text-slate-950">{breakdown[plan]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="page-panel">
          <div className="page-header">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Recenti</span>
            <h2 className="page-title text-3xl">Ultimi 5 report</h2>
          </div>
          <div className="mt-8 space-y-4">
            {latestReports.map(report => (
              <div key={report.id} className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-semibold text-slate-900">{report.filename}</p>
                <p className="mt-1 text-sm text-slate-500">{getRelatedEmail(report.users)} - anno {report.year}</p>
                <p className="mt-3 text-sm text-slate-600">{report.status} - {formatDate(report.created_at)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="page-panel">
          <div className="page-header">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Incassi</span>
            <h2 className="page-title text-3xl">Ultimi 5 pagamenti</h2>
          </div>
          <div className="mt-8 space-y-4">
            {latestPayments.map(payment => (
              <div key={payment.id} className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-semibold text-slate-900">{getRelatedEmail(payment.users)}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {payment.plan} - {isTestBypassPayment(payment) ? 'pagamento test' : payment.status}
                </p>
                <p className="mt-3 text-sm text-slate-600">
                  {formatCurrency(payment.amount_cents / 100)} - {formatDate(payment.created_at)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
