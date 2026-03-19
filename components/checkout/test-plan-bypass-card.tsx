'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

type ActivatePlanResponse = {
  success?: boolean
  redirectTo?: string
  error?: string
}

export function TestPlanBypassCard() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleActivate() {
    setError(null)

    startTransition(async () => {
      try {
        const response = await fetch('/api/test/activate-plan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        const data = (await response.json()) as ActivatePlanResponse

        if (!response.ok || !data.success) {
          throw new Error(data.error ?? 'Attivazione test non riuscita')
        }

        router.push(data.redirectTo ?? '/dashboard/upload')
        router.refresh()
      } catch (activationError) {
        setError(activationError instanceof Error ? activationError.message : 'Attivazione test non riuscita')
      }
    })
  }

  return (
    <div className="mt-8 rounded-[28px] border border-emerald-200 bg-emerald-50/80 p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <span className="inline-flex rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
            Modalita test attiva
          </span>
          <h2 className="mt-4 text-3xl font-display text-slate-950">Accedi subito alla dashboard senza passare da Stripe</h2>
          <p className="mt-3 text-sm leading-7 text-slate-700">
            Il sistema assegna il piano Pro, azzera il contatore report e registra un pagamento test visibile nelle schermate utente e admin.
          </p>
        </div>

        <div className="w-full max-w-sm">
          <Button type="button" onClick={handleActivate} disabled={isPending} className="w-full">
            {isPending ? 'Attivazione in corso...' : 'Attiva accesso test'}
          </Button>
          <p className="mt-3 text-center text-xs font-medium uppercase tracking-[0.18em] text-emerald-700">
            Nessun addebito reale
          </p>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}
    </div>
  )
}
