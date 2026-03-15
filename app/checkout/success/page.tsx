import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export default function CheckoutSuccessPage() {
  return (
    <div className="page-shell">
      <div className="mx-auto flex max-w-3xl items-center justify-center">
        <div className="page-panel w-full text-center">
          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
            Pagamento confermato
          </span>
          <h1 className="mt-6 text-5xl">Piano attivato correttamente.</h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-8 text-slate-600">
            Il tuo account puo ora accedere all upload dei report broker e all archivio PDF fiscale.
          </p>
          <Link href="/dashboard/upload" className={`${buttonVariants('primary')} mt-8`}>
            Vai all area personale
          </Link>
        </div>
      </div>
    </div>
  )
}
