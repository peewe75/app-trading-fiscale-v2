import { ReportsTableClient } from '@/components/reports/reports-table-client'
import { createSupabaseServiceClient } from '@/lib/supabase'
import type { Report } from '@/types'

export default async function AdminReportsPage() {
  const supabase = createSupabaseServiceClient()

  const { data: reports } = await supabase
    .from('reports')
    .select('id, user_id, filename, blob_key, plan, status, year, net_profit, tax_due, created_at, users(email)')
    .order('created_at', { ascending: false })

  const rows = ((reports ?? []) as Array<Report & { users?: { email?: string }[] | { email?: string } | null }>).map(report => ({
    ...report,
    user_email: Array.isArray(report.users) ? report.users[0]?.email ?? '-' : report.users?.email ?? '-',
  }))

  return (
    <div className="page-panel">
      <div className="page-header">
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Report</span>
        <h1 className="page-title">Tutti i report generati</h1>
        <p className="page-subtitle">Vista operativa completa con stato, utente e accesso al download PDF.</p>
      </div>

      <div className="mt-8">
        <ReportsTableClient reports={rows} scope="admin" />
      </div>
    </div>
  )
}
