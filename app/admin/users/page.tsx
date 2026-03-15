import { PlanBadge } from '@/components/plan-badge'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { formatDate } from '@/lib/utils'

export default async function AdminUsersPage() {
  const supabase = createSupabaseServiceClient()

  const { data: users } = await supabase
    .from('users')
    .select('id, email, plan, reports_used, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="page-panel">
      <div className="page-header">
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Utenti</span>
        <h1 className="page-title">Gestione account</h1>
        <p className="page-subtitle">Elenco utenti con piano attivo e contatore report completati.</p>
      </div>

      <div className="mt-8 data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Piano</th>
              <th>Report usati</th>
              <th>Registrato il</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map(user => (
              <tr key={user.id}>
                <td className="font-medium text-slate-900">{user.email}</td>
                <td>
                  <PlanBadge plan={user.plan} />
                </td>
                <td>{user.reports_used}</td>
                <td>{formatDate(user.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
