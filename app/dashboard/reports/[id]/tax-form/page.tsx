import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { TaxFormClient } from '@/components/tax-form/tax-form-client'
import { buttonVariants } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function ReportTaxFormPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const { id } = await params

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Archivio report</p>
          <h1 className="mt-2 text-3xl font-display text-slate-950">Preparazione quadro RW e RT</h1>
        </div>
        <Link href="/dashboard/reports" className={buttonVariants('secondary')}>
          Torna all archivio
        </Link>
      </div>

      <TaxFormClient reportId={id} />
    </div>
  )
}
