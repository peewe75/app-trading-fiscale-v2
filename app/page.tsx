import Link from 'next/link'
import { SignedIn, SignedOut } from '@clerk/nextjs'
import { Navbar } from '@/components/navbar'
import { buttonVariants } from '@/components/ui/button'
import { PLAN_DETAILS } from '@/lib/plans'
import { cn } from '@/lib/utils'

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <Navbar />

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-hero-grid opacity-50" />
        <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-white via-white/80 to-transparent" />

        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:pb-28 lg:pt-24">
          <div className="space-y-8">
            <div className="inline-flex rounded-full border border-slate-300 bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-slate-600">
              Rendicontazione fiscale per conti trading
            </div>

            <div className="space-y-5">
              <h1 className="max-w-4xl text-5xl leading-tight sm:text-6xl">
                Report fiscale professionale per i movimenti del tuo broker.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-600">
                Carichi il file HTML, ottieni il calcolo fiscale con PDF strutturato e storico consultabile. Pensato per trader e studi che vogliono un flusso serio, leggibile e ripetibile.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <SignedOut>
                <Link href="/sign-up" className={buttonVariants('primary')}>
                  Inizia ora
                </Link>
                <Link href="/sign-in" className={buttonVariants('secondary')}>
                  Accedi
                </Link>
              </SignedOut>
              <SignedIn>
                <Link href="/dashboard/upload" className={buttonVariants('primary')}>
                  Vai all area personale
                </Link>
              </SignedIn>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                ['Tempi medi', '10-30 secondi per report'],
                ['Formato output', 'PDF pronto al download'],
                ['Archiviazione', 'Storico centralizzato'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-[24px] border border-white/80 bg-white/85 p-5 shadow-panel backdrop-blur-xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
                  <p className="mt-3 text-base font-semibold text-slate-950">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="page-panel flex flex-col justify-between gap-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Flusso operativo</p>
              <div className="mt-6 space-y-5">
                {[
                  ['01', 'Upload del report broker', 'Il file HTML viene validato e registrato con storico per anno fiscale.'],
                  ['02', 'Calcolo fiscale', 'La funzione Python elabora P&L, interessi e imposta dovuta.'],
                  ['03', 'Download PDF', 'Il documento viene salvato su Netlify Blobs e resta disponibile nell archivio.'],
                ].map(([step, title, description]) => (
                  <div key={step} className="rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-start gap-4">
                      <span className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-xs font-bold tracking-[0.2em] text-white">
                        {step}
                      </span>
                      <div>
                        <h2 className="text-xl">{title}</h2>
                        <p className="mt-2 text-sm leading-7 text-slate-600">{description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Approccio</p>
              <p className="mt-3 text-base leading-7 text-slate-700">
                Palette neutra, struttura leggibile, focus su conformita e storicizzazione operativa.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-24 lg:px-8">
        <div className="page-panel">
          <div className="page-header">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Piani</span>
            <h2 className="page-title">Scegli il livello operativo adatto al tuo volume.</h2>
            <p className="page-subtitle">Pagamento una tantum. Nessun abbonamento ricorrente.</p>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            {(['base', 'standard', 'pro'] as const).map(plan => (
              <div
                key={plan}
                className={cn(
                  'rounded-[28px] border p-6',
                  plan === 'standard' ? 'border-slate-900 bg-slate-950 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-900'
                )}
              >
                <p className={cn('text-xs font-semibold uppercase tracking-[0.28em]', plan === 'standard' ? 'text-slate-300' : 'text-slate-500')}>
                  {PLAN_DETAILS[plan].name}
                </p>
                <p className="mt-4 text-4xl font-display">{PLAN_DETAILS[plan].priceLabel}</p>
                <p className={cn('mt-3 text-sm leading-7', plan === 'standard' ? 'text-slate-300' : 'text-slate-600')}>
                  {PLAN_DETAILS[plan].description}
                </p>
                <ul className={cn('mt-6 space-y-3 text-sm', plan === 'standard' ? 'text-slate-200' : 'text-slate-700')}>
                  {PLAN_DETAILS[plan].features.map(feature => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <Link
                  href="/checkout"
                  className={cn(
                    buttonVariants(plan === 'standard' ? 'secondary' : 'primary'),
                    'mt-8 w-full',
                    plan === 'standard' && 'border-slate-700 bg-slate-900 text-white hover:bg-slate-800'
                  )}
                >
                  Vai al checkout
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
