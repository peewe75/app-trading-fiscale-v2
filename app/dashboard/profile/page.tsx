import { auth, currentUser } from '@clerk/nextjs/server'
import { ClerkProfileCard } from '@/components/profile/clerk-profile-card'
import { PlanBadge } from '@/components/plan-badge'
import { createSupabaseServerClient } from '@/lib/supabase'
import { isTestBypassPayment } from '@/lib/test-plan-bypass'
import { getCurrentUserRecord } from '@/lib/user-record'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Payment } from '@/types'

export default async function ProfilePage() {
  const [, clerkUser] = await Promise.all([auth(), currentUser()])
  const user = await getCurrentUserRecord()
  const supabase = await createSupabaseServerClient()

  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('user_id', user?.id ?? '')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="page-panel">
        <div className="page-header">
          <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Profilo</span>
          <h1 className="page-title">Account e storico pagamenti</h1>
          <p className="page-subtitle">
            Dati di accesso gestiti da Clerk, piano attivo e pagamenti registrati in Supabase.
          </p>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          <div className="stat-card">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Email</p>
            <p className="mt-3 text-lg font-semibold text-slate-950">{clerkUser?.primaryEmailAddress?.emailAddress ?? user?.email ?? '-'}</p>
          </div>
          <div className="stat-card">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Piano</p>
            <div className="mt-3">
              <PlanBadge plan={user?.plan ?? null} />
            </div>
          </div>
          <div className="stat-card">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Report completati</p>
            <p className="mt-3 text-3xl font-display text-slate-950">{user?.reports_used ?? 0}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="page-panel">
          <div className="page-header">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Pagamenti</span>
            <h2 className="page-title text-3xl">Storico transazioni</h2>
          </div>

          <div className="mt-8 data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Piano</th>
                  <th>Importo</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {(payments ?? []).length ? (
                  (payments as Payment[]).map(payment => (
                    <tr key={payment.id}>
                      <td>{formatDate(payment.created_at)}</td>
                      <td className="capitalize">{payment.plan}</td>
                      <td>{formatCurrency(payment.amount_cents / 100)}</td>
                      <td>
                        {isTestBypassPayment(payment) ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-semibold text-emerald-700">Pagamento test</span>
                            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">{payment.status}</span>
                          </div>
                        ) : (
                          <span className="capitalize">{payment.status}</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-500">
                      Nessun pagamento registrato.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <ClerkProfileCard />
      </div>
    </div>
  )
}
