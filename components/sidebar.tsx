import Link from 'next/link'
import { PlanBadge } from '@/components/plan-badge'
import type { Plan } from '@/types'
import { cn } from '@/lib/utils'

type SidebarItem = {
  href: string
  label: string
  shortLabel: string
}

type SidebarProps = {
  area: 'dashboard' | 'admin'
  plan?: Plan | null
}

const dashboardItems: SidebarItem[] = [
  { href: '/dashboard/upload', label: 'Carica report', shortLabel: 'UP' },
  { href: '/dashboard/reports', label: 'Archivio report', shortLabel: 'RP' },
  { href: '/dashboard/news', label: 'News fiscali', shortLabel: 'NW' },
  { href: '/dashboard/profile', label: 'Profilo', shortLabel: 'PR' },
]

const adminItems: SidebarItem[] = [
  { href: '/admin', label: 'Dashboard', shortLabel: 'DB' },
  { href: '/admin/users', label: 'Utenti', shortLabel: 'US' },
  { href: '/admin/reports', label: 'Report', shortLabel: 'RP' },
  { href: '/admin/news', label: 'News', shortLabel: 'NW' },
]

function NavLink({ item }: { item: SidebarItem }) {
  return (
    <Link
      href={item.href}
      className="group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-950"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-[11px] font-bold tracking-[0.2em] text-slate-500 transition group-hover:border-slate-300 group-hover:text-slate-900">
        {item.shortLabel}
      </span>
      <span>{item.label}</span>
    </Link>
  )
}

export function Sidebar({ area, plan = null }: SidebarProps) {
  const items = area === 'admin' ? adminItems : dashboardItems

  return (
    <aside className="flex w-full max-w-xs flex-col rounded-[28px] border border-slate-200/80 bg-slate-50/95 p-5 shadow-panel">
      <div className="rounded-[22px] border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-bold tracking-[0.2em]',
              area === 'admin' ? 'bg-slate-950 text-white' : 'border border-slate-300 bg-slate-100 text-slate-700'
            )}
          >
            {area === 'admin' ? 'AD' : 'AT'}
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
              {area === 'admin' ? 'Control Room' : 'Client Area'}
            </p>
            <p className="font-display text-xl text-slate-950">App Trading Fiscale</p>
          </div>
        </div>
      </div>

      <nav className="mt-6 flex flex-1 flex-col gap-1">
        {items.map(item => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>

      <div className="mt-6 rounded-[22px] border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
          {area === 'admin' ? 'Accesso' : 'Piano attivo'}
        </p>
        <div className="mt-3">
          {area === 'admin' ? <span className="text-sm text-slate-700">Ruolo amministratore</span> : <PlanBadge plan={plan} />}
        </div>
        <div className="mt-4">
          <Link
            href={area === 'admin' ? '/dashboard/upload' : '/checkout'}
            className="text-sm font-medium text-slate-600 transition hover:text-slate-950"
          >
            {area === 'admin' ? 'Vai all area utente' : 'Gestisci il tuo piano'}
          </Link>
        </div>
      </div>
    </aside>
  )
}
