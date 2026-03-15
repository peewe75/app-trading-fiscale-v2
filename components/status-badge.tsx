import { cn } from '@/lib/utils'
import type { Report } from '@/types'

const statusStyles: Record<Report['status'], { label: string; className: string }> = {
  processing: {
    label: 'In elaborazione',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  ready: {
    label: 'Pronto',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  error: {
    label: 'Errore',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
  },
}

export function StatusBadge({ status }: { status: Report['status'] }) {
  const tone = statusStyles[status]

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]',
        tone.className
      )}
    >
      {tone.label}
    </span>
  )
}
