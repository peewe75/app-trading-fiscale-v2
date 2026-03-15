import Link from 'next/link'
import { SignedIn, SignedOut } from '@clerk/nextjs'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function Navbar() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/60 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-4 lg:px-8">
        <Link href="/" className="flex items-center gap-3 text-slate-950">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-300 bg-slate-950 text-sm font-bold text-white">
            AT
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">Fiscal Engine</p>
            <p className="font-display text-lg">App Trading Fiscale</p>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          <SignedOut>
            <Link href="/sign-in" className={cn(buttonVariants('secondary'), 'px-4 py-2.5')}>
              Accedi
            </Link>
            <Link href="/sign-up" className={cn(buttonVariants('primary'), 'px-4 py-2.5')}>
              Registrati
            </Link>
          </SignedOut>
          <SignedIn>
            <Link href="/dashboard/upload" className={cn(buttonVariants('primary'), 'px-4 py-2.5')}>
              Area personale
            </Link>
          </SignedIn>
        </div>
      </div>
    </header>
  )
}
