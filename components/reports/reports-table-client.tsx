'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { StatusBadge } from '@/components/status-badge'
import { buttonVariants } from '@/components/ui/button'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import type { Report } from '@/types'

type ReportRow = Report & {
  user_email?: string
}

type ReportsTableClientProps = {
  reports: ReportRow[]
  scope: 'user' | 'admin'
  highlightId?: string
}

export function ReportsTableClient({ reports, scope, highlightId }: ReportsTableClientProps) {
  const router = useRouter()
  const hasProcessing = reports.some(report => report.status === 'processing')

  useEffect(() => {
    if (!hasProcessing) return

    const timer = window.setInterval(() => {
      router.refresh()
    }, 3000)

    return () => window.clearInterval(timer)
  }, [hasProcessing, router])

  return (
    <div className="space-y-4">
      {hasProcessing ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Sono presenti report in elaborazione. La tabella si aggiorna automaticamente ogni 3 secondi.
        </div>
      ) : null}

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Data</th>
              {scope === 'admin' ? <th>Utente</th> : null}
              <th>File</th>
              <th>Anno</th>
              <th>Netto</th>
              <th>Stato</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {reports.map(report => (
              <tr key={report.id} className={cn(highlightId === report.id && 'bg-slate-50')}>
                <td>{formatDate(report.created_at)}</td>
                {scope === 'admin' ? <td>{report.user_email ?? '-'}</td> : null}
                <td className="font-medium text-slate-900">{report.filename}</td>
                <td>{report.year}</td>
                <td>{formatCurrency(report.net_profit)}</td>
                <td>
                  <StatusBadge status={report.status} />
                </td>
                <td>
                  {report.status === 'ready' ? (
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/api/reports/${report.id}/download`} className={cn(buttonVariants('secondary'), 'px-4 py-2')}>
                        Scarica PDF
                      </Link>
                      {scope === 'user' ? (
                        <Link
                          href={`/dashboard/reports/${report.id}/tax-form`}
                          className={cn(buttonVariants('primary'), 'px-4 py-2')}
                        >
                          Facsimile RW/RT
                        </Link>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-sm text-slate-400">In attesa</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
