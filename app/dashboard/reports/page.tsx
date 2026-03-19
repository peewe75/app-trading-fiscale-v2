import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { ReportsTableClient } from '@/components/reports/reports-table-client'
import { buttonVariants } from '@/components/ui/button'
import { createSupabaseServerClient } from '@/lib/supabase'
import { getCurrentUserRecord } from '@/lib/user-record'
import type { Report } from '@/types'

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>
}) {
  const { userId } = await auth()
  if (!userId) return null

  const user = await getCurrentUserRecord()
  const supabase = await createSupabaseServerClient()
  const { new: highlightId } = await searchParams

  const { data: reports } = await supabase
    .from('reports')
    .select('*')
    .eq('user_id', user?.id ?? '')
    .order('created_at', { ascending: false })

  const rows = (reports ?? []) as Report[]

  return (
    <div className="page-panel">
      <div className="page-header">
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Archivio</span>
        <h1 className="page-title">I miei report fiscali</h1>
        <p className="page-subtitle">
          Consulta lo stato di lavorazione, verifica il netto fiscale e scarica i PDF generati dal sistema.
        </p>
      </div>

      {!rows.length ? (
        <div className="mt-8 rounded-[28px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <p className="text-lg font-semibold text-slate-900">Nessun report disponibile.</p>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Carica il primo file broker per creare il tuo archivio fiscale.
          </p>
          <Link href="/dashboard/upload" className={`${buttonVariants('primary')} mt-6`}>
            Vai all upload
          </Link>
        </div>
      ) : (
        <div className="mt-8">
          <ReportsTableClient reports={rows} scope="user" highlightId={highlightId} />
        </div>
      )}
    </div>
  )
}
