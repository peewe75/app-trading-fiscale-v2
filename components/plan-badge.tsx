import type { Plan } from '@/types'
import { cn } from '@/lib/utils'

const toneMap: Record<Plan | 'none', string> = {
  base: 'border-slate-300 bg-slate-100 text-slate-700',
  standard: 'border-zinc-300 bg-zinc-100 text-zinc-800',
  pro: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  none: 'border-slate-200 bg-slate-50 text-slate-500',
}

const labelMap: Record<Plan | 'none', string> = {
  base: 'Base',
  standard: 'Standard',
  pro: 'Pro',
  none: 'Nessun piano',
}

export function PlanBadge({ plan }: { plan: Plan | null }) {
  const key = plan ?? 'none'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]',
        toneMap[key]
      )}
    >
      {labelMap[key]}
    </span>
  )
}
